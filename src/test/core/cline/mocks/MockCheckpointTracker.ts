// MockCheckpointTracker.ts
import CheckpointTracker from "../../../integrations/checkpoints/CheckpointTracker"

export class MockCheckpointTracker extends CheckpointTracker {
  static async create(taskId: string, providerRef: any): Promise<MockCheckpointTracker> {
    return new MockCheckpointTracker(taskId, providerRef)
  }

  constructor(taskId: string, providerRef: any) {
    super()
    // store internally if needed
  }

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