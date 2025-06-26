import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { useAppContext } from "../../contexts/AppContext";
import { useChat } from "../../hooks/useChat";
import { Button } from "@nextui-org/react";
import { Suggestions } from "./components/Suggestions";
import ModeService from "../../services/modeService";

export const Chat = () => {
  const navigate = useNavigate();
  const {
    currentChatId,
    setCurrentChatId,
    isChatStreaming,
    setHasActiveAction,
    setCost,
    cost,
  } = useAppContext();
  const { messages, sendMessage, clearChat, messagesEndRef, stopStreaming } =
    useChat();
  const initialLoadRef = useRef(true);

  // Reset context when component first mounts to ensure a fresh start
  useEffect(() => {
    const initializeChat = async () => {
      if (initialLoadRef.current) {
        try {
          setHasActiveAction(true);
          await ModeService.resetContext("regression");
          setCost(0);
          console.log("Context reset on Chat component mount");
          initialLoadRef.current = false;
        } catch (error) {
          console.error("Failed to reset context on component mount:", error);
        } finally {
          setHasActiveAction(false);
        }
      }
    };

    initializeChat();
  }, [setHasActiveAction]);

  useEffect(() => {
    if (!currentChatId) {
      setCurrentChatId(`#${Date.now()}`);
    }
  }, [currentChatId, setCurrentChatId]);

  const handleSendMessage = (message: string) => {
    sendMessage(message, true);
  };

  const handleClearChat = () => {
    clearChat();
    setCurrentChatId(`#${Date.now()}`);
  };

  const hasUserInteraction = messages.some((msg) => msg.isUser);

  return (
    <div className="h-full flex flex-col">
      <div className="h-[72px] px-6 border-b border-content3 bg-background flex items-center">
        <div className="flex justify-between items-center w-full">
          <div className="flex flex-col items-start">
            <h2 className="text-foreground text-lg font-normal mb-0.5">Chat</h2>
            {currentChatId && (
              <span className="text-xs text-foreground/60">
                {currentChatId}
              </span>
            )}
          </div>
          <div className="flex gap-2 items-center">
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
              onPress={() => navigate("/explore-mode")}
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
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
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
                <Suggestions onSendMessage={handleSendMessage} />
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
