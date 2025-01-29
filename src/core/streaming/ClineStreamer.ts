import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "../../api"
import { ClineProvider, GlobalFileNames } from "../webview/ClineProvider"
import { ClineMessage, ClineApiReqInfo, ClineApiReqCancelReason } from "../../shared/ExtensionMessage"
import { AssistantMessageContent, parseAssistantMessage } from "../assistant-message"
import { ApiStream } from "../../api/transform/stream"
import { getTruncatedMessages, getNextTruncationRange } from "../sliding-window"
import { SYSTEM_PROMPT } from "../prompts/system"
import { addUserInstructions } from "../prompts/system"
import { formatResponse } from "../prompts/responses"
import { McpHub } from "../../services/mcp/McpHub"
import { BrowserSettings } from "../../shared/BrowserSettings"
import { calculateApiCost } from "../../utils/cost"
import { serializeError } from "serialize-error"
import delay from "delay"
import { fileExistsAtPath } from "../../utils/fs"
import { OpenRouterHandler } from "../../api/providers/openrouter"
import path from "path"
import fs from "fs/promises"

export class ClineStreamer {
    private api: ApiHandler
    private providerRef: WeakRef<ClineProvider>
    private cwd: string
    private browserSettings: BrowserSettings
    private customInstructions?: string
    private apiConversationHistory: Anthropic.MessageParam[] = []
    private conversationHistoryDeletedRange?: [number, number]
    private consecutiveMistakeCount: number = 0
    private consecutiveAutoApprovedRequestsCount: number = 0
    private abort: boolean = false
    private abandoned: boolean = false
    private didFinishAbortingStream = false

    // Streaming state
    isWaitingForFirstChunk = false
    isStreaming = false
    private currentStreamingContentIndex = 0
    private assistantMessageContent: AssistantMessageContent[] = []
    private presentAssistantMessageLocked = false
    private presentAssistantMessageHasPendingUpdates = false
    private userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
    private userMessageContentReady = false
    private didRejectTool = false
    private didAlreadyUseTool = false
    private didCompleteReadingStream = false
    private didAutomaticallyRetryFailedApiRequest = false

    constructor(
        api: ApiHandler,
        providerRef: WeakRef<ClineProvider>,
        cwd: string,
        browserSettings: BrowserSettings,
        customInstructions?: string
    ) {
        this.api = api
        this.providerRef = providerRef
        this.cwd = cwd
        this.browserSettings = browserSettings
        this.customInstructions = customInstructions
    }

    setApiConversationHistory(history: Anthropic.MessageParam[]) {
        this.apiConversationHistory = history
    }

    setConversationHistoryDeletedRange(range?: [number, number]) {
        this.conversationHistoryDeletedRange = range
    }

    setConsecutiveMistakeCount(count: number) {
        this.consecutiveMistakeCount = count
    }

    setConsecutiveAutoApprovedRequestsCount(count: number) {
        this.consecutiveAutoApprovedRequestsCount = count
    }

    incrementConsecutiveMistakeCount() {
        this.consecutiveMistakeCount++
    }

    incrementConsecutiveAutoApprovedRequestsCount() {
        this.consecutiveAutoApprovedRequestsCount++
    }

    resetStreamingState() {
        this.currentStreamingContentIndex = 0
        this.assistantMessageContent = []
        this.didCompleteReadingStream = false
        this.userMessageContent = []
        this.userMessageContentReady = false
        this.didRejectTool = false
        this.didAlreadyUseTool = false
        this.presentAssistantMessageLocked = false
        this.presentAssistantMessageHasPendingUpdates = false
        this.didAutomaticallyRetryFailedApiRequest = false
    }

