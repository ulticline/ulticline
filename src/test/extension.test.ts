const fs = require("fs").promises;
const path = require("path");
const vscode = require("vscode");
require("should");

const packagePath = path.join(__dirname, "..", "..", "package.json");

// Type for webview message
interface WebviewMessage {
    text: string;
}

describe("Cline Extension", () => {
	after(() => {
		vscode.window.showInformationMessage("All tests done!")
	})

	it("should verify extension ID matches package.json", async () => {
		const packageJSON = JSON.parse(await fs.readFile(packagePath, "utf8"))
		const id = packageJSON.publisher + "." + packageJSON.name
		const clineExtensionApi = vscode.extensions.getExtension(id)

		clineExtensionApi?.id.should.equal(id)
	})

	it("should successfully execute the plus button command", async () => {
		await new Promise((resolve) => setTimeout(resolve, 400))
		await vscode.commands.executeCommand("cline.plusButtonClicked")
	})

	// New test to verify xvfb and webview functionality
	it("should create and display a webview panel", async () => {
		// Create a webview panel
		const panel = vscode.window.createWebviewPanel("testWebview", "CI/CD Test", vscode.ViewColumn.One, {
			enableScripts: true,
		})

		// Set some HTML content
		panel.webview.html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta charset="UTF-8">
					<title>xvfb Test</title>
				</head>
				<body>
					<div id="test">Testing xvfb display server</div>
				</body>
			</html>
		`

		// Verify panel exists
		should.exist(panel)
		panel.visible.should.be.true()

		// Clean up
		panel.dispose()
	})

	// Test webview message passing
	it("should handle webview messages", async () => {
		const panel = vscode.window.createWebviewPanel("testWebview", "Message Test", vscode.ViewColumn.One, {
			enableScripts: true,
		})

		// Set up message handling
		const messagePromise = new Promise<string>((resolve) => {
			panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
				if (typeof message === 'object' && message !== null && 'text' in message) {
					resolve(message.text as string);
				}
			}, undefined)
		})

		// Add message sending script
		panel.webview.html = `
			<!DOCTYPE html>
			<html>
				<head>
					<meta charset="UTF-8">
					<title>Message Test</title>
				</head>
				<body>
					<script>
						const vscode = acquireVsCodeApi();
						vscode.postMessage({ text: 'test-message' });
					</script>
				</body>
			</html>
		`

		// Wait for message
		const message = await messagePromise
		message.should.equal("test-message")

		// Clean up
		panel.dispose()
	})
})
