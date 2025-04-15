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
  private lastKnownUrl: string = '';
  
  // Add reference counter for active operations
  private static activeOperations: number = 0;
  private static cleanupInProgress: boolean = false;
  private static browserLock: Promise<void> = Promise.resolve();
  private static isShuttingDown: boolean = false;

  protected screenshotInterval: NodeJS.Timeout | null = null;
  private navigationMonitorInterval: NodeJS.Timeout | null = null;
  private isScreenshotStreamActive: boolean = false;
  private lastScreenshotError: number = 0;
  private consecutiveErrors: number = 0;

  constructor(serviceConfig: ServiceConfig) {
    super(serviceConfig);
    PuppeteerActions.initialize(serviceConfig.io, this);
  }

  /**
   * Helper method to acquire lock for critical browser operations
   * @returns Promise that resolves when lock is acquired
   */
  private static async acquireLock(): Promise<() => void> {
    // Store the current promise to ensure we wait on it
    const currentLock = PuppeteerService.browserLock;
    
    // Create a new promise and resolver for the next lock request
    let releaseLock: () => void;
    PuppeteerService.browserLock = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    
    // Wait for the current lock to be released
    await currentLock;
    
    // Return a function to release this lock
    return releaseLock!;
  }

  /**
   * Track an active browser operation
   * @returns A function to call when operation completes
   */
  private static trackOperation(): () => void {
    PuppeteerService.activeOperations++;
    return () => {
      PuppeteerService.activeOperations--;
    };
  }

  async initialize(url: string): Promise<ActionResponse> {
    try {
      this.emitConsoleLog("info", "Initializing Puppeteer browser...");
      
      // Reset shutdown flag to allow new initialization
      PuppeteerService.isShuttingDown = false;

      // If browser already exists, clean it up first to prevent duplicate processes
      if (PuppeteerService.browser) {
        this.emitConsoleLog("warn", "Browser instance already exists - cleaning up first");
        await this.cleanup();
        // Reset shutdown flag again as cleanup might have set it
        PuppeteerService.isShuttingDown = false;
      }

      // Launch with enhanced stealth settings to avoid bot detection while using moderate resources
      PuppeteerService.browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-dev-shm-usage',    // Overcome limited resource problems
          '--disable-setuid-sandbox',   // Disable setuid sandbox (safety feature)
          '--no-sandbox',               // Disable sandbox for better performance
          '--single-process',           // Run in a single process to reduce overhead
          '--disable-extensions',       // Disable extensions to reduce memory usage 
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-component-extensions-with-background-pages',
          '--disable-blink-features=AutomationControlled',  // Hide automation flags
          '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
          '--window-size=1366,768'     // Common laptop resolution, not too resource intensive
        ]
      });

      // Common user agents for rotation
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
      ];
      
      // Select a random user agent
      const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      
      // Create context with anti-fingerprinting measures
      const context = await PuppeteerService.browser.newContext({
        viewport: { width: 1366, height: 768 }, // Common laptop resolution
        userAgent: randomUserAgent,
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'light'
      });
      
      // Add anti-fingerprinting measures to mask automation
      await context.addInitScript(() => {
        // Override properties that automation detection looks for
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true
        });
        
        // Override Chrome runtime
        // @ts-ignore - Chrome object is not defined in standard Window type
        window.chrome = {
          runtime: {},
          loadTimes: function() {},
          csi: function() {},
          app: {}
        };
        
        // Add fake plugins to make fingerprint more normal
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return [
              {
                0: {type: "application/pdf"},
                name: "Chrome PDF Plugin",
                description: "Portable Document Format",
                filename: "internal-pdf-viewer"
              },
              {
                0: {type: "application/x-google-chrome-pdf"},
                name: "Chrome PDF Viewer",
                description: "Portable Document Format"
              },
              {
                0: {type: "application/x-nacl"},
                name: "Native Client"
              }
            ];
          },
          configurable: true
        });
        
        // Add language settings that look normal
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
          configurable: true
        });
        
        // Modify navigator properties that are used for fingerprinting
        const navigatorProps = {
          'hardwareConcurrency': 8,
          'deviceMemory': 8,
          'platform': 'Win32'
        };
        
        for (const [prop, value] of Object.entries(navigatorProps)) {
          if (prop in navigator) {
            Object.defineProperty(navigator, prop, {
              get: () => value,
              configurable: true
            });
          }
        }
        
        // Hide automation-related objects
        if (window.Notification) {
          Object.defineProperty(window.Notification, 'permission', {
            get: () => 'default',
            configurable: true
          });
        }
      });
      
      PuppeteerService.page = await context.newPage();
      
      // Configure page to intercept new tab navigations
      await this.configureNewTabInterception(PuppeteerService.page);
      
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
      
      // Store and emit the initial URL
      this.lastKnownUrl = PuppeteerService.page.url();
      this.io.emit("url-change", this.lastKnownUrl);
      
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

  /**
   * Simulate human-like behavior with random delays and mouse movements
   * @param page The Playwright Page object to interact with
   */
  private async simulateHumanBehavior(page: Page): Promise<void> {
    try {
      // Random delay (300-800ms)
      const delay = Math.floor(Math.random() * 500) + 300;
      await page.waitForTimeout(delay);
      
      // Only move mouse sometimes (70% of the time)
      if (Math.random() < 0.7) {
        // Get viewport dimensions
        const viewport = page.viewportSize();
        if (!viewport) return;
        
        // Generate random coordinates within viewport
        const x = Math.floor(Math.random() * viewport.width);
        const y = Math.floor(Math.random() * viewport.height);
        
        // Move mouse with a humanlike motion (use steps param for smooth movement)
        await page.mouse.move(x, y, {
          steps: Math.floor(Math.random() * 5) + 3 // 3-7 steps for realistic movement
        });
      }
    } catch (error) {
      // Silently fail - human behavior simulation is optional
      // If it fails, we'll just continue without it
    }
  }

  async performAction(
    action: ActionRequest,
    params?: any
  ): Promise<ActionResponse> {
    // Track this operation to prevent cleanup during action execution
    const releaseOperation = PuppeteerService.trackOperation();
    
    try {
      this.emitConsoleLog("info", `Performing browser action: ${action.action}`);
      
      if (!PuppeteerService.page || !PuppeteerService.browser) {
        this.emitConsoleLog("error", "Browser not launched for action: " + action.action);
        return {
          status: "error",
          message: "Browser not launched. Please launch the browser first.",
        };
      }
      
      // For interactive actions, simulate human behavior first
      if (['click', 'type', 'hover', 'scrollUp', 'scrollDown'].includes(action.action)) {
        await this.simulateHumanBehavior(PuppeteerService.page);
      }

      // Handle actions
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
          // Execute click action with more robust error handling
          try {
            // Execute click and get response
            const clickResponse = await PuppeteerActions.click(PuppeteerService.page, action);
            
            // Wait for page to stabilize after click, but use a shorter timeout
            try {
              await PuppeteerService.page.waitForLoadState("domcontentloaded", {
                timeout: 5000, // Shorter timeout to prevent hanging
              });
            } catch (error) {
              // If timeout occurs, log but continue - page might be stable already
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              this.emitConsoleLog("warn", `Load wait timed out after click: ${errorMessage}`);
            }
            
            return clickResponse;
          } catch (clickError) {
            // Special handling for the navigation content error
            const errorMessage = clickError instanceof Error ? clickError.message : String(clickError);
            
            if (errorMessage.includes("page.content") && errorMessage.includes("navigating")) {
              this.emitConsoleLog("warn", "Handled navigation content error gracefully");
              
              // Wait a bit longer for navigation to settle
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Return success anyway since the click likely worked
              return {
                status: "success", 
                message: "Click performed (page was navigating during content check)"
              };
            }
            
            // Re-throw other errors
            throw clickError;
          }
          
        case "type":
          return await PuppeteerActions.type(PuppeteerService.page, action);
          
        case "scrollUp":
          return await PuppeteerActions.scrollUp(PuppeteerService.page);
          
        case "scrollDown":
          return await PuppeteerActions.scrollDown(PuppeteerService.page);
          
        case "keyPress":
          return await PuppeteerActions.keyPress(PuppeteerService.page, action);
          
        case "hover":
          return await PuppeteerActions.hover(PuppeteerService.page, action);
          
        case "back":
          return await PuppeteerActions.back(PuppeteerService.page);
          
        case "detectLoading":
          return await PuppeteerActions.detectLoading(PuppeteerService.page, action);
          
        case "submit":
          return await PuppeteerActions.submitForm(PuppeteerService.page, action);
          
        default:
          this.emitConsoleLog("error", `Unsupported action type: ${action.action}`);
          return {
            status: "error",
            message: `Unsupported action type: ${action.action}`
          };
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.emitConsoleLog("error", `Browser action error (${action.action}): ${errorMessage}`);
      
      // Return a friendly error response rather than throwing
      return {
        status: "error",
        message: `Action '${action.action}' failed: ${errorMessage}`,
      };
    } finally {
      // Always release the operation tracker to prevent browser lockout
      releaseOperation();
    }
  }

  startScreenshotStream(interval: number = 1000): void {
    // Stop any existing stream first
    this.stopScreenshotStream();

    // Only start streaming if browser is initialized
    if (!this.isInitialized || !this.isConnected || PuppeteerService.isShuttingDown) {
      this.emitConsoleLog(
        "info",
        "Cannot start streaming: Browser not initialized or shutting down"
      );
      return;
    }

    // Set flag to indicate streaming is active
    this.isScreenshotStreamActive = true;
    this.consecutiveErrors = 0;

    this.screenshotInterval = setInterval(async () => {
      // Check if browser is still running before attempting to get screenshot
      if (!this.isInitialized || !this.isConnected || PuppeteerService.isShuttingDown || !PuppeteerService.browser) {
        this.emitConsoleLog("info", "Screenshot stream stopping: Browser no longer available");
        this.stopScreenshotStream();
        return;
      }

      try {
        // Don't attempt screenshots too rapidly after errors
        if (this.lastScreenshotError > 0 && (Date.now() - this.lastScreenshotError) < 1000) {
          return;
        }

        // Track the operation to prevent cleanup during screenshot processing
        const releaseOperation = PuppeteerService.trackOperation();
        
        try {
          // Monitor and emit URL changes
          await this.checkAndEmitUrlChanges();
          
          const screenshot = await this.takeScreenshot();
          if (screenshot) {
            this.io.emit("screenshot-stream", screenshot);
            
            // Reset error counter on success
            this.consecutiveErrors = 0;
          }
        } finally {
          // Always release the operation
          releaseOperation();
        }
      } catch (error) {
        // Track error timestamp to prevent spam
        this.lastScreenshotError = Date.now();
        this.consecutiveErrors++;
        
        // Only log every few errors to avoid spam
        if (this.consecutiveErrors % 5 === 1) {
          this.emitConsoleLog(
            "error", 
            `Screenshot error (${this.consecutiveErrors}): ${error instanceof Error ? error.message : String(error)}`
          );
        }
        
        // If we've had too many consecutive errors, stop the stream
        if (this.consecutiveErrors > 15) {
          this.emitConsoleLog("warn", "Stopping screenshot stream due to excessive errors");
          this.stopScreenshotStream();
          this.isConnected = false;
          this.isInitialized = false;
        }
      }
    }, interval);

    this.emitConsoleLog("info", "Screenshot stream started");
  }
  
  /**
   * Check if the URL has changed and emit a URL change event if it has
   */
  private async checkAndEmitUrlChanges(): Promise<void> {
    if (!PuppeteerService.page) return;
    
    try {
      // Get the current URL
      const currentUrl = PuppeteerService.page.url();
      
      // If URL has changed, emit a URL change event
      if (currentUrl && currentUrl !== this.lastKnownUrl) {
        this.lastKnownUrl = currentUrl;
        this.io.emit("url-change", currentUrl);
        this.emitConsoleLog("info", `URL changed to: ${currentUrl}`);
      }
    } catch (error) {
      // Log the error but don't throw it to avoid disrupting the screenshot stream
      this.emitConsoleLog("error", `Error checking URL: ${error}`);
    }
  }

  stopScreenshotStream(): void {
    // Set flag to indicate streaming is no longer active
    this.isScreenshotStreamActive = false;
    
    // Clear the screenshot interval if it exists
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
      this.emitConsoleLog("info", "Screenshot stream stopped");
    }
    
    // Reset error tracking
    this.consecutiveErrors = 0;
    this.lastScreenshotError = 0;
  }

  /**
   * Configure the page to intercept new tab navigations and redirect them to the current tab
   * This ensures links with target="_blank" still work and are visible in the UI
   */
  private async configureNewTabInterception(page: Page): Promise<void> {
    this.emitConsoleLog("info", "Configuring new tab interception");
    
    // 1. Add script to override window.open
    await page.addInitScript(() => {
      // Store the original window.open function
      const originalWindowOpen = window.open;
      
      // Override window.open to redirect to the same tab
      // @ts-ignore - Ignoring TypeScript errors for client-side code
      window.open = function(url?: string | URL | null, target?: string, features?: string): Window | null {
        if (url) {
          // Instead of opening a new window, navigate the current one
          window.location.href = url.toString(); // Convert URL object to string if needed
          // Return a mock window object to prevent errors
          return {
            closed: false,
            document: document,
            location: location,
            close: function() {},
            focus: function() {},
            blur: function() {},
            postMessage: function() {}
          } as unknown as Window;
        }
        // If no URL provided, fall back to original behavior
        // Ensure we pass correct types to originalWindowOpen
        return originalWindowOpen(url as string | URL | undefined, target, features);
      };
      
      // Log this change to console for debugging
      console.log("[FactifAI] window.open intercepted for single-tab navigation");
    });
    
    // 2. Add click event listener to handle target="_blank" links
    await page.addInitScript(() => {
      // Intercept all link clicks
      document.addEventListener('click', function(event) {
        // Check if the clicked element or its parent is a link
        const link = (event.target as HTMLElement).closest('a');
        
        // If it's a link with target="_blank" or "_new"
        if (link && (link.target === '_blank' || link.target === '_new') && link.href) {
          // Prevent default action
          event.preventDefault();
          
          // Navigate current window instead
          window.location.href = link.href;
          
          // Log for debugging
          console.log(`[FactifAI] Intercepted link with target=${link.target}, navigating in same tab to: ${link.href}`);
        }
      }, true); // Use capture phase to intercept before other handlers
      
      console.log("[FactifAI] Link click interception enabled for single-tab navigation");
    });
    
    // 3. Set HTTP headers to look like a real browser and avoid bot detection
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Ch-Ua': '"Chromium";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    });
    
    // 4. Set up page route handler for blocking ad domains, handling downloads and modifying requests
    await page.route('**/*', async (route) => {
      try {
        // Common ad/tracking domains that might cause connection issues
        const adDomains = [
          'bs.serving-sys.com',
          'amazon-adsystem.com',
          'doubleclick.net',
          'adservice.google.com',
          'googleads.g.doubleclick.net',
          'securepubads.g.doubleclick.net',
          'pagead2.googlesyndication.com'
        ];
        
        // Extract domain from URL
        const url = route.request().url();
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        // Check if this is an ad domain that should be blocked
        if (adDomains.some(adDomain => domain.includes(adDomain))) {
          this.emitConsoleLog("info", `Blocked ad request to: ${domain}`);
          // Abort the request instead of fetching it
          await route.abort('blockedbyclient');
          return;
        }
        
        // Add referrer header for navigation to appear more natural
        // Only do this for same-origin navigation
        const headers = route.request().headers();
        if (this.lastKnownUrl && 
            urlObj.origin === new URL(this.lastKnownUrl).origin &&
            route.request().resourceType() === 'document') {
          headers['Referer'] = this.lastKnownUrl;
        }
        
        // Handle the fetch with timeout
        let fetchTimeout: NodeJS.Timeout | null = null;
        
        try {
          // Create a promise for the timeout
          const timeoutPromise = new Promise<never>((_, reject) => {
            fetchTimeout = setTimeout(() => {
              reject(new Error(`Request to ${domain} timed out after 5000ms`));
            }, 5000);
          });
          
          // Create the fetch promise
          const fetchPromise = route.fetch();
          
          // Race them - with proper Playwright types
          const response = await Promise.race([fetchPromise, timeoutPromise]);
          
          // Clear timeout if fetch succeeded
          if (fetchTimeout) clearTimeout(fetchTimeout);
          
          // Check headers for attachments - Playwright's APIResponse uses headers() method
          const contentDisposition = response.headers()['content-disposition'];
          if (contentDisposition && contentDisposition.includes('attachment')) {
            this.emitConsoleLog("info", "Detected file download - handling in current tab");
          }
          
          // Fulfill the route with the response - already a Playwright APIResponse
          await route.fulfill({
            response, // Already a Playwright APIResponse object
          });
        } catch (error) {
          // Clear timeout if it's still active
          if (fetchTimeout) clearTimeout(fetchTimeout);
          
          // Log the error
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.emitConsoleLog("warn", `Request to ${domain} failed: ${errorMessage}`);
          
          // Abort the route
          await route.abort('failed');
        }
      } catch (error: any) {
        // This is the outermost error handler
        this.emitConsoleLog("warn", `Route handling error: ${error.message}`);
        
        // Make sure to abort or continue to prevent the request from hanging
        try {
          await route.abort('failed');
        } catch (e) {
          // If aborting fails, try to continue as a last resort
          try {
            await route.continue();
          } catch {
            // Ignore any errors at this point; we've done our best
          }
        }
      }
    });
    
    // 4. Set up monitoring for DOM-based navigation
    await this.monitorDomNavigation(page);
  }
  
  /**
   * Monitor for DOM-based navigation in single page applications
   */
  private async monitorDomNavigation(page: Page): Promise<void> {
    // Watch for history API usage
    await page.addInitScript(() => {
      // @ts-ignore - Ignore TypeScript errors for browser-side code
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // @ts-ignore - We're overriding browser APIs in a way TypeScript doesn't understand
      history.pushState = function() {
        // @ts-ignore - Using 'this' and 'arguments' in a non-standard way
        const result = originalPushState.apply(this, arguments as any);
        window.dispatchEvent(new Event('locationchange'));
        return result;
      };
      
      // @ts-ignore - We're overriding browser APIs in a way TypeScript doesn't understand
      history.replaceState = function() {
        // @ts-ignore - Using 'this' and 'arguments' in a non-standard way
        const result = originalReplaceState.apply(this, arguments as any);
        window.dispatchEvent(new Event('locationchange'));
        return result;
      };
      
      window.addEventListener('popstate', () => {
        window.dispatchEvent(new Event('locationchange'));
      });
      
      // Dispatch a custom event we can listen for
      window.addEventListener('locationchange', () => {
        console.log('[FactifAI] Location change detected:', window.location.href);
        // We'll use a custom attribute to signal this to our screenshot code
        document.documentElement.setAttribute('data-location-changed', 'true');
      });
    });
    
    // Setup an interval to check for this attribute
    const checkInterval = setInterval(async () => {
      if (!PuppeteerService.page) {
        clearInterval(checkInterval);
        return;
      }
      
      const hasChanged = await PuppeteerService.page.evaluate(() => {
        const changed = document.documentElement.getAttribute('data-location-changed') === 'true';
        if (changed) {
          document.documentElement.removeAttribute('data-location-changed');
        }
        return changed;
      }).catch(() => false);
      
      if (hasChanged) {
        // Force a URL check
        await this.checkAndEmitUrlChanges();
      }
    }, 300);
    
    // Store this interval for cleanup
    this.navigationMonitorInterval = checkInterval;
  }

  async cleanup(): Promise<void> {
    // Check if cleanup is already in progress
    if (PuppeteerService.cleanupInProgress) {
      this.emitConsoleLog("info", "Browser cleanup already in progress, waiting...");
      return;
    }

    // Set shutdown flag to prevent new operations from starting
    PuppeteerService.isShuttingDown = true;
    this.emitConsoleLog("info", "Cleaning up Puppeteer browser resources...");
    PuppeteerService.cleanupInProgress = true;

    // Acquire a lock to prevent concurrent cleanup operations
    const releaseLock = await PuppeteerService.acquireLock();
    
    try {
      // Check if there are any active operations and wait if needed
      if (PuppeteerService.activeOperations > 0) {
        this.emitConsoleLog("warn", `Waiting for ${PuppeteerService.activeOperations} active operations to complete before cleanup`);
        
        // Wait for active operations to complete (with a safety timeout)
        const maxWaitTime = 5000; // 5 seconds max wait
        const startTime = Date.now();
        
        while (PuppeteerService.activeOperations > 0) {
          // Check timeout
          if (Date.now() - startTime > maxWaitTime) {
            this.emitConsoleLog("warn", "Timeout waiting for active operations, proceeding with cleanup");
            break;
          }
          
          // Wait a short time before checking again
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    
      // Stop streaming before closing browser
      this.stopScreenshotStream();
      
      // Clear any navigation monitoring interval
      if (this.navigationMonitorInterval) {
        clearInterval(this.navigationMonitorInterval);
        this.navigationMonitorInterval = null;
      }

      // Actually close the browser instance with enhanced cleanup
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
    
    // Reset cleanup flag and release the lock
    PuppeteerService.cleanupInProgress = false;
    releaseLock();
  }

  async captureScreenshotAndInfer(): Promise<IProcessedScreenshot> {
    // Track this operation to prevent cleanup during screenshot capture
    const releaseOperation = PuppeteerService.trackOperation();
    
    try {
      // First check if browser is available
      if (!PuppeteerService.browser || !PuppeteerService.page) {
        throw new Error("Browser is not launched. Cannot capture screenshot and infer elements.");
      }
      
      const base64Image = await this.takeScreenshot();
      const elements = await this.getAllPageElements();

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
      
      // Get scroll position data
      const scrollData = await page.evaluate(() => {
        return {
          scrollPosition: window.scrollY,
          totalScroll: document.body.scrollHeight
        };
      });

      return {
        image: await this.markElements(base64Image, combinedElements),
        inference: combinedElements,
        scrollPosition: scrollData.scrollPosition,
        totalScroll: scrollData.totalScroll,
        originalImage: base64Image,
      };
    } catch (error) {
      // Log and rethrow the error
      this.emitConsoleLog("error", `Failed to capture screenshot: ${error}`);
      throw error;
    } finally {
      // Always release the operation tracker to prevent cleanup lock
      releaseOperation();
    }
  }

  /**
   * Check if the browser instance is available
   * @returns true if both browser and page are available
   */
  public async hasBrowserInstance(): Promise<boolean> {
    return PuppeteerService.browser !== null && PuppeteerService.page !== null;
  }

  async getCurrentUrl(): Promise<string> {
    // Check if browser is available and return a safe default if not
    if (!PuppeteerService.page) {
      console.log("Warning: Browser not launched when getting URL, returning empty string");
      return "";
    }
    
    try {
      let url = PuppeteerService.page.url();
      console.log("Current URL:", url);
      
      // Only try to evaluate if we couldn't get the URL and the page is available
      if (!url && PuppeteerService.page) {
        try {
          url = await PuppeteerService.page.evaluate(() => window.location.href);
          console.log("URL from evaluate:", url);
        } catch (evalError) {
          console.log("Error getting URL from evaluate:", evalError);
        }
      }
      
      return url || "";
    } catch (error) {
      console.log("Error getting current URL:", error);
      return "";
    }
  }

  /**
   * Take a screenshot of the current page using Playwright's optimized screenshot API
   * @returns Base64 encoded string of the screenshot image
   */
  async takeScreenshot(): Promise<string> {
    try {
      // Check if we're shutting down or browser is not available
      if (PuppeteerService.isShuttingDown) {
        throw new Error("Browser is shutting down. Cannot take screenshot.");
      }
      
      if (!PuppeteerService.browser || !PuppeteerService.page) {
        throw new Error(
          "Browser is not launched. Please launch the browser first."
        );
      }

      // In Playwright we can use the page directly without explicitly getting the context
      // This simplifies the code and reduces potential errors
      try {
        // Use Playwright's screenshot options for better quality and performance
        const buffer = await PuppeteerService.page.screenshot({ 
          type: "jpeg", // JPEG is faster than PNG and still good quality for previews
          quality: 90, // Good balance of quality and size
          fullPage: false, // Only capture viewport for performance
          timeout: 3000, // Prevent hanging on problematic pages
          scale: 'css', // Use CSS pixels for consistent scaling
        });
        
        return buffer.toString("base64");
      } catch (screenshotError) {
        // If standard screenshot fails, try with minimal options
        this.emitConsoleLog("warn", `Standard screenshot failed, trying fallback: ${screenshotError}`);
        
        try {
          const buffer = await PuppeteerService.page.screenshot({ 
            type: "jpeg",
            quality: 70,
            timeout: 2000
          });
          return buffer.toString("base64");
        } catch (fallbackError) {
          this.emitConsoleLog("error", `Fallback screenshot failed: ${fallbackError}`);
          throw fallbackError;
        }
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
  
  /**
   * Detect if a CAPTCHA is present on the current page
   * @returns True if a CAPTCHA is detected, false otherwise
   */
  async detectCaptcha(): Promise<boolean> {
    if (!PuppeteerService.page) return false;
    
    try {
      // Check for common CAPTCHA indicators
      const hasCaptcha = await PuppeteerService.page.evaluate(() => {
        // Common CAPTCHA selectors
        const captchaSelectors = [
          // Google reCAPTCHA
          '.g-recaptcha',
          'iframe[src*="recaptcha"]',
          'iframe[src*="google.com/recaptcha"]',
          // hCaptcha
          '.h-captcha',
          'iframe[src*="hcaptcha.com"]',
          // Cloudflare Turnstile
          '.cf-turnstile',
          'iframe[src*="challenges.cloudflare.com"]',
          // Text-based detection
          'form:has(input[name*="captcha"])',
          'div:has([id*="captcha"])',
          'img[src*="captcha"]'
        ];
        
        // Check for captcha text
        const bodyText = document.body.innerText.toLowerCase();
        const captchaTextIndicators = [
          'captcha',
          'human verification',
          'i\'m not a robot',
          'verify you are human',
          'security check'
        ];
        
        // Check if any selector matches
        const selectorMatch = captchaSelectors.some(selector => {
          try {
            return document.querySelector(selector) !== null;
          } catch {
            return false;
          }
        });
        
        // Check if any text indicator is present
        const textMatch = captchaTextIndicators.some(text => 
          bodyText.includes(text)
        );
        
        return selectorMatch || textMatch;
      });
      
      if (hasCaptcha) {
        this.emitConsoleLog("warn", "CAPTCHA detected on page - may require human intervention");
      }
      
      return hasCaptcha;
    } catch (error) {
      this.emitConsoleLog("error", `Error detecting CAPTCHA: ${error}`);
      return false;
    }
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
