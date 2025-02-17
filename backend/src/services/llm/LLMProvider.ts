import { Response } from "express";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { OmniParserResult } from "../../types/action.types";
import { ExploreActionTypes, Modes } from "../../types";

export interface LLMProvider {
  streamResponse(
    res: Response,
    message: string,
    history: ChatMessage[],
    mode: Modes,
    type: ExploreActionTypes,
    source?: StreamingSource,
    imageData?: string,
    omniParserResult?: OmniParserResult,
  ): Promise<void>;
}
