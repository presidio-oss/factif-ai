import { Server as SocketServer } from "socket.io";
import { Page } from "playwright";
import { PuppeteerService } from "./PuppeteerService";
import { ActionRequest, ActionResponse } from "../../../types/action.types";
import { getCoordinate } from "../../../utils/historyManager";

export class PuppeteerActions {
  private static io: SocketServer;
  private static puppeteerService: PuppeteerService;

  static initialize(io: SocketServer, puppeteerService: PuppeteerService) {
    PuppeteerActions.io = io;
    PuppeteerActions.puppeteerService = puppeteerService;
  }

  static async click(
    page: Page,
    action: ActionRequest
  ): Promise<ActionResponse> {
    if (!action || !action.coordinate) {
      return {
        status: "error",
        message: "Coordinates are required for click action",
      };
    }
    const coordinate = getCoordinate(action.coordinate);
    
    try {
      // First, check if element is within viewport using evaluate
      const res = await page.evaluate((coordinate) => {
        try {
          const element = document.elementFromPoint(
            coordinate.x,
            coordinate.y
          ) as Element;
          
          if (!element) {
            return {
              isSuccess: false,
              message: "No element found at specified coordinates"
            };
          }
          
          const { top } = element.getBoundingClientRect();
          const isOffScreen = top > window.innerHeight || top < window.scrollY;
          
          if (isOffScreen) {
            element.scrollIntoView({ behavior: "smooth" });
          }

          return {
            tagName: element.tagName,
            isInput: element.tagName === 'INPUT' || element.tagName === 'TEXTAREA',
            isSuccess: true,
            isOffScreen
          };
        } catch (e) {
          return {
            isSuccess: false,
            message:
              "Element not available on the visible viewport. Please check if the element is visible in the current viewport."
          };
        }
      }, coordinate);
      
      if (!res.isSuccess) {
        return {
          status: "error",
          message: res.message || "Element not found at coordinates",
        };
      }

      // If element was off-screen, wait a moment for scrolling to complete
      if (res.isOffScreen) {
        await page.waitForTimeout(300);
      }

      // Use Playwright's more reliable click method
      await page.mouse.click(coordinate.x, coordinate.y);
      
      // If we clicked on an input field, emit a signal to remember its position for typing
      if (res.isInput) {
        PuppeteerActions.io?.sockets.emit('input-focused', {x: coordinate.x, y: coordinate.y});
      }
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait for page to stabilize after the click
      await this.waitTillHTMLStable(page);

      return {
        status: "success",
        message: "Click action performed successfully",
      };
    } catch (e) {
      console.error("Click action error:", e);
      return {
        status: "error",
        message: "Click action failed. Please retry",
      };
    }
  }

