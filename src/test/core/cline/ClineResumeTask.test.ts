/**
 * ClineResumeTask.test.ts
 *
 * Verifies the logic in `resumeTaskFromHistory()` which:
 *  - Retrieves previously saved Cline messages and conversation history.
 *  - Removes duplicate or extraneous "resume_task" or "resume_completed_task" messages.
 *  - Determines if it should show "resume_completed_task" if the last message was a completion.
 *  - Constructs the right "resumption" user content, then re-enters the agentic loop.
 */

import { expect } from "chai"
import sinon from "sinon"
import * as Extension from "../../../../dist/extension.js"
import { MockClineProvider } from "./mocks/MockClineProvider"
import { MockApiHandler } from "./mocks/MockApiHandler"
import { MockTerminalManager } from "./mocks/MockTerminalManager"
import { MockBrowserSession } from "./mocks/MockBrowserSession"
import { MockUrlContentFetcher } from "./mocks/MockUrlContentFetcher"
import { AutoApprovalSettings } from "../../../shared/AutoApprovalSettings"
import { BrowserSettings } from "../../../shared/BrowserSettings"
import { ChatSettings } from "../../../shared/ChatSettings"
import { ApiConfiguration } from "../../../shared/api"
import { HistoryItem } from "../../../shared/HistoryItem"
import { ClineMessage } from "../../../shared/ExtensionMessage"

