// MockBrowserSession.ts
import { BrowserSession } from "../../../services/browser/BrowserSession"
import { BrowserActionResult } from "../../../shared/ExtensionMessage"

export class MockBrowserSession extends BrowserSession {
  constructor() {
    super({} as any, {} as any) // pass empty or partial config
  }

  async launchBrowser() {
    // Just store a flag or do nothing
  }

  async navigateToUrl(url: string): Promise<BrowserActionResult> {
    return { logs: "Mock logs", screenshot: "data:image/png;base64,AAAA..." }
  }

  async click(coordinate: string): Promise<BrowserActionResult> {
    return { logs: "Clicked at coordinate " + coordinate }
  }

  async type(text: string): Promise<BrowserActionResult> {
    return { logs: "Typed text: " + text }
  }

  async scrollDown() { 
    return { logs: "Scrolled down" }
  }

  async scrollUp() {
    return { logs: "Scrolled up" }
  }

  async closeBrowser() {
    // set a state or do nothing
  }
}