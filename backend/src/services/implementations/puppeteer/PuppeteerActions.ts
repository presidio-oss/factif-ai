import { Server as SocketServer } from "socket.io";
import { Page } from "playwright";
import { PuppeteerService } from "./PuppeteerService";
import { ActionRequest, ActionResponse } from "../../../types/action.types";
import { getCoordinate } from "../../../utils/historyManager";

export class PuppeteerActions {
  private static io: SocketServer;
  private static puppeteerService: PuppeteerService;
  private static lastHoverPosition: {x: number, y: number} | null = null;
  private static isMonitoringLoading: boolean = false;
  private static loadingMonitorInterval: NodeJS.Timeout | null = null;

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
      
      // First attempt to identify an element at the coordinates
      const elementInfo = await page.evaluate((coord) => {
        const element = document.elementFromPoint(coord.x, coord.y);
        if (!element) return null;
        
        // Find the closest anchor tag if the element itself isn't one
        const linkElement = element.tagName === 'A' 
          ? element 
          : element.closest('a');
        
        const { tagName, id, className } = element;
        const href = element.getAttribute('href');
        const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || 
                       element.hasAttribute('contenteditable');
        
        // Check if this is a new tab link
        let isNewTabLink = false;
        let linkTarget = null;
        let linkHref = null;
        
        if (linkElement) {
          linkTarget = linkElement.getAttribute('target');
          linkHref = linkElement.getAttribute('href');
          isNewTabLink = linkTarget === '_blank' || linkTarget === '_new';
        }
        
        return {
          tagName,
          id,
          className,
          href,
          isInput,
          isNewTabLink,
          linkTarget,
          linkHref,
          isNavigationLikely: !!href || (linkElement && !!linkElement.getAttribute('href')) // Flag if this might navigate
        };
      }, coordinate);
      
      if (!elementInfo) {
        return {
          status: "error",
          message: "No element found at specified coordinates",
        };
      }
      
      // Store if this is an input field for later
      isInput = elementInfo.isInput;
      
      // Set up navigation detection if we think this might cause navigation
      let navigationPromise = null;
      if (elementInfo.isNavigationLikely) {
        // Create a promise that will resolve when navigation occurs
        navigationPromise = page.waitForNavigation({ 
          timeout: 10000,
          waitUntil: 'domcontentloaded'
        }).catch(e => {
          // Just log but don't throw - navigation might not actually happen
          console.log("Navigation wait timed out or was aborted:", e.message);
          return null;
        });
      }
      
      // Use Playwright's click with precise coordinates
      await page.mouse.click(coordinate.x, coordinate.y);
      
      // If we were expecting navigation, wait for it now
      if (navigationPromise) {
        try {
          // Wait for navigation to complete with a timeout
          const navResult = await Promise.race([
            navigationPromise,
            new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))
          ]);
          
