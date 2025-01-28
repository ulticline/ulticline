// MockBrowserSession.ts
import { BrowserSession } from "../../../../services/browser/BrowserSession"
import { BrowserActionResult } from "../../../../shared/ExtensionMessage"

export class MockBrowserSession extends BrowserSession {
  constructor() {
    super({} as any, {} as any) // pass empty or partial config
  }

  override async launchBrowser(): Promise<void> {
    // Just store a flag or do nothing
  }

  override async navigateToUrl(url: string): Promise<BrowserActionResult> {
    return { logs: "Mock logs", screenshot: "data:image/png;base64,AAAA..." }
  }

  override async click(coordinate: string): Promise<BrowserActionResult> {
    return { logs: "Clicked at coordinate " + coordinate }
  }

  override async type(text: string): Promise<BrowserActionResult> {
    return { logs: "Typed text: " + text }
  }

  override async scrollDown(): Promise<BrowserActionResult> { 
    return { logs: "Scrolled down" }
  }

  override async scrollUp(): Promise<BrowserActionResult> {
    return { logs: "Scrolled up" }
  }

  override async closeBrowser(): Promise<BrowserActionResult> {
    return { logs: "Browser closed" }
  }
}