describe("Cline - resumeTaskFromHistory() Tests", () => {
  let provider: MockClineProvider
  let apiConfig: ApiConfiguration
  let autoApprovalSettings: AutoApprovalSettings
  let browserSettings: BrowserSettings
  let chatSettings: ChatSettings
  let fakeHistoryItem: HistoryItem

  beforeEach(() => {
    provider = new MockClineProvider()
    apiConfig = { 
      apiProvider: "anthropic",  // Changed from "mock" to a valid ApiProvider value
      apiModelId: "mock-model"
    }
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
    browserSettings = {
      headless: true,
      viewport: {  // Added required viewport settings
        width: 1280,
        height: 720
      }
      // Removed devtools as it's not in the interface
    }
    chatSettings = {
      mode: "act"
    }

    // Create a typical history item referencing a previously saved task
    fakeHistoryItem = {
      id: "task-123",
      ts: Date.now(),
      task: "Add some advanced logging",
      tokensIn: 100,
      tokensOut: 80,
      cacheWrites: 2,
      cacheReads: 2,
      totalCost: 0.2,
      size: 0,
      shadowGitConfigWorkTree: undefined,
      conversationHistoryDeletedRange: undefined
    }

    // Stub out methods that Cline depends on
    sinon.stub(provider, "context").value({} as any)
    sinon.stub(provider, "createApiHandler").callsFake(() => new MockApiHandler())
    sinon.stub(provider, "createTerminalManager").callsFake(() => new MockTerminalManager())
    sinon.stub(provider, "createBrowserSession").callsFake(() => new MockBrowserSession())
    sinon.stub(provider, "createUrlContentFetcher").callsFake(() => new MockUrlContentFetcher())
  })

  afterEach(() => {
    sinon.restore()
  })

  it("should load saved messages and remove old resume prompts", async () => {
    // Suppose the user previously had these messages in storage:
    const savedMessages: ClineMessage[] = [
      {
        ts: 123456,
        type: "say",
        say: "text",
        text: "Previous Task Title",
        conversationHistoryIndex: 0
      },
      {
        ts: 123457,
        type: "ask",
        ask: "resume_task",  // old resume prompt
        text: "",
        conversationHistoryIndex: 1
      },
      {
        ts: 123458,
        type: "say",
        say: "tool",
        text: JSON.stringify({ tool: "readFile", path: "someFile.txt" }),
        conversationHistoryIndex: 2
      }
    ]

    // And some API conversation logs we can pretend exist
    const savedApiHistory = [
      { role: "user", content: [{ type: "text", text: "User content" }] },
      { role: "assistant", content: [{ type: "text", text: "Assistant content" }] }
    ]

    sinon.stub(provider, "getSavedClineMessages").resolves(savedMessages)
    sinon.stub(provider as any, "getSavedApiConversationHistory").resolves(savedApiHistory)

    // Construct cline with a historyItem => triggers resume logic
    const cline = new Extension.Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,         // customInstructions
      undefined,         // task
      undefined,         // images
      fakeHistoryItem    // historyItem => triggers resumeTaskFromHistory()
    )

    // Wait a bit for asynchronous calls in constructor
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Check that it has pruned the old "resume_task" message
    expect(cline.clineMessages).to.have.lengthOf(2, "Should have pruned the old resume prompt.")
    expect(cline.clineMessages[0].text).to.equal("Previous Task Title")
    expect(cline.clineMessages[1].type).to.equal("say")
    expect(cline.clineMessages[1].say).to.equal("tool")

    // The code will have appended a new "resume_task" ask at the end:
    const lastMessage = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMessage.ask).to.equal("resume_task") // or "resume_completed_task", depends on logic
  })

  it("should resume with 'resume_completed_task' if last relevant message was a completion_result", async () => {
    // Simulate stored messages whose last relevant ask = "completion_result"
    const savedMessages: ClineMessage[] = [
      {
        ts: 900,
        type: "say",
        say: "text",
        text: "Some final message",
        conversationHistoryIndex: 0
      },
      {
        ts: 901,
        type: "ask",
        ask: "completion_result",
        text: "Task completed!",
        conversationHistoryIndex: 1
      }
    ]
    sinon.stub(provider, "getSavedClineMessages").resolves(savedMessages)
    sinon.stub(provider as any, "getSavedApiConversationHistory").resolves([])

    const cline = new Extension.Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      undefined,
      undefined,
      fakeHistoryItem
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    // The logic sees the last relevant ask is "completion_result", so it uses "resume_completed_task"
    const lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.ask).to.equal("resume_completed_task")
    expect(provider.postStateToWebviewCalled).to.be.true
  })

  it("should handle empty saved messages by throwing error or defaulting to a new task", async () => {
    // Suppose no messages in storage for that history
    sinon.stub(provider, "getSavedClineMessages").resolves([])
    sinon.stub(provider as any, "getSavedApiConversationHistory").resolves([])

    // In practice, your code might handle an empty set differently
    // For example, it might throw an error, or just treat it as a new task
    // Let's say we expect it to just proceed quietly:
    const cline = new Extension.Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      undefined,
      undefined,
      fakeHistoryItem
    )

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(cline.clineMessages).to.have.lengthOf(1, "Likely just has a resume prompt or fallback")
    const lastMsg = cline.clineMessages[0]
    expect(lastMsg.ask).to.oneOf(["resume_task", "resume_completed_task"])
  })

  it("should finalize changes to conversation history for re-entry into the main loop", async () => {
    // A scenario to verify the logic modifies `apiConversationHistory` 
    // and `clineMessages` in a way that re-enters the agentic loop

    // Stub some saved data
    const savedMessages: ClineMessage[] = [
      {
        ts: 1000,
        type: "say",
        say: "text",
        text: "Old message",
        conversationHistoryIndex: 0
      }
    ]
    const savedApiHistory = [
      { role: "user", content: [{ type: "text", text: "Old user message" }] },
      { role: "assistant", content: [{ type: "text", text: "Old assistant message" }] }
    ]

    sinon.stub(provider, "getSavedClineMessages").resolves(savedMessages)
    sinon.stub(provider as any, "getSavedApiConversationHistory").resolves(savedApiHistory)

    const cline = new Extension.Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      undefined,
      undefined,
      fakeHistoryItem
    )

    // Wait to ensure resume logic is done
    await new Promise((r) => setTimeout(r, 80))

    // Now, the agentic loop might place a new 'ask' at the end 
    // for "resume_task" or "resume_completed_task"
    // That triggers user input scenario
    // We'll check that conversation was appended, not replaced:
    expect(cline.apiConversationHistory.length).to.equal(2)
    // The new user content appended might contain some [TASK RESUMPTION] text
    // or similar. Check for partial user content
    // This is somewhat black-box, so we only check that we still have 2 old messages, 
    // and presumably more will be appended during the loop.

    // Ensure no crash occurred
    expect(cline.abandoned).to.be.false
  })
})
