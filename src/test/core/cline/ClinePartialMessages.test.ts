/**
 * ClinePartialMessages.test.ts
 *
 * Verifies that partial messages for both "ask" and "say" are created,
 * updated, completed, or possibly ignored as expected in Cline.ts.
 */

import { expect } from "chai"
import sinon from "sinon"
import { Cline } from "../../../core/Cline" // Adjust path as needed
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
import { ClineAsk, ClineSay } from "../../../shared/ExtensionMessage"

describe("Cline - Partial Messages (ask/say) Tests", () => {
  let provider: MockClineProvider
  let apiConfig: ApiConfiguration
  let autoApprovalSettings: AutoApprovalSettings
  let browserSettings: BrowserSettings
  let chatSettings: ChatSettings
  let stubbedHistoryItem: HistoryItem

  beforeEach(() => {
    provider = new MockClineProvider()
    apiConfig = { provider: "mock", model: "mock-model" }
    autoApprovalSettings = {
      enabled: false,
      maxRequests: 10,
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
    stubbedHistoryItem = {
      id: "partial-test-1",
      ts: Date.now(),
      task: "Testing partial messages",
      tokensIn: 0,
      tokensOut: 0,
      cacheWrites: 0,
      cacheReads: 0,
      totalCost: 0,
      size: 0,
      shadowGitConfigWorkTree: undefined,
      conversationHistoryDeletedRange: undefined
    }

    // Stub out "provider" methods that Cline depends on
    sinon.stub(provider, "context").value({} as any)
    sinon.stub(provider, "createApiHandler").callsFake(() => new MockApiHandler())
    sinon.stub(provider, "createTerminalManager").callsFake(() => new MockTerminalManager())
    sinon.stub(provider, "createBrowserSession").callsFake(() => new MockBrowserSession())
    sinon.stub(provider, "createUrlContentFetcher").callsFake(() => new MockUrlContentFetcher())
  })

  afterEach(() => {
    sinon.restore()
  })

  it("should record a partial 'ask(...)' and finalize it when partial=false is called", async () => {
    // Create a new Cline instance without an existing historyItem => new task
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Initial Task",
      undefined,
      undefined
    )

    // 1. Provide a partial ask
    const partialType: ClineAsk = "command_output" // example
    let errorCaught = false

    try {
      // This simulates a streaming scenario: pass partial=true
      // We expect that the first partial call actually creates a new message
      await cline.ask(partialType, "Partial chunk #1", true)
      // Because it's partial, it should throw an error: "Current ask promise was ignored"
      // to indicate we haven't completed it yet. That’s normal for partial usage flows.
    } catch (e) {
      errorCaught = true
      expect(e.message).to.include("ignored")
    }
    expect(errorCaught).to.be.true
    expect(cline.clineMessages).to.have.length.greaterThan(1) 
    // The last message in clineMessages is partial => we can verify
    const lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.type).to.equal("ask")
    expect(lastMsg.ask).to.equal(partialType)
    expect(lastMsg.partial).to.equal(true)
    expect(lastMsg.text).to.equal("Partial chunk #1")

    // 2. "Update" partial with next chunk
    errorCaught = false
    try {
      await cline.ask(partialType, "Partial chunk #2", true)
    } catch (e) {
      errorCaught = true
      expect(e.message).to.include("ignored")
    }
    expect(errorCaught).to.be.true

    // Confirm that the last message was updated with text = "Partial chunk #2"
    const updatedLast = cline.clineMessages[cline.clineMessages.length - 1]
    expect(updatedLast.text).to.equal("Partial chunk #2")

    // 3. Finalize partial => partial=false
    // This returns a final "ask" promise and no error is thrown
    const finalAskResult = await cline.ask(partialType, "Partial complete text", false)
    // finalAskResult is the object containing { response, text, images } 
    // which we normally get from handleWebviewAskResponse. Because we haven't
    // actually triggered handleWebviewAskResponse, the default test stubs might 
    // not supply a real user response, so `response` is likely undefined or an empty mock.
    expect(finalAskResult).to.be.an("object")
    expect(finalAskResult.text).to.be.undefined 
    // or a default stub

    const finalLastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(finalLastMsg.partial).to.equal(false)
    expect(finalLastMsg.text).to.equal("Partial complete text")
    expect(finalLastMsg.ask).to.equal(partialType)
  })

  it("should ignore partial ask if a new ask is created of a different type", async () => {
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Another Task",
      undefined,
      undefined
    )
    
    // 1. Start partial ask
    let errorCaught = false
    try {
      await cline.ask("command_output", "First partial chunk", true)
    } catch (e) {
      errorCaught = true
      expect(e.message).to.include("ignored")
    }
    expect(errorCaught).to.be.true

    // 2. Instead of finalizing that partial, we invoke a brand new ask with a different type
    const newAskResult = await cline.ask("followup", "Completely different ask", false)
    expect(newAskResult).to.be.an("object")

    // The partial ask for "command_output" is effectively ignored or replaced
    const lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.ask).to.equal("followup")
    expect(lastMsg.text).to.equal("Completely different ask")

    // Confirm we no longer have the partial "command_output" at the end
    // Because once a new ask is recognized, the old partial is basically overshadowed
    const secondToLast = cline.clineMessages[cline.clineMessages.length - 2]
    expect(secondToLast.ask).not.to.equal("command_output")
  })

  it("should handle partial 'say(...)' similarly, updating or ignoring partial messages", async () => {
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Partial say test",
      undefined,
      undefined
    )

    // partial say
    await cline.say("text", "Partial say chunk #1", undefined, true).catch((err) => {
      // For partial .say(...) we do not always rely on an error. 
      // This depends on how your implementation is set up
    })
    let lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.say).to.equal("text")
    expect(lastMsg.partial).to.equal(true)
    expect(lastMsg.text).to.equal("Partial say chunk #1")

    // Update partial
    await cline.say("text", "Partial say chunk #2", undefined, true).catch(() => {})
    lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.text).to.equal("Partial say chunk #2")

    // Complete partial
    await cline.say("text", "Fully complete say message", undefined, false)
    lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.text).to.equal("Fully complete say message")
    expect(lastMsg.partial).to.be.false
  })

  it("should properly remove partial messages when asked (removeLastPartialMessageIfExistsWithType)", async () => {
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Cleanup partial",
      undefined,
      undefined
    )

    // create partial ask
    let errorCaught = false
    try {
      await cline.ask("tool", "Partial tool chunk #1", true)
    } catch (e) {
      errorCaught = true
    }
    expect(errorCaught).to.be.true

    // Now we want to remove that partial if it exists
    await cline.removeLastPartialMessageIfExistsWithType("ask", "tool")

    // check that the last message is no longer partial ask=tool
    const lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.ask).not.to.equal("tool")
    expect(lastMsg.partial).not.to.equal(true)
  })
})