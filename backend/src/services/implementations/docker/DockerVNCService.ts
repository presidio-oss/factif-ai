import { BaseStreamingService } from "../../base/BaseStreamingService";
import { ServiceConfig } from "../../../types/stream.types";
import { ActionRequest, ActionResponse } from "../../../types/action.types";
import path from "path";
import crypto from "crypto";
import { DockerCommands } from "./DockerCommands";
import { DockerActions } from "./DockerActions";
import { DockerConfig, LogStreams } from "./DockerTypes";

export class DockerVNCService extends BaseStreamingService {
  private isConnected: boolean = false;
  private containerId: string | null = null;
  private logStreams: LogStreams = {};
  private readonly dockerContextPath: string;
  private readonly config: DockerConfig = {
    containerName: "factif-vnc",
    imageName: "factif-ubuntu-vnc",
    noVNCPort: 6080,
    vncPort: 5900,
  };

  constructor(serviceConfig: ServiceConfig) {
    super(serviceConfig);
    this.dockerContextPath = path.resolve(__dirname, "../../../docker");

    // Initialize DockerActions with the socket server instance
    DockerActions.initialize(serviceConfig.io);
  }

  async initialize(url: string): Promise<ActionResponse> {
    this.emitConsoleLog("info", "Initializing Ubuntu Docker VNC...");

    try {
      const containerStatus = await DockerCommands.checkContainerStatus(
        this.config.containerName
      );

      if (containerStatus.exists && containerStatus.id) {
        this.containerId = containerStatus.id;

        if (!containerStatus.running) {
          this.emitConsoleLog(
            "info",
            `Starting existing container ${this.containerId}...`
          );
          await DockerCommands.startContainer(this.containerId);
        } else {
          this.emitConsoleLog(
            "info",
            `Using running container ${this.containerId}`
          );
        }

        await this.waitForServices();
        await new Promise((resolve) => setTimeout(resolve, 2000));

        this.isConnected = true;
        this.isInitialized = true;
        await this.setupLogStreams();
        this.emitConsoleLog(
          "info",
          "Connected to existing Ubuntu Docker VNC container"
        );
        return {
          status: "success",
          message: "Connected to existing Ubuntu Docker VNC container",
        };
      }

      await this.ensureImageExists();

      const containerId = await DockerCommands.createContainer(this.config);
      this.containerId = containerId;

      await this.waitForServices();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await this.setupLogStreams();

      this.isConnected = true;
      this.isInitialized = true;
      this.emitConsoleLog("info", "Ubuntu Docker VNC initialization complete");

      return {
        status: "success",
        message: "Ubuntu Docker VNC initialization complete",
      };
    } catch (error: any) {
      this.emitConsoleLog(
        "error",
        `VNC initialization error: ${error.message || "Unknown error"}`
      );
      await this.cleanup();
      throw error;
    }
  }

  private async ensureImageExists(): Promise<void> {
    try {
      await DockerCommands.executeCommand({
        command: ["images", "-q", this.config.imageName],
      });
    } catch (error) {
      this.emitConsoleLog("error", "Docker image not available.");
      throw error;
    }
  }

  private async waitForServices(): Promise<void> {
    if (!this.containerId) throw new Error("No container ID available");

    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      if (await DockerCommands.checkService(this.containerId)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Timeout waiting for services to start");
  }

  private async setupLogStreams(): Promise<void> {
    if (!this.containerId) return;

    this.streamContainerLogs("x11vnc", "/tmp/x11vnc_logs/x11vnc.log");
    this.streamContainerLogs("novnc", "/tmp/novnc_logs/novnc.log");
  }

  private streamContainerLogs(service: string, logPath: string): void {
    if (!this.containerId) return;

    const docker = DockerCommands.executeCommand({
      command: ["exec", this.containerId, "tail", "-f", logPath],
    })
      .then((output) => {
        const logs = output.split("\n");
        logs.forEach((log) => {
          if (log.trim()) {
            this.emitConsoleLog("info", `[${service}] ${log.trim()}`);
          }
        });
      })
      .catch((error) => {
        if (!error.message.includes("No such file")) {
          this.emitConsoleLog("error", `[${service}] ${error.message}`);
        }
      });
  }

  startScreenshotStream(interval: number = 1000): void {
    if (!this.isInitialized || !this.isConnected) {
      throw new Error("VNC not initialized");
    }

    this.stopScreenshotStream();
    this.emitConsoleLog("info", "VNC streaming is handled by noVNC client");
  }

  stopScreenshotStream(): void {
    // No-op for VNC as we don't use screenshot streaming
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this.isInitialized || !this.isConnected || !this.containerId) {
      throw new Error("VNC not initialized");
    }

    const screenshotId = crypto.randomUUID();
    const screenshotPath = `/tmp/screenshot_${screenshotId}.png`;

    try {
      return DockerCommands.takeScreenshot(this.containerId, screenshotPath);
    } catch (error: any) {
      this.emitConsoleLog(
        "error",
        `Screenshot error: ${error.message || "Unknown error"}`
      );
      return null;
    }
  }

  async performAction(
    action: ActionRequest,
    params?: any
  ): Promise<ActionResponse> {
    if (!this.isInitialized || !this.isConnected || !this.containerId) {
      return {
        status: "error",
        message: "VNC not initialized",
      };
    }

    try {
      this.emitConsoleLog("info", `Performing VNC action: ${action}`);
      return await DockerActions.performAction(
        this.containerId,
        action,
        params
      );
    } catch (error: any) {
      this.emitConsoleLog(
        "error",
        `VNC action error: ${error.message || "Unknown error"}`
      );
      return {
        status: "error",
        message: error.message || "VNC action failed",
      };
    }
  }

  async getCurrentUrl() {
    if (!this.isInitialized || !this.isConnected || !this.containerId) {
      return {
        status: "error",
        message: "VNC not initialized",

        screenshot: "",
      };
    }
    return await DockerActions.getUrl(this.containerId);
  }

  async cleanup(): Promise<void> {
    this.emitConsoleLog("info", "Cleaning up Ubuntu Docker VNC resources...");

    this.stopScreenshotStream();

    Object.values(this.logStreams).forEach((stream) => {
      if (stream) {
        stream.kill();
      }
    });
    this.logStreams = {};

    this.isInitialized = false;
    this.isConnected = false;

    this.emitConsoleLog(
      "info",
      "VNC resources cleaned up, container left running"
    );
  }
}
