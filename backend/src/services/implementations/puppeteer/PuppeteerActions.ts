import { Server as SocketServer } from "socket.io";
import { Page } from "playwright";
import { PuppeteerService } from "./PuppeteerService";
import { ActionRequest, ActionResponse } from "../../../types/action.types";
import { getCoordinate } from "../../../utils/historyManager";

export class PuppeteerActions {
  private static io: SocketServer;
  private static puppeteerService: PuppeteerService;
  private static lastHoverPosition: {x: number, y: number} | null = null;

  static initialize(io: SocketServer, puppeteerService: PuppeteerService) {
    PuppeteerActions.io = io;
    PuppeteerActions.puppeteerService = puppeteerService;
  }

  /**
   * Performs a click action at the specified coordinates using Playwright's optimized interaction methods
   * 
   * @param page Playwright Page instance
   * @param action Action request containing coordinates
   * @returns ActionResponse with status and message
   */
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
      const beforeUrl = page.url();
      let hasNavigation = false;
      let isInput = false;
      
      // Set up a navigation promise to detect if the click causes navigation
      const navigationPromise = page.waitForNavigation({ 
        timeout: 5000,
        waitUntil: 'domcontentloaded' 
      }).catch(() => {
        // Catch timeout - navigation might not happen
        return null;
      });
      
      // First attempt to identify an element at the coordinates
      const elementInfo = await page.evaluate((coord) => {
        const element = document.elementFromPoint(coord.x, coord.y);
        if (!element) return null;
        
        const { tagName, id, className } = element;
        const href = element.getAttribute('href');
        const isOffScreen = element.getBoundingClientRect().top > window.innerHeight || 
                           element.getBoundingClientRect().top < window.scrollY;
        const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || 
                       element.hasAttribute('contenteditable');
                       
        if (isOffScreen) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        
        return {
          tagName,
          id,
          className,
          href,
          isInput,
          isOffScreen,
        };
      }, coordinate);
      
      if (!elementInfo) {
        return {
          status: "error",
          message: "No element found at specified coordinates",
        };
      }
      
      // If element was off-screen, wait briefly for scrolling to complete
      if (elementInfo.isOffScreen) {
        await page.waitForTimeout(300);
      }
      
      // Store if this is an input field for later
      isInput = elementInfo.isInput;
      
      // Use Playwright's click with precise coordinates
      await page.mouse.click(coordinate.x, coordinate.y);
      
      // Wait for potential navigation triggered by the click
      const navigationResult = await navigationPromise;
      hasNavigation = navigationResult !== null;
      
      // If we clicked on an input field, emit a signal to remember its position
      if (isInput) {
        PuppeteerActions.io?.sockets.emit('input-focused', {x: coordinate.x, y: coordinate.y});
      }
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // If navigation occurred, it already waited for stability
      if (!hasNavigation) {
        // Wait for page to stabilize after the click using Playwright's mechanisms
        await this.waitTillHTMLStable(page);
      }
      
      // Get current URL and check if it changed
      const currentUrl = page.url();
      if (currentUrl !== beforeUrl) {
        // Emit URL change event
        PuppeteerActions.io?.sockets.emit("url-change", currentUrl);
      }

      return {
        status: "success",
        message: hasNavigation 
          ? "Click performed with navigation" 
          : "Click action performed successfully",
      };
    } catch (error) {
      console.error("Click action error:", error);
      return {
        status: "error",
        message: `Click action failed: ${error instanceof Error ? error.message : "Please retry"}`,
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
      
      // Check for URL changes after key press (Enter key can trigger navigation)
      const currentUrl = page.url();
      PuppeteerActions.io?.sockets.emit("url-change", currentUrl);
      
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

  /**
   * Performs hover action at specified coordinates
   * @param page Playwright Page instance
   * @param action Action request containing coordinates
   * @returns Action response
   */
  static async hover(page: Page, action: ActionRequest): Promise<ActionResponse> {
    if (!action || !action.coordinate) {
      return {
        status: "error",
        message: "Coordinates are required for hover action",
      };
    }
    const coordinate = getCoordinate(action.coordinate);
    
    try {
      // Store the last hover position
      PuppeteerActions.lastHoverPosition = {
        x: coordinate.x,
        y: coordinate.y
      };
      
      // Check if element exists at coordinates
      const elementExists = await page.evaluate((coordinate) => {
        const element = document.elementFromPoint(coordinate.x, coordinate.y);
        return !!element;
      }, coordinate);
      
      if (!elementExists) {
        return {
          status: "error",
          message: "No element found at hover coordinates",
        };
      }
      
      // Move the mouse to the specified coordinates without clicking
      await page.mouse.move(coordinate.x, coordinate.y);
      
      // Get element info for better feedback
      const elementInfo = await page.evaluate((coordinate) => {
        const element = document.elementFromPoint(coordinate.x, coordinate.y);
        if (!element) return null;
        
        return {
          tagName: element.tagName.toLowerCase(),
          className: element.className,
          id: element.id,
          hasHoverStyles: !!window.getComputedStyle(element, ':hover')
        };
      }, coordinate);
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      return {
        status: "success",
        message: `Hover performed at (${coordinate.x},${coordinate.y}) over ${elementInfo?.tagName || 'element'}`,
      };
    } catch (error) {
      console.error("Hover action error:", error);
      return {
        status: "error",
        message: `Failed to hover: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Fast and efficient page stability check using Playwright's capabilities.
   * Optimized for quick response while ensuring minimal stability requirements are met.
   * 
   * @param page Playwright Page object
   * @param timeout Maximum time to wait in milliseconds
   */
  static async waitTillHTMLStable(page: Page, timeout = 2_000) {
    try {
      // Use Promise.race to wait for either domcontentloaded OR a short timeout
      // This ensures we don't block for too long on slow-loading resources
      await Promise.race([
        // Wait for essential DOM content
        page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 1500) })
          .catch(() => console.log("DOM content load check completed or timed out")),
          
        // Backup timeout to ensure we don't block too long
        new Promise(resolve => setTimeout(resolve, Math.min(timeout, 1000)))
      ]);
      
      // Skip running heavy animation checks for better performance
      // Most important UI elements should be ready by this point
      
      console.log("Basic stability check completed");
    } catch (e) {
      // Log but don't block - we should still continue even if waiting fails
      console.log("Page stability checks timed out, continuing anyway");
    }
  }

  static async captureScreenshot() {
    return await PuppeteerActions.puppeteerService.captureScreenshotAndInfer();
  }

  static async getCurrentUrl() {
    return await PuppeteerActions.puppeteerService.getCurrentUrl();
  }
}
