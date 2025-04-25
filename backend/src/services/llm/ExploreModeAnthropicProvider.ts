import { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import {
  exploreModePrompt,
  getPerformActionPrompt
} from "../../prompts/explore-mode.prompt";
import { appDocumentationGeneratorPrompt } from "../../prompts/app-doc-generator.prompt";
import {
  saveFileAndScreenshot
} from "../../utils/conversion-util";
import {
  getCurrentUrlBasedOnSource,
  logMessageRequest,
  extractAndStoreUrlFromResponse
} from "../../utils/common.util";
import { getLatestScreenshot } from "../../utils/screenshotUtils";
import { IProcessedScreenshot, OmniParserResponse } from "../interfaces/BrowserService";
import { PuppeteerService } from "../implementations/puppeteer/PuppeteerService";
import { CostTracker } from "../../utils/costCalculator";

// Interface for page metadata
interface PageMetadata {
  title?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  language?: string;
  description?: string;
  totalScrollHeight?: number;
  currentScrollPosition?: number;
}

export class ExploreModeAnthropicProvider implements LLMProvider {
  static pageRouter = new Set<string>(); // Tracks visited page URLs
  static visitedPagesCount = 0; // Tracks number of unique pages visited
  static currentFlow: string | null = null; // Tracks the current flow being explored

  // Static method to reset state when switching modes
  static resetState() {
    ExploreModeAnthropicProvider.pageRouter.clear();
    ExploreModeAnthropicProvider.visitedPagesCount = 0;
    ExploreModeAnthropicProvider.currentFlow = null;
    console.log("ExploreModeAnthropicProvider state has been reset");
  }

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
      )
    ];

    if (type === ExploreActionTypes.ACTION) {
      // Add all history messages
      history.forEach((msg) => {
        formattedMessages.push({
          role: msg.isUser ? "user" : ("assistant" as const),
          content: msg.text
        });
      });
    }

    // Add current message with image if present
    if (imageData && imageData.originalImage && imageData.originalImage !== "") {
      formattedMessages.push({
        role: "user",
        content: [
          { type: "text", text: currentMessage },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageData.originalImage.replace(
                /^data:image\/png;base64,/,
                ""
              )
            }
          }
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
      stream
    };
  }

  async processStreamResponse(
    stream: any,
    res: Response,
    currentChatId: string,
    imageData?: IProcessedScreenshot,
    source?: StreamingSource
  ): Promise<void> {
    let completeResponse = "";
    let model = "";
    // Collect the complete response while streaming chunks
    for await (const chunk of stream) {
      if (chunk.type === "message_start") {
        model = chunk.message.model;
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
        // Accumulate the complete response
        completeResponse += chunk.delta.text;

        this.sendStreamResponse(res, {
          message: chunk.delta.text,
          timestamp: Date.now()
        });
      }
    }

    // Once streaming is done, extract URL from the complete response if source is docker
    if (source === "ubuntu-docker-vnc" && completeResponse) {
      // Use the utility function to extract and store URL
      extractAndStoreUrlFromResponse(source, completeResponse);
    }

    // Check for flow completion in the response
    if (ExploreModeAnthropicProvider.currentFlow && completeResponse) {
      // Check if the response indicates flow completion
      const flowStatusMatch = completeResponse.match(/<flow_status>complete<\/flow_status>/i);
      if (flowStatusMatch) {
        console.log(`[Explore Mode] Flow completed: ${ExploreModeAnthropicProvider.currentFlow} flow`);

        // Extract flow summary if available
        let flowSummary = "Flow completed";
        const flowSummaryMatch = completeResponse.match(/<flow_summary>([\s\S]*?)<\/flow_summary>/i);
        if (flowSummaryMatch && flowSummaryMatch[1]) {
          flowSummary = flowSummaryMatch[1].trim();
        }

        // Add completion message to the response
        const completionMessage = `\n\n[FLOW COMPLETED] The ${ExploreModeAnthropicProvider.currentFlow} flow has been fully explored.\n${flowSummary}`;
        this.sendStreamResponse(res, {
          message: completionMessage,
          timestamp: Date.now(),
        });

        // Reset current flow
        ExploreModeAnthropicProvider.currentFlow = null;
      }
    }

    this.sendStreamResponse(res, {
      message: "",
      timestamp: Date.now(),
      isComplete: true,
      totalCost: CostTracker.getTotalCostForTestcase(currentChatId),
      imageData: imageData?.originalImage.startsWith("data:image") ? imageData?.originalImage : `data:image/png;base64,${imageData?.originalImage}`
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
    console.log("is image available", !!imageData);

    // Detect if this is a flow-specific exploration request
    if (type === ExploreActionTypes.EXPLORE) {
      const flowMatch = message.match(/explore\s+(\w+)\s+flow/i);
      if (flowMatch && flowMatch[1]) {
        const flowType = flowMatch[1].toLowerCase();
        ExploreModeAnthropicProvider.currentFlow = flowType;
        console.log(`[Explore Mode] Detected flow-specific exploration: ${flowType} flow`);
      }
    }

    type === ExploreActionTypes.EXPLORE &&
    (await this.generateComponentDescription(source as StreamingSource, currentChatId));

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
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse
  ): Promise<boolean> {
    try {
      console.log(omniParserResult);
      const modelId = this.getModelId();

      // Get currentPageUrl safely with fallback - critical change to prevent errors
      let currentPageUrl = "";
      try {
        // Only try to get URL if it's the Puppeteer source and we've verified browser is ready
        if (source === "chrome-puppeteer") {
          const puppeteerService = new PuppeteerService({ io: null as any });
          const browserReady = await puppeteerService.hasBrowserInstance();

          if (browserReady) {
            currentPageUrl = await getCurrentUrlBasedOnSource(source);
          } else {
            console.log("Browser not ready yet, using empty URL as fallback");
          }
        } else if (source) {
          currentPageUrl = await getCurrentUrlBasedOnSource(source);
        }
      } catch (urlError) {
        console.error("Error getting current page URL:", urlError);
        // Continue with empty URL rather than failing completely
      }

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

      const messageRequest = this.buildMessageRequest(
        modelId,
        formattedMessage
      );
      // Log the message request before sending
      logMessageRequest(messageRequest);

      const stream = await this.client.messages.create(messageRequest);
      await this.processStreamResponse(stream, res, currentChatId, imageData, source);
      return true;
    } catch (error) {
      console.log(error);
      this.sendStreamResponse(res, {
        message: "Error processing message re-trying",
        timestamp: Date.now(),
        isError: false
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
        content: (() => {
          if (action === ExploreActionTypes.EXPLORE) {
            let prompt = exploreModePrompt;

            // Add flow-specific instructions if a flow is being explored
            if (ExploreModeAnthropicProvider.currentFlow) {
              prompt += `\n\n# CURRENT FLOW: ${ExploreModeAnthropicProvider.currentFlow.toUpperCase()}
You are currently exploring the "${ExploreModeAnthropicProvider.currentFlow}" flow. Remember to:
1. Focus ONLY on elements relevant to the ${ExploreModeAnthropicProvider.currentFlow} flow
2. Prioritize elements in the order they would typically be used in this flow
3. Stop exploration and notify the user when the flow is complete
4. Include <flow_type>${ExploreModeAnthropicProvider.currentFlow}</flow_type> in your response
5. Set <flow_status>complete</flow_status> when the flow is finished`;
            }

            return prompt;
          } else {
            return getPerformActionPrompt(source, task, currentPageUrl);
          }
        })()
      }
    ];
    if (action === ExploreActionTypes.ACTION) {
      message.push({
        role: "assistant",
        content:
          "I understand. Before each response, I will:\n\n1. Verify only ONE tool use exists\n2. Check no tool XML in markdown\n3. Validate all parameters\n4. Never combine multiple actions\n\nWhat would you like me to do?"
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
    source: StreamingSource,
    currentChatId: string
  ): Promise<boolean> {
    // Check if browser is ready when using Puppeteer to prevent premature operations
    let browserReady = true;
    if (source === "chrome-puppeteer") {
      const puppeteerService = new PuppeteerService({ io: null as any });
      browserReady = await puppeteerService.hasBrowserInstance();

      if (!browserReady) {
        console.log("Browser not ready yet for documentation generation, skipping");
        return false;
      }
    }

    // Get page URL and screenshot with proper error handling
    let pageUrl = "";
    let screenshot;

    try {
      pageUrl = await getCurrentUrlBasedOnSource(source);
      screenshot = await getLatestScreenshot(source);

      // Verify we have the necessary data
      if (!pageUrl || !screenshot || !screenshot.originalImage) {
        console.log("Missing required data for documentation generation, skipping");
        return false;
      }
    } catch (error) {
      console.error("Error preparing data for documentation:", error);
      return false;
    }

    // Check if this URL is already visited
    if (ExploreModeAnthropicProvider.pageRouter.has(pageUrl)) return false;

    // Add URL to visited pages and increment counter
    ExploreModeAnthropicProvider.pageRouter.add(pageUrl);
    ExploreModeAnthropicProvider.visitedPagesCount++;

    console.log(`[Explore Mode] Visited page count: ${ExploreModeAnthropicProvider.visitedPagesCount}`);

    // Extract page metadata if using Puppeteer
    let pageMetadata: PageMetadata = {};
    if (source === "chrome-puppeteer" && PuppeteerService.page) {
      pageMetadata = await PuppeteerService.page.evaluate(() => {
        return {
          title: document.title,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          language: document.documentElement.lang || "en",
          description:
            document
              .querySelector("meta[name=\"description\"]")
              ?.getAttribute("content") || "",
          totalScrollHeight: document.documentElement.scrollHeight,
          currentScrollPosition: window.scrollY
        };
      });
    }

    const messageRequest = this.buildMessageRequest(
      this.getModelId(),
      [],
      false
    );

    // Generate exploration progress message based on pages visited
    const explorationProgress = ExploreModeAnthropicProvider.visitedPagesCount < 10 ?
      `\n\n⚠️ EXPLORATION PROGRESS: You've only visited ${ExploreModeAnthropicProvider.visitedPagesCount} unique pages so far. For comprehensive documentation, you should explore AT LEAST 10-15 more pages/sections before considering your exploration complete.\n\nDO NOT USE complete_task UNTIL YOU'VE EXPLORED MORE PAGES!` :
      `\n\nEXPLORATION PROGRESS: You've visited ${ExploreModeAnthropicProvider.visitedPagesCount} unique pages.`;

    /* prettier-ignore */
    // Create a comprehensive context message with all available metadata
    const contextMessage = `
${appDocumentationGeneratorPrompt}

PAGE METADATA:
Current URL: ${pageUrl}
Page Title: ${pageMetadata.title || "Unknown"}
Viewport Size: ${pageMetadata.viewportWidth || "Unknown"} x ${pageMetadata.viewportHeight || "Unknown"} pixels
Page Language: ${pageMetadata.language || "Unknown"}
${pageMetadata.description ? `Meta Description: ${pageMetadata.description}` : ""}
${screenshot.totalScroll ? `Total Page Height: ${screenshot.totalScroll}px` : ""}
${screenshot.scrollPosition !== undefined ? `Current Scroll Position: ${screenshot.scrollPosition}px` : ""}${explorationProgress}

IMPORTANT: 
1. Use the exact URL provided above as the "URL/Location" for the current page/screen in your documentation.
2. Include viewport dimensions and responsive behavior observations in your documentation.
3. Mention the page title exactly as shown above in your documentation.
4. Continue exploring by clicking on links, buttons, and menu items to discover more pages.
`;
    /* prettier-ignore */
    messageRequest.messages.push({
      role: "user",
      content: [
        { type: "text", text: contextMessage },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: screenshot.originalImage.replace(/^data:image\/png;base64,/, "")
          }
        }
      ]
    });
    const stream = await this.client.messages.create(messageRequest);
    // Collect the complete response while streaming chunks
    CostTracker.recordCost(currentChatId, stream.model,
      {
        prompt_tokens: stream.usage.input_tokens,
        completion_tokens: stream.usage.output_tokens
      });

    await saveFileAndScreenshot(
      `${new Date().getTime().toString()}`,
      screenshot,
      "./output",
      (stream.content[0] as any)["text"]
    );
    // Do NOT delete from pageRouter to maintain accurate visited page count!
    // ExploreModeAnthropicProvider.pageRouter.delete(pageUrl); 
    return true;
  }
}
