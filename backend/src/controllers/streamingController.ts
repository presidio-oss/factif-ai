import { Socket } from "socket.io";
import StreamingSourceService from "../services/StreamingSourceService";
import omniParserService from "../services/OmniParserService";
import { StreamingSource } from "../types/stream.types";
import { ActionRequest } from "../types/action.types";

export class StreamingController {
  private streamingService: StreamingSourceService;

  constructor(streamingService: StreamingSourceService) {
    this.streamingService = streamingService;
  }

  async handleStartStream(
    socket: Socket,
    {
      url,
      source = "chrome-puppeteer",
      folderPath,
    }: {
      url: string;
      source?: StreamingSource;
      folderPath?: string;
    },
  ) {
    try {
      await this.streamingService.initialize(url, source);
      this.streamingService.startScreenshotStream(1000); // Screenshot every second
      socket.emit("browser-started");
    } catch (error: any) {
      socket.emit("stream-error", {
        message: error?.message || "Unknown error occurred",
      });
    }
  }

  async handleBrowserAction(
    socket: Socket,
    {
      action,
      params,
      folderPath,
    }: {
      action: string;
      params: any;
      folderPath?: string;
    },
  ) {
    try {
      const paramsWithPath = { ...params, folderPath };
      await this.streamingService.performAction(
        {
          action,
          coordinate: `${paramsWithPath.x},${paramsWithPath.y}`,
          text: paramsWithPath?.text,
        } as ActionRequest,
        paramsWithPath,
      );
    } catch (error: any) {
      socket.emit("browser-error", {
        message: error?.message || "Unknown error occurred",
      });
    }
  }

  async handleRequestScreenshot(
    socket: Socket,
    { folderPath }: { folderPath?: string },
  ) {
    try {
      // First launch an empty browser if needed - ensures we always have a browser for screenshots
      const ensureBrowserAction = {
        action: "launch",
        url: "about:blank"
      };
      
      try {
        // This will simply validate the browser is available, or create a new one if not
        await this.streamingService.performAction(
          ensureBrowserAction as ActionRequest,
          { folderPath }
        );
      } catch (browserError) {
        console.error("Error ensuring browser is available:", browserError);
        // Continue anyway to try taking a screenshot
      }
      
      // Now attempt to take the screenshot
      const screenshot = await this.streamingService.takeScreenshot();

      if (screenshot) {
        const imageBuffer = Buffer.from(
          screenshot.replace(/^data:image\/\w+;base64,/, ""),
          "base64",
        );
        const omniParserResults =
          await omniParserService.processImage(imageBuffer);

        socket.emit("screenshot-snapshot", {
          image: screenshot,
          omniParserResults,
        });
      } else {
        // If no screenshot, inform the client
        socket.emit("browser-info", {
          message: "No screenshot available. Browser may not be initialized.",
        });
      }
    } catch (error: any) {
      console.error("Screenshot error:", error);
      socket.emit("browser-error", {
        message: error?.message || "Unknown error occurred",
      });
    }
  }

  async handleStopBrowser(
    socket: Socket,
    { folderPath }: { folderPath?: string },
  ) {
    try {
      await this.streamingService.cleanup();
      socket.emit("browser-stopped");
    } catch (error: any) {
      socket.emit("browser-error", {
        message: error?.message || "Unknown error occurred",
      });
    }
  }

  async handleDisconnect() {
    await this.streamingService.cleanup();
  }
}