  static async type(page: Page, action: ActionRequest): Promise<any> {
    if (!action) {
      throw new Error("Text is required for type action");
    }

    if (!action.text) {
      return {
        status: "error",
        message: "Text is required for type action",
      };
    }
    
    try {
      // Ensure the element is focused (even if coordinates aren't provided)
      if (action.coordinate) {
        const coordinate = getCoordinate(action.coordinate as string);
        
        // Check if element at coordinate is focusable
        const isFocusable = await page.evaluate((coordinate) => {
          const el = document.elementFromPoint(coordinate.x, coordinate.y);
          if (!el) return false;
          
          // Check if this is a focusable element
          const tagName = el.tagName.toLowerCase();
          const isInput = tagName === 'input' || tagName === 'textarea' || 
                         el.hasAttribute('contenteditable');
          
          // If focusable, try to focus it
          if (isInput) {
            // Cast to HTMLElement which has focus() method
            (el as HTMLElement).focus();
            return true;
          }
          return false;
        }, coordinate);
        
        if (!isFocusable) {
          // If not naturally focusable, try clicking it first
          await page.mouse.click(coordinate.x, coordinate.y);
          await page.waitForTimeout(100); // Small delay after click
        }
      }

      // Type the text with proper typing delay for stability
      await page.keyboard.type(action.text as string, { delay: 10 });
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      return {
        status: "success",
        message: "Type action performed successfully",
      };
    } catch (error) {
      console.error("Type action error:", error);
      return {
        status: "error",
        message: `Failed to type text: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  static async back(page: Page): Promise<ActionResponse> {
    try {
      if (!page) {
        return {
          status: "error",
          message: "Browser not launched",
        };
      }

      await page.goBack();

      // After navigation, emit the new URL
      const currentUrl = page.url();
      PuppeteerActions.io?.sockets.emit("url-change", currentUrl);
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait for page to stabilize
      await this.waitTillHTMLStable(page);
      return {
        status: "success",
        message: "Navigated back successfully",
      };
    } catch (error: any) {
      console.error("Failed to navigate back:", error);
      return {
        status: "error",
        message: "Failed to navigate back",
      };
    }
  }

  static async keyPress(
    page: Page,
    action: ActionRequest
  ): Promise<ActionResponse> {
    if (!action.key)
      return {
        status: "error",
        message: "Key is required for keypress action",
      };
      
    try {
      // Check if any element is focused
      const isFocused = await page.evaluate(() => {
        return document.activeElement !== document.body && 
               document.activeElement !== document.documentElement;
      });
      
      // If we have coordinates, try to click first to ensure focus
      if (action.coordinate && !isFocused) {
        const coordinate = getCoordinate(action.coordinate);
        await page.mouse.click(coordinate.x, coordinate.y);
        await page.waitForTimeout(100); // Small delay after click
      }
      
      // Handle special key mapping for cross-platform compatibility
      let newKey = action.key;
      if (action.key.toLowerCase().includes("control")) {
        newKey = action.key.toLowerCase().replace("control", "ControlOrMeta");
      }
      
      // Execute the key press with a small delay for stability
      await page.keyboard.press(newKey, { delay: 20 });
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait for any potential page updates
      await this.waitTillHTMLStable(page);
      
      return {
        status: "success",
        message: "Keypress action performed successfully",
      };
    } catch (error) {
      console.error("Keypress action error:", error);
      return {
        status: "error",
        message: `Failed to perform key press: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  static async scrollUp(page: Page): Promise<ActionResponse> {
    try {
      await page.mouse.wheel(0, -200);
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait briefly for the scroll to take effect
      await page.waitForTimeout(100);
      
      return {
        status: "success",
        message: "Scroll up action performed successfully",
      };
    } catch (error) {
      console.error("Scroll up error:", error);
      return {
        status: "error",
        message: `Failed to scroll up: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  static async scrollDown(page: Page): Promise<ActionResponse> {
    try {
      await page.mouse.wheel(0, 200);
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait briefly for the scroll to take effect
      await page.waitForTimeout(100);
      
      return {
        status: "success",
        message: "Scroll down action performed successfully",
      };
    } catch (error) {
      console.error("Scroll down error:", error);
      return {
        status: "error",
        message: `Failed to scroll down: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  // page.goto { waitUntil: "networkidle0" } may not ever resolve, and not waiting could return page content too early before js has loaded
  // https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded/61304202#61304202
  static async waitTillHTMLStable(page: Page, timeout = 5_000) {
    const checkDurationMsecs = 500; // 500
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 3;

    while (checkCounts++ <= maxChecks) {
      let html = await page.content();
      let currentHTMLSize = html.length;

      // let bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length)
      console.log("last: ", lastHTMLSize, " <> curr: ", currentHTMLSize);

      if (lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
        countStableSizeIterations++;
      } else {
        countStableSizeIterations = 0; //reset the counter
      }

      if (countStableSizeIterations >= minStableSizeIterations) {
        console.log("Page rendered fully...");
        break;
      }

      lastHTMLSize = currentHTMLSize;
      await new Promise((resolve) => setTimeout(resolve, checkDurationMsecs));
    }
  }

  static async captureScreenshot() {
    return await PuppeteerActions.puppeteerService.captureScreenshotAndInfer();
  }

  static async getCurrentUrl() {
    return await PuppeteerActions.puppeteerService.getCurrentUrl();
  }
}
