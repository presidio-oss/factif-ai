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
      }
    } catch (error: any) {
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
