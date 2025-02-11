import { Response } from 'express';
import { ChatMessage } from '../../types/chat.types';
import { StreamingSource } from '../../types/stream.types';
import { OmniParserResult } from '../../types/action.types';

export interface LLMProvider {
  streamResponse(
    res: Response,
    message: string, 
    history: ChatMessage[], 
    source?: StreamingSource,
    imageData?: string,
    omniParserResult?: OmniParserResult
  ): Promise<void>;
}
