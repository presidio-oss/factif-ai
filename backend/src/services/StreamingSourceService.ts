import { Server as SocketServer } from "socket.io";
import {
  StreamingService,
  StreamingSource,
  ServiceConfig,
} from "../types/stream.types";
import { ActionRequest, ActionResponse } from "../types/action.types";
import { PuppeteerService } from "./implementations/puppeteer/PuppeteerService";
import { DockerVNCService } from "./implementations/docker/DockerVNCService";

class StreamingSourceService {
  private service: StreamingService;
  _serviceConfig: ServiceConfig;

  constructor(io: SocketServer) {
    this._serviceConfig = { io };
    this.service = new PuppeteerService(this._serviceConfig); // Default to Puppeteer
  }

  private getService(source: StreamingSource): StreamingService {
    switch (source) {
      case "ubuntu-docker-vnc":
        return new DockerVNCService(this._serviceConfig);
      case "chrome-puppeteer":
        return new PuppeteerService(this._serviceConfig);
      default:
        throw new Error(`Unsupported streaming source: ${source}`);
    }
  }

  async initialize(
    url: string,
    source: StreamingSource,
  ): Promise<ActionResponse> {
    console.log("Initializing streaming service with source:", source);
    try {
      await this.cleanup(); // Cleanup existing service

      this.service = this.getService(source);
      return await this.service.initialize(url);
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Failed to initialize streaming service",
        screenshot: "",
      };
    }
  }

  startScreenshotStream(interval: number = 1000): void {
    this.service.startScreenshotStream(interval);
  }

  stopScreenshotStream(): void {
    this.service.stopScreenshotStream();
  }

  async performAction(
    action: string | ActionRequest,
    params?: any,
  ): Promise<ActionResponse | string> {
    try {
      return await this.service.performAction(action, params);
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Failed to perform action",
        screenshot: "",
      };
    }
  }

  async takeScreenshot(): Promise<string | null> {
    return this.service.takeScreenshot();
  }

  async cleanup(): Promise<void> {
    await this.service.cleanup();
  }
}

export default StreamingSourceService;
