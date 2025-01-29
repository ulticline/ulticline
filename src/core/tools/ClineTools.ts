import { TerminalManager } from "../../integrations/terminal/TerminalManager"
import { BrowserSession } from "../../services/browser/BrowserSession"
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { UrlContentFetcher } from "../../services/browser/UrlContentFetcher"
import { AutoApprovalSettings } from "../../shared/AutoApprovalSettings"
import { IClineProvider } from "../webview/IClineProvider"
import { ApiHandler } from "../../api"
import { extractTextFromFile } from "../../integrations/misc/extract-text"
import { listFiles } from "../../services/glob/list-files"
import { regexSearchFiles } from "../../services/ripgrep"
import { parseSourceCodeForDefinitionsTopLevel } from "../../services/tree-sitter"
import { formatResponse } from "../prompts/responses"
import { constructNewFileContent } from "../assistant-message/diff"
import { showSystemNotification } from "../../integrations/notifications"
import { fileExistsAtPath } from "../../utils/fs"
import { getReadablePath } from "../../utils/path"
import { fixModelHtmlEscaping, removeInvalidChars } from "../../utils/string"
import { serializeError } from "serialize-error"
import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"
import * as path from "path"
import delay from "delay"

type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
type ToolUseName = "execute_command" | "read_file" | "write_to_file" | "replace_in_file" | "search_files" | "list_files" | "list_code_definition_names" | "browser_action" | "access_mcp_resource" | "use_mcp_tool" | "ask_followup_question" | "plan_mode_response" | "attempt_completion"

export class ClineTools {
    private cwd: string
    private terminalManager: TerminalManager
    private urlContentFetcher: UrlContentFetcher
    private browserSession: BrowserSession
    private diffViewProvider: DiffViewProvider
    private autoApprovalSettings: AutoApprovalSettings
    private providerRef: WeakRef<IClineProvider>
    private didEditFile: boolean = false
    private api: ApiHandler

    constructor(
        api: ApiHandler,
        cwd: string,
        terminalManager: TerminalManager,
        urlContentFetcher: UrlContentFetcher,
        browserSession: BrowserSession,
        diffViewProvider: DiffViewProvider,
        autoApprovalSettings: AutoApprovalSettings,
        providerRef: WeakRef<IClineProvider>
    ) {
        this.api = api
        this.cwd = cwd
        this.terminalManager = terminalManager
        this.urlContentFetcher = urlContentFetcher
        this.browserSession = browserSession
        this.diffViewProvider = diffViewProvider
        this.autoApprovalSettings = autoApprovalSettings
        this.providerRef = providerRef
    }

    getDidEditFile() {
        return this.didEditFile
    }

    shouldAutoApproveTool(toolName: ToolUseName): boolean {
        if (this.autoApprovalSettings.enabled) {
            switch (toolName) {
                case "read_file":
                case "list_files":
                case "list_code_definition_names":
                case "search_files":
                    return this.autoApprovalSettings.actions.readFiles
                case "write_to_file":
                case "replace_in_file":
                    return this.autoApprovalSettings.actions.editFiles
                case "execute_command":
                    return this.autoApprovalSettings.actions.executeCommands
                case "browser_action":
                    return this.autoApprovalSettings.actions.useBrowser
                case "access_mcp_resource":
                case "use_mcp_tool":
                    return this.autoApprovalSettings.actions.useMcp
            }
        }
        return false
    }

