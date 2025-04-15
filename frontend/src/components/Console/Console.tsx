import { useCallback, useEffect, useRef, useState } from "react";
import SocketService from "../../services/socketService";

interface ConsoleLog {
  type: string;
  message: string;
  timestamp: string;
}

interface ConsoleProps {
  className?: string;
}

export const Console = ({ className = "" }: ConsoleProps) => {
  const consoleRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [height, setHeight] = useState(300); // Default height in pixels
  const socketService = SocketService.getInstance();
  const source = socketService.getSource();

  const clearConsole = useCallback(() => {
    setConsoleLogs([
      {
        type: "info",
        message: "Console cleared",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging && consoleRef.current) {
        const parentHeight =
          consoleRef.current.parentElement?.clientHeight || 0;
        const mouseY = e.clientY;
        const parentRect =
          consoleRef.current.parentElement?.getBoundingClientRect();
        const parentBottom = parentRect ? parentRect.bottom : 0;

        const newHeight = parentBottom - mouseY;
        // Limit height between 100px and 80% of parent height
        const maxHeight = parentHeight * 0.8;
        setHeight(Math.max(100, Math.min(newHeight, maxHeight)));
      }
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    // Clear logs when component mounts or source changes
    setConsoleLogs([]);

    // Add initial log
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs([
      {
        type: "info",
        message: "Console initialized",
        timestamp,
      },
    ]);

    // Initialize socket and listen for browser-console events
    const socket = socketService.connect();

    socket.on("browser-console", (log: { type: string; message: string }) => {
      const timestamp = new Date().toLocaleTimeString();
      setConsoleLogs((prev) => [...prev, { ...log, timestamp }]);
    });

    // Subscribe to browser console events from other parts of the app
    const handleBrowserConsole = (
      event: CustomEvent<{ type: string; message: string }>,
    ) => {
      const timestamp = new Date().toLocaleTimeString();
      setConsoleLogs((prev) => [...prev, { ...event.detail, timestamp }]);
    };

    window.addEventListener(
      "browser-console",
      handleBrowserConsole as EventListener,
    );

    return () => {
      window.removeEventListener(
        "browser-console",
        handleBrowserConsole as EventListener,
      );
      socket.off("browser-console");
      socketService.disconnect(); // Properly disconnect before reconnecting
    };
  }, [source]); // Add source as dependency to re-establish connection when source changes

  const getFormattedLogs = () => {
    return consoleLogs.map((log, index) => {
      const logStyle =
        log.type === "error"
          ? "text-danger"
          : log.type === "warning"
            ? "text-warning"
            : "text-foreground/90";

      return (
        <div
          key={index}
          className={`${logStyle} font-mono flex justify-start py-1`}
        >
          <span className="text-foreground/50">[{log.timestamp}]</span>
          <span className="text-foreground/60 mx-2">[{log.type}]</span>
          <span className="break-all">{log.message}</span>
        </div>
      );
    });
  };

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  return (
    <div
      ref={consoleRef}
      className={`relative bg-background ${className}`}
      style={{ height: `${height}px` }}
    >
      {/* Drag handle inside the console */}
      <div className="absolute inset-x-0 top-0 h-2">
        <div
          className="absolute inset-x-0 top-0 h-2 cursor-ns-resize group"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute left-1/2 top-2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-1">
            <div className="w-1 h-1 rounded-full bg-foreground/40"></div>
            <div className="w-1 h-1 rounded-full bg-foreground/40"></div>
            <div className="w-1 h-1 rounded-full bg-foreground/40"></div>
          </div>
        </div>
      </div>

      {/* Console header */}
      <div className="absolute top-2 inset-x-0 px-6 pt-1 pr-4 flex justify-between items-center">
        <h2 className="text-foreground text-sm font-semibold">Console</h2>
        <button
          onClick={clearConsole}
          className="w-6 h-6 flex items-center justify-center text-foreground/60 hover:text-foreground bg-content2 hover:bg-content3 rounded transition-colors"
          title="Clear console"
        >
          ⌫
        </button>
      </div>

      {/* Console content */}
      <div
        ref={scrollContainerRef}
        className="absolute inset-x-0 top-12 px-6 py-3 bg-content1 left-4 right-4 rounded bottom-4
          overflow-y-auto overflow-x-hidden
          [&::-webkit-scrollbar]:w-2
          [&::-webkit-scrollbar-track]:bg-background
          [&::-webkit-scrollbar-thumb]:bg-content3
          [&::-webkit-scrollbar-thumb]:rounded
          [&::-webkit-scrollbar-thumb:hover]:bg-content4"
      >
        <div className="font-mono text-sm text-foreground/90">
          {getFormattedLogs()}
        </div>
      </div>

      {isDragging && <div className="fixed inset-0 z-50 cursor-ns-resize" />}
    </div>
  );
};
