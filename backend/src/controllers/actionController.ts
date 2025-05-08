import { Request, Response } from "express";
import { ActionRequest } from "../types/action.types";
import { actionExecutorService } from "../server";
import { StreamingSource } from "../types/stream.types";
import { getLatestScreenshot } from "../utils/screenshotUtils";
import { config } from "../config";
import omniParserService from "../services/OmniParserService";

interface ActionQueryParams {
  chatId?: string;
  folderPath?: string;
  source?: StreamingSource;
}

const loadSecretConfig = (inputConfig: string): Record<string, string> => {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(atob(inputConfig));
  } catch (e) {
  }
  return config;
};

class ActionController {



  async executeAction(
    req: Request<{}, {}, ActionRequest, ActionQueryParams>,
    res: Response
  ) {
    try {
      const { source } = req.query;
      const { action } = req.body;

      const secretConfig = loadSecretConfig(req.headers["x-factifai-config"] as string);


      if (!action || !source) {
        return res.status(400).json({
          status: "error",
          message: "Missing required parameters",
          screenshot: ""
        });
      }

      // Execute the action
      const result = await actionExecutorService.executeAction({
        ...req.body,
        source
      }, secretConfig);
      const latestScreenshot = await getLatestScreenshot(source);
      let omniParserResult = null;
      if (config.omniParser.enabled) {
        omniParserResult = await omniParserService.processImage(latestScreenshot.originalImage);
      }
      let response: any = { screenshot: latestScreenshot?.originalImage, omniParserResults: omniParserResult };
      if (typeof result === "string") {
        response = { ...response, result };
      } else {
        response = { ...response, ...result };
      }

      return res.json(response);
    } catch (error) {
      console.error("Action execution error:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to execute action",
        screenshot: "",
        error: (error as Error).message
      });
    }
  }
}

export const actionController = new ActionController();
