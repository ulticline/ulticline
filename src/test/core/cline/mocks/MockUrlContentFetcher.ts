// MockUrlContentFetcher.ts
import { UrlContentFetcher } from "../../../services/browser/UrlContentFetcher"

export class MockUrlContentFetcher extends UrlContentFetcher {
  constructor() {
    // Pass a mock extension context or an empty object
    super({} as any)
  }

  async get(url: string) {
    // Return some fake data
    return "Mock content for " + url
  }

  closeBrowser() {
    // no-op
  }
}