/**
 * ClineCheckpoints.test.ts
 *
 * Tests how Cline interacts with checkpoints:
 * - restoreCheckpoint(...)
 * - presentMultifileDiff(...)
 * - doesLatestTaskCompletionHaveNewChanges()
 * - saveCheckpoint()
 *
 * This ensures correct logic for retrieving diffs, restoring tasks and workspace,
 * and verifying new changes.
 */

import { expect } from "chai"
import sinon from "sinon"
import { Cline } from "../../../core/Cline" // Adjust path as necessary
import { AutoApprovalSettings } from "../../../shared/AutoApprovalSettings"
import { BrowserSettings } from "../../../shared/BrowserSettings"
import { ChatSettings } from "../../../shared/ChatSettings"
import { ApiConfiguration } from "../../../shared/api"
import { MockClineProvider } from "./mocks/MockClineProvider"
import { MockApiHandler } from "./mocks/MockApiHandler"
import { MockTerminalManager } from "./mocks/MockTerminalManager"
import { MockBrowserSession } from "./mocks/MockBrowserSession"
import { MockUrlContentFetcher } from "./mocks/MockUrlContentFetcher"
import { HistoryItem } from "../../../shared/HistoryItem"
import { ClineCheckpointRestore } from "../../../shared/WebviewMessage"
import CheckpointTracker from "../../../integrations/checkpoints/CheckpointTracker"

