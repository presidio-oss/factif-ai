import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../services/api";
import { ChatMessage, OmniParserResult } from "../types/chat.types";
import { useAppContext } from "../contexts/AppContext";
import { MessageProcessor } from "../services/messageProcessor";

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const {
    isChatStreaming,
    setIsChatStreaming,
    setHasActiveAction,
    folderPath,
    currentChatId,
    streamingSource,
    saveScreenshots,
  } = useAppContext();

  // Initialize MessageProcessor with setHasActiveAction
  useEffect(() => {
    MessageProcessor.initialize(setHasActiveAction);
  }, [setHasActiveAction]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasPartialMessage = useRef(false);
  const activeMessageId = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const isProcessing = useRef(false);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset streaming state only on unmount
  useEffect(() => {
    return () => {
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      setIsChatStreaming(false);
    };
  }, []); // Empty dependency array means this only runs on unmount

  const addMessage = (newMessage: ChatMessage) => {
    setMessages((prev) => {
      // Check if message already exists to prevent duplicates
      const messageExists = prev.some(
        (msg) =>
          msg.text === newMessage.text &&
          msg.isUser === newMessage.isUser &&
          msg.timestamp.getTime() === newMessage.timestamp.getTime(),
      );
      if (messageExists) return prev;
      const newMessages = [...prev, newMessage];
      messagesRef.current = newMessages;
      return newMessages;
    });
  };

  const updateLastMessage = (
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      const updatedMessage = updater(lastMessage);

      // Only update if there's an actual change
      if (JSON.stringify(lastMessage) === JSON.stringify(updatedMessage)) {
        return prev;
      }

      newMessages[newMessages.length - 1] = updatedMessage;
      messagesRef.current = newMessages;
      return newMessages;
    });
  };

  const [latestOmniParserResult, setLatestOmniParserResult] =
    useState<OmniParserResult | null>(null);

  const handleChatMessage = async (
    currentMessage: string,
    imageData?: string,
    omniParserResult?: OmniParserResult,
  ) => {
    // Prevent multiple simultaneous chat messages
    if (isProcessing.current) return;
    isProcessing.current = true;

    const messageHistory = messagesRef.current.filter((msg) => !msg.isPartial);

    let fullResponse = "";

    // Generate unique ID for this message
    const messageId = `msg_${Date.now()}`;
    activeMessageId.current = messageId;
    setIsChatStreaming(true);

    try {
      await sendChatMessage(
        currentMessage,
        imageData,
        messageHistory,
        folderPath,
        currentChatId,
        streamingSource,
        // onChunk
        (chunk: string) => {
          // Ignore chunks if this isn't the active message
          if (!chunk.trim() || activeMessageId.current !== messageId) return;

          fullResponse += chunk;

          if (
            !hasPartialMessage.current &&
            activeMessageId.current === messageId
          ) {
            // For the first chunk, create a new message
            hasPartialMessage.current = true;
            addMessage({
              text: fullResponse,
              timestamp: new Date(),
              isUser: false,
              isPartial: true,
              isHistory: false,
            });
          } else {
            // For subsequent chunks, update the last message
            updateLastMessage((msg) => ({
              ...msg,
              text: fullResponse,
            }));
          }
        },
        // onComplete
        async () => {
          // Only process completion if this is still the active message
          if (activeMessageId.current === messageId) {
            hasPartialMessage.current = false;
            updateLastMessage((msg) => ({
              ...msg,
              isPartial: false,
            }));

            // Process for any actions
            const processedResponse = await MessageProcessor.processMessage(
              fullResponse,
              streamingSource,
            );

            if (processedResponse.actionResult) {
              // Update omni parser result if present
              if (processedResponse.omniParserResult) {
                setLatestOmniParserResult(processedResponse.omniParserResult);
              }

              // First mark the current response as complete and non-partial
              updateLastMessage((msg) => ({
                ...msg,
                isPartial: false,
                isHistory: true, // Mark as history since we'll be sending it in the next request
              }));

              // Add action result as a system message
              addMessage({
                text: processedResponse.actionResult,
                timestamp: new Date(),
                isUser: false,
                isHistory: false,
              });

              // Reset processing flag before recursive call
              isProcessing.current = false;

              console.log("Action result:", processedResponse.actionResult);
              await handleChatMessage(
                processedResponse.actionResult,
                imageData,
                processedResponse.omniParserResult, // Pass the omniParserResult to the next call
              );
            } else {
              // Mark message as history even when there's no action
              updateLastMessage((msg) => ({
                ...msg,
                isPartial: false,
                isHistory: true,
              }));
              setIsChatStreaming(false);
              activeMessageId.current = null;
              isProcessing.current = false;
            }
          }
        },
        // onError
        (error: Error) => {
          console.error("Chat Error:", error);
          if (activeMessageId.current === messageId) {
            setIsChatStreaming(false);
            hasPartialMessage.current = false;
            activeMessageId.current = null;
            isProcessing.current = false;

            // If we have a partial message, mark it as complete
            if (messagesRef.current.some((m) => m.isPartial)) {
              updateLastMessage((msg) => ({
                ...msg,
                isPartial: false,
              }));
            }

            addMessage({
              text: "Sorry, there was an error processing your message.",
              timestamp: new Date(),
              isUser: false,
              isHistory: false,
            });
          }
        },
        omniParserResult || latestOmniParserResult, // Use provided result or latest state
        saveScreenshots,
      );
    } catch (error) {
      console.error("Chat Error:", error);
      if (activeMessageId.current === messageId) {
        setIsChatStreaming(false);
        hasPartialMessage.current = false;
        activeMessageId.current = null;
        isProcessing.current = false;

        // If we have a partial message, mark it as complete
        if (messagesRef.current.some((m) => m.isPartial)) {
          updateLastMessage((msg) => ({
            ...msg,
            isPartial: false,
          }));
        }

        addMessage({
          text: "Sorry, there was an error processing your message.",
          timestamp: new Date(),
          isUser: false,
          isHistory: false,
        });
      }
    }
  };

  const sendMessage = async (
    message: string,
    sendToBackend: boolean = true,
    imageData?: string,
  ) => {
    if (!message.trim() || isChatStreaming) return;

    // Add the user message to chat
    addMessage({
      text: message,
      timestamp: new Date(),
      isUser: true,
      isHistory: true, // Mark user messages as history since they should be included in future requests
    });

    // Send to backend if needed
    if (sendToBackend) {
      await handleChatMessage(message, imageData);
      // Reset omni parser result after sending
      setLatestOmniParserResult(null);
    }
  };

  const clearChat = () => {
    if (!isChatStreaming) {
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      isProcessing.current = false;
      messagesRef.current = [];
      setMessages([]);
    }
  };

  const stopStreaming = () => {
    if (isChatStreaming) {
      activeMessageId.current = null;
      hasPartialMessage.current = false;
      isProcessing.current = false;
      setIsChatStreaming(false);

      // Mark any partial message as complete
      if (messagesRef.current.some((m) => m.isPartial)) {
        updateLastMessage((msg) => ({
          ...msg,
          isPartial: false,
          isHistory: true,
        }));
      }
    }
  };

  return {
    messages,
    sendMessage,
    clearChat,
    messagesEndRef,
    stopStreaming,
    latestOmniParserResult,
  };
};