    async *attemptApiRequest(previousApiReqIndex: number, clineMessages: ClineMessage[]): ApiStream {
        // Wait for MCP servers to be connected before generating system prompt
        await new Promise<void>((resolve) => {
            const checkMcp = () => {
                if (this.providerRef.deref()?.mcpHub?.isConnecting !== true) {
                    resolve()
                } else {
                    setTimeout(checkMcp, 100)
                }
            }
            setTimeout(checkMcp, 100)
        }).catch(() => {
            console.error("MCP servers failed to connect in time")
        })

        const mcpHub = this.providerRef.deref()?.mcpHub
        if (!mcpHub) {
            throw new Error("MCP hub not available")
        }

        let systemPrompt = await SYSTEM_PROMPT(
            this.cwd,
            this.api.getModel().info.supportsComputerUse ?? false,
            mcpHub,
            this.browserSettings,
        )

        let settingsCustomInstructions = this.customInstructions?.trim()
        const clineRulesFilePath = path.resolve(this.cwd, GlobalFileNames.clineRules)
        let clineRulesFileInstructions: string | undefined
        if (await fileExistsAtPath(clineRulesFilePath)) {
            try {
                const ruleFileContent = (await fs.readFile(clineRulesFilePath, "utf8")).trim()
                if (ruleFileContent) {
                    clineRulesFileInstructions = `# .clinerules\n\nThe following is provided by a root-level .clinerules file where the user has specified instructions for this working directory (${this.cwd.toPosix()})\n\n${ruleFileContent}`
                }
            } catch {
                console.error(`Failed to read .clinerules file at ${clineRulesFilePath}`)
            }
        }

        if (settingsCustomInstructions || clineRulesFileInstructions) {
            systemPrompt += addUserInstructions(settingsCustomInstructions, clineRulesFileInstructions)
        }

        // If the previous API request's total token usage is close to the context window, truncate the conversation history
        if (previousApiReqIndex >= 0) {
            const previousRequest = clineMessages[previousApiReqIndex]
            if (previousRequest && previousRequest.text) {
                const { tokensIn, tokensOut, cacheWrites, cacheReads }: ClineApiReqInfo = JSON.parse(previousRequest.text)
                const totalTokens = (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
                let contextWindow = this.api.getModel().info.contextWindow || 128_000
                let maxAllowedSize: number
                switch (contextWindow) {
                    case 64_000: // deepseek models
                        maxAllowedSize = contextWindow - 27_000
                        break
                    case 128_000: // most models
                        maxAllowedSize = contextWindow - 30_000
                        break
                    case 200_000: // claude models
                        maxAllowedSize = contextWindow - 40_000
                        break
                    default:
                        maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)
                }

                if (totalTokens >= maxAllowedSize) {
                    this.conversationHistoryDeletedRange = getNextTruncationRange(
                        this.apiConversationHistory,
                        this.conversationHistoryDeletedRange,
                    )
                }
            }
        }

        const truncatedConversationHistory = getTruncatedMessages(
            this.apiConversationHistory,
            this.conversationHistoryDeletedRange,
        )

        let stream = this.api.createMessage(systemPrompt, truncatedConversationHistory)
        const iterator = stream[Symbol.asyncIterator]()

        try {
            this.isWaitingForFirstChunk = true
            const firstChunk = await iterator.next()
            yield firstChunk.value
            this.isWaitingForFirstChunk = false
        } catch (error) {
            const isOpenRouter = this.api instanceof OpenRouterHandler
            if (isOpenRouter && !this.didAutomaticallyRetryFailedApiRequest) {
                console.log("first chunk failed, waiting 1 second before retrying")
                await delay(1000)
                this.didAutomaticallyRetryFailedApiRequest = true
            } else {
                throw error
            }
            yield* this.attemptApiRequest(previousApiReqIndex, clineMessages)
            return
        }

        yield* iterator
    }

    setAbort(value: boolean) {
        this.abort = value
    }

    setAbandoned(value: boolean) {
        this.abandoned = value
    }

    isAborted() {
        return this.abort
    }

    isAbandoned() {
        return this.abandoned
    }

    didFinishAborting() {
        return this.didFinishAbortingStream
    }

    setDidFinishAborting(value: boolean) {
        this.didFinishAbortingStream = value
    }

    isWaitingForUserMessageContent() {
        return !this.userMessageContentReady
    }

    getUserMessageContent() {
        return this.userMessageContent
    }

    setDidRejectTool(value: boolean) {
        this.didRejectTool = value
    }

    setDidAlreadyUseTool(value: boolean) {
        this.didAlreadyUseTool = value
    }

    getAssistantMessageContent() {
        return this.assistantMessageContent
    }

    getCurrentStreamingContentIndex() {
        return this.currentStreamingContentIndex
    }

    incrementStreamingContentIndex() {
        this.currentStreamingContentIndex++
    }

    setUserMessageContentReady(value: boolean) {
        this.userMessageContentReady = value
    }

    setPresentAssistantMessageLocked(value: boolean) {
        this.presentAssistantMessageLocked = value
    }

    setPresentAssistantMessageHasPendingUpdates(value: boolean) {
        this.presentAssistantMessageHasPendingUpdates = value
    }

    hasPresentAssistantMessagePendingUpdates() {
        return this.presentAssistantMessageHasPendingUpdates
    }

    isPresentAssistantMessageLocked() {
        return this.presentAssistantMessageLocked
    }

    setDidCompleteReadingStream(value: boolean) {
        this.didCompleteReadingStream = value
    }

    hasCompletedReadingStream() {
        return this.didCompleteReadingStream
    }
}
