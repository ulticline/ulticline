import * as vscode from "vscode"
import * as path from "path"
import os from "os"
import { TerminalManager } from "../../integrations/terminal/TerminalManager"
import { listFiles } from "../../services/glob/list-files"
import { formatResponse } from "../prompts/responses"
import { arePathsEqual } from "../../utils/path"
import { Anthropic } from "@anthropic-ai/sdk"

type UserContent = Array<
    Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam
>
import { parseMentions } from "../mentions"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import delay from "delay"

export class ClineEnvironment {
    private cwd: string
    private terminalManager: TerminalManager
    private urlContentFetcher: UrlContentFetcher
    private didEditFile: boolean = false

    constructor(cwd: string, terminalManager: TerminalManager, urlContentFetcher: UrlContentFetcher) {
        this.cwd = cwd
        this.terminalManager = terminalManager
        this.urlContentFetcher = urlContentFetcher
    }

    setDidEditFile(value: boolean) {
        this.didEditFile = value
    }

    async getEnvironmentDetails(includeFileDetails: boolean = false): Promise<string> {
        let details = ""

        // It could be useful for cline to know if the user went from one or no file to another between messages, so we always include this context
        details += "\n\n# VSCode Visible Files"
        const visibleFiles = vscode.window.visibleTextEditors
            ?.map((editor) => editor.document?.uri?.fsPath)
            .filter(Boolean)
            .map((absolutePath) => path.relative(this.cwd, absolutePath).toPosix())
            .join("\n")
        if (visibleFiles) {
            details += `\n${visibleFiles}`
        } else {
            details += "\n(No visible files)"
        }

        details += "\n\n# VSCode Open Tabs"
        const openTabs = vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .map((tab) => (tab.input as vscode.TabInputText)?.uri?.fsPath)
            .filter(Boolean)
            .map((absolutePath) => path.relative(this.cwd, absolutePath).toPosix())
            .join("\n")
        if (openTabs) {
            details += `\n${openTabs}`
        } else {
            details += "\n(No open tabs)"
        }

        const busyTerminals = this.terminalManager.getTerminals(true)
        const inactiveTerminals = this.terminalManager.getTerminals(false)

        if (busyTerminals.length > 0 && this.didEditFile) {
            await delay(300) // delay after saving file to let terminals catch up
        }

        if (busyTerminals.length > 0) {
            // wait for terminals to cool down
            await new Promise<void>((resolve) => {
                const checkTerminals = () => {
                    if (busyTerminals.every((t) => !this.terminalManager.isProcessHot(t.id))) {
                        resolve()
                    } else {
                        setTimeout(checkTerminals, 100)
                    }
                }
                setTimeout(checkTerminals, 100)
            }).catch(() => {}) // timeout after 15s
        }

        let terminalDetails = ""
        if (busyTerminals.length > 0) {
            // terminals are cool, let's retrieve their output
            terminalDetails += "\n\n# Actively Running Terminals"
            for (const busyTerminal of busyTerminals) {
                terminalDetails += `\n## Original command: \`${busyTerminal.lastCommand}\``
                const newOutput = this.terminalManager.getUnretrievedOutput(busyTerminal.id)
                if (newOutput) {
                    terminalDetails += `\n### New Output\n${newOutput}`
                }
            }
        }
        // only show inactive terminals if there's output to show
        if (inactiveTerminals.length > 0) {
            const inactiveTerminalOutputs = new Map<number, string>()
            for (const inactiveTerminal of inactiveTerminals) {
                const newOutput = this.terminalManager.getUnretrievedOutput(inactiveTerminal.id)
                if (newOutput) {
                    inactiveTerminalOutputs.set(inactiveTerminal.id, newOutput)
                }
            }
            if (inactiveTerminalOutputs.size > 0) {
                terminalDetails += "\n\n# Inactive Terminals"
                for (const [terminalId, newOutput] of inactiveTerminalOutputs) {
                    const inactiveTerminal = inactiveTerminals.find((t) => t.id === terminalId)
                    if (inactiveTerminal) {
                        terminalDetails += `\n## ${inactiveTerminal.lastCommand}`
                        terminalDetails += `\n### New Output\n${newOutput}`
                    }
                }
            }
        }

        if (terminalDetails) {
            details += terminalDetails
        }

        // Add current time information with timezone
        const now = new Date()
        const formatter = new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: true,
        })
        const timeZone = formatter.resolvedOptions().timeZone
        const timeZoneOffset = -now.getTimezoneOffset() / 60 // Convert to hours and invert sign to match conventional notation
        const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : ""}${timeZoneOffset}:00`
        details += `\n\n# Current Time\n${formatter.format(now)} (${timeZone}, UTC${timeZoneOffsetStr})`

        if (includeFileDetails) {
            details += `\n\n# Current Working Directory (${this.cwd.toPosix()}) Files\n`
            const isDesktop = arePathsEqual(this.cwd, path.join(os.homedir(), "Desktop"))
            if (isDesktop) {
                // don't want to immediately access desktop since it would show permission popup
                details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
            } else {
                const [files, didHitLimit] = await listFiles(this.cwd, true, 200)
                const result = formatResponse.formatFilesList(this.cwd, files, didHitLimit)
                details += result
            }
        }

        return `<environment_details>\n${details.trim()}\n</environment_details>`
    }

    async loadContext(userContent: UserContent, includeFileDetails: boolean = false): Promise<[UserContent, string]> {
        return await Promise.all([
            // This is a temporary solution to dynamically load context mentions from tool results. It checks for the presence of tags that indicate that the tool was rejected and feedback was provided (see formatToolDeniedFeedback, attemptCompletion, executeCommand, and consecutiveMistakeCount >= 3) or "<answer>" (see askFollowupQuestion), we place all user generated content in these tags so they can effectively be used as markers for when we should parse mentions). However if we allow multiple tools responses in the future, we will need to parse mentions specifically within the user content tags.
            Promise.all(
                userContent.map(async (block: Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam) => {
                    if (block.type === "text") {
                        // We need to ensure any user generated content is wrapped in one of these tags so that we know to parse mentions
                        // FIXME: Only parse text in between these tags instead of the entire text block which may contain other tool results. This is part of a larger issue where we shouldn't be using regex to parse mentions in the first place (ie for cases where file paths have spaces)
                        if (
                            block.text.includes("<feedback>") ||
                            block.text.includes("<answer>") ||
                            block.text.includes("<task>") ||
                            block.text.includes("<user_message>")
                        ) {
                            return {
                                ...block,
                                text: await parseMentions(block.text, this.cwd, this.urlContentFetcher),
                            }
                        }
                    }
                    return block
                }),
            ),
            this.getEnvironmentDetails(includeFileDetails),
        ])
    }
}
