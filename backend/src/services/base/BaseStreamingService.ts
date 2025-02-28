import { Server as SocketServer } from "socket.io";
import { ServiceConfig } from "../../types/stream.types";
import { ActionRequest, ActionResponse } from "../../types/action.types";

export abstract class BaseStreamingService {
  protected io: SocketServer;
  protected screenshotInterval: NodeJS.Timeout | null = null;
  protected isInitialized: boolean = false;

  constructor({ io }: ServiceConfig) {
    this.io = io;
  }

  protected emitConsoleLog(type: string, message: string) {
    this.io.sockets.emit("browser-console", { type, message });
  }
  abstract initialize(url: string): Promise<ActionResponse>;
  abstract startScreenshotStream(interval: number): void;

  stopScreenshotStream() {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
      this.emitConsoleLog("info", "Screenshot stream stopped");
    }
  }

  abstract performAction(
    action: string | ActionRequest,
    params?: any,
  ): Promise<ActionResponse | string>;

  async cleanup(): Promise<void> {
    this.stopScreenshotStream();
    this.isInitialized = false;
  }
}
