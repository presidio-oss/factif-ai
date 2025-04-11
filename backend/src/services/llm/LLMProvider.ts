import { Response } from "express";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { IProcessedScreenshot, OmniParserResponse } from "../interfaces/BrowserService";
import { ExploreActionTypes, Modes } from "../../types";

export interface LLMProvider {
  streamResponse(
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[],
    mode: Modes,
    type: ExploreActionTypes,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse
  ): Promise<void>;
}
