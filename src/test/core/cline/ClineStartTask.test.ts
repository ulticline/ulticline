/**
 * ClineStartTask.test.ts
 *
 * This test suite focuses on verifying that calling `cline.startTask(...)`:
 *  - Initializes the conversation and clineMessages properly.
 *  - Writes messages to the webview.
 *  - Handles optional images.
 *  - Creates the correct states for subsequent usage (isInitialized, etc.).
 *  - Mocks out external dependencies for repeatable tests.
 */

import { expect } from "chai"
import sinon from "sinon"
import { Cline } from "../../../core/Cline" // <-- Adjust path as needed
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

describe("Cline - startTask() Tests", () => {
  let provider: MockClineProvider
  let apiConfig: ApiConfiguration
  let autoApprovalSettings: AutoApprovalSettings
  let browserSettings: BrowserSettings
  let chatSettings: ChatSettings

  beforeEach(() => {
    provider = new MockClineProvider()
    apiConfig = {
      apiProvider: "anthropic",
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
      viewport: {
        width: 1280,
        height: 720
      }
    }
    chatSettings = { mode: "act" } as ChatSettings

    (provider as any).postStateToWebviewCalled = false

    provider.getSavedClineMessages = async () => {
      return []
    }

    sinon.stub(provider, "context").value({} as any) // if provider.context is needed

    sinon.stub(provider, "createApiHandler").callsFake(() => new MockApiHandler())
    sinon.stub(provider, "createTerminalManager").callsFake(() => new MockTerminalManager())
    sinon.stub(provider, "createBrowserSession").callsFake(() => new MockBrowserSession())
    sinon.stub(provider, "createUrlContentFetcher").callsFake(() => new MockUrlContentFetcher())

    // Example: You could mock fs, path, or vscode APIs globally if needed
    // using sinon.stub or a library like mock-fs / mock-require
  })

  afterEach(() => {
    sinon.restore()
  })

  it("should initialize a new task with a provided title", async () => {
    const taskTitle = "Implement a Hello World feature"
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      /* customInstructions? */ undefined,
      /* task? */ taskTitle,
      /* images? */ undefined,
      /* historyItem? */ undefined
    )

    // Check internal state
    expect(cline.isInitialized).to.be.true
    expect(cline.clineMessages).to.have.lengthOf(1, "Should have 1 message (the user-supplied task)")

    const firstMessage = cline.clineMessages[0]
    expect(firstMessage.text).to.equal(taskTitle, "Message text should match the provided task")
    expect(firstMessage.type).to.equal("say")
    expect(firstMessage.say).to.equal("text")

    // Optionally check that postStateToWebview or other provider actions were called
    expect(provider.postStateToWebviewCalled).to.be.true
  })

  it("should initialize a new task with images", async () => {
    const taskTitle = "Add images to new task"
    const images = ["base64image1", "base64image2"]
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,    // customInstructions?
      taskTitle,
      images        // images
    )

    // Verify images appended in the first message
    expect(cline.isInitialized).to.be.true
    expect(cline.clineMessages).to.have.lengthOf(1)
    const firstMessage = cline.clineMessages[0]

    expect(firstMessage.text).to.equal(taskTitle)
    expect(firstMessage.images).to.deep.equal(images)
    expect(firstMessage.type).to.equal("say")
    expect(firstMessage.say).to.equal("text")

    // Verify provider actions
    expect(provider.postStateToWebviewCalled).to.be.true
  })

  it("should throw if no task/title or images is provided without historyItem", () => {
    expect(() => {
      // Provide neither task nor images
      new Cline(
        provider as any,
        apiConfig,
        autoApprovalSettings,
        browserSettings,
        chatSettings
      )
    }).to.throw("Either historyItem or task/images must be provided")
  })

  it("should not overwrite existing messages if resuming from historyItem", async () => {
    // Suppose we have a HistoryItem that references a stored task
    const historyItem: HistoryItem = {
      id: "1234",
      ts: Date.now(),
      task: "Existing saved task",
      tokensIn: 0,
      tokensOut: 0,
      cacheWrites: 0,
      cacheReads: 0,
      totalCost: 0,
      size: 0,
      shadowGitConfigWorkTree: undefined,
      conversationHistoryDeletedRange: undefined
    }

    // Pretend the storage has some saved clineMessages
    sinon.stub(provider, "getSavedClineMessages").returns(
      Promise.resolve([
        {
          ts: 555,
          type: "say",
          say: "text",
          text: "Previously saved message",
          conversationHistoryIndex: 0
        }
      ]) as any
    )

    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined, // customInstructions
      undefined, // task
      undefined, // images
      historyItem
    )

    // Wait for async resume code to run
    // In practice, you might need to wait for cline to fully initialize or mock certain calls
    await new Promise((resolve) => setTimeout(resolve, 50))

    // The constructor calls resumeTaskFromHistory() if a historyItem is given
    // Ensure the old message was not overwritten
    expect(cline.clineMessages).to.have.lengthOf(1)
    expect(cline.clineMessages[0].text).to.equal("Previously saved message")
  })

  // Additional tests for edge cases around startTask() can go here
})