    async executeCommandTool(command: string): Promise<[boolean, ToolResponse]> {
        const terminalInfo = await this.terminalManager.getOrCreateTerminal(this.cwd)
        terminalInfo.terminal.show()
        const process = this.terminalManager.runCommand(terminalInfo, command)

        let userFeedback: { text?: string; images?: string[] } | undefined
        let didContinue = false
        const sendCommandOutput = async (line: string): Promise<void> => {
            try {
                const { response, text, images } = await this.providerRef.deref()?.ask("command_output", line) ?? {}
                if (response === "yesButtonClicked") {
                    // proceed while running
                } else {
                    userFeedback = { text, images }
                }
                didContinue = true
                process.continue() // continue past the await
            } catch {
                // This can only happen if this ask promise was ignored, so ignore this error
            }
        }

        let result = ""
        process.on("line", (line) => {
            result += line + "\n"
            if (!didContinue) {
                sendCommandOutput(line)
            } else {
                this.providerRef.deref()?.say("command_output", line)
            }
        })

        let completed = false
        process.once("completed", () => {
            completed = true
        })

        process.once("no_shell_integration", async () => {
            await this.providerRef.deref()?.say("shell_integration_warning")
        })

        await process

        // Wait for a short delay to ensure all messages are sent to the webview
        await delay(50)

        result = result.trim()

        if (userFeedback) {
            await this.providerRef.deref()?.say("user_feedback", userFeedback.text, userFeedback.images)
            return [
                true,
                formatResponse.toolResult(
                    `Command is still running in the user's terminal.${
                        result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
                    }\n\nThe user provided the following feedback:\n<feedback>\n${userFeedback.text}\n</feedback>`,
                    userFeedback.images,
                ),
            ]
        }

        if (completed) {
            return [false, `Command executed.${result.length > 0 ? `\nOutput:\n${result}` : ""}`]
        } else {
            return [
                false,
                `Command is still running in the user's terminal.${
                    result.length > 0 ? `\nHere's the output so far:\n${result}` : ""
                }\n\nYou will be updated on the terminal status and new output in the future.`,
            ]
        }
    }

    async readFileTool(relPath: string): Promise<ToolResponse> {
        const absolutePath = path.resolve(this.cwd, relPath)
        return await extractTextFromFile(absolutePath)
    }

    async listFilesTool(relDirPath: string, recursive: boolean = false): Promise<ToolResponse> {
        const absolutePath = path.resolve(this.cwd, relDirPath)
        const [files, didHitLimit] = await listFiles(absolutePath, recursive, 200)
        return formatResponse.formatFilesList(absolutePath, files, didHitLimit)
    }

    async searchFilesTool(relDirPath: string, regex: string, filePattern?: string): Promise<ToolResponse> {
        const absolutePath = path.resolve(this.cwd, relDirPath)
        return await regexSearchFiles(this.cwd, absolutePath, regex, filePattern)
    }

    async listCodeDefinitionsTool(relDirPath: string): Promise<ToolResponse> {
        const absolutePath = path.resolve(this.cwd, relDirPath)
        return await parseSourceCodeForDefinitionsTopLevel(absolutePath)
    }

    async writeFileTool(relPath: string, content: string): Promise<ToolResponse> {
        const absolutePath = path.resolve(this.cwd, relPath)
        const fileExists = await fileExistsAtPath(absolutePath)
        this.diffViewProvider.editType = fileExists ? "modify" : "create"

        if (!this.api.getModel().id.includes("claude")) {
            content = fixModelHtmlEscaping(content)
            content = removeInvalidChars(content)
        }

        content = content.trimEnd()

        if (!this.diffViewProvider.isEditing) {
            await this.diffViewProvider.open(relPath)
        }
        await this.diffViewProvider.update(content, true)
        await delay(300)
        this.diffViewProvider.scrollToFirstDiff()

        const { newProblemsMessage, userEdits, autoFormattingEdits, finalContent } = await this.diffViewProvider.saveChanges()
        this.didEditFile = true

        if (userEdits) {
            return formatResponse.toolResult(
                `The user made the following updates to your content:\n\n${userEdits}\n\n` +
                    (autoFormattingEdits
                        ? `The user's editor also applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
                        : "") +
                    `The updated content, which includes both your original modifications and the additional edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file that was saved:\n\n` +
                    `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
                    `Please note:\n` +
                    `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
                    `2. Proceed with the task using this updated file content as the new baseline.\n` +
                    `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
                    `4. IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including both user edits and any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n` +
                    `${newProblemsMessage}`,
            )
        } else {
            return formatResponse.toolResult(
                `The content was successfully saved to ${relPath.toPosix()}.\n\n` +
                    (autoFormattingEdits
                        ? `Along with your edits, the user's editor applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
                        : "") +
                    `Here is the full, updated content of the file that was saved:\n\n` +
                    `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
                    `IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n\n` +
                    `${newProblemsMessage}`,
            )
        }
    }

    async replaceInFileTool(relPath: string, diff: string): Promise<ToolResponse> {
        const absolutePath = path.resolve(this.cwd, relPath)
        const fileExists = await fileExistsAtPath(absolutePath)
        this.diffViewProvider.editType = fileExists ? "modify" : "create"

        if (!this.api.getModel().id.includes("claude")) {
            diff = fixModelHtmlEscaping(diff)
            diff = removeInvalidChars(diff)
        }

        try {
            const newContent = await constructNewFileContent(diff, this.diffViewProvider.originalContent || "", true)
            if (!this.diffViewProvider.isEditing) {
                await this.diffViewProvider.open(relPath)
            }
            await this.diffViewProvider.update(newContent, true)
            await delay(300)
            this.diffViewProvider.scrollToFirstDiff()

            const { newProblemsMessage, userEdits, autoFormattingEdits, finalContent } = await this.diffViewProvider.saveChanges()
            this.didEditFile = true

            if (userEdits) {
                return formatResponse.toolResult(
                    `The user made the following updates to your content:\n\n${userEdits}\n\n` +
                        (autoFormattingEdits
                            ? `The user's editor also applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
                            : "") +
                        `The updated content, which includes both your original modifications and the additional edits, has been successfully saved to ${relPath.toPosix()}. Here is the full, updated content of the file that was saved:\n\n` +
                        `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
                        `Please note:\n` +
                        `1. You do not need to re-write the file with these changes, as they have already been applied.\n` +
                        `2. Proceed with the task using this updated file content as the new baseline.\n` +
                        `3. If the user's edits have addressed part of the task or changed the requirements, adjust your approach accordingly.` +
                        `4. IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including both user edits and any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n` +
                        `${newProblemsMessage}`,
                )
            } else {
                return formatResponse.toolResult(
                    `The content was successfully saved to ${relPath.toPosix()}.\n\n` +
                        (autoFormattingEdits
                            ? `Along with your edits, the user's editor applied the following auto-formatting to your content:\n\n${autoFormattingEdits}\n\n(Note: Pay close attention to changes such as single quotes being converted to double quotes, semicolons being removed or added, long lines being broken into multiple lines, adjusting indentation style, adding/removing trailing commas, etc. This will help you ensure future SEARCH/REPLACE operations to this file are accurate.)\n\n`
                            : "") +
                        `Here is the full, updated content of the file that was saved:\n\n` +
                        `<final_file_content path="${relPath.toPosix()}">\n${finalContent}\n</final_file_content>\n\n` +
                        `IMPORTANT: For any future changes to this file, use the final_file_content shown above as your reference. This content reflects the current state of the file, including any auto-formatting (e.g., if you used single quotes but the formatter converted them to double quotes). Always base your SEARCH/REPLACE operations on this final version to ensure accuracy.\n\n` +
                        `${newProblemsMessage}`,
                )
            }
        } catch (error) {
            await this.providerRef.deref()?.say("diff_error", relPath)
            return formatResponse.toolError(
                `${(error as Error)?.message}\n\n` +
                    `This is likely because the SEARCH block content doesn't match exactly with what's in the file, or if you used multiple SEARCH/REPLACE blocks they may not have been in the order they appear in the file.\n\n` +
                    `The file was reverted to its original state:\n\n` +
                    `<file_content path="${relPath.toPosix()}">\n${this.diffViewProvider.originalContent}\n</file_content>\n\n` +
                    `Try again with a more precise SEARCH block.\n(If you keep running into this error, you may use the write_to_file tool as a workaround.)`,
            )
        }
    }
}
