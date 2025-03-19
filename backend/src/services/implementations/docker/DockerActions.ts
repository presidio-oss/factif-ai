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
    const scrollAttempts = 2; // Number of scroll clicks to perform
    const scrollDelay = 50; // Delay between scroll clicks in ms
    const contentLoadDelay = 2000; // Delay after scrolling for content to load

    try {
      // Perform multiple scroll clicks with delays between them
      for (let i = 0; i < scrollAttempts; i++) {
        await DockerCommands.executeCommand({
          command: ["exec", containerId, "xdotool", "click", button],
          successMessage: `Action Result: Scroll attempt ${i + 1}/${scrollAttempts} ${direction}`,
          errorMessage: "Action Result: Scroll action failed",
        });

        // Wait between scroll clicks to allow for smooth scrolling
        if (i < scrollAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, scrollDelay));
        }
      }

      // Wait for lazy-loaded content and animations to complete
      await new Promise((resolve) => setTimeout(resolve, contentLoadDelay));

      // Take screenshot after content has loaded
      const screenshot = await DockerCommands.takeScreenshot(
        containerId,
        "/tmp/screenshot.png",
      );

      return {
        status: "success",
        message: `Action Result: Scrolled ${direction}`,
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

  // URL cache with timestamp to prevent frequent retrievals
  private static urlCache: {[containerId: string]: {url: string, timestamp: number}} = {};
  private static URL_CACHE_TTL = 2000; // 2 seconds cache time
  
  static async getUrl(containerId: string): Promise<string> {
    try {
      // Check cache first to avoid frequent retrievals
      const now = Date.now();
      const cacheEntry = DockerActions.urlCache[containerId];
      
      if (cacheEntry && (now - cacheEntry.timestamp) < DockerActions.URL_CACHE_TTL) {
        console.log("URL retrieved from cache:", cacheEntry.url);
        return cacheEntry.url;
      }
      
      console.log("Retrieving URL using non-disruptive methods...");
      let url = "about:blank";
      
      // Method 1 (Primary): Direct URL Bar extraction - most reliable for full URLs including paths
      try {
        console.log("Trying direct URL bar extraction (primary method)...");
        
        // Create an improved script that gets the full URL directly from Firefox's address bar
        await DockerCommands.executeCommand({
          command: [
            "exec",
            containerId,
            "bash",
            "-c",
            `cat > /tmp/get_firefox_url.sh << 'EOF'
#!/bin/bash
# Find Firefox window
WINDOW_ID=$(xdotool search --class firefox | head -1)
if [ -z "$WINDOW_ID" ]; then
  echo "about:blank"
  exit 0
fi

# Save current focus & clipboard content
CURRENT_FOCUS=$(xdotool getactivewindow 2>/dev/null || echo "")
CURRENT_SELECTION=$(xclip -o -selection clipboard 2>/dev/null || echo "")

# Focus Firefox and get URL directly from address bar
xdotool windowactivate --sync $WINDOW_ID 2>/dev/null
sleep 0.3

# Select all text in address bar with Alt+D (focus), then Ctrl+A (select all)
xdotool key --delay 100 --clearmodifiers alt+d
sleep 0.3
xdotool key --delay 100 --clearmodifiers ctrl+a
sleep 0.3

# Copy to clipboard
xdotool key --delay 100 --clearmodifiers ctrl+c
sleep 0.3

# Cancel selection without changing focus
xdotool key --delay 100 --clearmodifiers Escape
sleep 0.2

# Get URL from clipboard (complete with path)
FULL_URL=$(xclip -o -selection clipboard 2>/dev/null)

# Make sure it looks like a URL
if [[ "$FULL_URL" != http* ]]; then
  # Try one more time with a different method
  xdotool key --delay 100 --clearmodifiers ctrl+l
  sleep 0.2
  xdotool key --delay 100 --clearmodifiers ctrl+c
  sleep 0.2
  xdotool key --delay 100 --clearmodifiers Escape
  FULL_URL=$(xclip -o -selection clipboard 2>/dev/null)
  
  # If still no URL, use about:blank
  if [[ "$FULL_URL" != http* ]]; then
    FULL_URL="about:blank"
  fi
fi

# Restore original clipboard content if possible
echo "$CURRENT_SELECTION" | xclip -selection clipboard 2>/dev/null

# Restore original focus
if [ -n "$CURRENT_FOCUS" ] && [ "$CURRENT_FOCUS" != "$WINDOW_ID" ]; then
  xdotool windowactivate $CURRENT_FOCUS 2>/dev/null
fi

# Return the complete URL with path
echo "$FULL_URL"
EOF
chmod +x /tmp/get_firefox_url.sh`
          ]
        });
        
        // Run the script to get the URL
        const scriptResult = await DockerCommands.executeCommand({
          command: [
            "exec",
            containerId,
            "/tmp/get_firefox_url.sh"
          ],
          successMessage: "Executed URL extraction script",
        });
        
        if (scriptResult && scriptResult.trim() !== "" && 
            (scriptResult.startsWith('http://') || scriptResult.startsWith('https://'))) {
          url = scriptResult.trim();
          console.log("URL found via direct extraction script:", url);
          
          // Cache the URL
          DockerActions.urlCache[containerId] = { url, timestamp: now };
          return url;
        }
      } catch (scriptError) {
        console.log("Direct extraction script failed:", scriptError);
      }

      // Method 2: Try window title extraction as a backup
      try {
        console.log("Trying window title extraction (backup method)...");
        
        // Get all Firefox windows
        const windowIds = await DockerCommands.executeCommand({
          command: [
            "exec",
            containerId,
            "bash",
            "-c",
            "xdotool search --class firefox || echo ''"
          ],
        });
        
        const windowIdList = windowIds.trim().split('\n').filter(id => id.trim() !== '');
        
        // Try each window with improved pattern to capture full paths
        for (const windowId of windowIdList) {
          try {
            const titleResult = await DockerCommands.executeCommand({
              command: [
                "exec",
                containerId,
                "bash",
                "-c",
                // Enhanced title extraction with better pattern for full URLs
                `xprop -id ${windowId} WM_NAME | grep -o 'https\\?://[^\"\\)\\(\\]\\[\\}\\{<>]*'`
              ],
            });
            
            if (titleResult && titleResult.trim() !== "" && 
                (titleResult.startsWith('http://') || titleResult.startsWith('https://'))) {
              url = titleResult.trim();
              console.log("URL found via window title:", url);
              
              // Cache the URL
              DockerActions.urlCache[containerId] = { url, timestamp: now };
              return url;
            }
          } catch (e) {
            // Try next window
          }
        }
      } catch (titleError) {
        console.log("Window title method failed:", titleError);
      }

      // If we got here, both methods failed
      console.log("All URL retrieval methods failed, returning default URL");
      
      // Cache the result even if it's the default
      DockerActions.urlCache[containerId] = { url: "about:blank", timestamp: now };
      return "about:blank";
    } catch (error: any) {
      console.log("Error retrieving URL:", error.message);
      return "about:blank";
    } finally {
      // Clean up any temporary files we might have created
      try {
        await DockerCommands.executeCommand({
          command: [
            "exec",
            containerId,
            "bash",
            "-c",
            "rm -f /tmp/extract_url.py /tmp/places_temp.sqlite /tmp/get_firefox_url.sh /tmp/active_win /tmp/mouse_pos"
          ],
        });
        
        // Note: We don't kill the headless Firefox instance here anymore
        // It will be reused for future URL retrievals to avoid the startup delay
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
  }

  static async performAction(
    containerId: string,
    action: ActionRequest,
    params: VNCActionParams,
  ): Promise<ActionResponse> {
    try {
      // Validate that Firefox is actually running before attempting actions
      if (action.action !== "launch") {
        try {
          // Quick check if Firefox is running using ps command
          const checkResult = await DockerCommands.executeCommand({
            command: ["exec", containerId, "bash", "-c", "ps aux | grep -i firefox | grep -v grep || echo ''"],
          });
          
          if (!checkResult.trim()) {
            const errorMessage = "Firefox not running - cannot perform action";
            DockerActions.io.sockets.emit("browser-action-error", {
              message: errorMessage,
              action: action.action,
              url: params.url
            });
            return {
              status: "error",
              message: errorMessage,
              screenshot: "",
            };
          }
        } catch (checkError) {
          // Continue even if check fails - we'll handle it in the main action
        }
      }
      
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
        case "scroll_up":
          result = await DockerActions.scroll(containerId, "up");
          break;
        case "scroll_down":
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
      // If we get here, the action was successful
      DockerActions.io.sockets.emit("action_performed");
      return result;
    } catch (error: any) {
      const errorMessage = error.message || `Action Result: Action ${action.action} failed`;
      
      // Emit the error event so frontend can update UI
      DockerActions.io.sockets.emit("browser-action-error", {
        message: errorMessage,
        action: action.action,
        url: params.url
      });
      
      return {
        status: "error",
        message: errorMessage,
        screenshot: "",
      };
    }
  }
}
