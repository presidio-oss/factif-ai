import { Response } from "express";
import { config } from "../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../types";
import { ChatMessage } from "../types/chat.types";
import { StreamingSource } from "../types/stream.types";
import { OmniParserResult } from "../types/action.types";
import { LLMProvider } from "./llm/LLMProvider";
import { trimHistory } from "../utils/historyManager";
import { ExploreModeAnthropicProvider } from "./llm/ExploreModeAnthropicProvider";
import { ExploreModeOpenAIProvider } from "./llm/ExploreModeOpenAIProvider";
import { OpenAIProvider } from "./llm/OpenAIProvider";
import { GeminiProvider } from "./llm/GeminiProvider";
import { AnthropicProvider } from "./llm/AnthropicProvider";
import { IProcessedScreenshot, OmniParserResponse } from "./interfaces/BrowserService";

export class ChatService {
  private static provider: LLMProvider;
  private static currentMode: Modes | null = null;

  static createProvider(mode: Modes) {
    // If we're switching modes, reset the provider first
    if (this.currentMode !== null && this.currentMode !== mode) {
      this.resetProvider();
    }
    
    // Store the current mode
    this.currentMode = mode;
    console.log('LLM Provider: ',config.llm.provider);
    if (mode === Modes.REGRESSION) {
      switch (config.llm.provider) {
        case "openai":
          this.provider = new OpenAIProvider("openai");
          break;
        case "azure-openai":
          this.provider = new OpenAIProvider("azure");
          break;
        case "gemini":
          this.provider = new GeminiProvider();
          break;
        case "anthropic":
        default:
          this.provider = new AnthropicProvider();
          break;
      }
    } else if (mode === Modes.EXPLORE) {
      switch (config.llm.provider) {
        case "openai":
          this.provider = new ExploreModeOpenAIProvider("openai");
          break;
        case "azure-openai":
          this.provider = new ExploreModeOpenAIProvider("azure");
          break;
        case "gemini":
        case "anthropic":
        default:
          this.provider = new ExploreModeAnthropicProvider();
          break;
      }
    }
  }

  private static sendStreamResponse(res: Response, data: StreamResponse) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  static async processMessage(
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    imageData: IProcessedScreenshot,
    source?: StreamingSource,
    omniParserResult?: OmniParserResponse,
  ): Promise<void> {
    // Get the current model based on provider
    const model = (() => {
      switch (config.llm.provider) {
        case "openai":
        case "azure-openai":
          return config.llm.openai.model;
        case "anthropic":
          return config.llm.anthropic.model;
        case "gemini":
          return config.llm.gemini.model;
      }
    })();

    // Use dynamic history trimming based on token counting
    const trimmedHistory = trimHistory(history, config.llm.provider, model);

    // Initialize SSE connection
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Set up keep-alive interval
    const keepAliveInterval = setInterval(() => {
      res.write(": keepalive\n\n");
    }, config.streamConfig.keepAliveInterval);

    try {
      // Stream the response from the LLM provider with optional image data
      await this.provider.streamResponse(
        currentChatId,
        res,
        message,
        trimmedHistory,
        mode,
        type,
        source,
        imageData,
        omniParserResult
      );
    } catch (error) {
      console.error("Error streaming response:", error);
      this.sendStreamResponse(res, {
        message: "Error processing message",
        isComplete: true,
        timestamp: Date.now(),
        isError: true,
      });
    } finally {
      // Clean up
      clearInterval(keepAliveInterval);
      res.end();
    }
  }

  static isProviderAvailable() {
    return !!ChatService.provider;
  }

  static resetProvider() {
    // Clean up the current provider
    this.provider = undefined as unknown as LLMProvider;
    console.log("LLM provider reset");
    
    // Reset the static state in ExploreModeProviders
    if (this.currentMode === Modes.EXPLORE) {
      // Call the dedicated static resetState methods that we added to each provider
      ExploreModeOpenAIProvider.resetState();
      ExploreModeAnthropicProvider.resetState();
      
      console.log("All explore mode providers have been reset");
    }
  }
}
