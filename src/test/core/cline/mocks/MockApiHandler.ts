// MockApiHandler.ts
import * as Extension from "../../../../../dist/extension.js"
import { ApiStream } from "../../../../api/transform/stream"
import { Anthropic } from "@anthropic-ai/sdk"
import { ModelInfo } from "../../../../shared/api"

export class MockApiHandler implements Extension.ApiHandler {
  // Add any properties or constructor args as needed
  private mockModelInfo = {
    id: "mock-model-123",
    info: { 
      contextWindow: 128_000,
      supportsComputerUse: true,
      supportsPromptCache: true
    } as ModelInfo
  }

  getModel() {
    return this.mockModelInfo
  }

  createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    // Return an async generator that yields usage and text chunks
    async function* generateChunks(): ApiStream {
      // 1) yield usage info
      yield { 
        type: "usage", 
        inputTokens: 42, 
        outputTokens: 0, 
        totalCost: 0.01 
      }

      // 2) yield partial text
      yield { 
        type: "text", 
        text: "Partial assistant message" 
      }

      // 3) yield final chunk
      yield { 
        type: "text", 
        text: "\nMore response text." 
      }
    }

    return generateChunks()
  }
}