// MockTerminalManager.ts
import { Terminal } from "vscode"
import { TerminalInfo } from "../../../../integrations/terminal/TerminalRegistry"
import { TerminalProcess, TerminalProcessResultPromise } from "../../../../integrations/terminal/TerminalProcess"

// Since TerminalManager isn't exported from extension.js, we'll keep the direct import
// but this is an implementation detail that doesn't affect the public API testing
export class MockTerminalManager {
  async getOrCreateTerminal(cwd: string): Promise<TerminalInfo> {
    return {
      id: 1,
      terminal: { show: () => {} } as unknown as Terminal,
      lastCommand: "",
      busy: false
    }
  }

  runCommand(terminalInfo: TerminalInfo, command: string): TerminalProcessResultPromise {
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

  getTerminals(isBusy: boolean): TerminalInfo[] {
    return []
  }

  isProcessHot(terminalId: number): boolean {
    return false
  }
}