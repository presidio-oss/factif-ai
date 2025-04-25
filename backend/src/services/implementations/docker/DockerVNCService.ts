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
    let shouldLaunchBrowser = url && url.trim().length > 0;

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
        this.emitConsoleLog("info", "Allowing extra time for VNC services to stabilize...");
        await new Promise((resolve) => setTimeout(resolve, 5000));

        this.isConnected = true;
        this.isInitialized = true;
        await this.setupLogStreams();
        this.emitConsoleLog(
          "info",
          "Connected to existing Ubuntu Docker VNC container"
        );

        // Launch browser if URL is provided
        if (shouldLaunchBrowser && this.containerId) {
          await this.launchFirefoxWithUrl(url);
        }

        return {
          status: "success",
          message: shouldLaunchBrowser 
            ? `Connected to existing Ubuntu Docker VNC container and launched Firefox with URL: ${url}`
            : "Connected to existing Ubuntu Docker VNC container",
        };
      }

      await this.ensureImageExists();

      const containerId = await DockerCommands.createContainer(this.config);
      
      // Check if container creation succeeded
      if (!containerId || containerId.trim() === "") {
        throw new Error("Failed to create Docker container. Docker might not be installed or running.");
      }
      
      this.containerId = containerId;

      await this.waitForServices();
      this.emitConsoleLog("info", "Allowing extra time for VNC services to stabilize...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await this.setupLogStreams();

      this.isConnected = true;
      this.isInitialized = true;
      this.emitConsoleLog("info", "Ubuntu Docker VNC initialization complete");

      // Launch browser if URL is provided
      if (shouldLaunchBrowser && this.containerId) {
        await this.launchFirefoxWithUrl(url);
      }

      return {
        status: "success",
        message: shouldLaunchBrowser 
          ? `Ubuntu Docker VNC initialization complete and Firefox launched with URL: ${url}`
          : "Ubuntu Docker VNC initialization complete",
      };
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error";
      if (errorMessage.includes("Docker is not available") || 
          errorMessage.includes("Docker container unavailable")) {
        // For Docker installation errors, don't show the stack trace
        this.emitConsoleLog(
          "error",
          "Docker is not available for VNC features. Please install Docker or ensure it's running."
        );
        await this.cleanup();
        
        // Return a special response instead of throwing an error
        return {
          status: "error",
          message: "Docker is not installed. Please install Docker from https://docs.docker.com/get-docker/"
        };
      } else {
        // For other errors, show more details
        this.emitConsoleLog(
          "error",
          `VNC initialization error: ${errorMessage}`
        );
        await this.cleanup();
        throw error;
      }
    }
  }

  // New method to launch Firefox with a URL
  async launchFirefoxWithUrl(url: string): Promise<void> {
    if (!this.containerId) {
      throw new Error("Container is not initialized");
    }

    try {
      this.emitConsoleLog("info", `Launching Firefox with URL: ${url}`);
      
      // Check if Firefox is already running
      let firefoxRunning = false;
      try {
        const result = await DockerCommands.executeCommand({
          command: ["exec", this.containerId, "pgrep", "-f", "firefox-esr"],
        });
        firefoxRunning = result.trim().length > 0;
      } catch (e) {
        // If pgrep fails, Firefox is likely not running
        firefoxRunning = false;
      }
      
      this.emitConsoleLog("info", `Firefox is ${firefoxRunning ? 'already running' : 'not running'}`);

      if (firefoxRunning) {
        // If Firefox is already running, just navigate to the URL using xdotool
        this.emitConsoleLog("info", "Navigating existing Firefox window to URL: " + url);
        try {
          // Activate Firefox window
          await DockerCommands.executeCommand({
            command: ["exec", this.containerId, "xdotool", "search", "--onlyvisible", "--class", "firefox", "windowactivate"],
          });
          
          // Navigate to the URL by focusing address bar, typing new URL, and hitting enter
          await DockerCommands.executeCommand({
            command: ["exec", this.containerId, "xdotool", "key", "ctrl+l"],
          });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await DockerCommands.executeCommand({
            command: ["exec", this.containerId, "xdotool", "type", url],
          });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await DockerCommands.executeCommand({
            command: ["exec", this.containerId, "xdotool", "key", "Return"],
          });
          
          this.emitConsoleLog("info", `Navigated existing Firefox to URL: ${url}`);
        } catch (error: any) {
          this.emitConsoleLog("warn", "Error navigating Firefox: " + error.message);
          
          // As a fallback, try launching a new window
          this.emitConsoleLog("info", "Attempting to open a new Firefox window instead");
          await DockerCommands.executeCommand({
            command: ["exec", this.containerId, "bash", "-c", `firefox-esr --new-window "${url}"`],
            successMessage: `Launched Firefox with URL: ${url}`,
            errorMessage: `Failed to launch Firefox with URL: ${url}`,
          });
        }
      } else {
        // Launch Firefox with the specified URL if it's not running
        await DockerCommands.executeCommand({
          command: ["exec", this.containerId, "bash", "-c", `firefox-esr --new-window "${url}"`],
          successMessage: `Launched Firefox with URL: ${url}`,
          errorMessage: `Failed to launch Firefox with URL: ${url}`,
        });
      }

      // Allow time for Firefox to load
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      this.emitConsoleLog("info", "Firefox launched successfully");
    } catch (error: any) {
      this.emitConsoleLog(
        "error",
        `Failed to launch Firefox: ${error.message || "Unknown error"}`
      );
      throw error;
    }
  }

  private async ensureImageExists(): Promise<void> {
    try {
      const result = await DockerCommands.executeCommand({
        command: ["images", "-q", this.config.imageName],
      });
      
      // Check if the command returned empty result, which could indicate Docker not installed
      if (result === "") {
        this.emitConsoleLog("error", "Docker may not be installed or is not running.");
        throw new Error("Docker is not available. Please install Docker or ensure it's running.");
      }
      
      // Check if the image exists
      if (!result.trim()) {
        this.emitConsoleLog("error", "Docker image not available.");
        throw new Error(`Docker image '${this.config.imageName}' not found.`);
      }
    } catch (error: any) {
      this.emitConsoleLog("error", "Docker image check failed.");
      throw error;
    }
  }

  private async waitForServices(): Promise<void> {
    if (!this.containerId) {
      this.emitConsoleLog("error", "Docker container unavailable. Docker might not be installed or running.");
      throw new Error("Docker container unavailable. Please install Docker or ensure it's running.");
    }

    let attempts = 0;
    const maxAttempts = 60; // Increased timeout from 30 to 60 seconds
    
    this.emitConsoleLog("info", "Waiting for VNC services to start...");

    while (attempts < maxAttempts) {
      try {
        const serviceStatus = await DockerCommands.checkServiceDetailed(this.containerId);
        
        if (serviceStatus.vncReady && serviceStatus.noVncReady) {
          this.emitConsoleLog("info", "All VNC services started successfully");
          return;
        }
        
        // Log which specific service we're waiting for
        if (attempts % 5 === 0) {
          if (!serviceStatus.vncReady && !serviceStatus.noVncReady) {
            this.emitConsoleLog("info", `Waiting for VNC and noVNC services... [${attempts+1}/${maxAttempts}]`);
          } else if (!serviceStatus.vncReady) {
            this.emitConsoleLog("info", `Waiting for VNC service (port 5900)... [${attempts+1}/${maxAttempts}]`);
          } else if (!serviceStatus.noVncReady) {
            this.emitConsoleLog("info", `Waiting for noVNC service (port 6080)... [${attempts+1}/${maxAttempts}]`);
          }
        }
      } catch (error: any) {
        // If Docker is not available, we might get errors here
        this.emitConsoleLog("warn", `Error checking service status: ${error.message || "Unknown error"}`);
        
        if (attempts % 5 === 0) {
          this.emitConsoleLog("info", `Still waiting for Docker services... [${attempts+1}/${maxAttempts}]`);
        }
      }
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    // Enhanced error message with more details
    throw new Error("Timeout waiting for services to start. Please check Docker logs for more information.");
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
      .catch((error: any) => {
        if (!error.message?.includes("No such file")) {
          this.emitConsoleLog("error", `[${service}] ${error.message || "Unknown error"}`);
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

    // Handle launch action separately
    if (action.action === "launch" && params?.url) {
      try {
        await this.launchFirefoxWithUrl(params.url);
        
        // Take screenshot after launching browser
        const screenshot = await this.takeScreenshot();
        
        // After Firefox is launched with URL, we need to trigger exploration automatically
        this.emitConsoleLog("info", "Triggering automatic exploration via multiple methods");
        
        // Emit socket events that the AutoExploreHandler component will listen for
        this.io.sockets.emit("firefox-launched", {
          url: params.url,
          screenshot: screenshot || "",
          source: "ubuntu-docker-vnc"
        });
        
        this.io.sockets.emit("auto-explore", {
          message: `Explore ${params.url}`,
          url: params.url,
          screenshot: screenshot || "",
          source: "ubuntu-docker-vnc"
        });
        
        // Try to run the autotype script directly
        try {
          const { execSync } = require('child_process');
          const autotypePath = path.resolve(__dirname, "../../../docker/ubuntu-vnc/autotype.sh");
          
          this.emitConsoleLog("info", `Running autotype script for ${params.url}`);
          execSync(`bash ${autotypePath} "${params.url}" &`);
        } catch (scriptError: any) {
          this.emitConsoleLog("warn", `Failed to run autotype script: ${scriptError.message || "Unknown error"}`);
        }
        
        return {
          status: "success",
          message: `Launched Firefox with URL: ${params.url} and triggered exploration`,
          screenshot: screenshot || "",
        };
      } catch (error: any) {
        return {
          status: "error",
          message: error.message || "Failed to launch Firefox",
          screenshot: "",
        };
      }
    }

    try {
      this.emitConsoleLog("info", `Performing VNC action: ${action.action}`);
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
