// MockClineProvider.ts
import { ClineProvider } from "../../../../core/webview/ClineProvider"
import { MockApiHandler } from "./MockApiHandler"
import { MockTerminalManager } from "./MockTerminalManager"
import { MockBrowserSession } from "./MockBrowserSession"
import { MockUrlContentFetcher } from "./MockUrlContentFetcher"
import { HistoryItem } from "../../../../shared/HistoryItem"
import { ExtensionMessage } from "../../../../shared/ExtensionMessage"
import { Disposable, OutputChannel, window } from "vscode"

export class MockClineProvider extends ClineProvider {
  public postStateToWebviewCalled: boolean = false
  
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
  }

  createApiHandler() {
    return new MockApiHandler()
  }

  createTerminalManager() {
    return new MockTerminalManager()
  }

  createBrowserSession() {
    return new MockBrowserSession()
  }

  createUrlContentFetcher() {
    return new MockUrlContentFetcher()
  }

  override async updateTaskHistory(info: HistoryItem): Promise<HistoryItem[]> {
    // store the updated info or do nothing
    return []
  }

  override async postMessageToWebview(message: ExtensionMessage): Promise<void> {
    // track or log the posted message
  }

  override async cancelTask(): Promise<void> {
    // no-op or track calls
  }

  async getSavedClineMessages(): Promise<any[]> {
    return []
  }

  async getSavedApiConversationHistory(): Promise<any[]> {
    return []
  }

  override async postStateToWebview(): Promise<void> {
    this.postStateToWebviewCalled = true
  }
}