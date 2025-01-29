import { ClineMessage } from "../../shared/ExtensionMessage"
import { ClineProvider } from "../webview/ClineProvider"
import { DIFF_VIEW_URI_SCHEME } from "../../integrations/editor/DiffViewProvider"
import { findLast } from "../../shared/array"
import CheckpointTracker from "../../integrations/checkpoints/CheckpointTracker"
import * as vscode from "vscode"

export class ClineCheckpoints {
    private taskId: string
    private providerRef: WeakRef<ClineProvider>
    private checkpointTracker?: CheckpointTracker
    checkpointTrackerErrorMessage?: string

    constructor(taskId: string, providerRef: WeakRef<ClineProvider>) {
        this.taskId = taskId
        this.providerRef = providerRef
    }

    async initializeTracker() {
        if (!this.checkpointTracker) {
            try {
                this.checkpointTracker = await CheckpointTracker.create(this.taskId, this.providerRef.deref())
                this.checkpointTrackerErrorMessage = undefined
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unknown error"
                console.error("Failed to initialize checkpoint tracker:", errorMessage)
                this.checkpointTrackerErrorMessage = errorMessage
                await this.providerRef.deref()?.postStateToWebview()
                vscode.window.showErrorMessage(errorMessage)
                return false
            }
        }
        return true
    }

    async saveCheckpoint() {
        const commitHash = await this.checkpointTracker?.commit() // silently fails for now
        return commitHash
    }

    async restoreCheckpoint(messageTs: number, messages: ClineMessage[], restoreType: "task" | "taskAndWorkspace" | "workspace") {
        const messageIndex = messages.findIndex((m) => m.ts === messageTs)
        const message = messages[messageIndex]
        if (!message) {
            console.error("Message not found", messages)
            return false
        }

        let didWorkspaceRestoreFail = false

        switch (restoreType) {
            case "task":
                break
            case "taskAndWorkspace":
            case "workspace":
                if (!await this.initializeTracker()) {
                    didWorkspaceRestoreFail = true
                    break
                }
                if (message.lastCheckpointHash && this.checkpointTracker) {
                    try {
                        await this.checkpointTracker.resetHead(message.lastCheckpointHash)
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : "Unknown error"
                        vscode.window.showErrorMessage("Failed to restore checkpoint: " + errorMessage)
                        didWorkspaceRestoreFail = true
                    }
                }
                break
        }

        if (!didWorkspaceRestoreFail) {
            switch (restoreType) {
                case "task":
                    vscode.window.showInformationMessage("Task messages have been restored to the checkpoint")
                    break
                case "workspace":
                    vscode.window.showInformationMessage("Workspace files have been restored to the checkpoint")
                    break
                case "taskAndWorkspace":
                    vscode.window.showInformationMessage("Task and workspace have been restored to the checkpoint")
                    break
            }
        }

        return !didWorkspaceRestoreFail
    }

    async presentMultifileDiff(messageTs: number, messages: ClineMessage[], seeNewChangesSinceLastTaskCompletion: boolean) {
        const messageIndex = messages.findIndex((m) => m.ts === messageTs)
        const message = messages[messageIndex]
        if (!message) {
            console.error("Message not found")
            return false
        }
        const hash = message.lastCheckpointHash
        if (!hash) {
            console.error("No checkpoint hash found")
            return false
        }

        if (!await this.initializeTracker()) {
            return false
        }

        let changedFiles:
            | {
                    relativePath: string
                    absolutePath: string
                    before: string
                    after: string
              }[]
            | undefined

        try {
            if (seeNewChangesSinceLastTaskCompletion) {
                // Get last task completed
                const lastTaskCompletedMessage = findLast(
                    messages.slice(0, messageIndex),
                    (m) => m.say === "completion_result",
                )

                // Get changed files between current state and commit
                changedFiles = await this.checkpointTracker?.getDiffSet(
                    lastTaskCompletedMessage?.lastCheckpointHash, // if undefined, then we get diff from beginning of git history, AKA when the task was started
                    hash,
                )
                if (!changedFiles?.length) {
                    vscode.window.showInformationMessage("No changes found")
                    return false
                }
            } else {
                // Get changed files between current state and commit
                changedFiles = await this.checkpointTracker?.getDiffSet(hash)
                if (!changedFiles?.length) {
                    vscode.window.showInformationMessage("No changes found")
                    return false
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            vscode.window.showErrorMessage("Failed to retrieve diff set: " + errorMessage)
            return false
        }

        // Open multi-diff editor
        await vscode.commands.executeCommand(
            "vscode.changes",
            seeNewChangesSinceLastTaskCompletion ? "New changes" : "Changes since snapshot",
            changedFiles.map((file) => [
                vscode.Uri.file(file.absolutePath),
                vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${file.relativePath}`).with({
                    query: Buffer.from(file.before ?? "").toString("base64"),
                }),
                vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${file.relativePath}`).with({
                    query: Buffer.from(file.after ?? "").toString("base64"),
                }),
            ]),
        )
        return true
    }

    async doesLatestTaskCompletionHaveNewChanges(messages: ClineMessage[]) {
        const messageIndex = messages.findIndex((m) => m.say === "completion_result")
        const message = messages[messageIndex]
        if (!message) {
            console.error("Completion message not found")
            return false
        }
        const hash = message.lastCheckpointHash
        if (!hash) {
            console.error("No checkpoint hash found")
            return false
        }

        if (!await this.initializeTracker()) {
            return false
        }

        // Get last task completed
        const lastTaskCompletedMessage = findLast(messages.slice(0, messageIndex), (m) => m.say === "completion_result")

        try {
            // Get changed files between current state and commit
            const changedFiles = await this.checkpointTracker?.getDiffSet(
                lastTaskCompletedMessage?.lastCheckpointHash, // if undefined, then we get diff from beginning of git history, AKA when the task was started
                hash,
            )
            const changedFilesCount = changedFiles?.length || 0
            if (changedFilesCount > 0) {
                return true
            }
        } catch (error) {
            console.error("Failed to get diff set:", error)
            return false
        }

        return false
    }

    async getShadowGitConfigWorkTree() {
        return await this.checkpointTracker?.getShadowGitConfigWorkTree()
    }
}
