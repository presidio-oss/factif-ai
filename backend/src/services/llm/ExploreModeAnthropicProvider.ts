import { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { OmniParserResult } from "../../types/action.types";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import {
  exploreModePrompt,
  getPerformActionPrompt,
} from "../../prompts/explore-mode";
import { modernizeOutput } from "../../prompts/modernize-output.prompt";
import {
  convertInputToOutput,
  saveFileAndScreenshot,
} from "../../utils/conversion-util";
import {
  addOmniParserResults,
  getCurrentUrlBasedOnSource,
  logMessageRequest,
} from "../../utils/common.util";
import { getLatestScreenshot } from "../../utils/screenshotUtils";
import { IProcessedScreenshot } from "../interfaces/BrowserService";

export class ExploreModeAnthropicProvider implements LLMProvider {
  static pageRouter = new Set<string>();

  private client: Anthropic | AnthropicBedrock;

  constructor() {
    if (config.llm.anthropic.useBedrock) {
      this.client = new AnthropicBedrock({
        awsRegion: config.llm.anthropic.bedrock.region,
        awsAccessKey: config.llm.anthropic.bedrock.credentials.accessKeyId,
        awsSecretKey: config.llm.anthropic.bedrock.credentials.secretAccessKey,
      });
    } else {
      this.client = new Anthropic({
        apiKey: config.llm.anthropic.apiKey,
      });
    }
  }

  private sendStreamResponse(res: Response, data: StreamResponse) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private getLastUserMessage(messages: ChatMessage[]): string {
    let message = "";
    if (messages.length > 0) {
      message = messages[0].text;
    }
    return message;
  }

  private formatMessagesWithHistory(
    currentMessage: string,
    history: ChatMessage[],
    imageData?: IProcessedScreenshot,
    source?: StreamingSource,
    _mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    currentPageUrl: string = ""
  ): { role: "user" | "assistant"; content: string | any[] }[] {
    const formattedMessages: {
      role: "user" | "assistant";
      content: string | any[];
    }[] = [
      ...this.chooseSystemPrompt(
        type,
        source as StreamingSource,
        type === ExploreActionTypes.ACTION
          ? this.getLastUserMessage(history)
          : "",
        currentPageUrl
      ),
    ];

    if (type === ExploreActionTypes.ACTION) {
      // Add all history messages
      history.forEach((msg) => {
        formattedMessages.push({
          role: msg.isUser ? "user" : ("assistant" as const),
          content: msg.text,
        });
      });
    }

    // Add current message with image if present
    if (imageData) {
      formattedMessages.push({
        role: "user",
        content: [
          {type: "text", text: currentMessage},
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageData.originalImage.replace(
                /^data:image\/png;base64,/,
                ""
              ),
            },
          },
        ],
      });
    } else {
      formattedMessages.push({
        role: "user",
        content: currentMessage,
      });
    }

    return formattedMessages;
  }

  getModelId(): string {
    return config.llm.anthropic.useBedrock
      ? config.llm.anthropic.bedrock.modelId
      : config.llm.anthropic.model;
  }

  buildMessageRequest(
    modelId: string,
    messages: any[],
    stream: boolean = true
  ): any {
    const maxTokens =
      config.llm.anthropic.contextConfig?.modelContextWindows[modelId] || 8192;
    return {
      model: modelId,
      max_tokens: maxTokens,
      messages,
      stream,
    };
  }

  async processStreamResponse(
    stream: any,
    res: Response,
    imageData?: IProcessedScreenshot
  ): Promise<void> {
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta?.text) {
        this.sendStreamResponse(res, {
          message: chunk.delta.text,
          timestamp: Date.now(),
        });
      }
    }
    this.sendStreamResponse(res, {
      message: "",
      timestamp: Date.now(),
      isComplete: true,
      imageData,
    });
  }

  /**
   * Streams a response based on the provided parameters and handles retries in case of failures.
   *
   * @param {Response} res - The HTTP response object to which the streamed response will be sent.
   * @param {string} message - The message to process and stream.
   * @param {ChatMessage[]} [history=[]] - The chat history containing previous messages, defaults to an empty array.
   * @param {Modes} [mode=Modes.REGRESSION] - The operational mode to use, default is `Modes.REGRESSION`.
   * @param {ExploreActionTypes} [type=ExploreActionTypes.EXPLORE] - The type of the action being processed, defaults to `ExploreActionTypes.EXPLORE`.
   * @param {StreamingSource} [source] - The source from which the streaming is initiated (optional).
   * @param {string} [imageData] - Any accompanying image data, if applicable (optional).
   * @param {OmniParserResult} [omniParserResult] - Parsed results from an OmniParser, if provided (optional).
   * @param {number} [retryCount=config.retryAttemptCount] - The number of retry attempts allowed, defaults to the system configuration.
   * @return {Promise<void>} Resolves when the streaming process is complete or fails after exhausting retry attempts.
   */
  async streamResponse(
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResult,
    retryCount: number = config.retryAttemptCount
  ): Promise<void> {
    console.log("is image available", !!imageData);
    type === ExploreActionTypes.EXPLORE &&
      (await this.generateComponentDescription(source as StreamingSource));

    const retryArray = new Array(retryCount).fill(0);
    let isRetrySuccessful = false;
    for (let _ of retryArray) {
      isRetrySuccessful = await this.processStream(
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
        isError: true,
      });
    }
  }

  /**
   * Processes a stream message request and sends a streaming response.
   *
   * @param {Response} res - The response object used to send data back to the client.
   * @param {string} message - The message to be processed.
   * @param {ChatMessage[]} [history=[]] - An optional array of chat message history.
   * @param {Modes} [mode=Modes.REGRESSION] - The operational mode for processing the message.
   * @param {ExploreActionTypes} [type=ExploreActionTypes.EXPLORE] - The type of action being explored.
   * @param {StreamingSource} [source] - An optional source of the streaming request.
   * @param {string} [imageData] - An optional base64 image string related to the message.
   * @param {OmniParserResult} [omniParserResult] - An optional result from the OmniParser for additional context.
   * @return {Promise<boolean>} A promise that resolves to true if the stream is processed successfully; otherwise, false.
   */
  async processStream(
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResult
  ): Promise<boolean> {

    const USER_ROLE = "user";
    try {
      const modelId = this.getModelId();
      const currentPageUrl = await getCurrentUrlBasedOnSource(
        source as StreamingSource
      );

      // Format messages with history and image if present
      const formattedMessage = this.formatMessagesWithHistory(
        message,
        history,
        imageData,
        source,
        mode,
        type,
        currentPageUrl
      );
      // If omni parser is enabled and we have results, add them to the last user message
      if (config.omniParser.enabled && omniParserResult) {
        addOmniParserResults(formattedMessage, omniParserResult, USER_ROLE);
      }

      const messageRequest = this.buildMessageRequest(
        modelId,
        formattedMessage
      );
      // Log the message request before sending
      logMessageRequest(messageRequest);

      const stream = await this.client.messages.create(messageRequest);
      await this.processStreamResponse(stream, res, imageData);
      return true;
    } catch (error) {
      console.log(error)
      this.sendStreamResponse(res, {
        message: "Error processing message re-trying",
        timestamp: Date.now(),
        isError: false,
      });

      return false;
    }
  }

  /**
   * Constructs a system prompt message based on the provided action, source, task, and page URL.
   *
   * @param {ExploreActionTypes} action - The type of action to determine the system prompt (e.g., exploration or task-specific action).
   * @param {StreamingSource} source - The streaming source to be used for the task-specific prompt generation.
   * @param {string} task - The specific task to be performed, utilized for generating the appropriate system prompt.
   * @param {string} currentPageUrl - The current page URL to be used as context in the prompt generation.
   * @return {{role: "user" | "assistant", content: string | any[]}[]} Array of message objects containing roles ("user" or "assistant") and their associated content.
   */
  chooseSystemPrompt(
    action: ExploreActionTypes,
    source: StreamingSource,
    task: string,
    currentPageUrl: string
  ): {
    role: "user" | "assistant";
    content: string | any[];
  }[] {
    const message: {
      role: "user" | "assistant";
      content: string | any[];
    }[] = [
      {
        role: "user",
        content:
          action === ExploreActionTypes.EXPLORE
            ? exploreModePrompt
            : getPerformActionPrompt(source, task, currentPageUrl),
      },
    ];
    if (action === ExploreActionTypes.ACTION) {
      message.push({
        role: "assistant",
        content:
          "I understand. Before each response, I will:\n\n1. Verify only ONE tool use exists\n2. Check no tool XML in markdown\n3. Validate all parameters\n4. Never combine multiple actions\n\nWhat would you like me to do?",
      });
    }

    return message;
  }

  /**
   * Generates a component description based on the current page context.
   * This involves capturing a screenshot, preparing a message request,
   * and processing the generated content. Screenshots are saved along
   * with the output file based on the generated results.
   *
   * @return {Promise<boolean>} A promise that resolves to a boolean value indicating
   * whether the operation was performed successfully. Returns false if the page has
   * already been processed.
   */
  async generateComponentDescription(
    source: StreamingSource
  ): Promise<boolean> {
    let pageUrl = await getCurrentUrlBasedOnSource(source);
    let screenshot = await getLatestScreenshot(source);

    if (ExploreModeAnthropicProvider.pageRouter.has(pageUrl)) return false;
    ExploreModeAnthropicProvider.pageRouter.add(pageUrl);
    const messageRequest = this.buildMessageRequest(
      this.getModelId(),
      [],
      false
    );
    messageRequest.messages.push({
      role: "user",
      content: [
        { type: "text", text: modernizeOutput },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: screenshot.originalImage.replace(/^data:image\/png;base64,/, ""),
          },
        },
      ],
    });
    const stream = await this.client.messages.create(messageRequest);
    await saveFileAndScreenshot(
      `${new Date().getTime().toString()}`,
      screenshot,
      "./output",
      (stream.content[0] as any)["text"]
    );
    ExploreModeAnthropicProvider.pageRouter.delete(pageUrl);
    return true;
  }
}
