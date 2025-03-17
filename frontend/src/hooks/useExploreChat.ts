import { useEffect, useRef, useState } from "react";
import {
  getCurrentUrl,
  executeAction,
  sendExploreChatMessage,
} from "../services/api";
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
import {
  updateCurrentSession,
  getSession,
  getSessionsList,
  deleteSession,
} from "@/utils/exploreHistoryManager";
import { pruneMessages } from "@/utils/storageUtil";
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
    registerLoadSessionFn,
  } = useExploreModeContext();

  // Initialize with empty array
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

  // Load messages from backend when component mounts or chatId changes
  useEffect(() => {
    if (currentChatId) {
      const loadSessionData = async () => {
        try {
          const session = await getSession(currentChatId);

          if (session && session.messages) {
            // Convert ISO strings back to Date objects
            const processedMessages = session.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }));

            // Only set messages if we have some
            if (processedMessages.length > 0) {
              console.log(
                `Loaded ${processedMessages.length} messages for chat ${currentChatId}`,
              );
              setMessages(processedMessages);
            }

            // If this session has graph data, load it
            if (session.graphData) {
              exploreGraphData.current = session.graphData;
              setGraphData(session.graphData);
            }
          }
        } catch (error) {
          console.error(`Failed to load session ${currentChatId}:`, error);
        }
      };

      loadSessionData();
    }
  }, [currentChatId, setGraphData]);

  // Keep messagesRef in sync with messages state and save to backend
  useEffect(() => {
    messagesRef.current = messages;

    // Only save when we have a chat ID and messages
    if (currentChatId && messages.length > 0) {
      // Prune messages to control size
      const prunedMessages = pruneMessages(messages);

      // Save to the backend session system for persistence
      (async () => {
        try {
          // Save the session
          await updateCurrentSession(
            currentChatId,
            prunedMessages,
            exploreGraphData.current,
          );

          // Update the sessions list in ExploreModeContext
          const sessions = await getSessionsList();
          setRecentSessions(sessions);
        } catch (error) {
          console.error(
            "Failed to save session or update sessions list:",
            error,
          );
        }
      })();
    }
  }, [messages, currentChatId, setRecentSessions]);

  // Simple browser state tracking for this component instance
  const browserLaunched = useRef(false);

  // Reset streaming state and clean up resources on unmount
  useEffect(() => {
    return () => {
      // First clean up state
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      setIsChatStreaming(false);

      // Then ensure browser is closed on component unmount
      try {
        // We need to use an immediately invoked async function since useEffect cleanup can't be async
        (async () => {
          const closeAction = {
            type: "perform_action",
            action: "close",
          };
          await executeAction(closeAction, streamingSource);
          console.log("Browser instance closed on ExploreChat unmount");
          browserLaunched.current = false;
        })();
      } catch (error) {
        console.error("Failed to close browser on unmount:", error);
        browserLaunched.current = false;
      }
    };
  }, [setIsChatStreaming, streamingSource]);

  // Helper function to ensure a browser is available when needed
  const ensureBrowserAvailable = async (url?: string) => {
    // Skip if we already know we have a browser
    if (browserLaunched.current) {
      console.log("Browser already launched for explore mode, continuing");
      return true;
    }

    try {
      // Launch with specified URL or a blank page
      const launchAction = {
        type: "perform_action",
        action: "launch",
        url: url || "about:blank", // Use provided URL or blank page
      };
      
      console.log("Ensuring browser is available for explore mode:", url || "about:blank");
      setHasActiveAction?.(true);
      await executeAction(launchAction, streamingSource);
      setHasActiveAction?.(false);
      
      // Mark browser as launched
      browserLaunched.current = true;
      console.log("Browser successfully launched for explore mode");
      return true;
    } catch (error) {
      console.error("Failed to ensure browser availability in explore mode:", error);
      browserLaunched.current = false;
      return false;
    }
  };

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

  // Add a periodic state persistence function to ensure graph data isn't lost
  useEffect(() => {
    // Only set up timer if we have graph data to persist
    if (exploreGraphData.current?.nodes?.length > 0) {
      const persistenceInterval = setInterval(() => {
        // Check if we still have graph data to persist
        if (exploreGraphData.current?.nodes?.length > 0) {
          console.log("Periodic graph data persistence:", 
                     exploreGraphData.current.nodes.length, "nodes");
          setGraphData(exploreGraphData.current);
          localStorage.setItem("MAP", JSON.stringify(exploreGraphData.current));
        }
      }, 30000); // Every 30 seconds
      
      return () => clearInterval(persistenceInterval);
    }
  }, [exploreGraphData.current?.nodes?.length, setGraphData]);

  const handleEdgeAndNodeCreation = (
    url: string,
    imageData?: string | IProcessedScreenshot,
  ) => {
    if (!url) {
      console.error("Cannot create node: URL is empty");
      return uuid(); // Return a node ID anyway to prevent further errors
    }
    
    // Make sure exploreGraphData.current is properly initialized
    if (!exploreGraphData.current || !exploreGraphData.current.nodes) {
      console.warn("exploreGraphData.current is not properly initialized, resetting it");
      
      // Try to load from localStorage first before resetting
      try {
        const storedMap = localStorage.getItem("MAP");
        if (storedMap) {
          const parsedMap = JSON.parse(storedMap);
          if (parsedMap && Array.isArray(parsedMap.nodes) && parsedMap.nodes.length > 0) {
            console.log("Restored graph data from localStorage:", parsedMap.nodes.length, "nodes");
            exploreGraphData.current = parsedMap;
          } else {
            exploreGraphData.current = { nodes: [], edges: [] };
          }
        } else {
          exploreGraphData.current = { nodes: [], edges: [] };
        }
      } catch (error) {
        console.error("Failed to restore graph data from localStorage:", error);
        exploreGraphData.current = { nodes: [], edges: [] };
      }
      
      // Immediately update the context to ensure the graph UI knows about this change
      setGraphData(exploreGraphData.current);
    }
    
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
          nodeId,
        });
      }

      createConstructNode(nodeId, { label: url, imageData });
      
      // After creating the first node, explicitly log the graph state
      if (isFirstNode) {
        console.log("After creating first node, graph state:", JSON.stringify(exploreGraphData.current));
      }
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
          imageData,
        );
      } else if (exploreQueue.current[url].length === 0) {
        // If we've seen this URL before but its queue is empty, update with new elements
        const existingNode = exploreGraphData.current.nodes.find(
          (node) => node.data.label === url,
        );

        if (existingNode) {
          handleQueueUpdate(
            processedExploreMessage,
            fullResponse,
            url,
            existingNode.id,
            parent,
            imageData,
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
      if (
        route &&
        exploreQueue.current[route] &&
        exploreQueue.current[route].length > 0
      ) {
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
      const elementScreenshot =
        nextElementToVisit.screenshot ||
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
      await handleExploreMessage(
        message,
        "action",
        elementScreenshot || imageData,
        undefined,
      );
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
      const containsUrl =
        /(https?:\/\/[^\s'"]+)/i.test(message) ||
        /\b[a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)\b/i.test(message);
      const isExploreRequest =
        message.toLowerCase().includes("explore") || type === "explore";

      // If this seems to be an explore request with a URL, ensure browser is launched
      if (isExploreRequest && containsUrl) {
        try {
          // Extract the URL from the message
          let urlMatch = message.match(/(https?:\/\/[^\s'"]+)/i);

          // If no http/https URL, try to detect domain names like example.com
          if (!urlMatch) {
            urlMatch = message.match(
              /\b([a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)[^\s'"]*)\b/i,
            );
            if (urlMatch) {
              // Prepend https:// to the domain
              urlMatch[1] = `https://${urlMatch[1]}`;
            }
          }
          
          if (urlMatch && urlMatch[1]) {
            console.log("Auto-launching browser for explore request with URL:", urlMatch[1]);
            
            // Use our ensureBrowserAvailable helper to launch with the specific URL
            const launched = await ensureBrowserAvailable(urlMatch[1]);
            
            if (launched) {
              // Update URL in UI since browser was launched successfully
              UIInteractionService.getInstance().handleSourceChange(
                streamingSource, 
                urlMatch[1]
              );
              
              // Mark browser as launched so we don't try again
              browserLaunched.current = true;
              
              // Wait briefly to ensure the browser is ready
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          } else {
            // No URL found, but we should still ensure a browser is available for explore mode
            await ensureBrowserAvailable();
          }
        } catch (error) {
          console.error("Error in auto-launch logic:", error);
        }
      }

      await handleExploreMessage(message, type, imageData, undefined);
      setLatestOmniParserResult(null);
    }
  };

  const clearChat = async () => {
    if (!isChatStreaming) {
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      isProcessing.current = false;
      messagesRef.current = [];
      setMessages([]);

      // First, properly close any existing browser instance
      try {
        // Execute the close action to ensure browser is properly closed
        const closeAction = {
          type: "perform_action",
          action: "close",
        };
        await executeAction(closeAction, streamingSource);
        browserLaunched.current = false;
        console.log("Browser instance closed successfully");
      } catch (error) {
        console.error("Failed to close browser:", error);
        browserLaunched.current = false;
      }

      // Reset graph data for a new chat
      exploreGraphData.current = { nodes: [], edges: [] };
      exploreQueue.current = {};
      exploreRoute.current = [];
      currentlyExploring.current = null;
      setGraphData({ nodes: [], edges: [] });
      
      // Clear localStorage MAP data to ensure a fresh start
      localStorage.removeItem("MAP");
      localStorage.removeItem("started_explore");
      
      console.log("Graph data reset for new chat");

      // If we have a chatId, tell the backend to delete its session
      if (currentChatId) {
        try {
          await deleteSession(currentChatId);
          console.log(`Deleted session for chat ${currentChatId}`);
        } catch (error) {
          console.error(
            `Failed to delete session for chat ${currentChatId}:`,
            error,
          );
        }
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
  const loadSession = async (sessionId: string) => {
    if (isChatStreaming) return;

    try {
      console.log("Loading session:", sessionId);
      const session = await getSession(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found`);
        return;
      }

      // Set current chat ID
      setCurrentChatId(sessionId);

      // Load messages
      if (session.messages && session.messages.length > 0) {
        const processedMessages = session.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(processedMessages);
        messagesRef.current = processedMessages;
      } else {
        setMessages([]);
        messagesRef.current = [];
      }

      // Load graph data with enhanced validation and debugging
      console.log("Session graph data:", session?.graphData);
      
      if (session.graphData && (session.graphData.nodes || session.graphData.edges)) {
        // Verify graph data structure is valid
        const validGraphData = {
          nodes: Array.isArray(session.graphData.nodes) ? session.graphData.nodes : [],
          edges: Array.isArray(session.graphData.edges) ? session.graphData.edges : []
        };
        
        console.log("Graph data nodes count:", validGraphData.nodes.length);
        console.log("Graph data edges count:", validGraphData.edges.length);
        
        // Update the ref and context
        exploreGraphData.current = validGraphData;
        setGraphData(validGraphData);
      } else {
        console.log("No valid graph data in session, initializing empty graph");
        exploreGraphData.current = { nodes: [], edges: [] };
        setGraphData({ nodes: [], edges: [] });
      }

      // Reset other state
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      isProcessing.current = false;

      console.log(
        `Loaded session ${sessionId} with ${session.messages?.length || 0} messages and ${exploreGraphData.current.nodes.length} nodes`,
      );

      // Close recent chats panel
      setShowRecentChats(false);
    } catch (error) {
      console.error(`Error loading session ${sessionId}:`, error);
    }
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
