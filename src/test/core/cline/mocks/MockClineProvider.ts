// MockClineProvider.ts
import * as Extension from "../../../../../dist/extension.js"
import { MockApiHandler } from "./MockApiHandler"
import { MockTerminalManager } from "./MockTerminalManager"
import { MockBrowserSession } from "./MockBrowserSession"
import { MockUrlContentFetcher } from "./MockUrlContentFetcher"
import { HistoryItem } from "../../../../shared/HistoryItem"
import { ExtensionMessage } from "../../../../shared/ExtensionMessage"
import { ClineAskResponse } from "../../../../shared/WebviewMessage"
import { Disposable, OutputChannel, window } from "vscode"
import { IClineProvider } from "../../../../core/webview/IClineProvider"

export class MockClineProvider extends Extension.ClineProvider implements IClineProvider {
  public postStateToWebviewCalled: boolean = false
  public override context: any
  public askCalled: boolean = false
  public sayCalled: boolean = false
  
  constructor() {
    // Create a mock output channel
    const mockOutputChannel: OutputChannel = {
      name: 'Mock Output',
      append: () => {},
      appendLine: () => {},
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
      replace: () => {}
    } as OutputChannel

    super({} as any, mockOutputChannel)
    this.context = {}
  }

  override createApiHandler() {
    return new MockApiHandler()
  }

  override createTerminalManager() {
    return new MockTerminalManager()
  }

  override createBrowserSession() {
    return new MockBrowserSession()
  }

  override createUrlContentFetcher() {
    return new MockUrlContentFetcher()
  }

  override async updateTaskHistory(info: HistoryItem): Promise<HistoryItem[]> {
    return []
  }

  override async postMessageToWebview(message: ExtensionMessage): Promise<void> {
    // track or log the posted message
  }

  override async cancelTask(): Promise<void> {
    // no-op or track calls
  }

  override async getSavedClineMessages(): Promise<any[]> {
    return []
  }

  override async getSavedApiConversationHistory(): Promise<any[]> {
    return []
  }

  override async postStateToWebview(): Promise<void> {
    this.postStateToWebviewCalled = true
  }

  async ask(type: string, text?: string, partial?: boolean): Promise<{
    response: ClineAskResponse;
    text?: string;
    images?: string[];
  }> {
    this.askCalled = true
    return {
      response: "yesButtonClicked",
      text: "Mock response"
    }
  }

  async say(type: string, text?: string, images?: string[]): Promise<void> {
    this.sayCalled = true
  }
}
