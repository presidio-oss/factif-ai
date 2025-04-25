import { KeyboardEvent, useRef, useState } from "react";
import { ChatInputProps } from "../../types/chat.types";
import { SendIcon } from "../Icons/SendIcon";
import { StopIcon } from "../Icons/StopIcon";
import { Textarea, Button } from "@nextui-org/react";
import { useAppContext } from "../../contexts/AppContext";

export const ChatInput = ({
  onSendMessage,
  isStreaming,
  onStopStreaming,
}: ChatInputProps) => {
  const { hasActiveAction } = useAppContext();
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isStreaming) {
      onSendMessage(trimmedMessage);
      setMessage("");
      // Refocus the input after sending
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      <div className="py-4">
        <div className="flex gap-2 items-center">
          <Textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) =>
              handleKeyPress(e as KeyboardEvent<HTMLTextAreaElement>)
            }
            placeholder={
              isStreaming ? "Waiting for response..." : "Type a message..."
            }
            classNames={{
              base: "min-h-12",
              input: [
                "text-foreground",
                "placeholder:text-foreground-500",
                "!text-base",
              ],
              inputWrapper: [
                "min-h-12",
                "bg-content2/50",
                "hover:bg-content2",
                "group-data-[focused=true]:bg-content2",
                "!cursor-text",
                "transition-colors",
                "!border-content3",
                isStreaming ? "opacity-50" : "",
              ],
            }}
            variant="bordered"
            radius="lg"
            isDisabled={isStreaming}
            fullWidth
            minRows={1}
            maxRows={6}
          />
          <Button
            onPress={isStreaming ? onStopStreaming : handleSendMessage}
            isDisabled={
              (!isStreaming && !message.trim()) ||
              (isStreaming && hasActiveAction)
            }
            className={`h-12 w-12 min-w-[48px] ${
              isStreaming
                ? "bg-danger/20 hover:bg-danger/30 text-danger border border-danger/50"
                : ""
            }`}
            color={isStreaming ? "danger" : "primary"}
            variant={isStreaming ? "flat" : "solid"}
            isIconOnly
            radius="lg"
            title={
              isStreaming
                ? hasActiveAction
                  ? "Cannot stop during action execution"
                  : "Stop generating"
                : "Send message"
            }
            size="lg"
          >
            {isStreaming ? <StopIcon /> : <SendIcon />}
          </Button>
        </div>
      </div>
    </>
  );
};
