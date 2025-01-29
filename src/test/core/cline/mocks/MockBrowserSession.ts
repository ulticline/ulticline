// MockBrowserSession.ts
import * as Extension from "../../../../../dist/extension.js"
import { BrowserActionResult } from "../../../../shared/ExtensionMessage"

export class MockBrowserSession extends Extension.BrowserSession {
  constructor() {
    super({}, {})
  }

  override async launchBrowser(): Promise<void> {
    // Just store a flag or do nothing
  }

  override async navigateToUrl(url: string): Promise<BrowserActionResult> {
    return { logs: "Mock logs", screenshot: "data:image/png;base64,AAAA..." }
  }

  override async click(coordinate: string): Promise<BrowserActionResult> {
    return { logs: "Clicked " + coordinate, screenshot: "data:image/png;base64,AAAA..." }
  }

  override async type(text: string): Promise<BrowserActionResult> {
    return { logs: "Typed " + text, screenshot: "data:image/png;base64,AAAA..." }
  }

  override async scrollDown(): Promise<BrowserActionResult> {
    return { logs: "Scrolled down", screenshot: "data:image/png;base64,AAAA..." }
  }

  override async scrollUp(): Promise<BrowserActionResult> {
    return { logs: "Scrolled up", screenshot: "data:image/png;base64,AAAA..." }
  }

  override async closeBrowser(): Promise<BrowserActionResult> {
    return { logs: "Browser closed", screenshot: "data:image/png;base64,AAAA..." }
  }

  override async goto(url: string): Promise<BrowserActionResult> {
    return { logs: "Navigated to " + url, screenshot: "data:image/png;base64,AAAA..." }
  }

  override async getScreenshot(): Promise<string> {
    return "data:image/png;base64,AAAA..."
  }

  override async getContent(): Promise<string> {
    return "<html><body>Mock content</body></html>"
  }
}