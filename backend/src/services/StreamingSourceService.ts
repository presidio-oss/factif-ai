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
  private isInitialized: boolean = false;
  private pendingInitialization: Promise<ActionResponse> | null = null;
  private lastInitializedSource: StreamingSource | null = null;

  constructor(io: SocketServer) {
    this._serviceConfig = { io };
    this.service = new PuppeteerService(this._serviceConfig); // Default to Puppeteer
  }

  private getService(source: StreamingSource): StreamingService {
    // Only create a new service if we're changing source types
    if (this.lastInitializedSource !== source) {
      switch (source) {
        case "ubuntu-docker-vnc":
          return new DockerVNCService(this._serviceConfig);
        case "chrome-puppeteer":
          return new PuppeteerService(this._serviceConfig);
        default:
          throw new Error(`Unsupported streaming source: ${source}`);
      }
    }
    
    // Return existing service if the source type hasn't changed
    return this.service;
  }

  async initialize(
    url: string,
    source: StreamingSource,
  ): Promise<ActionResponse> {
    console.log("Initializing streaming service with source:", source);
    
    // If there's an already pending initialization, wait for it
    if (this.pendingInitialization) {
      console.log("Waiting for pending initialization to complete...");
      await this.pendingInitialization;
    }
    
    // Create new pending initialization
    this.pendingInitialization = (async () => {
      try {
        // Only cleanup if we're initializing a different type of service
        // or if we're already initialized and need to reinitialize
        if (this.lastInitializedSource !== source || this.isInitialized) {
          console.log("Cleaning up previous service before initialization...");
          await this.cleanup();
        }
        
        console.log(`Creating ${source} service and initializing with URL: ${url}`);
        this.service = this.getService(source);
        const result = await this.service.initialize(url);
        
        // Mark as initialized only if successful
        if (result.status === "success") {
          this.isInitialized = true;
          this.lastInitializedSource = source;
          console.log(`Successfully initialized ${source} service with URL: ${url}`);
        } else {
          console.error(`Failed to initialize ${source} service: ${result.message}`);
          this.isInitialized = false;
        }
        
        return result;
      } catch (error: any) {
        console.error(`Error during service initialization: ${error.message || error}`);
        this.isInitialized = false;
        return {
          status: "error",
          message: error.message || "Failed to initialize streaming service",
          screenshot: "",
        };
      } finally {
        // Clear the pending initialization
        this.pendingInitialization = null;
      }
    })();
    
    return await this.pendingInitialization;
  }

  startScreenshotStream(interval: number = 1000): void {
    if (!this.isInitialized) {
      console.warn("Cannot start screenshot stream: Service not initialized");
      return;
    }
    
    try {
      this.service.startScreenshotStream(interval);
    } catch (error) {
      console.error(`Error starting screenshot stream: ${error}`);
    }
  }

  stopScreenshotStream(): void {
    try {
      this.service.stopScreenshotStream();
    } catch (error) {
      console.error(`Error stopping screenshot stream: ${error}`);
    }
  }

  /**
   * Check if a browser is actually active/running
   * This is used to detect browsers that might have been launched directly by the LLM
   * @returns Promise resolving to true if a browser instance is active
   */
  private async checkActiveBrowser(): Promise<boolean> {
    try {
      // Check if the service is a PuppeteerService and has an active browser instance
      if (this.service instanceof PuppeteerService) {
        return await this.service.hasBrowserInstance();
      }
      return false;
    } catch (error) {
      console.error("Error checking active browser:", error);
      return false; 
    }
  }

  async performAction(
    action: string | ActionRequest,
    params?: any,
  ): Promise<ActionResponse | string> {
    // Wait for any pending initialization to complete first
    if (this.pendingInitialization) {
      console.log("Waiting for pending initialization before performing action...");
      await this.pendingInitialization;
    }
    
    // If action is "launch", make sure to handle it even if not initialized
    const actionString = typeof action === 'string' ? action : action.action;
    if (!this.isInitialized && actionString !== "launch") {
      // NEW CODE: Check if there's actually a browser running
      const isBrowserActive = await this.checkActiveBrowser();
      
      if (isBrowserActive) {
        // If browser is active despite isInitialized=false, self-heal the state
        console.log("Browser detected as active despite isInitialized=false, allowing action");
        this.isInitialized = true;
      } else {
        console.warn(`Cannot perform action '${actionString}': Browser not initialized`);
        return {
          status: "error",
          message: "Browser not initialized. Please launch the browser first.",
          screenshot: "",
        };
      }
    }
    
    try {
      const result = await this.service.performAction(action, params);
      
      // Update initialization state if this was a launch or close action
      if (actionString === "launch" && typeof result === 'object' && result.status === "success") {
        this.isInitialized = true;
      } else if (actionString === "close") {
        this.isInitialized = false;
      }
      
      return result;
    } catch (error: any) {
      console.error(`Error performing action '${actionString}': ${error.message || error}`);
      return {
        status: "error",
        message: error.message || "Failed to perform action",
        screenshot: "",
      };
    }
  }

  async takeScreenshot(): Promise<string | null> {
    // Wait for any pending initialization to complete first
    if (this.pendingInitialization) {
      console.log("Waiting for pending initialization before taking screenshot...");
      await this.pendingInitialization;
    }
    
    // Return empty if not initialized
    if (!this.isInitialized) {
      console.warn("Cannot take screenshot: Browser not initialized");
      return "";
    }
    
    try {
      return await this.service.takeScreenshot();
    } catch (error: any) {
      console.error(`Error taking screenshot: ${error.message || error}`);
      return "";
    }
  }

  async cleanup(): Promise<void> {
    try {
      // If there's a pending initialization, wait for it to complete first
      // to avoid race conditions with cleanup
      if (this.pendingInitialization) {
        console.log("Waiting for pending initialization before cleanup...");
        try {
          await this.pendingInitialization;
        } catch (error) {
          console.error("Error in pending initialization during cleanup:", error);
          // Continue with cleanup anyway
        }
      }
      
      // Only attempt cleanup if we believe we're initialized or if there's
      // a lastInitializedSource, which suggests we previously had a service
      if (this.isInitialized || this.lastInitializedSource) {
        console.log("Cleaning up browser service resources...");
        await this.service.cleanup();
        console.log("Browser service resources cleaned up successfully");
      }
      
      // Reset state variables regardless of success
      this.isInitialized = false;
    } catch (error) {
      console.error(`Error during service cleanup: ${error}`);
      // Reset state even after error
      this.isInitialized = false;
      // Re-throw to let caller handle if needed
      throw error;
    }
  }
}

export default StreamingSourceService;
