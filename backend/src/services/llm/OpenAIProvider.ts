import { Response } from "express";
import OpenAI, { AzureOpenAI } from "openai";
import { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { SYSTEM_PROMPT } from "../../prompts/systemPrompts.prompt";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import { IProcessedScreenshot, OmniParserResponse } from "../interfaces/BrowserService";
import fs from "fs";
import path from "path";
import { addElementsList } from "../../utils/common.util";
import { CostTracker } from "../../utils/costCalculator";

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

  private logMessageRequest(messageRequest: any) {
    try {
      // Create logs directory if it doesn't exist
      const logsDir = path.join(__dirname, "../../../logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Create a log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(logsDir, `message-request-${timestamp}.json`);

      fs.writeFileSync(logFile, JSON.stringify(messageRequest, null, 2));
    } catch (error) {
      console.error("Error logging message request:", error);
    }
  }

  private formatMessagesWithHistory(
    currentMessage: string,
    history: ChatMessage[],
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse,
  ): ChatCompletionMessageParam[] {
    const systemPrompt = SYSTEM_PROMPT(source, omniParserResult, imageData)

    const formattedMessages: ChatCompletionMessageParam[] = [
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
    if (imageData) {
      // For OpenAI, we need to format the content as an array of text/image objects
      const contentArray: ChatCompletionContentPart[] = [
        { type: "text", text: messageText },
      ];
      
      // Add the image if available (properly formatted for OpenAI)
      if (imageData.image && imageData.image.length > 0) {
        // Clean the base64 string by removing the prefix if present
        const base64Image = imageData.image.replace(/^data:image\/\w+;base64,/, "");
        
        // Using proper typing for OpenAI SDK
        contentArray.push({
          type: "image_url", 
          image_url: {
            url: `data:image/png;base64,${base64Image}`,
          },
        } as ChatCompletionContentPart);
      }
      
      // Add elements list as additional text if available
      if (imageData.inference && imageData.inference.length > 0) {
        contentArray.push({
          type: "text",
          text: addElementsList(imageData.inference),
        });
      }
      
      formattedMessages.push({
        role: "user" as const,
        content: contentArray,
      });
    } else {
      formattedMessages.push({
        role: "user" as const,
        content: messageText,
      });
    }
    
    return formattedMessages;
  }


  async streamResponse(
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    _mode: Modes = Modes.REGRESSION,
    _type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse,
    retryCount: number = config.retryAttemptCount,
  ): Promise<void> {
    const retryArray = new Array(retryCount).fill(0);
    let isRetrySuccessful = false;
    for (let _ of retryArray) {
      isRetrySuccessful = await this.processStream(
        currentChatId,
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
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse,
  ) {
    try {
      console.log("Open AI Processing message with history length:", history.length);
      const messages = this.formatMessagesWithHistory(
        message,
        history,
        source,
        imageData,
        omniParserResult,
      );
      console.log("Creating completion with model:", this.model);
      
      // Log the message request before sending
      this.logMessageRequest({
        model: this.model,
        messages,
      });

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        stream_options: {
          "include_usage": true
        }
      });

      let accumulatedResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (chunk.usage) {
          CostTracker.recordCost(currentChatId, chunk.model, {
            prompt_tokens: chunk.usage?.prompt_tokens as number,
            completion_tokens: chunk.usage?.completion_tokens as number,
          })
        }
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
        totalCost: CostTracker.getTotalCostForTestcase(currentChatId),
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
