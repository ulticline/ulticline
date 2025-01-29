import { ClineAskResponse } from "../../shared/WebviewMessage"

export interface IClineProvider {
    ask(type: string, text?: string, partial?: boolean): Promise<{
        response: ClineAskResponse;
        text?: string;
        images?: string[];
    }>;
    say(type: string, text?: string, images?: string[]): Promise<void>;
    postStateToWebview(): Promise<void>;
}
