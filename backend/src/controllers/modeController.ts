import { Request, Response } from "express";
import { Modes } from "../types";
import { ChatService } from "../services/chatService";

export class ModeController {
  /**
   * Switches the application mode and resets provider state
   * 
   * @param req Request with mode parameter
   * @param res Response object
   */
  static async switchMode(req: Request, res: Response): Promise<void> {
    try {
      const { mode } = req.body;

      if (!mode || !Object.values(Modes).includes(mode)) {
        res.status(400).json({
          success: false,
          message: "Invalid mode specified. Must be 'explore' or 'regression'",
        });
        return;
      }

      // Reset the provider first to clear any static state
      ChatService.resetProvider();
      console.log(`Mode switch: Provider reset for mode change to ${mode}`);
      
      // Create a new provider with the specified mode
      ChatService.createProvider(mode as Modes);
      console.log(`Mode switch: New provider created with mode ${mode}`);

      res.status(200).json({
        success: true,
        message: `Successfully switched to ${mode} mode`,
        mode,
      });
    } catch (error) {
      console.error("Error switching mode:", error);
      res.status(500).json({
        success: false,
        message: "Failed to switch mode",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Gets the current application mode
   * 
   * @param req Request object
   * @param res Response object
   */
  static async getMode(req: Request, res: Response): Promise<void> {
    try {
      const providerAvailable = ChatService.isProviderAvailable();
      
      res.status(200).json({
        success: true,
        providerAvailable,
      });
    } catch (error) {
      console.error("Error getting mode:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get mode information",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
