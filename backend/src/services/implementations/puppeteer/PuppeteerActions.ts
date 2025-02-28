import * as puppeteer from "puppeteer";
import { Browser, KeyInput, Page } from "puppeteer";
import { Server as SocketServer } from "socket.io";
import { ActionResponse } from "../../../types/action.types";

export class PuppeteerActions {
  private static io: SocketServer;
  private static browser: Browser | null = null;
  private static page: Page | null = null;

  static initialize(io: SocketServer) {
    PuppeteerActions.io = io;
  }

  static async getScreenshot(fullPage: boolean = false): Promise<string> {
    if (!PuppeteerActions.page) {
      throw new Error("Browser not launched");
    }

    const buffer = await PuppeteerActions.page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage,
    });

    return Buffer.from(buffer).toString("base64");
  }


  static async getCurrentUrl(): Promise<string> {
    if (!PuppeteerActions.page) {
      throw new Error("Browser not launched");
    }
    let url = PuppeteerActions.page.url();
    console.log("===", url);
    if (!url) {
      await PuppeteerActions.page.evaluate(() => {
        url = window.location.href;
        console.log("===>>>", url);
      });
    }
    return url;
  }

  private static async waitForPageLoad(): Promise<void> {
    if (!PuppeteerActions.page) {
      throw new Error("Browser not launched");
    }

    try {
      await PuppeteerActions.page.waitForNavigation({
        waitUntil: ["domcontentloaded", "networkidle2"],
        timeout: 7_000,
      });
    } catch (e) {
      // Ignore navigation timeout
      console.log("Navigation timeout or no navigation occurred");
    }
  }

  static async launch(url: string): Promise<ActionResponse> {
    try {
      // Close any existing browser instance
      if (PuppeteerActions.browser) {
        await PuppeteerActions.browser.close();
        PuppeteerActions.browser = null;
        PuppeteerActions.page = null;
      }

      // Launch new browser
      PuppeteerActions.browser = await puppeteer.launch({
        args: [
          "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        ],
        headless: "shell",
        defaultViewport: {
          width: 1270,
          height: 720,
        },
      });

      // Create new page
      PuppeteerActions.page = await PuppeteerActions.browser.newPage();

      // Listen for navigation events
      PuppeteerActions.page.on("framenavigated", async (frame) => {
        if (frame === PuppeteerActions.page?.mainFrame()) {
          const currentUrl = await frame.url();
          PuppeteerActions.io?.sockets.emit("url-change", currentUrl);
        }
      });

      // Navigate to URL and wait for load
      await PuppeteerActions.page.goto(url, {
        timeout: 7_000,
        waitUntil: ["domcontentloaded", "networkidle2"],
      });
      await PuppeteerActions.waitTillHTMLStable(PuppeteerActions.page);
      // Emit the current URL
      const currentUrl = await PuppeteerActions.page.url();
      PuppeteerActions.io?.sockets.emit("url-change", currentUrl);

      // Get screenshot
      const screenshot = await PuppeteerActions.getScreenshot();
      PuppeteerActions.io?.sockets.emit("action_performed");

      return {
        status: "success",
        message: "Action Result: Browser launched successfully",
        screenshot,
      };
    } catch (error: any) {
      console.error("Failed to launch browser:", error);
      return {
        status: "error",
        message: error.message,
        screenshot: "",
      };
    }
  }

  static async click(x: number, y: number): Promise<ActionResponse> {
    try {
      if (!PuppeteerActions.page) {
        return {
          status: "error",
          message: "Action Result: Browser not launched",
          screenshot: "",
        };
      }

      await PuppeteerActions.page.mouse.click(x, y);

      // Wait for any potential navigation or network activity
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await PuppeteerActions.waitForPageLoad();
        // After navigation, emit the new URL
        const currentUrl = await PuppeteerActions.page.url();
        PuppeteerActions.io?.sockets.emit("url-change", currentUrl);
      } catch (e) {
        // Ignore navigation timeout - might be a click that doesn't trigger navigation
      }

      const screenshot = await PuppeteerActions.getScreenshot();
      PuppeteerActions.io?.sockets.emit("action_performed");

      return {
        status: "success",
        message: "Action Result: Click action completed",
        screenshot,
      };
    } catch (error: any) {
      console.error("Failed to click:", error);
      return {
        status: "error",
        message: error.message,
        screenshot: "",
      };
    }
  }

  static async type(text: string): Promise<ActionResponse> {
    try {
      if (!PuppeteerActions.page) {
        return {
          status: "error",
          message: "Action Result: Browser not launched",
          screenshot: "",
        };
      }

      // Split text by newlines and handle each part
      const parts = text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
          await PuppeteerActions.page.keyboard.type(parts[i]);
        }
        // Press Enter after each part except the last one
        if (i < parts.length - 1) {
          await PuppeteerActions.page.keyboard.press("Enter");
        }
      }

      const screenshot = await PuppeteerActions.getScreenshot();
      PuppeteerActions.io?.sockets.emit("action_performed");

      return {
        status: "success",
        message: "Action Result: Text typed successfully",
        screenshot,
      };
    } catch (error: any) {
      console.error("Failed to type:", error);
      return {
        status: "error",
        message: error.message,
        screenshot: "",
      };
    }
  }

  static async back(): Promise<ActionResponse> {
    try {
      if (!PuppeteerActions.page) {
        return {
          status: "error",
          message: "Action Result: Browser not launched",
          screenshot: "",
        };
      }

      await PuppeteerActions.page.goBack();
      await PuppeteerActions.waitForPageLoad();

      // After navigation, emit the new URL
      const currentUrl = await PuppeteerActions.page.url();
      PuppeteerActions.io?.sockets.emit("url-change", currentUrl);

      const screenshot = await PuppeteerActions.getScreenshot();
      PuppeteerActions.io?.sockets.emit("action_performed");

      return {
        status: "success",
        message: "Action Result: Navigated back successfully",
        screenshot,
      };
    } catch (error: any) {
      console.error("Failed to navigate back:", error);
      return {
        status: "error",
        message: error.message,
        screenshot: "",
      };
    }
  }

  static async keyPress(key: KeyInput): Promise<ActionResponse> {
    try {
      if (!PuppeteerActions.page) {
        return {
          status: "error",
          message: "Action Result: Browser not launched",
          screenshot: "",
        };
      }

      await PuppeteerActions.page.keyboard.press(key);

      // Wait briefly for any potential UI updates
      await new Promise((resolve) => setTimeout(resolve, 500));

      const screenshot = await PuppeteerActions.getScreenshot();
      PuppeteerActions.io?.sockets.emit("action_performed");

      return {
        status: "success",
        message: `Action Result: Key ${key} pressed successfully`,
        screenshot,
      };
    } catch (error: any) {
      console.error("Failed to press key:", error);
      return {
        status: "error",
        message: error.message,
        screenshot: "",
      };
    }
  }

  static async scroll(direction: "up" | "down"): Promise<ActionResponse> {
    try {
      if (!PuppeteerActions.page) {
        return {
          status: "error",
          message: "Action Result: Browser not launched",
          screenshot: "",
        };
      }

      await PuppeteerActions.page.evaluate((dir) => {
        window.scrollBy(
          0,
          dir === "up" ? -window.innerHeight : window.innerHeight,
        );
      }, direction);

      // Wait for any lazy-loaded content
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const screenshot = await PuppeteerActions.getScreenshot();
      PuppeteerActions.io?.sockets.emit("action_performed");

      return {
        status: "success",
        message: `Action Result: Scrolled ${direction}`,
        screenshot,
      };
    } catch (error: any) {
      console.error(`Failed to scroll ${direction}:`, error);
      return {
        status: "error",
        message: error.message,
        screenshot: "",
      };
    }
  }

  // page.goto { waitUntil: "networkidle0" } may not ever resolve, and not waiting could return page content too early before js has loaded
  // https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded/61304202#61304202
  private static async waitTillHTMLStable(
    page: puppeteer.Page,
    timeout = 5_000,
  ) {
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
}
