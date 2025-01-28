/**
 * ClineTools.test.ts
 *
 * Verifies how Cline handles tool usage—especially user approval vs. rejection,
 * partial vs. complete tool calls, auto-approval, etc.
 *
 * We test from a "black box" perspective by calling public methods that result
 * in tool usage, rather than calling internal sub-methods directly.
 */

import { expect } from "chai"
import sinon from "sinon"
import { Cline } from "../../../core/Cline" // Adjust path as needed
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
import { ClineAskResponse, ClineMessage } from "../../../shared/WebviewMessage"
import { ClineAsk, ClineSay } from "../../../shared/ExtensionMessage"

describe("Cline - Tools Usage Tests", () => {
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
    stubbedHistoryItem = {
      id: "tools-tests-1",
      ts: Date.now(),
      task: "Testing tool usage",
      tokensIn: 0,
      tokensOut: 0,
      cacheWrites: 0,
      cacheReads: 0,
      totalCost: 0,
      size: 0,
      shadowGitConfigWorkTree: undefined,
      conversationHistoryDeletedRange: undefined
    }

    // Stub out necessary provider methods
    sinon.stub(provider, "context").value({} as any)
    sinon.stub(provider, "createApiHandler").callsFake(() => new MockApiHandler())
    sinon.stub(provider, "createTerminalManager").callsFake(() => new MockTerminalManager())
    sinon.stub(provider, "createBrowserSession").callsFake(() => new MockBrowserSession())
    sinon.stub(provider, "createUrlContentFetcher").callsFake(() => new MockUrlContentFetcher())
  })

  afterEach(() => {
    sinon.restore()
  })

  it("should handle execute_command with user approval (happy path)", async () => {
    // 1. Configure auto-approval for commands = false (so we test user approval)
    autoApprovalSettings.actions.executeCommands = false

    // 2. Create new Cline
    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Task with Tools",
      undefined,
      undefined
    )

    // 3. Pretend the LLM tries to execute a command => call a "tool_use" block
    // from the "assistant message" perspective, but black-box we do an "ask"
    // that includes "execute_command" data. We’ll do partial = false, 
    // so it tries to finalize the tool usage right away.

    // We'll simulate the "tool" ask from the assistant:
    const askType: ClineAsk = "tool"
    const toolPayload = JSON.stringify({
      tool: "execute_command",
      path: "/some/path", // might not matter
      command: "npm run build",
      requires_approval: "false"
    })

    // We'll stub handleWebviewAskResponse to pretend user clicks "yesButtonClicked"
    // (User approves the tool usage)
    sinon.stub(cline, "handleWebviewAskResponse").callsFake(
      (resp: ClineAskResponse, text?: string, images?: string[]) => {
        // force it to set the askResponse 
        ;(cline as any).askResponse = resp
        ;(cline as any).askResponseText = text
        ;(cline as any).askResponseImages = images
      }
    )

    // Now we trigger the ask:
    await cline.ask(askType, toolPayload, false)
    // This should cause a "tool use" workflow for execute_command. 
    // Because user approval is stubbed to "yesButtonClicked", it is allowed.

    // 4. Check that the final messages reflect the tool usage
    const lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.type).to.equal("ask")
    expect(lastMsg.ask).to.equal("tool")

    // Tools typically produce a "command" or "command_output" say message 
    // or final "tool_result" appended. Let's see if cline recorded a follow-up:
    const commandOutputMsg = cline.clineMessages.find(
      (m) => m.type === "say" && m.say === "command_output"
    )
    // The real code might generate partial outputs. 
    // If so, we at least confirm there's something about the command usage.
    // If your code lumps final results differently, adapt the checks as needed.
    expect(commandOutputMsg).to.exist
  })

  it("should handle execute_command with user rejection", async () => {
    // 1. Turn off auto-approval
    autoApprovalSettings.actions.executeCommands = false

    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Task with Tools",
      undefined,
      undefined
    )

    // 2. Stub handleWebviewAskResponse to simulate user clicked "messageResponse" / no
    sinon.stub(cline, "handleWebviewAskResponse").callsFake(
      (resp: ClineAskResponse, text?: string, images?: string[]) => {
        // For a user rejection, we might do:
        if (resp === "messageResponse") {
          ;(cline as any).askResponse = resp
          ;(cline as any).askResponseText = text
          ;(cline as any).askResponseImages = images
        } else {
          // Possibly "noButtonClicked"
          ;(cline as any).askResponse = "noButtonClicked"
        }
      }
    )

    // 3. Trigger a "tool" ask for "execute_command"
    const askType: ClineAsk = "tool"
    const commandPayload = JSON.stringify({
      tool: "execute_command",
      command: "rm -rf /some/important/files",
      requires_approval: "true"
    })

    // Because the user "rejects," we expect the code to produce a "denied" flow
    await cline.ask(askType, commandPayload, false)

    // 4. Check the clineMessages to see if it posted something like "The user denied this operation."
    const denialMsg = cline.clineMessages.find(
      (m) => m.type === "say" && m.say === "tool"
        && m.text?.includes("The user denied this operation.")
    )
    expect(denialMsg).to.exist
  })

  it("should handle read_file tool usage with auto-approval turned ON for readFiles", async () => {
    // 1. Turn on auto-approval for readFiles
    autoApprovalSettings.enabled = true
    autoApprovalSettings.actions.readFiles = true
    autoApprovalSettings.maxRequests = 3

    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Reading files",
      undefined,
      undefined
    )

    // 2. Stub handleWebviewAskResponse in case something tries to prompt the user
    sinon.stub(cline, "handleWebviewAskResponse").callsFake(
      (resp: ClineAskResponse, text?: string, images?: string[]) => {
        (cline as any).askResponse = resp
        (cline as any).askResponseText = text
        (cline as any).askResponseImages = images
      }
    )

    // 3. Trigger read_file usage
    const askType: ClineAsk = "tool"
    const readFilePayload = JSON.stringify({
      tool: "read_file",
      path: "src/core/Cline.ts"
    })
    await cline.ask(askType, readFilePayload, false)

    // 4. Since auto-approval is enabled for readFiles, we expect no user prompt
    // The final result might appear in a "tool_result" or "tool" message referencing file content
    // Let's check clineMessages
    const readFileMsg = cline.clineMessages.find((m) => {
      return (
        m.type === "say" &&
        m.say === "tool" &&
        m.text?.includes("readFile")
      )
    })
    expect(readFileMsg).to.exist
    expect(readFileMsg?.text).to.include("Cline.ts")
  })

  it("should handle partial replace_in_file (diff) scenario", async () => {
    // We'll test that partial usage is recognized, then finalized
    autoApprovalSettings.actions.editFiles = true // So it auto-approves

    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Replacing content",
      undefined,
      undefined
    )

    sinon.stub(cline, "handleWebviewAskResponse").callsFake(
      (resp: ClineAskResponse, text?: string, images?: string[]) => {
        (cline as any).askResponse = resp
        (cline as any).askResponseText = text
        (cline as any).askResponseImages = images
      }
    )

    // 1. partial = true (streaming diff)
    let errorCaught = false
    try {
      await cline.ask(
        "tool",
        JSON.stringify({
          tool: "replace_in_file",
          path: "src/index.js",
          diff: "---a\n+++b\n-someLine\n+replacement"
        }),
        true
      )
    } catch (err) {
      // The partial logic often throws "Current ask promise was ignored" to break streaming
      errorCaught = true
      expect(err.message).to.include("ignored")
    }
    expect(errorCaught).to.be.true

    // Check the last message is partial
    let lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.type).to.equal("ask")
    expect(lastMsg.ask).to.equal("tool")
    expect(lastMsg.partial).to.equal(true)

    // 2. partial = false => finalize
    await cline.ask(
      "tool",
      JSON.stringify({
        tool: "replace_in_file",
        path: "src/index.js",
        diff: "---a\n+++b\n-someLine\n+replacement (complete version)"
      }),
      false
    )

    // Check it’s now not partial
    lastMsg = cline.clineMessages[cline.clineMessages.length - 1]
    expect(lastMsg.partial).to.equal(false)
    expect(lastMsg.text).to.include("replace_in_file")
    expect(lastMsg.text).to.include("complete version")

    // Possibly check that some "toolResult" or "The content was successfully saved" text
    const finalFileEditMsg = cline.clineMessages.find((m) => {
      return (
        m.type === "say" &&
        m.say === "tool" &&
        m.text?.includes("The content was successfully saved")
      )
    })
    expect(finalFileEditMsg).to.exist
  })

  it("should handle auto-approval limit (autoApprovalSettings.maxRequests)", async () => {
    // In this test we confirm that after a certain # of auto-approved requests, 
    // the user is prompted or something else is triggered to reset the count.

    autoApprovalSettings.enabled = true
    autoApprovalSettings.actions.executeCommands = true
    autoApprovalSettings.maxRequests = 2 // e.g., only 2 auto-approvals before forcing user prompt

    const cline = new Cline(
      provider as any,
      apiConfig,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      undefined,
      "Check maxRequests limit",
      undefined,
      undefined
    )

    // stub user always says "yesButtonClicked" to reset count if asked
    sinon.stub(cline, "handleWebviewAskResponse").callsFake(
      (resp: ClineAskResponse) => {
        (cline as any).askResponse = resp
      }
    )

    // 1. Try a tool usage #1 -> auto-approve
    await cline.ask(
      "tool",
      JSON.stringify({
        tool: "execute_command",
        command: "echo 'Autoapprove1'",
        requires_approval: "false"
      }),
      false
    )
    // => Should pass as auto-approve #1

    // 2. Next usage #2 -> also auto-approve
    await cline.ask(
      "tool",
      JSON.stringify({
        tool: "execute_command",
        command: "echo 'Autoapprove2'",
        requires_approval: "false"
      }),
      false
    )
    // => That’s the second auto-approval

    // 3. Third usage => auto-approval limit reached. 
    // The code should ask the user to reset or proceed
    await cline.ask(
      "tool",
      JSON.stringify({
        tool: "execute_command",
        command: "echo 'Autoapprove3 - but limit exceeded'",
        requires_approval: "false"
      }),
      false
    )

    // Check that there's a "auto_approval_max_req_reached" or something in clineMessages
    // depending on how your code handles that scenario
    const maxReqMessage = cline.clineMessages.find(
      (m: ClineMessage) => m.ask === "auto_approval_max_req_reached"
    )
    expect(maxReqMessage).to.exist
    // Then we stubbed user says "yesButtonClicked" => the auto-approval count is reset
    // You can check whether the next tool usage is auto-approved again, etc.
  })
})