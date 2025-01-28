// MockApiHandler.ts
import { ApiHandler } from "../../path/to/api"

export class MockApiHandler implements ApiHandler {
  // Add any properties or constructor args as needed
  private mockModelInfo = {
    id: "mock-model-123",
    info: { 
      contextWindow: 128_000, // or any chosen default
      supportsComputerUse: true
    },
  }

  getModel() {
    return this.mockModelInfo
  }

  createMessage(systemPrompt: string, conversationHistory: any[]) {
    // Return an async generator that yields usage and text chunks
    const mockIterator = {
      async *[Symbol.asyncIterator]() {
        // 1) yield usage info
        yield { type: "usage", inputTokens: 42, outputTokens: 0, totalCost: 0.01 }

        // 2) yield partial text
        yield { type: "text", text: "Partial assistant message" }

        // 3) yield final chunk, etc.
        yield { type: "text", text: "\nMore response text." }
      }
    }
    return mockIterator
  }
}