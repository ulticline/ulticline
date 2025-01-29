// MockUrlContentFetcher.ts
// No need to extend from UrlContentFetcher since it's not exported from extension.js
export class MockUrlContentFetcher {
  constructor() {}

  async urlToMarkdown(url: string): Promise<string> {
    return `Mock content for ${url}`
  }

  async closeBrowser(): Promise<void> {}
}