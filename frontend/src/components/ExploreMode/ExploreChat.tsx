import { useEffect } from "react";
import { ChatInput } from "../Chat/ChatInput";
import { ChatMessages } from "../Chat/ChatMessages";
import { useAppContext } from "@/contexts/AppContext";
import { useExploreChat } from "@/hooks/useExploreChat";
import { Button } from "@nextui-org/react";
import { Suggestion, Suggestions } from "../Chat/components/Suggestions";

export const ExploreChat = () => {
  const { currentChatId, setCurrentChatId, isChatStreaming, type } =
    useAppContext();
  const { messages, sendMessage, clearChat, messagesEndRef, stopStreaming } =
    useExploreChat();

  useEffect(() => {
    if (!currentChatId) {
      setCurrentChatId(`#${Date.now()}`);
    }
  }, [currentChatId, setCurrentChatId]);

  const handleSendMessage = (message: string) => {
    sendMessage(message, true, type).then();
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
            <h2 className="text-foreground text-lg font-normal mb-0.5">
              Explore Chat
            </h2>
            {currentChatId && (
              <span className="text-xs text-foreground/60">
                {currentChatId}
              </span>
            )}
          </div>
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
      <div className="border-t border-content3 px-6">
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
    prompt: "Explore https://wikipedia.org and document the features and links",
  },
  {
    type: "explore",
    title: "Explore Ecommerce Site",
    description: "Explore all the features and links on saucedemo.com",
    prompt: "Explore https://www.saucedemo.com/ and document the features and links",
  },
];
