import { Response } from "express";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { OmniParserResult } from "../../types/action.types";
import { IProcessedScreenshot } from "../interfaces/BrowserService";
import { ExploreActionTypes, Modes } from "../../types";

export interface LLMProvider {
  streamResponse(
    res: Response,
    message: string,
    history: ChatMessage[],
    mode: Modes,
    type: ExploreActionTypes,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResult
  ): Promise<void>;
}
