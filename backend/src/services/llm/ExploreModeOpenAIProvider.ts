import { Response } from "express";
import OpenAI, { AzureOpenAI } from "openai";
import { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources";
import { config } from "../../config";
import { ExploreActionTypes, Modes, StreamResponse } from "../../types";
import { ChatMessage } from "../../types/chat.types";
import { StreamingSource } from "../../types/stream.types";
import { LLMProvider } from "./LLMProvider";
import {
  saveFileAndScreenshot,
} from "../../utils/conversion-util";
import {
  getCurrentUrlBasedOnSource,
  extractAndStoreUrlFromResponse,
} from "../../utils/common.util";
import { getLatestScreenshot } from "../../utils/screenshotUtils";
import { IProcessedScreenshot, OmniParserResponse } from "../interfaces/BrowserService";
import { PuppeteerService } from "../implementations/puppeteer/PuppeteerService";
import { 
  exploreModePrompt, 
  getPerformActionPrompt 
} from "../../prompts/explore-mode.prompt";
import { appDocumentationGeneratorPrompt } from "../../prompts/app-doc-generator.prompt";
import fs from "fs";
import path from "path";
import { CostTracker } from "../../utils/costCalculator";

// Interface for page metadata (matching the Anthropic implementation)
interface PageMetadata {
  title?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  language?: string;
  description?: string;
  totalScrollHeight?: number;
  currentScrollPosition?: number;
}

export class ExploreModeOpenAIProvider implements LLMProvider {
  static pageRouter = new Set<string>(); // Tracks visited page URLs
  static visitedPagesCount = 0; // Tracks number of unique pages visited
  static currentFlow: string | null = null; // Tracks the current flow being explored

  // Static method to reset state when switching modes
  static resetState() {
    ExploreModeOpenAIProvider.pageRouter.clear();
    ExploreModeOpenAIProvider.visitedPagesCount = 0;
    ExploreModeOpenAIProvider.currentFlow = null;
    console.log("ExploreModeOpenAIProvider state has been reset");
  }

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
  ): ChatCompletionMessageParam[] {
    const formattedMessages: ChatCompletionMessageParam[] = this.chooseSystemPrompt(
      type,
      source as StreamingSource,
      type === ExploreActionTypes.ACTION
        ? this.getLastUserMessage(history)
        : "",
      currentPageUrl
    );

    if (type === ExploreActionTypes.ACTION) {
      // Add all history messages
      history.forEach((msg) => {
        formattedMessages.push({
          role: msg.isUser ? "user" : "assistant",
          content: msg.text,
        });
      });
    }

    // Add current message with image if present
    if (imageData) {
      // For OpenAI, we need to format the content as an array of text/image objects
      const contentArray: ChatCompletionContentPart[] = [
        { type: "text", text: currentMessage },
      ];

      // Add the image if available (properly formatted for OpenAI)
      if (imageData.originalImage && imageData.originalImage.length > 0) {
        // Clean the base64 string by removing the prefix if present
        const base64Image = imageData.originalImage.replace(/^data:image\/\w+;base64,/, "");

        contentArray.push({
          type: "image_url", 
          image_url: {
            url: `data:image/png;base64,${base64Image}`,
          },
        } as ChatCompletionContentPart);
      }

      formattedMessages.push({
        role: "user",
        content: contentArray,
      });
    } else {
      formattedMessages.push({
        role: "user",
        content: currentMessage,
      });
    }

    return formattedMessages;
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
    console.log("is image available", !!imageData);

    // Detect if this is a flow-specific exploration request
    if (type === ExploreActionTypes.EXPLORE) {
      const flowMatch = message.match(/explore\s+(\w+)\s+flow/i);
      if (flowMatch && flowMatch[1]) {
        const flowType = flowMatch[1].toLowerCase();
        ExploreModeOpenAIProvider.currentFlow = flowType;
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
        isError: true,
      });
    }
  }

  async processStream(
    currentChatId: string,
    res: Response,
    message: string,
    history: ChatMessage[] = [],
    mode: Modes = Modes.REGRESSION,
    type: ExploreActionTypes = ExploreActionTypes.EXPLORE,
    source?: StreamingSource,
    imageData?: IProcessedScreenshot,
    omniParserResult?: OmniParserResponse,
  ): Promise<boolean> {
    try {
      console.log("Processing message with history length:", history.length);
      // const currentPageUrl = await getCurrentUrlBasedOnSource(
      //   source as StreamingSource
      // );

      // Format messages with history and image if present
      const messages = this.formatMessagesWithHistory(
        message,
        history,
        imageData,
        source,
        mode,
        type,
        ""
      );

      // If omni parser is enabled and we have results, add them to the last user message
      if (config.omniParser.enabled && omniParserResult) {
        const lastUserMessageIndex = messages.length - 1;
        const lastUserMessage = messages[lastUserMessageIndex];

        // Handle both string and array content types
        if (typeof lastUserMessage.content === 'string') {
          messages[lastUserMessageIndex].content = 
            `${lastUserMessage.content}\n\nOmni Parser Results:\n${JSON.stringify(omniParserResult, null, 2)}`;
        } else if (Array.isArray(lastUserMessage.content)) {
          // For content arrays (with images), add omni parser results to the first text element
          const textElement = lastUserMessage.content.find(item => item.type === 'text');
          if (textElement && 'text' in textElement) {
            textElement.text = `${textElement.text}\n\nOmni Parser Results:\n${JSON.stringify(omniParserResult, null, 2)}`;
          }
        }
      }

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

      // Extract URL from response if using docker source
      if (source === 'ubuntu-docker-vnc' && accumulatedResponse) {
        // Use the utility function to extract and store URL
        extractAndStoreUrlFromResponse(source, accumulatedResponse);
      }

      // Check for flow completion in the response
      if (ExploreModeOpenAIProvider.currentFlow && accumulatedResponse) {
        // Check if the response indicates flow completion
        const flowStatusMatch = accumulatedResponse.match(/<flow_status>complete<\/flow_status>/i);
        if (flowStatusMatch) {
          console.log(`[Explore Mode] Flow completed: ${ExploreModeOpenAIProvider.currentFlow} flow`);

          // Extract flow summary if available
          let flowSummary = "Flow completed";
          const flowSummaryMatch = accumulatedResponse.match(/<flow_summary>([\s\S]*?)<\/flow_summary>/i);
          if (flowSummaryMatch && flowSummaryMatch[1]) {
            flowSummary = flowSummaryMatch[1].trim();
          }

          // Add completion message to the response
          const completionMessage = `\n\n[FLOW COMPLETED] The ${ExploreModeOpenAIProvider.currentFlow} flow has been fully explored.\n${flowSummary}`;
          this.sendStreamResponse(res, {
            message: completionMessage,
            timestamp: Date.now(),
          });

          // Reset current flow
          ExploreModeOpenAIProvider.currentFlow = null;
        }
      }

      this.sendStreamResponse(res, {
        message: "",
        isComplete: true,
        timestamp: Date.now(),
        totalCost: CostTracker.getTotalCostForTestcase(currentChatId),
        imageData: imageData?.originalImage,
      });
      return true;
    } catch (error) {
      console.error("Error in ExploreModeOpenAIProvider:", error);
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

  chooseSystemPrompt(
    action: ExploreActionTypes,
    source: StreamingSource,
    task: string,
    currentPageUrl: string
  ): ChatCompletionMessageParam[] {
    if (action === ExploreActionTypes.EXPLORE) {
      let prompt = exploreModePrompt;

      // Add flow-specific instructions if a flow is being explored
      if (ExploreModeOpenAIProvider.currentFlow) {
        prompt += `\n\n# CURRENT FLOW: ${ExploreModeOpenAIProvider.currentFlow.toUpperCase()}
You are currently exploring the "${ExploreModeOpenAIProvider.currentFlow}" flow. Remember to:
1. Focus ONLY on elements relevant to the ${ExploreModeOpenAIProvider.currentFlow} flow
2. Prioritize elements in the order they would typically be used in this flow
3. Stop exploration and notify the user when the flow is complete
4. Include <flow_type>${ExploreModeOpenAIProvider.currentFlow}</flow_type> in your response
5. Set <flow_status>complete</flow_status> when the flow is finished`;
      }

      return [{
        role: "system",
        content: prompt
      }];
    } else {
      return [
        {
          role: "system",
          content: getPerformActionPrompt(source, task, currentPageUrl)
        },
        {
          role: "assistant",
          content:
            "I understand. Before each response, I will:\n\n1. Verify only ONE tool use exists\n2. Check no tool XML in markdown\n3. Validate all parameters\n4. Never combine multiple actions\n\nWhat would you like me to do?"
        }
      ];
    }
  }

  async generateComponentDescription(
    source: StreamingSource,
    currentChatId: string,
  ): Promise<boolean> {
    let pageUrl = await getCurrentUrlBasedOnSource(source);
    let screenshot = await getLatestScreenshot(source);

    // Check if this URL is already visited
    if (ExploreModeOpenAIProvider.pageRouter.has(pageUrl)) return false;

    // Add URL to visited pages and increment counter
    ExploreModeOpenAIProvider.pageRouter.add(pageUrl);
    ExploreModeOpenAIProvider.visitedPagesCount++;

    console.log(`[Explore Mode] Visited page count: ${ExploreModeOpenAIProvider.visitedPagesCount}`);

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
              .querySelector('meta[name="description"]')
              ?.getAttribute("content") || "",
          totalScrollHeight: document.documentElement.scrollHeight,
          currentScrollPosition: window.scrollY,
        };
      });
    }

    // Generate exploration progress message based on pages visited
    const explorationProgress = ExploreModeOpenAIProvider.visitedPagesCount < 10 ?
      `\n\n⚠️ EXPLORATION PROGRESS: You've only visited ${ExploreModeOpenAIProvider.visitedPagesCount} unique pages so far. For comprehensive documentation, you should explore AT LEAST 10-15 more pages/sections before considering your exploration complete.\n\nDO NOT USE complete_task UNTIL YOU'VE EXPLORED MORE PAGES!` :
      `\n\nEXPLORATION PROGRESS: You've visited ${ExploreModeOpenAIProvider.visitedPagesCount} unique pages.`;

    // Create a comprehensive context message with all available metadata
    const contextMessage = `
${appDocumentationGeneratorPrompt}

PAGE METADATA:
Current URL: ${pageUrl}
Page Title: ${pageMetadata.title || 'Unknown'}
Viewport Size: ${pageMetadata.viewportWidth || 'Unknown'} x ${pageMetadata.viewportHeight || 'Unknown'} pixels
Page Language: ${pageMetadata.language || 'Unknown'}
${pageMetadata.description ? `Meta Description: ${pageMetadata.description}` : ''}
${screenshot.totalScroll ? `Total Page Height: ${screenshot.totalScroll}px` : ''}
${screenshot.scrollPosition !== undefined ? `Current Scroll Position: ${screenshot.scrollPosition}px` : ''}${explorationProgress}

IMPORTANT: 
1. Use the exact URL provided above as the "URL/Location" for the current page/screen in your documentation.
2. Include viewport dimensions and responsive behavior observations in your documentation.
3. Mention the page title exactly as shown above in your documentation.
4. Continue exploring by clicking on links, buttons, and menu items to discover more pages.
`;

    // Prepare message for OpenAI format
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: [
          { type: "text", text: contextMessage },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${screenshot.originalImage.replace(/^data:image\/png;base64,/, "")}`,
            }
          }
        ]
      }
    ];

    // Call the OpenAI API without streaming for this component description
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
      });

      CostTracker.recordCost(currentChatId, response.model,
        {
          prompt_tokens: response!.usage!.prompt_tokens,
          completion_tokens: response!.usage!.completion_tokens
        });

      const responseText = response.choices[0].message.content || "";

      // Save the result to file
      await saveFileAndScreenshot(
        `${new Date().getTime().toString()}`,
        screenshot,
        "./output",
        responseText
      );

      return true;
    } catch (error) {
      console.error("Error generating component description:", error);
      return false;
    }
  }
}
