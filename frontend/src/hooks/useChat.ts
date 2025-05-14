import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../services/api";
import { ChatMessage, OmniParserResult } from "../types/chat.types";
import { useAppContext } from "../contexts/AppContext";
import { MessageProcessor } from "../services/messageProcessor";
import ModeService from "../services/modeService";

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
    setCost,
    secrets
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
  
  // Track current chat ID changes to reset context when a new chat is created
  const prevChatIdRef = useRef(currentChatId);
  useEffect(() => {
    const resetContextForNewChat = async () => {
      // Only run on chat ID changes (not first load)
      if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
        console.log(`Chat ID changed from ${prevChatIdRef.current} to ${currentChatId}, resetting context`);
        try {
          setHasActiveAction(true);
          await ModeService.resetContext("regression");
          console.log("Context reset for new chat session");
        } catch (error) {
          console.error("Failed to reset context for new chat session:", error);
        } finally {
          setHasActiveAction(false);
        }
      }
      prevChatIdRef.current = currentChatId;
    };
    
    resetContextForNewChat();
  }, [currentChatId, setHasActiveAction]);

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
        async (cost: number) => {
          console.log('cost ==>', cost);
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
              secrets
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

              // Reset context when a chat interaction completes to ensure next chat starts fresh
              try {
                // Only reset if there's no action to handle (actions will have their own flow)
                if (!processedResponse.actionResult) {
                  console.log("Chat interaction complete, resetting context for next interaction");
                  await ModeService.resetContext("regression");
                  console.log("Context reset after chat completion");
                  
                  // Reset first message flag so next message will be treated as a fresh start
                  isFirstMessageRef.current = true;
                }
              } catch (error) {
                console.error("Failed to reset context after chat completion:", error);
              }
              
              setIsChatStreaming(false);
              activeMessageId.current = null;
              isProcessing.current = false;
            }
          }
          cost > -1 && setCost((prev: number)=> prev + cost);
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

  // Track if this is the first message in the chat
  const isFirstMessageRef = useRef(true);

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
      // If this is the first message of the session, ensure context is reset
      if (isFirstMessageRef.current && messagesRef.current.length <= 1) {
        console.log("First message in chat session, ensuring fresh context");
        try {
          setHasActiveAction(true);
          await ModeService.resetContext("regression");
          console.log("Context reset before first message");
        } catch (error) {
          console.error("Failed to reset context before first message:", error);
        } finally {
          setHasActiveAction(false);
          // Mark that we've sent the first message
          isFirstMessageRef.current = false;
        }
      }
      
      await handleChatMessage(message, imageData);
      // Reset omni parser result after sending
      setLatestOmniParserResult(null);
    }
  };

  const clearChat = async () => {
    if (!isChatStreaming) {
      try {
        setHasActiveAction(true);
        setCost(0)
        // Reset LLM context in the backend to ensure a fresh start
        await ModeService.resetContext("regression");
        console.log("Context reset for new chat");
      } catch (error) {
        console.error("Failed to reset context for new chat:", error);
      } finally {
        setHasActiveAction(false);
      }

      // Clear local state
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
