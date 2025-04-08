import SocketService from "./socketService";
import ConsoleService from "./consoleService";
import { checkHealth } from "./api";
import { KeyboardEvent, MouseEvent } from "react";

type StreamingSource = "chrome-puppeteer" | "ubuntu-docker-vnc";

interface BrowserAction {
  action: string;
  params: Record<string, any>;
}

// Loading state detection configurations
interface LoadingDetectionConfig {
  maxWaitTime: number;       // Maximum time to wait for loading to complete (ms)
  pollingInterval: number;   // How often to check if loading is complete (ms)
  loadingIndicators: string[]; // CSS selectors for common loading indicators
}

export class UIInteractionService {
  private static instance: UIInteractionService;
  private socketInitialized: boolean = false;
  private browserStarted: boolean = false;
  private currentSource: StreamingSource = "chrome-puppeteer";
  private currentUrl: string = "";
  private urlChangeHandlers: ((url: string) => void)[] = [];
  private interactiveModeEnabled: boolean = false;
  private pendingStreamStart: boolean = false;
  private consoleService: ConsoleService;
  private actionPerformedResolve: (() => void) | null = null;
  private lastClickTime: number = 0;
  private lastClickCoords: { x: number; y: number } | null = null;
  private _hoverThrottleTimeout: ReturnType<typeof setTimeout> | null = null;
  private _isWaitingForLoading: boolean = false;
  private _waitTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _loadingDetectionConfig: LoadingDetectionConfig = {
    maxWaitTime: 30000,       // 30 seconds default max wait time
    pollingInterval: 250,     // Check every 250ms
    loadingIndicators: [
      '.loading',
      '.spinner',
      'progress',
      '.progress',
      '.loader',
      '[role="progressbar"]',
      '.fa-spin',
      '.spinning',
      '.rotate'
      // Common loading indicator selectors
    ]
  };

  /**
   * Check if the browser is currently started
   * @returns boolean indicating if browser is running
   */
  isBrowserStarted(): boolean {
    return this.browserStarted;
  }

  private constructor() {
    this.consoleService = ConsoleService.getInstance();
  }

  static getInstance(): UIInteractionService {
    if (!UIInteractionService.instance) {
      UIInteractionService.instance = new UIInteractionService();
    }
    return UIInteractionService.instance;
  }