          // If navigation occurred (not timeout), mark it
          if (navResult !== 'timeout') {
            hasNavigation = true;
            console.log("Navigation detected after click");
          }
        } catch (navError) {
          console.log("Error waiting for navigation:", navError);
        }
      }
      
      // Emit action_performed event right after click to improve responsiveness
      // This gives immediate feedback to the user while page processing continues
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // If we clicked on an input field, emit a signal to remember its position
      if (isInput) {
        PuppeteerActions.io?.sockets.emit('input-focused', {x: coordinate.x, y: coordinate.y});
      }
      
      // If we clicked on a target="_blank" link, emit a signal about the interception
      if (elementInfo.isNewTabLink && elementInfo.linkHref) {
        PuppeteerActions.io?.sockets.emit('intercepted-newtab', {
          target: elementInfo.linkTarget,
          href: elementInfo.linkHref,
          message: `Intercepted link that would open in a new tab (target="${elementInfo.linkTarget}")`,
          currentUrl: page.url()
        });
        
        console.log(`[FactifAI] Intercepted ${elementInfo.linkTarget} link to: ${elementInfo.linkHref}`);
      }
      
      // Now wait for page to stabilize, with a short timeout if we detected navigation
      // This happens after action_performed is emitted, so UI remains responsive
      try {
        await this.waitTillHTMLStable(page, hasNavigation ? 6000 : 20000);
      } catch (stabilityError) {
        console.error("Error waiting for page stability:", stabilityError);
        // Continue execution even if stability check fails
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
          await this.waitTillHTMLStable(page)
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
      console.log("[FactifAI] Executing scrollUp action");
      
      // Use smaller scroll amount for smoother scrolling
      await page.mouse.wheel(0, -150);
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait a bit longer for the scroll to take effect and content to settle
      await page.waitForTimeout(150);
      
      // Add more debugging info
      console.log("[FactifAI] ScrollUp action completed successfully");
      
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
      console.log("[FactifAI] Executing scrollDown action");
      
      // Use smaller scroll amount for smoother scrolling
      await page.mouse.wheel(0, 150);
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      // Wait a bit longer for the scroll to take effect and content to settle
      await page.waitForTimeout(150);
      
      // Add more debugging info
      console.log("[FactifAI] ScrollDown action completed successfully");
      
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
   * Handles navigation events properly to avoid content access during navigation.
   * 
   * @param page Playwright Page object
   * @param timeout Maximum time to wait in milliseconds
   */
  static async waitTillHTMLStable(page: Page, timeout = 20_000) {
    // First, wait for any ongoing navigations to complete
    try {
      // Short timeout to catch any immediate navigation events
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {
        // Ignore timeout - page might not be navigating
      });
    } catch (e) {
      // Ignore navigation errors
      console.log("Navigation wait error (benign):", e);
    }
    
    // Initial delay to ensure the page has stabilized enough for content access
    await new Promise((resolve) => setTimeout(resolve, 120));
    
    const checkDurationMsecs = 300; // 300ms for faster checks
    const maxChecks = timeout / checkDurationMsecs;
    let lastHTMLSize = 0;
    let checkCounts = 1;
    let countStableSizeIterations = 0;
    const minStableSizeIterations = 2;

    while (checkCounts++ <= maxChecks) {
      let html = '';
      try {
        // Use a try-catch block to handle potential navigation errors
        html = await page.content();
        let currentHTMLSize = html.length;

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
      } catch (error) {
        // If we get an error while trying to access content, the page might be navigating
        console.log("Content access error (possibly during navigation):", error);
        // Reset stable iterations counter as content is changing
        countStableSizeIterations = 0;
      }
      
      await new Promise((resolve) => setTimeout(resolve, checkDurationMsecs));
    }
  }

  static async captureScreenshot() {
    return await PuppeteerActions.puppeteerService.captureScreenshotAndInfer();
  }

  static async isBrowserReady(): Promise<boolean> {
    if (!PuppeteerActions.puppeteerService) {
      console.log("PuppeteerService is not initialized");
      return false;
    }
    return await PuppeteerActions.puppeteerService.hasBrowserInstance();
  }

  static async getCurrentUrl() {
    return await PuppeteerActions.puppeteerService.getCurrentUrl();
  }
  
  /**
   * Detects loading indicators on the page and monitors their state
   * @param page Playwright Page instance
   * @param action Action request containing selector options
   * @returns ActionResponse with status and message
   */
  static async detectLoading(page: Page, action: ActionRequest | { action: string; params?: Record<string, any> }): Promise<ActionResponse> {
    try {
      const selectors = action.params?.selectors || [
        '.loading', 
        '.spinner', 
        'progress',
        '.progress',
        '.loader',
        '[role="progressbar"]'
      ];
      
      // Check if any loading indicators are present
      const loadingState = await page.evaluate((selectors) => {
        // Helper function to check if an element or any of its children are visible
        const isElementVisible = (element: Element | null) => {
          if (!element) return false;
          
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          
          const rect = element.getBoundingClientRect();
          return !(rect.width === 0 || rect.height === 0);

        };
      
        // Find all loading indicators in the document
        let loadingElements = [];
        let isLoading = false;
        let progressValue = null;
        
        // Check each selector
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el: Element) => {
              if (isElementVisible(el)) {
                isLoading = true;
                loadingElements.push({
                  selector,
                  text: el.textContent?.trim() || ''
                });
                
                // Try to get progress value if available
                if (el.tagName === 'PROGRESS' && el.hasAttribute('value')) {
                  const value = parseFloat(el.getAttribute('value') || '0');
                  const max = parseFloat(el.getAttribute('max') || '100');
                  progressValue = Math.round((value / max) * 100);
                }
                // Check for aria-valuenow for role="progressbar"
                else if (el.getAttribute('role') === 'progressbar' && el.hasAttribute('aria-valuenow')) {
                  const valueNow = parseFloat(el.getAttribute('aria-valuenow') || '0');
                  const valueMax = parseFloat(el.getAttribute('aria-valuemax') || '100');
                  progressValue = Math.round((valueNow / valueMax) * 100);
                }
              }
            });
          } catch (e) {
            // Ignore errors for individual selectors
            console.error(`Error checking selector ${selector}:`, e);
          }
        }
        
        // Also check for common AJAX loading indicators
        if (!isLoading) {
          // Look for spinning icons from common libraries (Font Awesome, Material Icons, etc.)
          const spinIcons = document.querySelectorAll('.fa-spinner, .fa-spin, .spin, .material-icons-spin, .rotating');
          spinIcons.forEach((icon: Element) => {
            if (isElementVisible(icon)) {
              isLoading = true;
              loadingElements.push({
                selector: 'icon',
                text: icon.textContent?.trim() || 'spinning icon'
              });
            }
          });
          
          // Check if there are any elements with animation
          const animatedElements = Array.from(document.querySelectorAll('*')).filter((el: Element) => {
            const style = window.getComputedStyle(el);
            return style.animation !== 'none' && 
                   isElementVisible(el) && 
                   (el.className.includes('load') || 
                    el.className.includes('spin') || 
                    el.className.includes('progress'));
          });
          
          if (animatedElements.length > 0) {
            isLoading = true;
            loadingElements.push({
              selector: 'animated',
              text: 'Animated loading element detected'
            });
          }
        }
        
        // Return loading state information
        return { 
          isLoading, 
          loadingElements, 
          progressValue 
        };
      }, selectors);
      
      // If loading is detected, start monitoring until complete
      if (loadingState.isLoading) {
        this.startLoadingMonitor(page, selectors);
        
        // Emit loading state
        PuppeteerActions.io?.sockets.emit("loading-state-update", {
          isLoading: true,
          progress: loadingState.progressValue
        });
        
        return {
          status: "success",
          message: `Loading detected: ${loadingState.loadingElements.length} indicators found, monitoring until complete`
        };
      } else {
        // No loading indicators found
        PuppeteerActions.io?.sockets.emit("loading-state-update", {
          isLoading: false
        });
        
        // Emit page-ready event immediately if we're coming from an action
        if (action.params?.afterAction) {
          PuppeteerActions.io?.sockets.emit("page-ready");
        }
        
        return {
          status: "success",
          message: "No loading indicators detected, page is ready"
        };
      }
    } catch (error) {
      console.error("Loading detection error:", error);
      
      // If we encounter an error, assume the page is ready to avoid getting stuck
      PuppeteerActions.io?.sockets.emit("loading-state-update", { isLoading: false });
      PuppeteerActions.io?.sockets.emit("page-ready");
      
      return {
        status: "error",
        message: `Failed to detect loading state: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  
  /**
   * Monitors loading state until completion
   * @param page Playwright Page instance
   * @param selectors CSS selectors to check for loading indicators
   */
  private static startLoadingMonitor(page: Page, selectors: string[]) {
    // Clear any existing monitoring
    if (this.loadingMonitorInterval) {
      clearInterval(this.loadingMonitorInterval);
      this.loadingMonitorInterval = null;
    }
    
    this.isMonitoringLoading = true;
    
    // Set interval to check loading state until complete
    this.loadingMonitorInterval = setInterval(async () => {
      try {
        // Check current loading state
        const loadingState = await page.evaluate((selectors) => {
          // Helper function to check if an element or any of its children are visible
          const isElementVisible = (element: Element | null) => {
            if (!element) return false;
            
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
              return false;
            }
            
            const rect = element.getBoundingClientRect();
            return !(rect.width === 0 || rect.height === 0);

          };
        
          // Check if any loading indicators are still present
          let isLoading = false;
          let progressValue = null;
          
          for (const selector of selectors) {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach((el: Element) => {
                if (isElementVisible(el)) {
                  isLoading = true;
                  
                  // Try to get progress value if available
                  if (el.tagName === 'PROGRESS' && el.hasAttribute('value')) {
                    const value = parseFloat(el.getAttribute('value') || '0');
                    const max = parseFloat(el.getAttribute('max') || '100');
                    progressValue = Math.round((value / max) * 100);
                  }
                  // Check for aria-valuenow for role="progressbar"
                  else if (el.getAttribute('role') === 'progressbar' && el.hasAttribute('aria-valuenow')) {
                    const valueNow = parseFloat(el.getAttribute('aria-valuenow') || '0');
                    const valueMax = parseFloat(el.getAttribute('aria-valuemax') || '100');
                    progressValue = Math.round((valueNow / valueMax) * 100);
                  }
                }
              });
            } catch (e) {
              // Ignore errors for individual selectors
            }
          }
          
          // Also check for common AJAX loading indicators if no loading elements found
          if (!isLoading) {
            // Look for spinning icons from common libraries
            const spinIcons = document.querySelectorAll('.fa-spinner, .fa-spin, .spin, .material-icons-spin, .rotating');
            isLoading = Array.from(spinIcons).some(isElementVisible);
            
            // Check if there are any elements with animation
            if (!isLoading) {
              const animatedElements = Array.from(document.querySelectorAll('*')).filter((el: Element) => {
                const style = window.getComputedStyle(el);
                return style.animation !== 'none' && 
                       isElementVisible(el) && 
                       (el.className.includes('load') || 
                        el.className.includes('spin') || 
                        el.className.includes('progress'));
              });
              
              isLoading = animatedElements.length > 0;
            }
          }
          
          return { isLoading, progressValue };
        }, selectors);
        
        // Emit current loading state
        PuppeteerActions.io?.sockets.emit("loading-state-update", {
          isLoading: loadingState.isLoading,
          progress: loadingState.progressValue
        });
        
        // If loading complete, stop monitoring
        if (!loadingState.isLoading) {
          if (this.loadingMonitorInterval) {
            clearInterval(this.loadingMonitorInterval);
            this.loadingMonitorInterval = null;
          }
          
          this.isMonitoringLoading = false;
          
          // Emit page-ready event
          PuppeteerActions.io?.sockets.emit("page-ready");
        }
      } catch (error) {
        console.error("Loading monitor error:", error);
        
        // If we encounter an error, stop monitoring and assume page is ready
        if (this.loadingMonitorInterval) {
          clearInterval(this.loadingMonitorInterval);
          this.loadingMonitorInterval = null;
        }
        
        this.isMonitoringLoading = false;
        PuppeteerActions.io?.sockets.emit("loading-state-update", { isLoading: false });
        PuppeteerActions.io?.sockets.emit("page-ready");
      }
    }, 500); // Check every 500ms
  }
  
  /**
   * Handle form submission and wait for completion
   * @param page Playwright Page instance
   * @param action Action request containing form selector
   * @returns ActionResponse
   */
  static async submitForm(page: Page, action: ActionRequest): Promise<ActionResponse> {
    try {
      const selector = action.params?.selector || 'form';
      
      // Find and submit the form
      const formCount = await page.evaluate((selector) => {
        const forms = selector === 'form' 
          ? document.forms 
          : document.querySelectorAll(selector);
          
        if (forms.length === 0) return 0;
        
        // Submit the first matching form
        try {
          if (forms[0].tagName === 'FORM') {
            forms[0].submit();
          } else {
            // If it's not a form but another element, look for a submit button inside
            const submitBtn = forms[0].querySelector('button[type="submit"], input[type="submit"]');
            if (submitBtn) {
              (submitBtn as HTMLElement).click();
            } else {
              // If no submit button, try submitting a parent form if it exists
              let parent = forms[0].parentElement;
              while (parent) {
                if (parent.tagName === 'FORM') {
                  parent.submit();
                  break;
                }
                parent = parent.parentElement;
              }
            }
          }
        } catch (e) {
          console.error("Error submitting form:", e);
        }
        
        return forms.length;
      }, selector);
      
      if (formCount === 0) {
        return {
          status: "error",
          message: `No form found with selector: ${selector}`
        };
      }
      
      // Set up a navigation promise to detect if the submission causes navigation
      const navigationPromise = page.waitForNavigation({ 
        timeout: 5000,
        waitUntil: 'domcontentloaded' 
      }).catch(() => null);
      
      // Wait for either navigation or detect loading
      const result = await Promise.race([
        navigationPromise,
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
      
      // If navigation occurred, update the URL
      if (result !== null) {
        const currentUrl = page.url();
        PuppeteerActions.io?.sockets.emit("url-change", currentUrl);
      }
      
      // Start loading detection regardless
      await this.detectLoading(page, {
        action: 'detectLoading',
        source: 'chrome-puppeteer',  // Required by ActionRequest interface
        params: {
          selectors: [
            '.loading', 
            '.spinner', 
            'progress',
            '.progress',
            '.loader',
            '[role="progressbar"]'
          ],
          afterAction: true
        }
      });
      
      // Notify that action was performed
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      return {
        status: "success",
        message: "Form submitted successfully"
      };
    } catch (error) {
      console.error("Form submission error:", error);
      
      // Notify that action was performed even if there was an error
      PuppeteerActions.io?.sockets.emit("action_performed");
      
      return {
        status: "error",
        message: `Form submission failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
}
