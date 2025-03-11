import { useEffect, useRef, useState } from "react";
import { getCurrentUrl, executeAction, sendExploreChatMessage } from "../services/api";
import { ChatMessage, OmniParserResult } from "../types/chat.types";
import { useAppContext } from "@/contexts/AppContext";
import { useExploreModeContext } from "@/contexts/ExploreModeContext";
import { MessageProcessor } from "../services/messageProcessor";
import SocketService from "../services/socketService";
import UIInteractionService from "../services/uiInteractionService";
import {
  IExploredClickableElement,
  IExploreGraphData,
  IExploreQueueItem,
} from "@/types/message.types";
import { updateCurrentSession, getSession, getSessionsList } from "@/utils/exploreHistoryManager";
import { 
  safeGetItem, 
  safeSetItem, 
  safeRemoveItem, 
  pruneMessages, 
  removeImageDataFromMessages,
  cleanupOldChats 
} from "@/utils/storageUtil";
import { v4 as uuid } from "uuid";
import { createEdgeOrNode } from "@/utils/graph.util.ts";
import { StreamingSource } from "@/types/api.types.ts";

// Interface for screenshot data structure
interface IProcessedScreenshot {
  image: string;
  inference?: any[];
  totalScroll?: number;
  scrollPosition?: number;
  originalImage?: string;
}