  onUrlChange(handler: (url: string) => void) {
    this.urlChangeHandlers.push(handler);
    return () => {
      this.urlChangeHandlers = this.urlChangeHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  private notifyUrlChange(url: string) {
    this.currentUrl = url;
    this.urlChangeHandlers.forEach((handler) => handler(url));
  }

  setInteractiveMode(enabled: boolean) {
    this.interactiveModeEnabled = enabled;
  }

  private startStream() {
    if (this.pendingStreamStart) return;

    const socketService = SocketService.getInstance();
    if (!socketService) return;

    this.pendingStreamStart = true;
    this.browserStarted = true;

    if (this.currentSource === "chrome-puppeteer") {
      const params: { source: StreamingSource; url?: string } = {
        source: this.currentSource,
      };

      if (this.currentUrl) {
        params.url = this.currentUrl;
        socketService.emit("start-stream", params);
        // Notify URL change to update URL bar
        this.notifyUrlChange(this.currentUrl);
      }
    } else {
      socketService.emit("start-stream", { source: this.currentSource });
    }
  }

  async initialize(
    onScreenshotUpdate: (base64Image: string) => void,
    onStatusUpdate: (status: string) => void,
    onError: (error: string | null) => void,
    streamingSource: StreamingSource,
  ) {
    if (this.socketInitialized) return;
    this.consoleService.emitConsoleEvent(
      "info",
      "Initializing UI interaction service...",
    );

    const socketService = SocketService.getInstance();
    const socket = socketService.connect();
    this.currentSource = streamingSource;
    this.socketInitialized = true;

    socket.on("connect", async () => {
      onStatusUpdate("Connected to server");
      onError(null);

      try {
        const response = await checkHealth();
        this.consoleService.emitConsoleEvent(
          "info",
          `Server health check: ${response.message || "Server is running"}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        this.consoleService.emitConsoleEvent(
          "error",
          `Server health check failed: ${errorMessage}`,
        );
      }

      if (!this.browserStarted && !this.pendingStreamStart) {
        this.startStream();
      }
    });

    socket.on("connect_error", (err: Error) => {
      onStatusUpdate("Connection error");
      onError(`Failed to connect to server: ${err.message}`);
      this.consoleService.emitConsoleEvent(
        "error",
        `Socket connection error: ${err.message}`,
      );
    });

    socket.on("disconnect", () => {
      onStatusUpdate("Disconnected from server");
      onScreenshotUpdate("");
      this.browserStarted = false;
      this.pendingStreamStart = false;
      this.consoleService.emitConsoleEvent("info", "Socket disconnected");
    });

    socket.on("browser-started", () => {
      this.consoleService.emitConsoleEvent("info", "Browser started");
      onStatusUpdate("Browser initialized");
      onError(null);
      this.pendingStreamStart = false;
      this.browserStarted = true;
    });

    socket.on("browser-error", ({ message }: { message: string }) => {
      onStatusUpdate("Browser error");
      onError(message);
      this.browserStarted = false;
      this.pendingStreamStart = false;
    });

    socket.on("browser-stopped", () => {
      onStatusUpdate("Browser stopped");
      onScreenshotUpdate("");
      this.browserStarted = false;
      this.pendingStreamStart = false;
    });

    socket.on("screenshot-stream", (base64Image: string) => {
      onScreenshotUpdate(base64Image);
      onStatusUpdate("Streaming...");
    });

    socket.on("url-change", (url: string) => {
      this.notifyUrlChange(url);
    });

    socket.on("action_performed", () => {
      this.consoleService.emitConsoleEvent("info", "Action performed event received");
      if (this.actionPerformedResolve) {
        this.actionPerformedResolve();
        this.actionPerformedResolve = null;
      }
    });

    // Handle input element focus notification
    socket.on("input-focused", (coordinates) => {
      this.consoleService.emitConsoleEvent("info", `Input element focused at (${coordinates.x}, ${coordinates.y})`);
      this.lastClickCoords = coordinates;
    });

    // Handle loading state detection
    socket.on("loading-state-update", ({ isLoading, progress }) => {
      if (isLoading) {
        this.consoleService.emitConsoleEvent("info", `Loading in progress${progress ? `: ${progress}%` : ''}`);
        this._isWaitingForLoading = true;
      } else {
        this.consoleService.emitConsoleEvent("info", "Loading completed");
        this._isWaitingForLoading = false;
        if (this.actionPerformedResolve) {
          this.actionPerformedResolve();
          this.actionPerformedResolve = null;
        }
      }
    });

    // Handle page ready events (DOM content loaded, etc)
    socket.on("page-ready", () => {
      this.consoleService.emitConsoleEvent("info", "Page is fully loaded");
      this._isWaitingForLoading = false;
    });
  }

  handleSourceChange(newSource: StreamingSource, url?: string) {
    console.log("** Source change:", newSource, url);
    this.currentSource = newSource;
    if (url) {
      // Set current URL and notify subscribers to update the UI
      this.notifyUrlChange(url);
    }
    const socketService = SocketService.getInstance();
    const socket = socketService.getSocket();

    if (socket) {
      if (this.browserStarted) {
        socket.once("browser-stopped", () => {
          this.startStream();
        });
        socketService.emit("stop-browser");
      } else if (!this.pendingStreamStart) {
        this.startStream();
      }
    }
  }

  /**
   * Handles browser back navigation without resetting the browser
   * Uses the browser's native history navigation capabilities
   * @returns {Promise<void>}
   */
  async handleBackNavigation(): Promise<void> {
    const socket = SocketService.getInstance().getSocket();

    if (!socket || !this.interactiveModeEnabled) {
      this.consoleService.emitConsoleEvent(
        "error",
        "Cannot perform back navigation: Socket not initialized or interactive mode not enabled"
      );
      return;
    }

    try {
      // Use the existing performAction method with the "back" action
      await this.performAction("back");
      this.consoleService.emitConsoleEvent("info", "Back navigation performed");
    } catch (error) {
      this.consoleService.emitConsoleEvent(
        "error",
        `Back navigation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  handleMouseInteraction(event: MouseEvent, imageElement: HTMLImageElement) {
    const socket = SocketService.getInstance().getSocket();
    if (
      !socket ||
      !this.interactiveModeEnabled
    )
      return;

    const imageRect = imageElement.getBoundingClientRect();
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;

    const scaleX = naturalWidth / imageRect.width;
    const scaleY = naturalHeight / imageRect.height;

    const relativeX = event.clientX - imageRect.left;
    const relativeY = event.clientY - imageRect.top;

    const scaledX = Math.round(relativeX * scaleX);
    const scaledY = Math.round(relativeY * scaleY);

    // For click events only
    if (event.type === 'click' || event.type === 'mousedown') {
      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastClickTime;
      const isDoubleClick =
        timeDiff < 300 &&
        this.lastClickCoords &&
        Math.abs(this.lastClickCoords.x - scaledX) < 5 &&
        Math.abs(this.lastClickCoords.y - scaledY) < 5;

      if (isDoubleClick) {
        this.emitBrowserAction({
          action: "doubleClick",
          params: { x: scaledX, y: scaledY },
        });
        this.consoleService.emitConsoleEvent(
          "info",
          `Double click event at scaled coordinates (${scaledX}, ${scaledY})`,
        );
        this.lastClickTime = 0;
        this.lastClickCoords = null;
      } else {
        this.emitBrowserAction({
          action: "click",
          params: { x: scaledX, y: scaledY },
        });
        this.consoleService.emitConsoleEvent(
          "info",
          `Click event at scaled coordinates (${scaledX}, ${scaledY})`,
        );
        this.lastClickTime = currentTime;
        this.lastClickCoords = { x: scaledX, y: scaledY };
      }
    }
  }

  /**
   * Handle mouse hover interactions
   * @param event Mouse event
   * @param imageElement Image element being hovered
   */
  handleHoverInteraction(event: MouseEvent, imageElement: HTMLImageElement) {
    const socket = SocketService.getInstance().getSocket();
    if (
      !socket ||
      !this.interactiveModeEnabled
    )
      return;

    // Calculate hover coordinates using the same scaling logic as for clicks
    const imageRect = imageElement.getBoundingClientRect();
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;

    const scaleX = naturalWidth / imageRect.width;
    const scaleY = naturalHeight / imageRect.height;

    const relativeX = event.clientX - imageRect.left;
    const relativeY = event.clientY - imageRect.top;

    const scaledX = Math.round(relativeX * scaleX);
    const scaledY = Math.round(relativeY * scaleY);

    // Throttle hover events to avoid overwhelming the server
    // Use setTimeout with a small delay to debounce hover events
    if (this._hoverThrottleTimeout) {
      clearTimeout(this._hoverThrottleTimeout);
    }

    this._hoverThrottleTimeout = setTimeout(() => {
      this.emitBrowserAction({
        action: "hover",
        params: { x: scaledX, y: scaledY },
      });

      this.consoleService.emitConsoleEvent(
        "info",
        `Hover event at scaled coordinates (${scaledX}, ${scaledY})`,
      );
    }, 50); // 50ms throttle
  }

  handleKeyboardInteraction(event: KeyboardEvent) {
    const socket = SocketService.getInstance().getSocket();
    if (
      !socket ||
      !this.interactiveModeEnabled
    )
      return;

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
    }

    const specialKeys: { [key: string]: string } = {
      Backspace: "Backspace",
      Enter: "Enter",
      Tab: "Tab",
      Delete: "Delete",
      ArrowLeft: "ArrowLeft",
      ArrowRight: "ArrowRight",
      ArrowUp: "ArrowUp",
      ArrowDown: "ArrowDown",
      Escape: "Escape",
      Home: "Home",
      End: "End",
      PageUp: "PageUp",
      PageDown: "PageDown",
      Control: "Control",
      Alt: "Alt",
      Shift: "Shift",
      Meta: "Meta",
      CapsLock: "CapsLock",
    };

    if (event.key in specialKeys) {
      this.emitBrowserAction({
        action: "keyPress",
        params: { key: specialKeys[event.key] },
      });
    } else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
      this.emitBrowserAction({
        action: "type",
        params: { text: event.key, ...this.lastClickCoords },
      });
    }

    this.consoleService.emitConsoleEvent("info", `Key pressed: ${event.key}`);
  }

  // Throttle state for scroll events
  private _scrollThrottleTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastScrollTime: number = 0;
  private _scrollThrottleDelay: number = 300; // ms between scroll actions

  handleScrollInteraction(event: WheelEvent) {
    const socket = SocketService.getInstance().getSocket();
    if (
      !socket ||
      !this.interactiveModeEnabled
    )
      return;

    // Prevent scroll events from firing too rapidly
    const now = Date.now();
    if (now - this._lastScrollTime < this._scrollThrottleDelay) {
      // Too soon since last scroll - ignore this event
      return;
    }

    // Clear any existing timeout
    if (this._scrollThrottleTimeout) {
      clearTimeout(this._scrollThrottleTimeout);
    }

    const direction = event.deltaY > 0 ? "down" : "up";
    const actionType = event.deltaY > 0 ? "scrollDown" : "scrollUp";

    // Update last scroll time
    this._lastScrollTime = now;

    // Use throttle timeout to delay execution slightly and prevent multiple rapid scrolls
    this._scrollThrottleTimeout = setTimeout(() => {
      this.emitBrowserAction({
        action: actionType,
        params: {},
      });

      this.consoleService.emitConsoleEvent("info", `Scroll ${direction}`);
    }, 50); // Small delay to batch rapid scroll events
  }

  cleanup() {
    if (this.socketInitialized) {
      const socketService = SocketService.getInstance();
      const socket = socketService.getSocket();

      if (socket) {
        socketService.emit("stop-browser");
        socket.removeAllListeners();
      }

      socketService.disconnect();
      this.socketInitialized = false;
      this.browserStarted = false;
      this.pendingStreamStart = false;
    }
  }

  private emitBrowserAction(action: BrowserAction) {
    const socket = SocketService.getInstance().getSocket();
    if (socket) {
      // Log the action being sent
      this.consoleService.emitConsoleEvent(
        "info",
        `Sending browser action: ${action.action} ${
          action.params.x !== undefined ? `at (${action.params.x}, ${action.params.y})` : ""
        }`
      );

      // Send the action to the server
      socket.emit("browser-action", action);
    }
  }

  /**
   * Wait for loading to complete
   * @param timeout Optional timeout override in ms
   * @returns Promise that resolves when loading completes or rejects on timeout
   */
  async waitForLoading(timeout?: number): Promise<void> {
    const socket = SocketService.getInstance().getSocket();
    if (!socket) {
      throw new Error("Cannot wait for loading: Socket not initialized");
    }

    const maxWaitTime = timeout || this._loadingDetectionConfig.maxWaitTime;

    return new Promise<void>((resolve, reject) => {
      // If not already waiting for loading
      if (!this._isWaitingForLoading) {
        // Check if there are any loading indicators on the page
        this.emitBrowserAction({
          action: "detectLoading",
          params: {
            selectors: this._loadingDetectionConfig.loadingIndicators
          },
        });
      }

      // Setup listener for loading completion
      const loadingCompleteHandler = () => {
        if (this._waitTimeoutId) {
          clearTimeout(this._waitTimeoutId);
          this._waitTimeoutId = null;
        }
        socket.off("loading-state-update", loadingUpdateHandler);
        socket.off("page-ready", loadingCompleteHandler);
        this._isWaitingForLoading = false;
        resolve();
      };

      // Handle loading state updates
      const loadingUpdateHandler = ({ isLoading }: { isLoading: boolean }) => {
        if (!isLoading) {
          loadingCompleteHandler();
        }
      };

      socket.on("loading-state-update", loadingUpdateHandler);
      socket.on("page-ready", loadingCompleteHandler);

      // Set timeout to prevent waiting indefinitely
      this._waitTimeoutId = setTimeout(() => {
        socket.off("loading-state-update", loadingUpdateHandler);
        socket.off("page-ready", loadingCompleteHandler);
        this._isWaitingForLoading = false;
        this.consoleService.emitConsoleEvent("warn", `Wait for loading timed out after ${maxWaitTime}ms`);
        reject(new Error(`Wait for loading timed out after ${maxWaitTime}ms`));
      }, maxWaitTime);
    });
  }

  async performAction(
    action: string,
    coordinate?: string,
    text?: string,
    waitTimeout?: number
  ): Promise<void> {
    const socket = SocketService.getInstance().getSocket();
    if (
      !socket ||
      !this.interactiveModeEnabled
    ) {
      this.consoleService.emitConsoleEvent(
        "error",
        "Cannot perform action: Socket not initialized or interactive mode not enabled",
      );
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.actionPerformedResolve = resolve;
      let timeoutId: ReturnType<typeof setTimeout>;

      const clearTimeoutAndResolve = () => {
        clearTimeout(timeoutId);
        if (this.actionPerformedResolve) {
          this.actionPerformedResolve();
          this.actionPerformedResolve = null;
        }
      };

      const clearTimeoutAndReject = (error: Error) => {
        clearTimeout(timeoutId);
        if (this.actionPerformedResolve) {
          this.actionPerformedResolve = null;
          reject(error);
        }
      };

      // This handler is used to clear the timeout and resolve the promise when the action is performed.
      // It also removes itself to prevent memory leaks and unexpected behavior.
      const actionPerformedHandler = () => {
        clearTimeoutAndResolve();
        this.consoleService.emitConsoleEvent("info", `Action performed`);
        socket.off("action_performed", actionPerformedHandler);
      };

      socket.on("action_performed", actionPerformedHandler);
      switch (action.toLowerCase()) {
        case "back":
          // Back navigation action
          this.emitBrowserAction({ action: "back", params: {} });
          this.consoleService.emitConsoleEvent("info", "Back navigation action sent");
          break;

        case "wait":
          // Wait for loading to complete or a specific condition
          const waitTimeout = text ? parseInt(text, 10) : undefined;
          this.waitForLoading(waitTimeout)
            .then(() => {
              this.consoleService.emitConsoleEvent("info", "Wait completed successfully");
              clearTimeoutAndResolve();
            })
            .catch((error) => {
              clearTimeoutAndReject(error instanceof Error ? error : new Error(String(error)));
            });
          break;

        case "click":
          if (coordinate) {
            const [x, y] = coordinate.split(",").map(Number);
            this.emitBrowserAction({
              action: "click",
              params: { x, y },
            });
            this.consoleService.emitConsoleEvent(
              "info",
              `Click event at coordinates (${x}, ${y})`,
            );
          } else {
            clearTimeoutAndReject(
              new Error("Click action requires coordinates"),
            );
          }
          break;

        case "doubleclick":
          if (coordinate) {
            const [x, y] = coordinate.split(",").map(Number);
            this.emitBrowserAction({
              action: "doubleClick",
              params: { x, y },
            });
            this.consoleService.emitConsoleEvent(
              "info",
              `Double click event at coordinates (${x}, ${y})`,
            );
          } else {
            clearTimeoutAndReject(
              new Error("Double click action requires coordinates"),
            );
          }
          break;

        case "type":
          if (text) {
            this.emitBrowserAction({
              action: "type",
              params: { text },
            });
            this.consoleService.emitConsoleEvent(
              "info",
              `Type action: ${text}`,
            );

            // After typing, automatically check for loading indicators
            // This helps with form submissions that might happen after typing
            setTimeout(() => {
              this.emitBrowserAction({
                action: "detectLoading",
                params: {
                  selectors: this._loadingDetectionConfig.loadingIndicators,
                  afterAction: true
                },
              });
            }, 300);
          } else {
            clearTimeoutAndReject(new Error("Type action requires text"));
          }
          break;

        case "keypress":
          console.log("Key press action: ", text, action);
          if (text) {
            this.emitBrowserAction({
              action: "keyPress",
              params: { key: text },
            });
            this.consoleService.emitConsoleEvent(
              "info",
              `Key press action: ${text}`,
            );
          }
          break;

        case "hover":
          if (coordinate) {
            const [x, y] = coordinate.split(",").map(Number);
            this.emitBrowserAction({
              action: "hover",
              params: { x, y },
            });
            this.consoleService.emitConsoleEvent(
              "info",
              `Hover event at coordinates (${x}, ${y})`,
            );
          } else {
            clearTimeoutAndReject(
              new Error("Hover action requires coordinates"),
            );
          }
          break;

        case "scrollDown":
        case "scrollUp":
          const direction = action.toLowerCase() === "scrolldown" ? "down" : "up";
          this.emitBrowserAction({
            action: action,
            params: {},
          });
          this.consoleService.emitConsoleEvent("info", `Scroll ${direction}`);
          break;

        case "close":
          this.cleanup();
          this.consoleService.emitConsoleEvent("info", "Browser closed");
          clearTimeoutAndResolve();
          break;

        case "submit":
          // Submit form and wait for loading to complete
          this.emitBrowserAction({
            action: "submit",
            params: coordinate ? { selector: coordinate } : {},
          });
          this.consoleService.emitConsoleEvent("info", "Form submission action sent");

          // Automatically check for loading after submission
          setTimeout(() => {
            this.emitBrowserAction({
              action: "detectLoading",
              params: {
                selectors: this._loadingDetectionConfig.loadingIndicators,
                afterAction: true
              },
            });
          }, 300);
          break;

        default:
          clearTimeoutAndReject(new Error(`Unknown action: ${action}`));
      }

      // Set a timeout to reject the promise if 'action_performed' is not received
      // This ensures that the action doesn't hang indefinitely if there's no response
      timeoutId = setTimeout(() => {
        socket.off("action_performed", actionPerformedHandler);
        clearTimeoutAndReject(new Error("Action timed out"));
        this.consoleService.emitConsoleEvent("error", `Action timed out`);
      }, 5_000);
    });
  }
}

export default UIInteractionService;
