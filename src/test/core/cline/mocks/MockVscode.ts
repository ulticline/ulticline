// MockVscode.ts
export const vscode = {
	window: {
	  showInformationMessage: jest.fn(),
	  showErrorMessage: jest.fn(),
	  visibleTextEditors: [],
	  tabGroups: { all: [] },
	},
	commands: {
	  executeCommand: jest.fn()
	},
	workspace: {
	  workspaceFolders: []
	}
  }