import { Response } from "express";
import {
  GenerativeModel,
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory
} from "@google/generative-ai";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { SYSTEM_PROMPT } from "../../prompts/systemPrompts.prompt";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import { IProcessedScreenshot, OmniParserResponse } from "../interfaces/BrowserService";
import { addElementsList } from "../../utils/common.util";
import { CostTracker } from "../../utils/costCalculator";

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private chatModel: GenerativeModel;
  private visionModel: GenerativeModel;

  safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE
    }
  ];
  // {
  //   category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
  //   threshold: HarmBlockThreshold.BLOCK_NONE,
  // },

  constructor() {
    if (!config.llm.gemini.apiKey) {
      throw new Error("Gemini API key is required");
    }
    this.client = new GoogleGenerativeAI(config.llm.gemini.apiKey);
    this.chatModel = this.client.getGenerativeModel({
      model: config.llm.gemini.model,
      safetySettings: this.safetySettings
    });
    this.visionModel = this.client.getGenerativeModel({
      model: config.llm.gemini.visionModel,
      safetySettings: this.safetySettings
    });
  }

  private sendStreamResponse(res: Response, data: StreamResponse) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private formatMessagesWithHistory(
    currentMessage: string,
    history: ChatMessage[],
    source?: StreamingSource,
    omniParserResult?: OmniParserResponse
  ) {
    const systemPrompt = SYSTEM_PROMPT(source, omniParserResult) || "";

    // Add omni parser results if available and enabled
    const finalMessage =
      config.omniParser.enabled && omniParserResult
        ? `${currentMessage}\n\nOmni Parser Results:\n${JSON.stringify(omniParserResult, null, 2)}`
        : currentMessage;
    // Start with verification acknowledgment
    const formattedHistory = [
      {
        role: "assistant",
        parts: [
          {
            text: "I understand. Before each response, I will:\n\n1. Verify only ONE tool use exists\n2. Check no tool XML in markdown\n3. Validate all parameters\n4. Never combine multiple actions\n\nWhat would you like me to do?"
          }
        ]
      },
      ...history.map((msg) => ({
        role: msg.isUser ? "user" : "assistant",
        parts: [{ text: msg.text }]
      }))
    ];

    return {
      systemPrompt,
      history: formattedHistory,
      currentMessage: finalMessage
    };
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
        source,
        imageData,
        omniParserResult
      );
      if (isRetrySuccessful) {
        return;
      }
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
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResponse?: OmniParserResponse
  ): Promise<boolean> {
    try {
      console.log(
        "Stream - Processing message with history length:",
        history.length
      );
      if (imageData && (!config.omniParser.enabled || !omniParserResponse)) {
        // Only use vision model if omni parser is not enabled
        const systemPrompt = SYSTEM_PROMPT(source, omniParserResponse, imageData);
        const result = await this.visionModel.generateContent([
          { text: systemPrompt },
          ...(imageData.image.length > 0
            ? [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: Buffer.from(imageData.originalImage, "base64").toString(
                    "base64"
                  )
                }
              }
            ]
            : []),
          ...(imageData.inference.length > 0
            ? [
              {
                text: addElementsList(imageData.inference)
              }
            ]
            : []),
          { text: message }
        ]);

        console.log("gemini result: ", result);
        const response: any = result.response;
        const {
          promptTokenCount,
          candidatesTokenCount
        } = response.usageMetadata;
        CostTracker.recordCost(currentChatId, response.modelVersion,
          {
            prompt_tokens: promptTokenCount,
            completion_tokens: candidatesTokenCount
          });
        this.sendStreamResponse(res, {
          message: response.text(),
          timestamp: Date.now()
        });
        this.sendStreamResponse(res, {
          message: "",
          isComplete: true,
          timestamp: Date.now()
        });
      } else {
        // Handle chat model request
        const {
          systemPrompt,
          history: formattedHistory,
          currentMessage
        } = this.formatMessagesWithHistory(
          message,
          history,
          source,
          omniParserResponse
        );

        const chat = this.chatModel.startChat({
          history: formattedHistory
        });

        const result = await chat.sendMessageStream([
          { text: systemPrompt },
          { text: currentMessage }
        ]);
        let accumulatedContent = "";

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          accumulatedContent += chunkText;

          if (chunkText) {
            this.sendStreamResponse(res, {
              message: chunkText,
              timestamp: Date.now(),
              isPartial: true
            });
          }
        }
        this.sendStreamResponse(res, {
          message: "Stream complete",
          timestamp: Date.now(),
          isComplete: true
        });
      }
      return true;
    } catch (error) {
      console.error("Stream error in GeminiProvider:", error);
      this.sendStreamResponse(res, {
        message: "Error processing message",
        timestamp: Date.now(),
        isError: false
      });
      return false;
    }
  }
}
