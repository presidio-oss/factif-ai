import { Server as SocketServer } from "socket.io";
import { ActionRequest, ActionResponse } from "./action.types";

export interface StreamingService {
  initialize(url: string): Promise<ActionResponse>;
  startScreenshotStream(interval: number): void;
  stopScreenshotStream(): void;
  performAction(
    action: string | ActionRequest,
    params?: any,
  ): Promise<ActionResponse | string>;
  cleanup(): Promise<void>;
  takeScreenshot(): Promise<string | null>;
}

export interface StreamAction {
  action: string;
  params?: any;
}

export type StreamingSource = "chrome-puppeteer" | "ubuntu-docker-vnc";

// Used by BaseStreamingService for browser console and screenshot streaming
export interface ServiceConfig {
  io: SocketServer;
}
