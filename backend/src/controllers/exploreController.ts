import { Request, Response } from "express";
import { ChatService } from "../services/chatService";
import { StreamingSource } from "../types/stream.types";
import { TestcaseController } from "./testcaseController";
import { getLatestScreenshot, saveScreenshot } from "../utils/screenshotUtils";
import { ExploreActionTypes, Modes } from "../types";
import { getCurrentUrlBasedOnSource } from "../utils/common.util";
import { RouteClassifierService } from "../services/RouteClassifierService";

export class ExploreController {
  private static routeClassifierService = new RouteClassifierService();
  static async handleExploreMessage(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      // Always reset and recreate the provider with explore mode to prevent context bleed

      ChatService.createProvider(Modes.EXPLORE);
      console.log("Explore provider created with mode: EXPLORE");
      // Get data from request body
      const { message, history, omniParserResult } = req.body;

      // Get remaining params from query string
      const folderPath = req.query.folderPath as string;
      const currentChatId = req.query.currentChatId as string;
      const source = req.query.source as StreamingSource | undefined;
      const saveScreenshots = req.query.saveScreenshots as string;
      let type = req.query.type as string;

      if (type == "undefined") {
        type = ExploreActionTypes.EXPLORE;
      }

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
          saveScreenshot(latestScreenshot, folderPath, currentChatId),
        folderPath &&
          TestcaseController.downloadTestcase(
            history,
            currentChatId,
            folderPath,
          ),
        ChatService.processMessage(
          currentChatId,
          res,
          message,
          history,
          Modes.EXPLORE,
          type as ExploreActionTypes,
          latestScreenshot,
          source,
          omniParserResult,
        ),
      ]);
    } catch (error) {
      console.error("Explore message error:", error);
      res.status(500).json({
        status: "error",
        message: "Error processing explore message",
      });
    }
  }

  static healthCheck(_req: Request, res: Response): void {
    res.json({
      status: "ok",
      message: "Explore mode is running",
    });
  }

  static async handleExploreCurrentPath(_req: Request, res: Response) {
    const source = _req.query.source as StreamingSource | undefined;
    if (!source) return;
    const url = await getCurrentUrlBasedOnSource(source);
    console.log("Determined URL:", url);
    res.json({ url });
  }

  /**
   * Classify routes for graph visualization
   * @param req Request with urls array to classify
   * @param res Response with classification results
   */
  static async classifyRoutes(req: Request, res: Response): Promise<void> {
    try {
      const { routes } = req.body;
      
      if (!Array.isArray(routes) || routes.length === 0) {
        res.status(400).json({
          status: "error",
          message: "Valid routes array is required",
        });
        return;
      }

      const classificationResults: Record<string, { category: string; description: string }> = {};
      
      // Process classifications in batches
      const routeObjects = routes.map(url => ({ url }));
      const classifications = await ExploreController.routeClassifierService.batchClassifyRoutes(routeObjects);
      
      // Convert Map to Record for JSON response
      classifications.forEach((value, key) => {
        classificationResults[key] = value;
      });

      res.json({
        status: "success",
        classifications: classificationResults
      });
    } catch (error) {
      console.error("Route classification error:", error);
      res.status(500).json({
        status: "error",
        message: "Error classifying routes",
      });
    }
  }
}
