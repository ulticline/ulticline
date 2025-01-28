// MockUrlContentFetcher.ts
import { UrlContentFetcher } from "../../../../services/browser/UrlContentFetcher"

export class MockUrlContentFetcher extends UrlContentFetcher {
  constructor() {
    // Pass empty object as config since we're mocking
    super({} as any)
  }

  override async urlToMarkdown(url: string): Promise<string> {
    // Mock implementation
    return `Mock content for ${url}`
  }

  override async closeBrowser(): Promise<void> {
    // Mock
  }
}