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
    const res = await page.evaluate((coordinate) => {
      try {
        const element = document.elementFromPoint(
          coordinate.x,
          coordinate.y
        ) as Element;
        const { top } = element.getBoundingClientRect();

        if (top > window.innerHeight || top < window.scrollY) {
          element.scrollIntoView({ behavior: "smooth" });
        }

        return {
          top,
          isSuccess: true,
          isConditionPassed: top > window.innerHeight || top < window.scrollY,
        };
      } catch (e) {
        return {
          isSuccess: false,
          message:
            "Element not available on the visible viewport. Please check if the element is visible in the current viewport otherwise scroll the page to make the element visible in the viewport",
        };
      }
    }, coordinate);
    if (!res.isSuccess) {
      return {
        status: res.isSuccess ? "success" : "error",
        message: res.message || "",
      };
    }

    try {
      await page.mouse.move(coordinate.x, coordinate.y);
      await page.mouse.click(coordinate.x, coordinate.y, {
        button: "left",
        clickCount: 1,
      });
      // Create a navigation promise that resolves on load or times out after 5 seconds
      await page.waitForLoadState("domcontentloaded", {
        timeout: 20_000,
      });

      // Wait for both navigation and click to complete

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
    if (!action.coordinate || !action.text) {
      return {
        status: "error",
        message: "Coordinates & text are required for type action",
      };
    }
    const coordinate = getCoordinate(action.coordinate as string);
    const isElementFocused = await page.evaluate((coordinate) => {
      const el = document.elementFromPoint(coordinate!.x, coordinate!.y);
      return el === document.activeElement;
    }, coordinate);
    if (isElementFocused) {
      await page.keyboard.type(action!.text as string);
      return {
        status: "success",
        message: "Type action performed successfully",
      };
    } else {
      return {
        status: "error",
        message: "Element is not focused. Please click on the element first.",
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
      PuppeteerActions.io?.sockets.emit("action_performed");

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
    if (!action.text)
      return {
        status: "error",
        message: "Text is required for keypress action",
      };
    const coordinate = getCoordinate(action.coordinate as string);
    const isFocused = await page.evaluate((coordinate) => {
      const el = document.elementFromPoint(coordinate!.x, coordinate!.y);
      return el === document.activeElement;
    }, coordinate);
    if (isFocused) {
      let newKey = action.text;
      if (action.text.includes("control")) {
        newKey = action.text.toLowerCase().replace("control", "ControlOrMeta");
      }
      await page.keyboard.press(newKey, { delay: 10 });
      return {
        status: "success",
        message: "Keypress action performed successfully",
      };
    } else {
      return {
        status: "error",
        message: "Element is not focused. Please click on the element first.",
      };
    }
  }

  static async scrollUp(page: Page): Promise<ActionResponse> {
    await page.mouse.wheel(0, -200);
    return {
      status: "success",
      message: "Scroll up action performed successfully",
    };
  }

  static async scrollDown(page: Page): Promise<ActionResponse> {
    await page.mouse.wheel(0, 200);
    return {
      status: "success",
      message: "Scroll down action performed successfully",
    };
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
