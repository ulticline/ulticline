// MockTerminalManager.ts
import { TerminalManager } from "../../../integrations/terminal/TerminalManager"

export class MockTerminalManager extends TerminalManager {
  constructor() {
    super()
  }

  getOrCreateTerminal(cwd: string) {
    // Return a fake terminal object with an ID and stubs for .show().
    return {
      id: "mock-terminal",
      terminal: { show: () => {} },
      lastCommand: undefined
    }
  }

  runCommand(terminalInfo: any, command: string) {
    // Return a mock process object with line events
    const process = {
      on: (eventName: string, cb: Function) => {},
      continue: () => {},
    }
    // Possibly store the command, simulate line events later, etc.
    return Promise.resolve(process)
  }

  getTerminals(isBusy: boolean) {
    // Return empty or some list of mock terminals
    return []
  }

  isProcessHot(id: string) {
    // Return false or true depending on what you want to test
    return false
  }
}