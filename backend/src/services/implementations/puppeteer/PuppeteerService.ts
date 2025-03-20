import { BaseStreamingService } from "../../base/BaseStreamingService";
import { ServiceConfig } from "../../../types/stream.types";
import { PuppeteerActions } from "./PuppeteerActions";
import {
  IProcessedScreenshot,
  IClickableElement,
} from "../../interfaces/BrowserService";
import { createCanvas, loadImage } from "canvas";
import { Browser, chromium, Page } from "playwright";
import { ActionRequest, ActionResponse } from "../../../types/action.types";

export class PuppeteerService extends BaseStreamingService {
  private isConnected: boolean = false;
  static browser: Browser | null = null;
  static page: Page | null = null;

  protected screenshotInterval: NodeJS.Timeout | null = null;

  constructor(serviceConfig: ServiceConfig) {
    super(serviceConfig);
    PuppeteerActions.initialize(serviceConfig.io, this);
  }

  async initialize(url: string): Promise<ActionResponse> {
    try {
      this.emitConsoleLog("info", "Initializing Puppeteer browser...");

      // If browser already exists, clean it up first to prevent duplicate processes
      if (PuppeteerService.browser) {
        this.emitConsoleLog("warn", "Browser instance already exists - cleaning up first");
        await this.cleanup();
      }

      // Launch with optimized settings to reduce resource usage
      PuppeteerService.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-gpu',              // Disable GPU hardware acceleration
          '--disable-dev-shm-usage',    // Overcome limited resource problems
          '--disable-setuid-sandbox',   // Disable setuid sandbox (safety feature)
          '--no-sandbox',               // Disable sandbox for better performance
          '--single-process',           // Run in a single process to reduce overhead
          '--disable-extensions',       // Disable extensions to reduce memory usage 
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-component-extensions-with-background-pages'
        ]
      });

      const context = await PuppeteerService.browser.newContext();
      PuppeteerService.page = await context.newPage();
      
      // Set memory and CPU usage limits
      try {
        // Using optional chaining and non-null assertion to handle possible null browser
        const browser = context.browser();
        // Check if we have a valid browser object before accessing version
        if (browser) {
          const browserVersion = browser.version();
          if (browserVersion && browserVersion.includes('chrome')) {
            // These flags only work with Chrome
            await context.addInitScript(() => {
              // @ts-ignore
              window.chrome = {
                runtime: {
                  // Reduce memory consumption
                  PredictiveNetworkingEnabled: false,
                },
              };
            });
          }
        }
      } catch (e) {
        // Ignore errors with browser version detection
        this.emitConsoleLog("warn", `Failed to apply Chrome optimizations: ${e}`);
      }

      await PuppeteerService.page.goto(url);
      await PuppeteerActions.waitTillHTMLStable(PuppeteerService.page);
      this.isConnected = true;
      this.isInitialized = true;
      this.startScreenshotStream();
      return { status: "success", message: "Puppeteer browser initialized" };
    } catch (error: any) {
      this.emitConsoleLog(
        "error",
        `Browser initialization error: ${error.message || "Unknown error"}`
      );
      await this.cleanup();
      throw error;
    }
  }

  async performAction(
    action: ActionRequest,
    params?: any
  ): Promise<ActionResponse> {
    try {
      this.emitConsoleLog("info", `Performing browser action: ${action.action}`);
      if (!PuppeteerService.page)
        return {
          status: "error",
          message: "Browser not launched. Please launch the browser first.",
        };

      switch (action.action) {
        case "launch":
          return this.initialize(params?.url);
        case "close":
          await this.cleanup();
          return { 
            status: "success", 
            message: "Browser closed successfully" 
          };
        case "click":
          const response = await PuppeteerActions.click(PuppeteerService.page, action);
          await PuppeteerService.page.waitForLoadState("domcontentloaded", {
            timeout: 20_000,
          });
          return response;
        case "type":
          return await PuppeteerActions.type(PuppeteerService.page, action);
        case "scroll_up":
          return await PuppeteerActions.scrollUp(PuppeteerService.page);
        case "scroll_down":
          return await PuppeteerActions.scrollDown(PuppeteerService.page);
        case "keyPress":
          return await PuppeteerActions.keyPress(PuppeteerService.page, action);
        case "back":
          return await PuppeteerActions.back(PuppeteerService.page);
        default:
          throw new Error(`Unsupported action type: ${action}`);
      }
    } catch (error: any) {
      this.emitConsoleLog(
        "error",
        `Browser action error: ${error.message || "Unknown error"}`
      );
      throw error;
    }
  }

  startScreenshotStream(interval: number = 1000): void {
    // Stop any existing stream first
    this.stopScreenshotStream();

    // Only start streaming if browser is initialized
    if (!this.isInitialized || !this.isConnected) {
      this.emitConsoleLog(
        "info",
        "Cannot start streaming: Browser not initialized"
      );
      return;
    }

    this.screenshotInterval = setInterval(async () => {
      // Check if browser is still running before attempting to get screenshot
      if (!this.isInitialized || !this.isConnected) {
        this.stopScreenshotStream();
        return;
      }

      try {
        const screenshot = await this.takeScreenshot();
        if (screenshot) {
          this.io.emit("screenshot-stream", screenshot);
        }
      } catch (error) {
        // If we get an error, the browser might have been closed
        // Stop the stream and update state
        this.stopScreenshotStream();
        this.isConnected = false;
        this.isInitialized = false;
      }
    }, interval);

    this.emitConsoleLog("info", "Screenshot stream started");
  }

  stopScreenshotStream(): void {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
  }

  async cleanup(): Promise<void> {
    this.emitConsoleLog("info", "Cleaning up Puppeteer browser resources...");

    // Stop streaming before closing browser
    this.stopScreenshotStream();

    // Actually close the browser instance with enhanced cleanup
    try {
      if (PuppeteerService.browser) {
        // Get all browser contexts and close them explicitly first
        const contexts = PuppeteerService.browser.contexts();
        for (const context of contexts) {
          try {
            // Close all pages in this context
            const pages = context.pages();
            for (const page of pages) {
              try {
                // Ensure page is properly closed
                await page.close({ runBeforeUnload: false });
              } catch (pageError) {
                this.emitConsoleLog("warn", `Error closing page: ${pageError}`);
              }
            }
            // Close the browser context
            await context.close();
          } catch (contextError) {
            this.emitConsoleLog("warn", `Error closing browser context: ${contextError}`);
          }
        }
        
        // Now close the main browser with force kill option to ensure processes terminate
        await PuppeteerService.browser.close();
        
        // Force garbage collection for the browser object
        PuppeteerService.browser = null;
        PuppeteerService.page = null;
        this.emitConsoleLog("info", "Browser instance closed successfully");
        
        // Additional safety measure: run a GC if available (Node 14+)
        if (global.gc) {
          try {
            global.gc();
            this.emitConsoleLog("info", "Manual garbage collection triggered");
          } catch (gcError) {
            this.emitConsoleLog("warn", `GC failed: ${gcError}`);
          }
        }
      }
    } catch (error) {
      this.emitConsoleLog("error", `Error closing browser: ${error}`);
      
      // Even if normal close fails, try force terminating any browser processes
      try {
        PuppeteerService.browser = null;
        PuppeteerService.page = null;
      } catch (e) {
        this.emitConsoleLog("error", `Failed to reset browser references: ${e}`);
      }
    }

    // Reset state variables
    this.isInitialized = false;
    this.isConnected = false;
    this.emitConsoleLog("info", "Browser resources cleaned up");
  }

  async captureScreenshotAndInfer(): Promise<IProcessedScreenshot> {
    // First check if browser is available
    if (!PuppeteerService.browser || !PuppeteerService.page) {
      throw new Error("Browser is not launched. Cannot capture screenshot and infer elements.");
    }
    
    const base64Image = await this.takeScreenshot();
    const elements: {
      clickableElements: IClickableElement[];
      inputElements: IClickableElement[];
    } = await this.getAllPageElements();

    // Combine elements, but ensure we don't exceed reasonable limits for the LLM
    const MAX_COMBINED_ELEMENTS = 400;
    const combinedElements = [
      ...elements.clickableElements,
      ...elements.inputElements,
    ].slice(0, MAX_COMBINED_ELEMENTS);
    
    // Get context safely without non-null assertion
    const contexts = PuppeteerService.browser.contexts();
    if (!contexts || contexts.length === 0) {
      throw new Error("No browser context available");
    }
    
    const context = contexts[0];
    const pages = context.pages();
    if (!pages || pages.length === 0) {
      throw new Error("No page available in context");
    }
    
    const page = pages[0];
    let scrollPosition = 0;
    let totalScroll = 0;

    await page.evaluate(() => {
      scrollPosition = window.scrollY;
      totalScroll = document.body.scrollHeight;
    }, null);

    return {
      image: await this.markElements(base64Image, combinedElements),
      inference: combinedElements,
      scrollPosition,
      totalScroll,
      originalImage: base64Image,
    };
  }

  async getCurrentUrl(): Promise<string> {
    if (!PuppeteerService.page) {
      throw new Error("Browser not launched");
    }
    let url = PuppeteerService.page.url();
    console.log("===", url);
    if (!url) {
      await PuppeteerService.page.evaluate(() => {
        url = window.location.href;
        console.log("===>>>", url);
      });
    }
    return url;
  }

  async takeScreenshot(): Promise<string> {
    try {
      if (!PuppeteerService.browser || !PuppeteerService.page) {
        throw new Error(
          "Browser is not launched. Please launch the browser first."
        );
      }

      // Get context safely
      const contexts = PuppeteerService.browser.contexts();
      if (!contexts || contexts.length === 0) {
        throw new Error("No browser context available");
      }
      
      const context = contexts[0];
      
      // Get page safely
      const pages = context.pages();
      if (!pages || pages.length === 0) {
        throw new Error("No page available in context");
      }
      
      const page = pages[0];
      
      // Take screenshot with error handling
      try {
        const buffer = await page.screenshot({ type: "png" });
        return buffer.toString("base64");
      } catch (screenshotError) {
        this.emitConsoleLog("error", `Screenshot error: ${screenshotError}`);
        throw screenshotError;
      }
    } catch (e) {
      this.emitConsoleLog("error", `Failed to take screenshot: ${e}`);
      return "";
    }
  }

  async getAllPageElements(): Promise<{
    clickableElements: Array<IClickableElement>;
    inputElements: Array<IClickableElement>;
  }> {
    if (!PuppeteerService.browser) {
      throw new Error(
        "Browser is not launched. Please launch the browser first."
      );
    }

    // Get context safely
    const contexts = PuppeteerService.browser.contexts();
    if (!contexts || contexts.length === 0) {
      throw new Error("No browser context available for getting page elements");
    }
    
    const context = contexts[0];
    
    // Get page safely
    const pages = context.pages();
    if (!pages || pages.length === 0) {
      throw new Error("No page available in context for getting page elements");
    }
    
    const page = pages[0];

    // Get all elements that are typically clickable or interactive
    const elements = await page.evaluate(() => {
      const clickableSelectors =
        'a, button, [role], [onclick], input[type="submit"], input[type="button"]';
      const inputSelectors =
        'input:not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"],select';

      // Create Sets to store unique elements
      const uniqueClickableElements = Array.from(
        document.querySelectorAll(clickableSelectors)
      );
      const uniqueInputElements = Array.from(
        document.querySelectorAll(inputSelectors)
      );

      function checkIfElementIsVisuallyVisible(
        element: Element,
        centerX: number,
        centerY: number
      ) {
        const topElement = document.elementFromPoint(centerX, centerY);
        return !(topElement !== element && !element.contains(topElement));
      }

      function elementVisibility(element: Element) {
        const isVisible = element.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        });
        const style = getComputedStyle(element);
        const notHiddenByCSS =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          parseFloat(style.opacity) > 0;
        const notHiddenAttribute = !(element as any).hidden;
        return isVisible && notHiddenByCSS && notHiddenAttribute;
      }

      function getElementInfo(element: Element) {
        const { top, left, bottom, right, width, height } =
          element.getBoundingClientRect();
        const attributes: Record<string, string> = {};
        const { innerHeight, innerWidth } = window;
        const isVisibleInCurrentViewPort =
          top >= 0 && left >= 0 && bottom <= innerHeight && right <= innerWidth;

        // Get all attributes
        Array.from(element.attributes).forEach((attr) => {
          attributes[attr.name] = attr.value;
        });

        return elementVisibility(element)
          ? {
              type:
                element instanceof HTMLInputElement
                  ? element.type
                  : element.tagName.toLowerCase(),
              tagName: element.tagName.toLowerCase(),
              text: element.textContent?.trim(),
              placeholder: (element as HTMLInputElement).placeholder,
              coordinate: {
                x: Math.round(left + width / 2),
                y: Math.round(top + height / 2),
              },
              attributes,
              isVisibleInCurrentViewPort,
              isVisuallyVisible: checkIfElementIsVisuallyVisible(
                element,
                left + width / 2,
                top + height / 2
              ),
            }
          : null;
      }

      return {
        clickableElements: Array.from(uniqueClickableElements)
          .map(getElementInfo)
          .filter((e) => e) as IClickableElement[],
        inputElements: Array.from(uniqueInputElements)
          .map(getElementInfo)
          .filter((e) => e) as IClickableElement[],
      };
    });

    // Filter elements for visibility and implement maximum limits
    const visibleClickableElements = elements.clickableElements
      .filter(e => e.isVisibleInCurrentViewPort && e.isVisuallyVisible);

    const visibleInputElements = elements.inputElements
      .filter(e => e.isVisibleInCurrentViewPort && e.isVisuallyVisible);

    // Define maximum limits
    const MAX_CLICKABLE = 150;
    const MAX_INPUT = 50;

    // Prioritize elements with text/labels and ensure we don't exceed limits
    const prioritizedClickable = visibleClickableElements
      .sort((a, b) => (a.text ? 1 : 0) - (b.text ? 1 : 0))
      .slice(0, MAX_CLICKABLE);

    const prioritizedInput = visibleInputElements
      .slice(0, MAX_INPUT);

    // Return the filtered elements
    return {
      clickableElements: prioritizedClickable,
      inputElements: prioritizedInput
    };
  }

  async markElements(
    base64Image: string,
    elements: IClickableElement[]
  ): Promise<string> {
    const imageBuffer = Buffer.from(base64Image, "base64");
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");

    context.drawImage(image, 0, 0);

    elements.forEach((element, index) => {
      if (!element.isVisuallyVisible) return;
      context.beginPath();
      context.rect(element.coordinate.x - 5, element.coordinate.y - 5, 30, 20);
      context.fillStyle = "green";
      context.fill();

      context.fillStyle = "#fff";
      context.font = "12px Arial";
      context.fillText(
        `[${index.toString()}]`,
        element.coordinate.x,
        element.coordinate.y + 5
      );
    });

    return canvas.toDataURL();
  }
}
