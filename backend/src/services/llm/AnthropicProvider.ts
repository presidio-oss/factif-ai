import { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { SYSTEM_PROMPT } from "../../prompts/systemPrompts.prompt";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import {
  addElementsList,
  logMessageRequest
} from "../../utils/common.util";
import {
  IProcessedScreenshot, OmniParserResponse
} from "../interfaces/BrowserService";
import { CostTracker } from "../../utils/costCalculator";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic | AnthropicBedrock;


  constructor() {
    if (config.llm.anthropic.useBedrock) {
      this.client = new AnthropicBedrock({
        awsRegion: config.llm.anthropic.bedrock.region,
        awsAccessKey: config.llm.anthropic.bedrock.credentials.accessKeyId,
        awsSecretKey: config.llm.anthropic.bedrock.credentials.secretAccessKey,
        awsSessionToken: config.llm.anthropic.bedrock.credentials.sessionToken,
      });
    } else {
      this.client = new Anthropic({
        apiKey: config.llm.anthropic.apiKey
      });
    }
  }

  private sendStreamResponse(res: Response, data: StreamResponse) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private formatMessagesWithHistory(
    currentMessage: string,
    history: ChatMessage[],
    imageData?: IProcessedScreenshot,
    source?: StreamingSource,
    omniParserResponse?: OmniParserResponse | null
  ): { role: "user" | "assistant"; content: string | any[] }[] {
    const formattedMessages: {
      role: "user" | "assistant";
      content: string | any[];
    }[] = [
      {
        role: "user",
        content: SYSTEM_PROMPT(source, omniParserResponse, imageData)
      },
      {
        role: "assistant",
        content:
          "I understand. Before each response, I will:\n\n1. Verify only ONE tool use exists\n2. Check no tool XML in markdown\n3. Validate all parameters\n4. Never combine multiple actions\n\nWhat would you like me to do?"
      }
    ];

    // Add all history messages
    history.forEach((msg) => {
      formattedMessages.push({
        role: msg.isUser ? "user" : ("assistant" as const),
        content: msg.text
      });
    });

    // Add current message with image if present
    console.log("==============", imageData);
    if (imageData) {
      formattedMessages.push({
        role: "user",
        content: [
          { type: "text", text: currentMessage },
          ...(imageData.image.length > 0
            ? [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: imageData.image.replace(
                    /^data:image\/png;base64,/,
                    ""
                  )
                }
              }
            ]
            : []),
          ...(imageData.inference.length > 0
            ? [
              {
                type: "text",
                text: addElementsList(imageData.inference)
              }
            ]
            : [])
        ]
      });
    } else {
      formattedMessages.push({
        role: "user",
        content: currentMessage
      });
    }

    return formattedMessages;
  }

  getModelId(): string {
    return config.llm.anthropic.useBedrock
      ? config.llm.anthropic.bedrock.modelId
      : config.llm.anthropic.model;
  }

  buildMessageRequest(modelId: string, messages: any[]): any {
    const maxTokens =
      config.llm.anthropic.contextConfig?.modelContextWindows[modelId] || 8192;
    return {
      model: modelId,
      max_tokens: maxTokens,
      messages,
      stream: true as const
    };
  }

  async processStreamResponse(stream: any, res: Response, currentChatId: string): Promise<void> {
    console.log(stream);
    let model = '';
    for await (const chunk of stream) {
      if (chunk.type === "message_start") {
        model = chunk.message.model
      } else if (chunk.type === "message_stop") {
        const {
          inputTokenCount,
          outputTokenCount
        } = chunk["amazon-bedrock-invocationMetrics"];
        CostTracker.recordCost(currentChatId, model,
          {
            prompt_tokens: inputTokenCount,
            completion_tokens: outputTokenCount
          });
      } else if (chunk.type === "content_block_delta" && chunk.delta?.text) {
        this.sendStreamResponse(res, {
          message: chunk.delta.text,
          timestamp: Date.now()
        });
      }
    }
    this.sendStreamResponse(res, {
      message: "",
      timestamp: Date.now(),
      isComplete: true,
      totalCost: CostTracker.getTotalCostForTestcase(currentChatId),
    });
  }

  async streamResponse(
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse,
    retryCount: number = config.retryAttemptCount
  ): Promise<void> {
    const retryArray = new Array(retryCount).fill(0);
    let isRetrySuccessful = false;
    for (let _ of retryArray) {
      isRetrySuccessful = await this.processStream(
        currentChatId,
        res,
        message,
        history,
        mode,
        type,
        source,
        imageData,
        omniParserResult
      );
      if (isRetrySuccessful) {
        return;
      }
      console.log("Attempting to retry");
    }
    if (!isRetrySuccessful) {
      this.sendStreamResponse(res, {
        message: "Error processing message. Please try again later.",
        timestamp: Date.now(),
        isError: true
      });
    }
  }

  async processStream(
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    _mode: Modes = Modes.REGRESSION,
    _type: ExploreActionTypes = ExploreActionTypes.ACTION,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse | null
  ) {
    console.log("Processing message with history length:", history.length);
    try {
      const modelId = this.getModelId();
      // Format messages with history and image if present
      const formattedMessage = this.formatMessagesWithHistory(
        message,
        history,
        imageData,
        source,
        omniParserResult || null
      );
      const messageRequest = this.buildMessageRequest(
        modelId,
        formattedMessage
      );
      // Log the message request before sending
      logMessageRequest(messageRequest);

      const stream = await this.client.messages.create(messageRequest);
      await this.processStreamResponse(stream, res, currentChatId);
      return true;
    } catch (error) {
      console.error("Error in AnthropicProvider:", error);
      this.sendStreamResponse(res, {
        message: "Error processing message re-trying",
        timestamp: Date.now(),
        isError: false
      });

      return false;
    }
  }


}