export const useExploreChat = () => {
  const {
    isChatStreaming,
    setIsChatStreaming,
    setHasActiveAction,
    folderPath,
    currentChatId,
    setCurrentChatId,
    streamingSource,
    saveScreenshots,
    setType,
  } = useAppContext();

  const { 
    setGraphData, 
    setRecentSessions, 
    setShowRecentChats,
    registerLoadSessionFn
  } = useExploreModeContext();

  // Initialize with empty array, we'll load from localStorage in useEffect
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestOmniParserResult, setLatestOmniParserResult] =
    useState<OmniParserResult | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasPartialMessage = useRef(false);
  const activeMessageId = useRef<string | null>(null);
  const isProcessing = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const exploreQueue = useRef<{ [key in string]: IExploreQueueItem[] }>({});
  const exploreRoute = useRef<string[]>([]);
  const exploreGraphData = useRef<IExploreGraphData>({
    nodes: [],
    edges: [],
  });
  const currentlyExploring = useRef<{
    url: string;
    id: string;
    nodeId: string;
    label: string;
  } | null>(null);

  // Initialize MessageProcessor
  useEffect(() => {
    MessageProcessor.initialize(setHasActiveAction);
  }, [setHasActiveAction]);

  // Load messages from localStorage when component mounts or chatId changes
  useEffect(() => {
    if (currentChatId) {
      const storedMessagesKey = `explore_chat_${currentChatId}`;
      const storedMessages = safeGetItem(storedMessagesKey);
      
      if (storedMessages) {
        try {
          const parsedMessages = JSON.parse(storedMessages);
          // Convert ISO strings back to Date objects
          const processedMessages = parsedMessages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          
          // Only set messages if we have some and if they're different from current state
          if (processedMessages.length > 0) {
            console.log(`Loaded ${processedMessages.length} messages for chat ${currentChatId}`);
            setMessages(processedMessages);
          }
        } catch (error) {
          console.error("Failed to parse stored explore messages:", error);
        }
      }
      
      // Clean up old chats to free space when loading a chat
      cleanupOldChats(currentChatId);
    }
  }, [currentChatId]); // Re-run when chatId changes

  // Keep messagesRef in sync with messages state and save to localStorage
  useEffect(() => {
    messagesRef.current = messages;
    
    // Only save when we have a chat ID and messages
    if (currentChatId && messages.length > 0) {
      const storedMessagesKey = `explore_chat_${currentChatId}`;
      
      // Prune messages to control size
      const prunedMessages = pruneMessages(messages);
      
      // For localStorage storage, remove large image data
      const storageMessages = removeImageDataFromMessages(prunedMessages);
      
      // Try to save to localStorage
      const success = safeSetItem(
        storedMessagesKey, 
        JSON.stringify(storageMessages.map(msg => ({
          ...msg,
          // Convert Date to ISO string for storage
          timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp
        })))
      );
      
      if (!success) {
        console.warn('Failed to save chat messages to localStorage - likely quota exceeded');
      }
        
      // Also save to the session system for automatic persistence
      // Use the original messages for the session (which might be stored differently)
      updateCurrentSession(currentChatId, prunedMessages, exploreGraphData.current);
      
      // Update the sessions list in ExploreModeContext
      setRecentSessions(getSessionsList());
    }
  }, [messages, currentChatId, setRecentSessions]);

  // Reset streaming state only on unmount
  useEffect(() => {
    return () => {
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      setIsChatStreaming(false);
    };
  }, [setIsChatStreaming]);

  // Scroll management
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Message management functions
  const addMessage = (newMessage: ChatMessage) => {
    setMessages((prev) => {
      const messageExists = prev.some(
        (msg) =>
          msg.text === newMessage.text &&
          msg.isUser === newMessage.isUser &&
          msg.timestamp.getTime() === newMessage.timestamp.getTime(),
      );
      if (messageExists) return prev;
      return [...prev, newMessage];
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

      if (JSON.stringify(lastMessage) === JSON.stringify(updatedMessage)) {
        return prev;
      }

      newMessages[newMessages.length - 1] = updatedMessage;
      return newMessages;
    });
  };

  // Error handling
  const handleError = (messageId: string, error: Error) => {
    console.error("Explore Chat Error:", error);
    if (activeMessageId.current === messageId) {
      setIsChatStreaming(false);
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      isProcessing.current = false;

      if (messagesRef.current.some((m) => m.isPartial)) {
        updateLastMessage((msg) => ({ ...msg, isPartial: false }));
      }

      addMessage({
        text: "Sorry, there was an error processing your message.",
        timestamp: new Date(),
        isUser: false,
        isHistory: false,
      });
    }
  };

  const createConstructNode = (
    currentNodeId: string,
    data: { label: string; imageData?: string | IProcessedScreenshot },
  ) => {
    const currentNodelCount = exploreGraphData.current.nodes.length;

    // Process image data based on type
    let processedImageData;
    if (data.imageData) {
      if (typeof data.imageData === "string") {
        // If it's already a string, make sure it has the data URI prefix
        processedImageData = data.imageData.startsWith("data:")
          ? data.imageData
          : `data:image/png;base64,${data.imageData}`;
      } else if (typeof data.imageData === "object" && data.imageData.image) {
        // If it's a screenshot object, extract the base64 image
        processedImageData = `${data.imageData.image}`;
      }
    }

    exploreGraphData.current.nodes.push({
      id: currentNodeId,
      position: { x: 200, y: currentNodelCount * 100 },
      data: {
        label: data.label,
        edges: [],
        imageData: processedImageData,
      },
      type: "pageNode",
    });
    setGraphData(exploreGraphData.current);
    localStorage.setItem("MAP", JSON.stringify(exploreGraphData.current));
  };

  const createEdge = (
    sourceId: string,
    targetId: string,
    edgeId: string,
    label: string,
  ) => {
    exploreGraphData.current.edges.push({
      id: edgeId,
      source: sourceId,
      target: targetId,
      sourceHandle: edgeId,
      type: "bezier",
      label,
    });
    exploreGraphData.current.nodes.map((node) => {
      if (node.id === sourceId) {
        node.data.edges = [...node.data.edges, edgeId];
      }
    });
    setGraphData(exploreGraphData.current);
    localStorage.setItem("MAP", JSON.stringify(exploreGraphData.current));
  };

  const handleEdgeAndNodeCreation = (
    url: string,
    imageData?: string | IProcessedScreenshot,
  ) => {
    const canCreateNode = createEdgeOrNode(exploreGraphData.current.nodes, url);
    const nodeId = !canCreateNode.createNode
      ? (canCreateNode.node?.id as string)
      : uuid();

    // Check if this might be the first node (homepage)
    const isFirstNode = exploreGraphData.current.nodes.length === 0;

    if (canCreateNode.createNode) {
      // Log for debugging first node issue
      if (isFirstNode) {
        console.log("Creating first node (homepage):", {
          url,
          hasImageData: !!imageData,
          imageDataType: imageData ? typeof imageData : "undefined",
        });
      }

      createConstructNode(nodeId, { label: url, imageData });
    } else if (
      isFirstNode &&
      !canCreateNode.node?.data.imageData &&
      imageData
    ) {
      // Special case: If we're not creating a new node because it already exists,
      // but it's the first node and doesn't have image data, update it with the image
      console.log("Updating first node with missing image data");
      exploreGraphData.current.nodes = exploreGraphData.current.nodes.map(
        (node) => {
          if (node.id === nodeId) {
            let processedImageData;
            if (typeof imageData === "string") {
              processedImageData = imageData.startsWith("data:")
                ? imageData
                : `data:image/png;base64,${imageData}`;
            } else if (typeof imageData === "object" && imageData.image) {
              processedImageData = `data:image/png;base64,${imageData.image}`;
            }

            return {
              ...node,
              data: {
                ...node.data,
                imageData: processedImageData,
              },
            };
          }
          return node;
        },
      );
      setGraphData(exploreGraphData.current);
    }

    if (currentlyExploring.current) {
      createEdge(
        currentlyExploring.current.nodeId,
        nodeId,
        currentlyExploring.current.id,
        currentlyExploring.current.label,
      );
    }
    return nodeId;
  };

  const handleQueueUpdate = (
    processedExploreMessage: IExploredClickableElement[],
    fullResponse: string,
    url: string,
    nodeId: string,
    parent: {
      url: string;
      id: string;
      nodeId: string;
    } | null,
    imageData?: string | IProcessedScreenshot,
  ) => {
    // Track if we have valid image data to save with the elements
    let processedImageData: string | undefined;
    if (imageData) {
      if (typeof imageData === "string") {
        processedImageData = imageData;
      } else if (typeof imageData === "object" && imageData.image) {
        processedImageData = imageData.image;
      }
    }

    for (const element of processedExploreMessage) {
      if (element.text && element.coordinates) {
        const elementId = uuid();
        const exploredOutput: IExploreQueueItem = {
          text: element.text,
          coordinates: element.coordinates,
          aboutThisElement: element.aboutThisElement || "",
          source: fullResponse,
          url,
          id: elementId,
          nodeId,
          // Store the screenshot with each element for documentation
          screenshot: processedImageData,
          parent: {
            url: (parent?.url as string) || url,
            nodeId: (parent?.nodeId as string) || nodeId,
            id: (parent?.id as string) || elementId,
          },
        };
        exploreQueue.current[url].push(exploredOutput);
      }
    }
    localStorage.setItem(
      "started_explore",
      JSON.stringify(exploreQueue.current),
    );
  };

  const cleanCompletedQueue = (
    exploredRoutes: string[],
    currentQueue: { [key in string]: IExploreQueueItem[] },
  ): Set<string> => {
    const routeSet = new Set(exploredRoutes);
    console.log(currentQueue);
    // Remove routes that have empty queues
    Object.keys(currentQueue)
      .filter((key) => currentQueue[key].length === 0)
      .forEach((key) => {
        routeSet.delete(key);
      });
    return routeSet;
  };

  // Process explore output
  const processExploreOutput = async (
    fullResponse: string,
    parent: { url: string; id: string; nodeId: string } | null = null,
    streamingSource: StreamingSource,
    imageData?: string | IProcessedScreenshot,
  ) => {
    const processedExploreMessage =
      MessageProcessor.processExploreMessage(fullResponse) || [];
    const routeSet = cleanCompletedQueue(
      exploreRoute.current,
      exploreQueue.current,
    );

    if (processedExploreMessage.length > 0) {
      const url = await getCurrentUrl(streamingSource);

      if (!url) return;
      
      // Always process the elements for the current URL, whether we've seen it before or not
      // This ensures we don't miss any clickable elements on pages we revisit
      if (!exploreQueue.current[url]) {
        exploreQueue.current[url] = [];
      }
      
      // Only add to routeSet if it's a new URL
      if (!routeSet.has(url as string)) {
        routeSet.add(url as string);
        const nodeId = handleEdgeAndNodeCreation(url, imageData);
        handleQueueUpdate(
          processedExploreMessage,
          fullResponse,
          url,
          nodeId,
          parent,
          imageData
        );
      } else if (exploreQueue.current[url].length === 0) {
        // If we've seen this URL before but its queue is empty, update with new elements
        const existingNode = exploreGraphData.current.nodes.find(node => 
          node.data.label === url
        );
        
        if (existingNode) {
          handleQueueUpdate(
            processedExploreMessage,
            fullResponse,
            url,
            existingNode.id,
            parent,
            imageData
          );
          console.log(`Updated elements for existing route: ${url}`);
        }
      }
    }

    exploreRoute.current = [...routeSet];
    return processedExploreMessage.length > 0
      ? processedExploreMessage[0]
      : null;
  };

  const getNextToExplore = () => {
    console.log("exploreRoute.current ===>", exploreRoute.current);
    console.log("exploreQueue.current ===>", exploreQueue.current);
    
    // Try each route in order until we find one with items in its queue
    for (let i = 0; i < exploreRoute.current.length; i++) {
      const route = exploreRoute.current[i];
      if (route && exploreQueue.current[route] && exploreQueue.current[route].length > 0) {
        // Found a route with items to explore
        const nextItem = exploreQueue.current[route].shift();
        if (nextItem) {
          currentlyExploring.current = {
            url: route,
            id: nextItem.id,
            nodeId: nextItem.nodeId,
            label: nextItem.text,
          };
          
          // If this isn't the first route, move it to the front for future checks
          if (i > 0) {
            // Move this route to the front of the array for the next iteration
            exploreRoute.current.splice(i, 1);
            exploreRoute.current.unshift(route);
          }
          
          return nextItem;
        }
      }
    }
    
    // No routes with items to explore found
    console.log("No more items to explore in any route");
    return null;
  };

  // Handle message completion
  const handleMessageCompletion = async (
    messageId: string,
    fullResponse: string,
    imageData?: string | IProcessedScreenshot,
    _omniParserResult?: OmniParserResult,
  ) => {
    if (activeMessageId.current !== messageId) return;

    hasPartialMessage.current = false;
    updateLastMessage((msg) => ({ ...msg, isPartial: false }));

    const processedResponse = await MessageProcessor.processMessage(
      fullResponse,
      streamingSource,
    );

    const exploredOutput = await processExploreOutput(
      fullResponse,
      currentlyExploring.current,
      streamingSource,
      imageData,
    );

    if (
      processedResponse.actionResult ||
      fullResponse.includes("<complete_task>")
    ) {
      if (processedResponse.omniParserResult) {
        setLatestOmniParserResult(processedResponse.omniParserResult);
      }

      updateLastMessage((msg) => ({
        ...msg,
        isPartial: false,
        isHistory: true,
      }));

      processedResponse.actionResult &&
        addMessage({
          text: processedResponse.actionResult,
          timestamp: new Date(),
          isUser: false,
          isHistory: false,
        });

      isProcessing.current = false;

      if (fullResponse.includes("<complete_task>")) {
        setType("explore");
      }

      await handleExploreMessage(
        processedResponse.actionResult
          ? processedResponse.actionResult
          : processedResponse.text,
        fullResponse.includes("<complete_task>") ? "explore" : "action",
        imageData,
        processedResponse.omniParserResult,
      );
    } else if (exploredOutput) {
      await onGettingExploredMode(imageData);
    } else {
      updateLastMessage((msg) => ({
        ...msg,
        isPartial: false,
        isHistory: true,
      }));
      setIsChatStreaming(false);
      activeMessageId.current = null;
      isProcessing.current = false;
    }
  };

  const onGettingExploredMode = async (
    imageData?: string | IProcessedScreenshot,
  ) => {
    const nextElementToVisit = getNextToExplore();
    console.log("nextElementToVisit ===>", nextElementToVisit);
    isProcessing.current = false;
    
    if (nextElementToVisit) {
      setType("action");
      
      // Use the element's saved screenshot if available, otherwise use the current page screenshot
      // This ensures we document the state of the page when the element was found
      const elementScreenshot = nextElementToVisit.screenshot || 
        (typeof imageData === "string" ? imageData : imageData?.image);
      
      // Include a direct instruction to take a screenshot after navigation
      const message = `In ${nextElementToVisit.url} \n Visit ${nextElementToVisit.text} on coordinate : ${nextElementToVisit.coordinates} with about this element : ${nextElementToVisit.aboutThisElement}. After clicking on this element you MUST take a screenshot by performing a click action. This screenshot is important for complete documentation of this feature.`;
      
      addMessage({
        text: message,
        timestamp: new Date(),
        isUser: true,
        isHistory: true, // Mark as history so it's included in persistence
      });
      
      // Pass the element's screenshot to ensure it gets saved
      await handleExploreMessage(message, "action", elementScreenshot || imageData, undefined);
    } else {
      // No more elements to explore
      setIsChatStreaming(false);
      setType("explore"); // Change back to explore mode
      
      // Calculate exploration statistics
      const totalNodes = exploreGraphData.current.nodes.length;
      const totalEdges = exploreGraphData.current.edges.length;
      const uniqueRoutes = Object.keys(exploreQueue.current).length;
      
      // Add completion message
      addMessage({
        text: `✅ Exploration complete! I've visited all accessible links and elements.\n\nSummary:\n- ${totalNodes} pages explored\n- ${totalEdges} links followed\n- ${uniqueRoutes} unique routes discovered\n\nYou can now see the complete site map in the graph view. You can also start a new exploration or ask questions about what I found.`,
        timestamp: new Date(),
        isUser: false,
        isHistory: true,
      });
    }
  };

  // Handle message chunks
  const handleMessageChunk = (
    messageId: string,
    chunk: string,
    fullResponse: string,
  ) => {
    if (!chunk.trim() || activeMessageId.current !== messageId) return;

    if (!hasPartialMessage.current && activeMessageId.current === messageId) {
      hasPartialMessage.current = true;
      addMessage({
        text: fullResponse,
        timestamp: new Date(),
        isUser: false,
        isPartial: true,
        isHistory: false,
      });
    } else {
      updateLastMessage((msg) => ({
        ...msg,
        text: fullResponse,
      }));
    }
  };

  // Main message handling function
  const handleExploreMessage = async (
    currentMessage: string,
    type: string,
    imageData?: string | IProcessedScreenshot,
    omniParserResult?: OmniParserResult,
  ) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    const messageId = `msg_${Date.now()}`;
    activeMessageId.current = messageId;
    setIsChatStreaming(true);

    let fullResponse = "";

    try {
      // Convert imageData to string if it's an IProcessedScreenshot object
      let processedImageData: string | undefined;
      if (imageData) {
        if (typeof imageData === "string") {
          processedImageData = imageData;
        } else if (imageData.image) {
          processedImageData = imageData.image;
        }
      }

      await sendExploreChatMessage(
        currentMessage,
        processedImageData,
        messagesRef.current.filter((msg) => !msg.isPartial),
        type,
        folderPath,
        currentChatId,
        streamingSource,
        (chunk: string) => {
          fullResponse += chunk;
          handleMessageChunk(messageId, chunk, fullResponse);
        },
        (image?: string) =>
          handleMessageCompletion(
            messageId,
            fullResponse,
            image,
            omniParserResult,
          ),
        (error: Error) => handleError(messageId, error),
        omniParserResult || latestOmniParserResult,
        saveScreenshots,
      );
    } catch (error) {
      handleError(messageId, error as Error);
    }
  };

  // Public interface functions
  const sendMessage = async (
    message: string,
    sendToBackend: boolean = true,
    type: string,
    imageData?: string,
  ) => {
    if (!message.trim() || isChatStreaming) return;

    addMessage({
      text: message,
      timestamp: new Date(),
      isUser: true,
      isHistory: true,
    });

    if (sendToBackend) {
      // Check if message contains a URL and is an explore request
      const containsUrl = /(https?:\/\/[^\s'"]+)/i.test(message) || /\b[a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)\b/i.test(message);
      const isExploreRequest = message.toLowerCase().includes("explore") || type === "explore";
      
      // If this seems to be an explore request with a URL, ensure browser is launched
      if (isExploreRequest && containsUrl) {
        try {
          // Extract the URL from the message
          let urlMatch = message.match(/(https?:\/\/[^\s'"]+)/i);
          
          // If no http/https URL, try to detect domain names like example.com
          if (!urlMatch) {
            urlMatch = message.match(/\b([a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)[^\s'"]*)\b/i);
            if (urlMatch) {
              // Prepend https:// to the domain
              urlMatch[1] = `https://${urlMatch[1]}`;
            }
          }
          if (urlMatch && urlMatch[1]) {
            console.log("Auto-launching browser for explore request with URL:", urlMatch[1]);
            
            const socketService = SocketService.getInstance();
            const socket = socketService.getSocket();
            
            // Check if we have a socket but need to auto-launch the browser
            if (socket) {
              // Launch the browser with the extracted URL
              const launchAction = {
                type: "perform_action",
                action: "launch",
                url: urlMatch[1],
              };
              
              try {
                setHasActiveAction?.(true);
                const response = await executeAction(launchAction, streamingSource);
                console.log("Browser auto-launched for explore request");
                
                // After launching, explicitly set the URL in UIInteractionService
                if (response.status === "success") {
                  // Set the URL in UIInteractionService to update the URL bar
                  UIInteractionService.getInstance().handleSourceChange(
                    streamingSource, 
                    urlMatch[1]
                  );
                }
                
                // Wait briefly to ensure the browser is ready
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (error) {
                console.error("Failed to auto-launch browser for explore:", error);
                // Continue with the message even if auto-launch failed
              } finally {
                setHasActiveAction?.(false);
              }
            }
          }
        } catch (error) {
          console.error("Error in auto-launch logic:", error);
        }
      }
      
      await handleExploreMessage(message, type, imageData, undefined);
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
      
      // Also clear the localStorage for this chat
      if (currentChatId) {
        safeRemoveItem(`explore_chat_${currentChatId}`);
      }
    }
  };

  const stopStreaming = () => {
    if (isChatStreaming) {
      activeMessageId.current = null;
      hasPartialMessage.current = false;
      isProcessing.current = false;
      setIsChatStreaming(false);

      if (messagesRef.current.some((m) => m.isPartial)) {
        updateLastMessage((msg) => ({
          ...msg,
          isPartial: false,
          isHistory: true,
        }));
      }
    }
  };

  // Session management functions
  const loadSession = (sessionId: string) => {
    if (isChatStreaming) return;
    
    const session = getSession(sessionId);
    if (!session) {
      console.error(`Failed to load session ${sessionId}: not found`);
      return;
    }
    
    // Set current chat ID
    setCurrentChatId(sessionId);
    
    // Load messages
    if (session.messages && session.messages.length > 0) {
      const processedMessages = session.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages(processedMessages);
      messagesRef.current = processedMessages;
    } else {
      setMessages([]);
      messagesRef.current = [];
    }
    
    // Load graph data
    if (session.graphData) {
      exploreGraphData.current = session.graphData;
      setGraphData(session.graphData);
    } else {
      exploreGraphData.current = { nodes: [], edges: [] };
      setGraphData({ nodes: [], edges: [] });
    }
    
    // Reset other state
    hasPartialMessage.current = false;
    activeMessageId.current = null;
    isProcessing.current = false;
    
    console.log(`Loaded session ${sessionId} with ${session.messages?.length || 0} messages`);

    // Close recent chats panel
    setShowRecentChats(false);
  };

  // Register the loadSession function with the context
  // Using useRef to ensure we only register once
  const registeredRef = useRef(false);
  useEffect(() => {
    if (!registeredRef.current) {
      registerLoadSessionFn(loadSession);
      registeredRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to ensure this only runs once

  return {
    messages,
    sendMessage,
    clearChat,
    messagesEndRef,
    stopStreaming,
    latestOmniParserResult,
    loadSession,
  };
};
