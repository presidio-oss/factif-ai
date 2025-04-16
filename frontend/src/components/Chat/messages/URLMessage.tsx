import { useEffect, useRef, useState } from "react";
import SocketService from "@/services/socketService";
import UIInteractionService from "@/services/uiInteractionService";
import { LoadingSpinner } from "./LoadingSpinner";
import { useAppContext } from "@/contexts/AppContext";

interface URLMessageProps {
  content: string;
  addSystemMessage: (text: string) => void;
  onSendMessage: (
    message: string,
    isAutomatic?: boolean,
    sendToBackend?: boolean,
    isComputerUse?: boolean,
    imageData?: string,
  ) => Promise<void>;
}

export const URLMessage = ({
  content,
  addSystemMessage,
  onSendMessage,
}: URLMessageProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const successMessageSent = useRef(false);
  const hasOpenedUrl = useRef(false);
  const { isChatStreaming } = useAppContext();
  const messageToSend = useRef<string | null>(null);

  // First useEffect to handle the URL opening
  useEffect(() => {
    if (!hasOpenedUrl.current && !isSuccess) {
      const browserService = UIInteractionService.getInstance();
      // Check if we're already in an active chat with a browser running
      // Only change the source if we're not in an active chat or if the browser isn't started
      if (!isChatStreaming || !browserService.isBrowserStarted()) {
        console.log("Opening URL in browser:", content);
        browserService.handleSourceChange("chrome-puppeteer", content);
      } else {
        console.log("Browser already running, not reinitializing for URL:", content);
        // Still mark as opened to prevent repeated attempts
        setIsLoading(false);
        setIsSuccess(true);
        successMessageSent.current = true;
      }
      hasOpenedUrl.current = true;
    }
  }, [content, isSuccess, isChatStreaming]);

  // Second useEffect to handle socket events
  useEffect(() => {
    if (isSuccess) return;

    const socketService = SocketService.getInstance();
    const socket = socketService.getSocket();

    if (socket) {
      const handleBrowserStarted = async () => {
        if (!successMessageSent.current) {
          setIsLoading(false);
          setIsSuccess(true);
          messageToSend.current = `The URL ${content} has been opened successfully. Please proceed with the next step.`;
          if (!isChatStreaming) {
            await onSendMessage(messageToSend.current, true, true, false);
            messageToSend.current = null;
          }
          successMessageSent.current = true;
        }
      };

      socket.on("browser-started", handleBrowserStarted);

      socket.on("browser-error", async ({ message }: { message: string }) => {
        setIsLoading(false);
        setIsSuccess(false);
        await onSendMessage(
          `Failed to open URL: ${content}. Error: ${message}`,
          true,
          false,
          false,
        );
      });

      return () => {
        socket.off("browser-started", handleBrowserStarted);
        socket.off("browser-error");
      };
    }
  }, [content, addSystemMessage, onSendMessage, isSuccess, isChatStreaming]);

  // Third useEffect to handle the case when isChatStreaming becomes false
  useEffect(() => {
    if (!isChatStreaming && messageToSend.current) {
      onSendMessage(messageToSend.current, true, true, false).then((_) => {
        messageToSend.current = null;
      });
    }
  }, [isChatStreaming, onSendMessage]);

  return (
    <div className="my-2 p-3 bg-blue-900/50 border border-blue-500 rounded-lg shadow-lg">
      <div className="flex items-center gap-2 mb-2 text-blue-300 border-b border-blue-500/50 pb-2">
        <span className="text-xl">🔗</span>
        <span className="font-semibold">Opening URL</span>
        {isSuccess && (
          <svg
            className="w-5 h-5 text-green-400 ml-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
      <p className="text-blue-300 font-mono break-all m-0">{content}</p>
      {isLoading && !isSuccess && (
        <div className="mt-3 pt-3 border-t border-blue-500/50">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
};
