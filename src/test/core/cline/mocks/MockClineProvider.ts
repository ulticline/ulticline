// MockClineProvider.ts
import { ClineProvider } from "../../../core/webview/ClineProvider"

export class MockClineProvider extends ClineProvider {
  constructor() {
    // pass in some mock extension context if needed
    super({} as any)
  }

  updateTaskHistory(info: any) {
    // store the updated info or do nothing
  }

  postMessageToWebview(message: any) {
    // track or log the posted message
  }

  cancelTask() {
    // no-op or track calls
  }
}