import { Response } from "express";
import OpenAI, { AzureOpenAI } from "openai";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { SYSTEM_PROMPT } from "../../prompts/systemPrompts.prompt";
import { OmniParserResult } from "../../types/action.types";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import { IProcessedScreenshot } from "../interfaces/BrowserService";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI | AzureOpenAI;
  model: string;

  constructor(type: "openai" | "azure" = "openai") {
    if (type === "openai") {
      this.client = new OpenAI({
        apiKey: config.llm.openai.apiKey,
      });
      this.model = config.llm.openai.model;
    } else {
      this.client = new AzureOpenAI({
        apiKey: config.llm.openai.azure.apiKey,
        endpoint: config.llm.openai.azure.endpoint,
        deployment: config.llm.openai.azure.model,
        apiVersion: config.llm.openai.azure.version,
      });
      this.model = config.llm.openai.azure.model;
    }
  }

  private sendStreamResponse(res: Response, data: StreamResponse) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private formatMessagesWithHistory(
    currentMessage: string,
    history: ChatMessage[],
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResult,
  ): { role: "system" | "user" | "assistant"; content: string | any[] }[] {
    const systemPrompt = SYSTEM_PROMPT(source, !!omniParserResult, imageData);

    const formattedMessages: {
      role: "system" | "user" | "assistant";
      content: string | any[];
    }[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "assistant",
        content:
          "I understand. Before each response, I will:\n\n1. Verify only ONE tool use exists\n2. Check no tool XML in markdown\n3. Validate all parameters\n4. Never combine multiple actions\n\nWhat would you like me to do?",
      },
    ];

    history.forEach((msg) => {
      formattedMessages.push({
        role: msg.isUser ? "user" : "assistant",
        content: msg.text,
      });
    });

    // Add omni parser results if available and enabled
    const messageText =
      config.omniParser.enabled && omniParserResult
        ? `${currentMessage}\n\nOmni Parser Results:\n${JSON.stringify(omniParserResult, null, 2)}`
        : currentMessage;

    // Format the final message based on whether there's image data
    const finalMessage =
      imageData && (!config.omniParser.enabled || !omniParserResult)
        ? {
            role: "user" as const,
            content: [
              { type: "text", text: messageText },
              ...(imageData.image.length > 0
                ? [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${imageData.image}`,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {
            role: "user" as const,
            content: messageText,
          };

    formattedMessages.push(finalMessage);
    return formattedMessages;
  }

  async streamResponse(
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    _mode: Modes = Modes.REGRESSION,
    _type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResult,
    retryCount: number = config.retryAttemptCount,
  ): Promise<void> {
    const retryArray = new Array(retryCount).fill(0);
    let isRetrySuccessful = false;
    for (let _ of retryArray) {
      isRetrySuccessful = await this.processStream(
        res,
        message,
        history,
        source,
        imageData,
        omniParserResult,
      );
      if (isRetrySuccessful) {
        return;
      }
    }
    if (!isRetrySuccessful) {
      this.sendStreamResponse(res, {
        message: "Error processing message. Please try again later.",
        timestamp: Date.now(),
        isError: true,
      });
    }
  }

  async processStream(
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResult,
  ) {
    try {
      console.log("Processing message with history length:", history.length);
      const messages = this.formatMessagesWithHistory(
        message,
        history,
        source,
        imageData,
        omniParserResult,
      );
      console.log("Creating completion with model:", this.model);

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
      });

      let accumulatedResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          accumulatedResponse += content;
          this.sendStreamResponse(res, {
            message: content,
            timestamp: Date.now(),
          });
        }
      }

      this.sendStreamResponse(res, {
        message: "",
        isComplete: true,
        timestamp: Date.now(),
      });
      return true;
    } catch (error) {
      console.error("Error in OpenAIProvider:", error);
      this.sendStreamResponse(res, {
        message:
          "Error processing message: " +
          (error instanceof Error ? error.message : String(error)),
        isComplete: true,
        timestamp: Date.now(),
        isError: false,
      });
      return false;
    }
  }
}
