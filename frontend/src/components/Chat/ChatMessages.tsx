import { ChatMessage } from "@/types/chat.types.ts";
import { ThinkingAnimation } from "./messages/ThinkingAnimation";
import { Message } from "./messages/Message";
import { useAppContext } from "../../contexts/AppContext";

interface ChatMessagesProps {
  messages: ChatMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessages = ({
  messages,
  messagesEndRef,
}: ChatMessagesProps) => {
  const { isChatStreaming, hasActiveAction } = useAppContext();

  return (
    <div className="flex-1 py-4 overflow-auto space-y-4">
      {messages.map((msg, i) => (
        <Message
          key={i}
          text={msg.text}
          isUser={msg.isUser}
          isPartial={msg.isPartial}
        />
      ))}
      {(isChatStreaming || hasActiveAction) && (
        <div className="flex justify-start">
          <ThinkingAnimation hasActiveAction={hasActiveAction}/>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
