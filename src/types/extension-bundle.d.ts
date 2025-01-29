/**
 * A TypeScript declaration file for the `dist/extension.js` module.
 *
 * This module exports key symbols from the compiled Cline extension bundle,
 * including the `Cline` class, as well as the standard `activate` and `deactivate`
 * functions used by VS Code extensions.
 *
 * The `Cline` class supports:
 * - Tracking messages (`clineMessages`).
 * - Managing asks via `ask(...)` and handling responses via `handleWebviewAskResponse(...)`.
 * - Initializing core settings for auto-approvals, browser usage, chat functionality, etc.
 *
 * By declaring these APIs, we enable TypeScript to recognize them when importing
 * from `dist/extension.js`, providing type safety and intellisense for the
 * Cline extension logic in consuming code or test files.
 */

declare module "*dist/extension.js" {
  import type { AutoApprovalSettings } from "../shared/AutoApprovalSettings"
  import type { BrowserSettings } from "../shared/BrowserSettings"
  import type { ChatSettings } from "../shared/ChatSettings"
  import type { ApiConfiguration } from "../shared/api"
  import type { ClineAskResponse } from "../shared/WebviewMessage"
  import type { ClineAsk, ClineMessage } from "../shared/ExtensionMessage"
  import type { ApiHandler } from "../api"
  import type { BrowserSession } from "../services/browser/BrowserSession"
  import type { ClineProvider } from "../core/webview/ClineProvider"
  import type { BrowserActionResult } from "../shared/ExtensionMessage"

  // Core classes that need to be exposed
  export class Cline {
    constructor(
      provider: any,
      apiConfig: ApiConfiguration,
      autoApprovalSettings: AutoApprovalSettings,
      browserSettings: BrowserSettings,
      chatSettings: ChatSettings,
      customInstructions?: string,
      task?: string,
      images?: string[],
      historyItem?: any
    );

    clineMessages: ClineMessage[];
    isInitialized: boolean;
    abandoned: boolean;
    apiConversationHistory: any[];

    ask(askType: ClineAsk, payload: string, partial: boolean): Promise<void>;
    handleWebviewAskResponse(resp: ClineAskResponse, text?: string, images?: string[]): Promise<void>;
    saveCheckpoint(): Promise<void>;
    restoreCheckpoint(messageTs: number, type: string): Promise<void>;
    presentMultifileDiff(messageTs: number, showDiff: boolean): Promise<void>;
    doesLatestTaskCompletionHaveNewChanges(): Promise<boolean>;
  }

  // Base classes needed for mocks
  export abstract class ClineProvider {
    constructor(context: any, outputChannel: any);
    context: any;
    
    abstract createApiHandler(): ApiHandler;
    abstract createTerminalManager(): any;
    abstract createBrowserSession(): BrowserSession;
    abstract createUrlContentFetcher(): any;
    abstract updateTaskHistory(info: any): Promise<any[]>;
    abstract postMessageToWebview(message: any): Promise<void>;
    abstract cancelTask(): Promise<void>;
    abstract getSavedClineMessages(): Promise<any[]>;
    abstract getSavedApiConversationHistory(): Promise<any[]>;
    abstract postStateToWebview(): Promise<void>;
  }

  export interface BrowserActionResult {
    logs: string;
    screenshot: string;
  }

  export abstract class BrowserSession {
    constructor(config: any, provider: any);
    
    abstract launchBrowser(): Promise<void>;
    abstract navigateToUrl(url: string): Promise<BrowserActionResult>;
    abstract click(coordinate: string): Promise<BrowserActionResult>;
    abstract type(text: string): Promise<BrowserActionResult>;
    abstract scrollDown(): Promise<BrowserActionResult>;
    abstract scrollUp(): Promise<BrowserActionResult>;
    abstract closeBrowser(): Promise<BrowserActionResult>;
    abstract goto(url: string): Promise<BrowserActionResult>;
    abstract getScreenshot(): Promise<string>;
    abstract getContent(): Promise<string>;
  }

  export interface ApiHandler {
    getModel(): any;
    createMessage(systemPrompt: string, messages: any[]): AsyncGenerator<any>;
  }

  // Standard extension exports
  export function activate(context: any): Promise<void>;
  export function deactivate(): Promise<void>;
} 