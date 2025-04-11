import { Request, Response } from "express";
import { ChatService } from "../services/chatService";
import { StreamingSource } from "../types/stream.types";
import { TestcaseController } from "./testcaseController";
import { getLatestScreenshot, saveScreenshot } from "../utils/screenshotUtils";
import { ExploreActionTypes, Modes } from "../types";
import omniParserService from "../services/OmniParserService";
import { config } from "../config";

export class ChatController {
  static async handleChatMessage(req: Request, res: Response): Promise<void> {
    try {
      // Get data from request body and query params
      const { message, history } = req.body;
      const folderPath = req.query.folderPath as string;
      const currentChatId = req.query.currentChatId as string;
      const source = req.query.source as StreamingSource | undefined;
      const saveScreenshots = req.query.saveScreenshots as string;
      const mode = req.query.mode as Modes;
      const type = req.query.type as ExploreActionTypes;

      // Always reset and recreate the provider with the correct mode to prevent context bleed
      const requestedMode = req.query.mode as Modes || Modes.REGRESSION;

      ChatService.createProvider(requestedMode);
      console.log(`Chat provider created with mode: ${requestedMode}`);

      if (!message || !Array.isArray(history)) {
        res.status(400).json({
          status: "error",
          message: "Message and valid history array are required"
        });
        return;
      }

      // Get latest screenshot if available
      const latestScreenshot = await getLatestScreenshot(source);
      let omniParserResult = null;
      if (config.omniParser.enabled) {
        omniParserResult = await omniParserService.processImage(latestScreenshot.originalImage);
        console.log("OmniParser result:", omniParserResult);
      }

      await Promise.all([
        folderPath &&
        saveScreenshots === "true" &&
        saveScreenshot(
          latestScreenshot,
          folderPath,
          currentChatId
        ),
        folderPath &&
        TestcaseController.downloadTestcase(
          history,
          currentChatId,
          folderPath
        ),
        ChatService.processMessage(
          currentChatId,
          res,
          message,
          history,
          requestedMode,
          type,
          latestScreenshot,
          source,
          omniParserResult as any
        ),
      ]);
    } catch (error) {
      console.error("Chat message error:", error);
      res.status(500).json({
        status: "error",
        message: "Error processing chat message"
      });
    }
  }

  static healthCheck(_req: Request, res: Response): void {
    res.json({
      status: "ok",
      message: "Hurray.. Server is running!"
    });
  }
}
