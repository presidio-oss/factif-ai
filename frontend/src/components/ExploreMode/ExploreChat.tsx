import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChatInput } from "../Chat/ChatInput";
import { ChatMessages } from "../Chat/ChatMessages";
import { useAppContext } from "@/contexts/AppContext";
import { useExploreModeContext } from "@/contexts/ExploreModeContext";
import { useExploreChat } from "@/hooks/useExploreChat";
import ModeService from "@/services/modeService";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@nextui-org/react";
import { Suggestion, Suggestions } from "../Chat/components/Suggestions";
import RecentChats from "./RecentChats";
import { emergencyStorageCleanup } from "@/utils/storageCleanup";

export const ExploreChat = () => {
  const navigate = useNavigate();
  const {
    currentChatId,
    setCurrentChatId,
    isChatStreaming,
    type,
    setHasActiveAction,
    setCost,
    cost,
  } = useAppContext();
  const { showRecentChats, setShowRecentChats } = useExploreModeContext();
  const { messages, sendMessage, clearChat, messagesEndRef, stopStreaming } =
    useExploreChat();
  const initialLoadRef = useRef(true);

  // State for storage warning modal
  const [isStorageWarningOpen, setIsStorageWarningOpen] = useState(false);
  const [cleanupItemsCount, setCleanupItemsCount] = useState(0);

  // Reset context when component first mounts to ensure a fresh start
  useEffect(() => {
    const initializeExploreChat = async () => {
      if (initialLoadRef.current) {
        try {
          setHasActiveAction(true);
          await ModeService.resetContext("explore");
          setCost(0);
          console.log("Context reset on ExploreChat component mount");
          initialLoadRef.current = false;
        } catch (error) {
          console.error(
            "Failed to reset explore context on component mount:",
            error,
          );
        } finally {
          setHasActiveAction(false);
        }
      }
    };

    initializeExploreChat();
  }, [setHasActiveAction]);

  useEffect(() => {
    if (!currentChatId) {
      setCurrentChatId(`#${Date.now()}`);
    }

    // Set up error listener for quota exceeded errors
    const handleStorageError = (event: ErrorEvent) => {
      // Check if the error is related to localStorage quota
      if (
        event.message.includes("QuotaExceededError") ||
        event.message.includes("exceeded the quota") ||
        event.message.includes("QUOTA_EXCEEDED_ERR")
      ) {
        console.warn("Storage quota exceeded, performing emergency cleanup");

        // Run the emergency cleanup
        const count = emergencyStorageCleanup();
        setCleanupItemsCount(count);

        // Show the warning modal
        setIsStorageWarningOpen(true);
      }
    };

    // Add event listener
    window.addEventListener("error", handleStorageError);

    return () => {
      // Remove event listener on cleanup
      window.removeEventListener("error", handleStorageError);
    };
  }, [currentChatId, setCurrentChatId]);

  const handleSendMessage = (message: string) => {
    sendMessage(message, true, type).then();
  };

  const handleClearChat = () => {
    clearChat();
    setCost(0);
    setCurrentChatId(`#${Date.now()}`);
  };

  const hasUserInteraction = messages.some((msg) => msg.isUser);

  // Toggle Recent Chats panel
  const toggleRecentChats = () => {
    setShowRecentChats(!showRecentChats);
  };

  // Manual storage cleanup handler
  const handleManualCleanup = () => {
    const count = emergencyStorageCleanup();
    setCleanupItemsCount(count);
    setIsStorageWarningOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="h-[72px] px-6 border-b border-content3 bg-background flex items-center">
        <div className="flex justify-between items-center w-full">
          <div className="flex flex-col items-start">
            <h2 className="text-foreground text-lg font-normal mb-0.5">
              Explore Chat
            </h2>
            {currentChatId && (
              <span className="text-xs text-foreground/60">
                {currentChatId}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Button
              onPress={toggleRecentChats}
              isDisabled={isChatStreaming}
              color="default"
              variant="bordered"
              size="sm"
              isIconOnly
              className="min-w-unit-8 w-8 h-8"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </Button>
            <Button
              onPress={handleClearChat}
              isDisabled={isChatStreaming}
              color="default"
              variant="bordered"
              size="sm"
              isIconOnly
              className="min-w-unit-8 w-8 h-8"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </Button>

            <Button
              size="sm"
              color="primary"
              variant="flat"
              isIconOnly
              isDisabled={isChatStreaming}
              onPress={() => navigate("/")}
              className="h-8 w-8 min-w-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </Button>
            <Button
              onPress={handleManualCleanup}
              isDisabled={isChatStreaming}
              color="warning"
              variant="flat"
              size="sm"
              className="min-w-unit-16 hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clean Storage
            </Button>
          </div>
        </div>
      </div>

      {/* Storage Warning Modal */}
      <Modal
        isOpen={isStorageWarningOpen}
        onClose={() => setIsStorageWarningOpen(false)}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            Storage Quota Warning
          </ModalHeader>
          <ModalBody>
            <p>
              Your browser storage quota was exceeded. This usually happens when
              exploring many pages with large images and screenshots.
            </p>
            <p className="mt-2">
              {cleanupItemsCount > 0
                ? `We've automatically cleaned up ${cleanupItemsCount} items from your storage.`
                : "We've attempted to clean up your storage."}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              onPress={() => setIsStorageWarningOpen(false)}
            >
              Got it
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Recent Chats Modal */}
      {showRecentChats && <RecentChats clearChat={clearChat} />}
      <div className="flex-1 relative overflow-hidde bg-background">
        <div className="absolute inset-0">
          <div className="h-full overflow-y-auto">
            <div className="px-6">
              <ChatMessages
                messages={messages}
                messagesEndRef={messagesEndRef}
              />
            </div>
            {!hasUserInteraction && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <Suggestions
                  title="What would you like to explore?"
                  footerText="or enter your own site you like to explore"
                  suggestions={ExploreModeSuggestions}
                  onSendMessage={handleSendMessage}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {cost > 0 && (
        <div
          className={
            "hidden flex items-center justify-start text-orange-500 text-left px-4 py-1 border-t-1 border-content3 bg-[#242121]"
          }
        >
          Cost: ${cost.toFixed(4)}
        </div>
      )}
      <div className="border-t border-content3 px-4">
        <ChatInput
          onSendMessage={handleSendMessage}
          isStreaming={isChatStreaming}
          onStopStreaming={stopStreaming}
        />
      </div>
    </div>
  );
};

export const ExploreModeSuggestions: Suggestion[] = [
  {
    type: "explore",
    title: "Explore Wikipedia",
    description: "Explore all the features and links on wikipedia.org",
    prompt: "Launch https://wikipedia.org",
  },
  {
    type: "explore",
    title: "Explore Ecommerce Site",
    description: "Explore all the features and links on saucedemo.com",
    prompt: "Launch https://www.saucedemo.com",
  },
];
