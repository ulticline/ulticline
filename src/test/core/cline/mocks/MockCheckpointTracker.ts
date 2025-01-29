// MockCheckpointTracker.ts
import { ClineProvider } from "../../../../core/webview/ClineProvider"

export class MockCheckpointTracker {
  static async create(
    taskId: string, 
    provider: ClineProvider, 
    cwd: string = process.cwd()
  ): Promise<MockCheckpointTracker> {
    return new MockCheckpointTracker(provider, taskId, cwd)
  }

  constructor(
    private provider: ClineProvider, 
    private taskId: string, 
    private cwd: string
  ) {}

  async commit() {
    return "mock-commit-hash"
  }

  async resetHead(hash: string) {
    // no-op or track calls
  }

  async getDiffSet(fromHash?: string, toHash?: string) {
    // Return a mock array of changed files
    return [
      {
        relativePath: "fileA.txt",
        absolutePath: "/mock/absolute/path/to/fileA.txt",
        before: "old content",
        after: "new content",
      }
    ]
  }
}