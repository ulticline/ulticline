// MockTerminalManager.ts
import { TerminalManager } from "../../../../integrations/terminal/TerminalManager"
import { Terminal } from "vscode"
import { TerminalInfo } from "../../../../integrations/terminal/TerminalRegistry"
import { TerminalProcess, TerminalProcessResultPromise } from "../../../../integrations/terminal/TerminalProcess"

// Since we can't find the base TerminalManager class, let's create a mock implementation
export class MockTerminalManager extends TerminalManager {
  constructor() {
    super()
  }

  override async getOrCreateTerminal(cwd: string): Promise<TerminalInfo> {
    // Return a fake terminal object with an ID and stubs for .show().
    return {
      id: 1,
      terminal: { show: () => {} } as unknown as Terminal,
      lastCommand: "",
      busy: false
    }
  }

  override runCommand(terminalInfo: TerminalInfo, command: string): TerminalProcessResultPromise {
    // Create a mock TerminalProcess with all required properties
    const mockProcess: TerminalProcess = {
      on: (eventName: string, cb: Function) => mockProcess,
      continue: () => {},
      waitForShellIntegration: true,
      isListening: true,
      buffer: [],
      fullOutput: "",
      lastCommand: command,
      terminalId: terminalInfo.id,
      then: () => Promise.resolve(mockProcess),
      catch: () => Promise.resolve(mockProcess),
      finally: (onfinally?: (() => void) | undefined) => Promise.resolve(mockProcess),
      [Symbol.toStringTag]: "Promise"
    } as unknown as TerminalProcess

    return mockProcess as unknown as TerminalProcessResultPromise
  }

  override getTerminals(isBusy: boolean): TerminalInfo[] {
    // Return empty or some list of mock terminals
    return []
  }

  override isProcessHot(terminalId: number): boolean {
    // Return false or true depending on what you want to test
    return false
  }
}