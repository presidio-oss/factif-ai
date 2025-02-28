import { Request, Response } from "express";
import { ActionRequest } from "../types/action.types";
import { actionExecutorService } from "../server";
import { StreamingSource } from "../types/stream.types";

interface ActionQueryParams {
  chatId?: string;
  folderPath?: string;
  source?: StreamingSource;
}

class ActionController {
  async executeAction(
    req: Request<{}, {}, ActionRequest, ActionQueryParams>,
    res: Response,
  ) {
    try {
      const { source } = req.query;
      const { action } = req.body;

      if (!action || !source) {
        return res.status(400).json({
          status: "error",
          message: "Missing required parameters",
          screenshot: "",
        });
      }

      // Execute the action
      const result = await actionExecutorService.executeAction({
        ...req.body,
        source,
      });

      return res.json(result);
    } catch (error) {
      console.error("Action execution error:", error);
      return res.status(500).json({
        status: "error",
        message: "Failed to execute action",
        screenshot: "",
        error: (error as Error).message,
      });
    }
  }
}

export const actionController = new ActionController();
