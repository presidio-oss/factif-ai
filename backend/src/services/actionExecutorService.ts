import { ActionRequest, ActionResponse } from "../types/action.types";
import { PuppeteerService } from "./implementations/puppeteer/PuppeteerService";
import { DockerVNCService } from "./implementations/docker/DockerVNCService";
import { BaseStreamingService } from "./base/BaseStreamingService";
import { ServiceConfig } from "../types/stream.types";

class ActionExecutorService {
  _puppeteerService: BaseStreamingService;
  _dockerVNCService: BaseStreamingService;
  _initialized: { [key: string]: boolean } = {
    "chrome-puppeteer": false,
    "ubuntu-docker-vnc": false,
  };

  constructor(serviceConfig: ServiceConfig) {
    this._puppeteerService = new PuppeteerService(serviceConfig);
    this._dockerVNCService = new DockerVNCService(serviceConfig);
    // Initialize Docker VNC service immediately since it doesn't need a URL
    this.initializeDockerVNC().then();
  }

  private async initializeDockerVNC() {
    try {
      // Initialize with empty URL since Docker VNC doesn't need it
      await this._dockerVNCService.initialize("");
      this._initialized["ubuntu-docker-vnc"] = true;
    } catch (error) {
      console.error("Failed to initialize Docker VNC:", error);
    }
  }

  async executeAction(
    request: ActionRequest,
    secretConfig: Record<string, string> = {},
  ): Promise<ActionResponse | string> {
    try {
      // Get the appropriate service first
      const service = this.getServiceForSource(request.source);

      // Validate source-specific actions
      if (request.source === "ubuntu-docker-vnc") {
        // Allow "launch" but still block "back" action
        if (request.action === "launch" || request.action === "back") {
          return {
            status: "error",
            message: `Action '${request.action}' is not supported for Docker VNC source`,
            screenshot: "",
          };
        }
        
        // Ensure Docker service is initialized
        if (!this._initialized["ubuntu-docker-vnc"]) {
          await this.initializeDockerVNC();
        }

      } else if (request.source === "chrome-puppeteer") {
        if (request.action === "doubleClick") {
          return {
            status: "error",
            message:
              "Double click action is only supported for Docker VNC source",
            screenshot: "",
          };
        }
        // Handle Puppeteer initialization
        if (request.action === "launch") {
          if (!request.url) {
            return {
              status: "error",
              message: "URL is required for launch action",
            };
          }
          const result = await service.initialize(request.url);
          this._initialized["chrome-puppeteer"] = true;
          return result;
        }
      }

      if (request.text) {
        request.text = this.getText(request.text, secretConfig);
      }
      // Route action through the selected service
      return (await service.performAction(request, {
        url: request.url,
        x: request.coordinate
          ? parseInt(request.coordinate.split(",")[0])
          : undefined,
        y: request.coordinate
          ? parseInt(request.coordinate.split(",")[1])
          : undefined,
        text: request.text,
        key: request.key,
        direction: request.action === "scrollUp"
          ? "up" 
          : request.action === "scrollDown"
            ? "down" 
            : undefined,
      })) as ActionResponse;
    } catch (error) {
      console.error("Action execution error:", error);
      return {
        status: "error",
        message: "Action execution failed",
        screenshot: "",
        error: (error as Error).message,
      };
    }
  }

  getText(text: string | undefined, config: Record<string, string>): string {
    if (!text) {
      return "";
    }
    return config.hasOwnProperty(text) ? config[text] : text;
  }

  private getServiceForSource(
    source: ActionRequest["source"],
  ): BaseStreamingService {
    switch (source) {
      case "chrome-puppeteer":
        return this._puppeteerService;
      case "ubuntu-docker-vnc":
        return this._dockerVNCService;
      default:
        throw new Error(`Unknown source: ${source}`);
    }
  }
}

// Export the class instead of an instance
export { ActionExecutorService };
