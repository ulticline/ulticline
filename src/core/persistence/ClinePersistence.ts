import fs from "fs/promises"
import path from "path"
import getFolderSize from "get-folder-size"
import { ClineMessage } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem"
import { fileExistsAtPath } from "../../utils/fs"
import { ClineProvider, GlobalFileNames } from "../webview/ClineProvider"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { findLast } from "../../shared/array"
import { Anthropic } from "@anthropic-ai/sdk"

export class ClinePersistence {
    private taskId: string
    private providerRef: WeakRef<ClineProvider>

    constructor(taskId: string, providerRef: WeakRef<ClineProvider>) {
        this.taskId = taskId
        this.providerRef = providerRef
    }

    async ensureTaskDirectoryExists(): Promise<string> {
        const globalStoragePath = this.providerRef.deref()?.context.globalStorageUri.fsPath
        if (!globalStoragePath) {
            throw new Error("Global storage uri is invalid")
        }
        const taskDir = path.join(globalStoragePath, "tasks", this.taskId)
        await fs.mkdir(taskDir, { recursive: true })
        return taskDir
    }

    async getSavedApiConversationHistory(): Promise<Anthropic.MessageParam[]> {
        const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
        const fileExists = await fileExistsAtPath(filePath)
        if (fileExists) {
            return JSON.parse(await fs.readFile(filePath, "utf8"))
        }
        return []
    }

    async saveApiConversationHistory(apiConversationHistory: Anthropic.MessageParam[]) {
        try {
            const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.apiConversationHistory)
            await fs.writeFile(filePath, JSON.stringify(apiConversationHistory))
        } catch (error) {
            // in the off chance this fails, we don't want to stop the task
            console.error("Failed to save API conversation history:", error)
        }
    }

    async getSavedClineMessages(): Promise<ClineMessage[]> {
        const filePath = path.join(await this.ensureTaskDirectoryExists(), GlobalFileNames.uiMessages)
        if (await fileExistsAtPath(filePath)) {
            return JSON.parse(await fs.readFile(filePath, "utf8"))
        } else {
            // check old location
            const oldPath = path.join(await this.ensureTaskDirectoryExists(), "claude_messages.json")
            if (await fileExistsAtPath(oldPath)) {
                const data = JSON.parse(await fs.readFile(oldPath, "utf8"))
                await fs.unlink(oldPath) // remove old file
                return data
            }
        }
        return []
    }

    async saveClineMessages(clineMessages: ClineMessage[], shadowGitConfigWorkTree?: string, conversationHistoryDeletedRange?: [number, number]) {
        try {
            const taskDir = await this.ensureTaskDirectoryExists()
            const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
            await fs.writeFile(filePath, JSON.stringify(clineMessages))
            // combined as they are in ChatView
            const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(clineMessages.slice(1))))
            const taskMessage = clineMessages[0] // first message is always the task say
            const lastRelevantMessage = findLast(clineMessages,
                (m: ClineMessage) => !(m.ask === "resume_task" || m.ask === "resume_completed_task")
            )
            let taskDirSize = 0
            try {
                // getFolderSize.loose silently ignores errors
                // returns # of bytes, size/1000/1000 = MB
                taskDirSize = await getFolderSize.loose(taskDir)
            } catch (error) {
                console.error("Failed to get task directory size:", taskDir, error)
            }
            await this.providerRef.deref()?.updateTaskHistory({
                id: this.taskId,
                ts: lastRelevantMessage?.ts ?? Date.now(),
                task: taskMessage.text ?? "",
                tokensIn: apiMetrics.totalTokensIn,
                tokensOut: apiMetrics.totalTokensOut,
                cacheWrites: apiMetrics.totalCacheWrites,
                cacheReads: apiMetrics.totalCacheReads,
                totalCost: apiMetrics.totalCost,
                size: taskDirSize,
                shadowGitConfigWorkTree,
                conversationHistoryDeletedRange,
            } satisfies HistoryItem)
        } catch (error) {
            console.error("Failed to save cline messages:", error)
        }
    }
}