describe("Cline - Checkpoints Tests", () => {
  let provider: MockClineProvider
  let apiConfig: ApiConfiguration
  let autoApprovalSettings: AutoApprovalSettings
  let browserSettings: BrowserSettings
  let chatSettings: ChatSettings
  let mockHistoryItem: HistoryItem

  beforeEach(() => {
    provider = new MockClineProvider()
    apiConfig = { provider: "mock", model: "mock-model" }
    autoApprovalSettings = {
      enabled: false,
      maxRequests: 5,
      actions: {
        readFiles: false,
        editFiles: false,
        executeCommands: false,
        useBrowser: false,
        useMcp: false
      },
      enableNotifications: false
    }
    browserSettings = { headless: true, devtools: false }
    chatSettings = { mode: "act" }
    mockHistoryItem = {
      id: "checkpoint-tests-1",
      ts: Date.now(),
      task: "Testing checkpoint usage",
      tokensIn: 0,
      tokensOut: 0,
      cacheWrites: 0,
      cacheReads: 0,
      totalCost: 0,
      size: 0,
      shadowGitConfigWorkTree: undefined,
      conversationHistoryDeletedRange: undefined
    }

    // Stub out necessary provider calls
    sinon.stub(provider, "context").value({} as any)
    sinon.stub(provider, "createApiHandler").callsFake(() => new MockApiHandler())
    sinon.stub(provider, "createTerminalManager").callsFake(() => new MockTerminalManager())
    sinon.stub(provider, "createBrowserSession").callsFake(() => new MockBrowserSession())
    sinon.stub(provider, "createUrlContentFetcher").callsFake(() => new MockUrlContentFetcher())

    // We often want to stub "CheckpointTracker.create(...)"
    sinon.stub(CheckpointTracker, "create").callsFake(async () => {
      const fakeTracker = {
        resetHead: sinon.stub().resolves(undefined),
        commit: sinon.stub().resolves("mock-commit-hash"),
        getDiffSet: sinon.stub().resolves([]),
        getShadowGitConfigWorkTree: sinon.stub().resolves(undefined)
      }
      return fakeTracker as any
    })
  })

  afterEach(() => {
    sinon.restore()
  })

  it("should restore checkpoint for 'task' only without restoring workspace", async () => {
    // Create a new Cline with a stubbed lastCheckpointHash in one of its messages
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Checkpoint test: task only",
      undefined,
      undefined
    )

    // Suppose we add a message that has lastCheckpointHash
    cline.clineMessages.push({
      ts: 1001,
      type: "say",
      say: "completion_result",
      text: "Completed something.",
      lastCheckpointHash: "mock-hash-for-task",
      conversationHistoryIndex: 0,
      conversationHistoryDeletedRange: undefined
    })

    // Call restoreCheckpoint with "task"
    await cline.restoreCheckpoint(1001, "task")

    // Because "task" means do not restore workspace changes, we check that we did NOT call resetHead
    const trackerInstance = (CheckpointTracker.create as sinon.SinonStub).returnValues[0]
    const actualTracker = await trackerInstance
    expect(actualTracker.resetHead.called).to.be.false

    // Possibly also check that "vscode.window.showInformationMessage" got triggered
    // if you want to confirm user feedback. You might stub that as well if needed.

    // Validate any conversation resets as appropriate
    // e.g. if your code slices the conversation. If you want to confirm that,
    // you can examine cline.apiConversationHistory or cline.clineMessages
  })

  it("should restore checkpoint for 'taskAndWorkspace' including resetHead", async () => {
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Checkpoint test: task + workspace",
      undefined,
      undefined
    )

    cline.clineMessages.push({
      ts: 1002,
      type: "say",
      say: "completion_result",
      text: "Another done step",
      lastCheckpointHash: "mock-hash-2",
      conversationHistoryIndex: 2,
      conversationHistoryDeletedRange: undefined
    })

    await cline.restoreCheckpoint(1002, "taskAndWorkspace")

    // Expect resetHead to be called
    const trackerInstance = (CheckpointTracker.create as sinon.SinonStub).returnValues[0]
    const actualTracker = await trackerInstance
    expect(actualTracker.resetHead.calledOnce).to.be.true
    expect(actualTracker.resetHead.firstCall.args[0]).to.equal("mock-hash-2")
  })

  it("should present multifile diff via presentMultifileDiff(...) and handle no changes found", async () => {
    // The mock getDiffSet above returns an empty array by default
    // so we'll verify that it gracefully handles "No changes found" scenario
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Diff test",
      undefined,
      undefined
    )

    cline.clineMessages.push({
      ts: 1234,
      type: "say",
      say: "completion_result",
      text: "Completion with checkpoint",
      lastCheckpointHash: "mock-hash-for-diff",
      conversationHistoryIndex: 0,
      conversationHistoryDeletedRange: undefined
    })

    // You might stub out vscode.window.showInformationMessage to check the text
    const showInfoStub = sinon.stub((cline as any).providerRef.deref(), "showInformationMessage")

    // Attempt to present a multifile diff
    await cline.presentMultifileDiff(1234, false)

    // Because getDiffSet returns [], we expect it to say "No changes found"
    expect(showInfoStub.called).to.be.true
    const callArg = showInfoStub.firstCall.args[0]
    expect(callArg).to.include("No changes found")
  })

  it("should detect new changes after latest completion using doesLatestTaskCompletionHaveNewChanges()", async () => {
    // We'll configure getDiffSet to return a non-empty result
    ;(CheckpointTracker.create as sinon.SinonStub).callsFake(async () => {
      const fakeTracker = {
        resetHead: sinon.stub().resolves(undefined),
        commit: sinon.stub().resolves("mock-commit-hash"),
        getDiffSet: sinon.stub().resolves([
          // Simulate 1 changed file
          {
            relativePath: "src/index.js",
            absolutePath: "/abs/path/to/src/index.js",
            before: "old content",
            after: "new content"
          }
        ]),
        getShadowGitConfigWorkTree: sinon.stub().resolves(undefined)
      }
      return fakeTracker as any
    })

    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Detect new changes",
      undefined,
      undefined
    )

    // Add a completion_result message w/ a checkpoint
    cline.clineMessages.push({
      ts: 9999,
      type: "say",
      say: "completion_result",
      text: "Some final result",
      lastCheckpointHash: "completion-hash",
      conversationHistoryIndex: 2,
      conversationHistoryDeletedRange: undefined
    })

    const hasChanges = await cline.doesLatestTaskCompletionHaveNewChanges()
    expect(hasChanges).to.be.true
  })

  it("should save a new checkpoint using saveCheckpoint()", async () => {
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Checkpoint Save Test",
      undefined,
      undefined
    )

    // Add multiple messages
    cline.clineMessages.push({
      ts: 101,
      type: "ask",
      ask: "tool",
      text: "Some usage",
      lastCheckpointHash: undefined,
      conversationHistoryIndex: 0,
      conversationHistoryDeletedRange: undefined
    })
    cline.clineMessages.push({
      ts: 102,
      type: "say",
      say: "completion_result",
      text: "We ended up with changes",
      lastCheckpointHash: undefined,
      conversationHistoryIndex: 1,
      conversationHistoryDeletedRange: undefined
    })

    // Now call saveCheckpoint
    await cline.saveCheckpoint()

    // The stubbed commit() returns "mock-commit-hash"
    // Expect the last tool usage message to have lastCheckpointHash = "mock-commit-hash"
    const lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.lastCheckpointHash).to.equal("mock-commit-hash")

    // Also confirm earlier messages remain unmarked until we find a tool usage or completion
    // If your code sets them all, adapt accordingly. The standard approach is that
    // it only sets the last "tool or completion" usage with the checkpoint hash, 
    // or possibly every subsequent item until the previous hash, etc.
  })
})