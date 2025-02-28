import { Request, Response } from "express";
import { ChatService } from "../services/chatService";
import { StreamingSource } from "../types/stream.types";
import { TestcaseController } from "./testcaseController";
import { getLatestScreenshot, saveScreenshot } from "../utils/screenshotUtils";
import { ExploreActionTypes, Modes } from "../types";

export class ChatController {
  static async handleChatMessage(req: Request, res: Response): Promise<void> {
    try {
      !ChatService.isProviderAvailable() &&
        ChatService.createProvider(Modes.REGRESSION);
      // Get data from request body
      const { message, history, omniParserResult } = req.body;

      // Get remaining params from query string
      const folderPath = req.query.folderPath as string;
      const currentChatId = req.query.currentChatId as string;
      const source = req.query.source as StreamingSource | undefined;
      const saveScreenshots = req.query.saveScreenshots as string;
      const mode = req.query.mode as Modes;
      const type = req.query.type as ExploreActionTypes;

      if (!message || !Array.isArray(history)) {
        res.status(400).json({
          status: "error",
          message: "Message and valid history array are required",
        });
        return;
      }

      // Get latest screenshot if available
      const latestScreenshot = await getLatestScreenshot(source);

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
          res,
          message,
          history,
          mode,
          type,
          latestScreenshot,
          source,
          omniParserResult
        ),
      ]);
    } catch (error) {
      console.error("Chat message error:", error);
      res.status(500).json({
        status: "error",
        message: "Error processing chat message",
      });
    }
  }

  static healthCheck(_req: Request, res: Response): void {
    res.json({
      status: "ok",
      message: "Hurray.. Server is running!",
    });
  }
}
