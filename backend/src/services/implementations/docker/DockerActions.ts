import { DockerCommands } from "./DockerCommands";
import { KeyMap, VNCActionParams } from "./DockerTypes";
import { Server as SocketServer } from "socket.io";
import { ActionRequest, ActionResponse } from "../../../types/action.types";

export class DockerActions {
  private static io: SocketServer;

  private static readonly keyMap: KeyMap = {
    Backspace: "BackSpace",
    Enter: "Return",
    Tab: "Tab",
    Delete: "Delete",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
    Escape: "Escape",
    Home: "Home",
    End: "End",
    PageUp: "Page_Up",
    PageDown: "Page_Down",
    Control: "Control_L",
    Alt: "Alt_L",
    Shift: "Shift_L",
    Meta: "Super_L",
    CapsLock: "Caps_Lock",
  };

  static initialize(io: SocketServer) {
    DockerActions.io = io;
  }

  static async click(
    containerId: string,
    x: number,
    y: number,
  ): Promise<ActionResponse> {
    try {
      await DockerCommands.executeCommand({
        command: [
          "exec",
          containerId,
          "xdotool",
          "mousemove",
          x.toString(),
          y.toString(),
          "click",
          "1",
        ],
        successMessage: `Action Result: Clicked at ${x},${y}`,
        errorMessage: "Action Result: Click action failed",
      });

      // Wait for potential UI updates (matching Puppeteer's behavior)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const screenshot = await DockerCommands.takeScreenshot(
        containerId,
        "/tmp/screenshot.png",
      );
      return {
        status: "success",
        message: `Action Result: Clicked at ${x},${y}`,
        screenshot: screenshot || "",
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Action Result: Click action failed",
        screenshot: "",
      };
    }
  }

  static async doubleClick(
    containerId: string,
    x: number,
    y: number,
  ): Promise<ActionResponse> {
    try {
      await DockerCommands.executeCommand({
        command: [
          "exec",
          containerId,
          "xdotool",
          "mousemove",
          x.toString(),
          y.toString(),
          "click",
          "--repeat",
          "2",
          "1",
        ],
        successMessage: `Action Result: Double clicked at ${x},${y}`,
        errorMessage: "Action Result: Double click action failed",
      });

      // Wait for potential UI updates (matching click behavior)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const screenshot = await DockerCommands.takeScreenshot(
        containerId,
        "/tmp/screenshot.png",
      );
      return {
        status: "success",
        message: `Action Result: Double clicked at ${x},${y}`,
        screenshot: screenshot || "",
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Action Result: Double click action failed",
        screenshot: "",
      };
    }
  }

  static async type(
    containerId: string,
    text: string,
  ): Promise<ActionResponse> {
    try {
      await DockerCommands.executeCommand({
        command: ["exec", containerId, "xdotool", "type", text],
        successMessage: `Action Result: Typed text: ${text}`,
        errorMessage: "Action Result: Type action failed",
      });

      // Wait for UI updates (matching Puppeteer's behavior)
      await new Promise((resolve) => setTimeout(resolve, 500));

      const screenshot = await DockerCommands.takeScreenshot(
        containerId,
        "/tmp/screenshot.png",
      );
      return {
        status: "success",
        message: `Action Result: Typed text: ${text}`,
        screenshot: screenshot || "",
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Action Result: Type action failed",
        screenshot: "",
      };
    }
  }

  static async keyPress(
    containerId: string,
    key: string,
  ): Promise<ActionResponse> {
    const xdotoolKey = DockerActions.keyMap[key] || key;

    try {
      await DockerCommands.executeCommand({
        command: ["exec", containerId, "xdotool", "key", xdotoolKey],
        successMessage: ` Action Result: Pressed key: ${key}`,
        errorMessage: "Action Result: Key press action failed",
      });

      // Wait for UI updates (matching Puppeteer's behavior)
      await new Promise((resolve) => setTimeout(resolve, 500));

      const screenshot = await DockerCommands.takeScreenshot(
        containerId,
        "/tmp/screenshot.png",
      );
      return {
        status: "success",
        message: `Action Result: Pressed key: ${key}`,
        screenshot: screenshot || "",
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Action Result: Key press action failed",
        screenshot: "",
      };
    }
  }

  static async scroll(
    containerId: string,
    direction: "up" | "down",
  ): Promise<ActionResponse> {
    const button = direction === "up" ? "4" : "5";
    // Use smaller number of attempts for more controlled scrolling
    const scrollAttempts = 3;
    const scrollDelay = 200; // Delay between scroll actions
    const contentLoadDelay = 1000; // Wait for content to load after scrolling
    
    try {
      console.log(`Performing controlled scroll ${direction} (approx. 300px)`);
      
      // Primary method: Mousedown/up for better control of scroll amount
      for (let i = 0; i < scrollAttempts; i++) {
        await DockerCommands.executeCommand({
          command: [
            "exec", 
            containerId, 
            "xdotool",
            "mousedown", 
            button, 
            "mouseup", 
            button
          ],
          successMessage: `Scroll step ${i + 1}/${scrollAttempts} ${direction}`,
          errorMessage: "Scroll step failed",
        });
        
        // Small delay between scroll actions for better responsiveness
        await new Promise((resolve) => setTimeout(resolve, scrollDelay));
      }
      
      // If the mousedown/up approach doesn't scroll enough, 
      // use a single arrow key press as fallback (more gentle than Page Up/Down)
      const arrowKey = direction === "up" ? "Up" : "Down";
      await DockerCommands.executeCommand({
        command: ["exec", containerId, "xdotool", "key", "--repeat", "3", arrowKey],
        successMessage: `Fine-tuning scroll with arrow keys`,
        errorMessage: "Arrow key scroll failed",
      });

      // Wait for lazy-loaded content and animations to complete
      await new Promise((resolve) => setTimeout(resolve, contentLoadDelay));

      // Take screenshot after content has loaded
      const screenshot = await DockerCommands.takeScreenshot(
        containerId,
        "/tmp/screenshot.png",
      );
      
      return {
        status: "success",
        message: `Action Result: Scrolled ${direction} approximately 300px`,
        screenshot: screenshot || "",
      };
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || "Action Result: Scroll action failed",
        screenshot: "",
      };
    }
  }

  static async getUrl(containerId: string): Promise<string> {
    try {
      // Focus on the Firefox window and copy the URL from the address bar
      await DockerCommands.executeCommand({
        command: [
          "exec",
          containerId,
          "xdotool",
          "search",
          "--onlyvisible",
          "--class",
          "firefox",
          "windowactivate",
          "--sync",
          "key",
          "ctrl+l",
          "ctrl+c",
          "Escape",
        ],
        successMessage: "URL copied from Firefox",
        errorMessage: "Failed to copy URL from Firefox",
      });

      // Retrieve the copied URL from the clipboard
      const result = await DockerCommands.executeCommand({
        command: [
          "exec",
          containerId,
          "xclip",
          "-o",
          "-selection",
          "clipboard",
        ],
        successMessage: "URL retrieved from clipboard",
        errorMessage: "Failed to retrieve URL from clipboard",
      });

      return result.trim();
    } catch (error: any) {
      console.log("error here");
      throw new Error(error.message || "Failed to get URL");
    }
  }

  static async performAction(
    containerId: string,
    action: ActionRequest,
    params: VNCActionParams,
  ): Promise<ActionResponse> {
    try {
      let result: ActionResponse;
      switch (action.action) {
        case "click":
          if (params.x !== undefined && params.y !== undefined) {
            result = await DockerActions.click(containerId, params.x, params.y);
          } else {
            return {
              status: "error",
              message: "Action Result: Click requires x,y coordinates",
              screenshot: "",
            };
          }
          break;
        case "doubleClick":
          if (params.x !== undefined && params.y !== undefined) {
            result = await DockerActions.doubleClick(
              containerId,
              params.x,
              params.y,
            );
          } else {
            return {
              status: "error",
              message: "Action Result: Double click requires x,y coordinates",
              screenshot: "",
            };
          }
          break;
        case "type":
          if (params.text) {
            result = await DockerActions.type(containerId, params.text);
            // if (result.status === "success") {
            // await DockerActions.keyPress(containerId, "Escape");
            // }
          } else {
            return {
              status: "error",
              message: "Action Result: Type requires text parameter",
              screenshot: "",
            };
          }
          break;
        case "keyPress":
          if (params.key) {
            result = await DockerActions.keyPress(containerId, params.key);
          } else {
            return {
              status: "error",
              message: "Action Result: Key press requires key parameter",
              screenshot: "",
            };
          }
          break;
        case "scroll":
          if (params.direction) {
            result = await DockerActions.scroll(containerId, params.direction);
          } else {
            return {
              status: "error",
              message: "Action Result: Scroll requires direction parameter",
              screenshot: "",
            };
          }
          break;
        case "scrollUp":
          result = await DockerActions.scroll(containerId, "up");
          break;
        case "scrollDown":
          result = await DockerActions.scroll(containerId, "down");
          break;
        case "getUrl":
          const url = await DockerActions.getUrl(containerId);
          result = {
            status: "success",
            message: `Action Result: Retrieved URL: ${url}`,
            screenshot: "",
          };
          break;
        default:
          return {
            status: "error",
            message: `Action Result: Unknown action: ${action}`,
            screenshot: "",
          };
      }
      DockerActions.io.sockets.emit("action_performed");
      return result;
    } catch (error: any) {
      return {
        status: "error",
        message: error.message || `Action Result: Action ${action} failed`,
        screenshot: "",
      };
    }
  }
}
