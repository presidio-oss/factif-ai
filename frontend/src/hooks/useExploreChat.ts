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
// import UIInteractionService from "../services/uiInteractionService";
import ModeService from "../services/modeService";
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
import {
  RouteClassifierService
} from "@/services/routeClassifierService";

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
    setCost,
    secrets
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
  const visitedUrls = useRef<Set<string>>(new Set());
  const visitedElements = useRef<Set<string>>(new Set());
  const currentlyExploring = useRef<{
    url: string;
    id: string;
    nodeId: string;
    label: string;
  } | null>(null);
  const parentDomain = useRef<string | null>(null);

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
      setCost(0)
      // Then ensure browser is closed on component unmount
      try {
        // We need to use an immediately invoked async function since useEffect cleanup can't be async
        (async () => {
          const closeAction = {
            type: "perform_action",
            action: "close",
          };
          await executeAction(closeAction, streamingSource, secrets);
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
  // const ensureBrowserAvailable = async (url?: string) => {
  //   // Skip if we already know we have a browser
  //   if (browserLaunched.current) {
  //     console.log("Browser already launched for explore mode, continuing");
  //     return true;
  //   }
  //
  //   try {
  //     // Launch with specified URL or a blank page
  //     const launchAction = {
  //       type: "perform_action",
  //       action: "launch",
  //       url: url || "about:blank", // Use provided URL or blank page
  //     };
  //
  //     console.log("Ensuring browser is available for explore mode:", url || "about:blank");
  //     setHasActiveAction?.(true);
  //     await executeAction(launchAction, streamingSource);
  //     setHasActiveAction?.(false);
  //
  //     // Mark browser as launched
  //     browserLaunched.current = true;
  //     console.log("Browser successfully launched for explore mode");
  //     return true;
  //   } catch (error) {
  //     console.error("Failed to ensure browser availability in explore mode:", error);
  //     browserLaunched.current = false;
  //     return false;
  //   }
  // };

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

  const createConstructNode = async (
    currentNodeId: string,
    data: { label: string; imageData?: string },
  ) => {
    const currentNodelCount = exploreGraphData.current.nodes.length;
    const url = data.label;

    // Define a properly typed node data object with all required fields
    interface NodeData {
      label: string;
      edges: string[];
      imageData?: string;
      category?: string;
      categoryDescription?: string;
    }

    // Immediately classify the new node before adding it to the graph
    let nodeData: NodeData = {
      label: data.label,
      edges: [],
      imageData: data.imageData,
    };

    try {
      // Attempt to classify the URL immediately
      console.log(`Classifying new node URL: ${url}`);
      const classifications = await RouteClassifierService.classifyRoutes([
        url,
      ]);

      if (classifications && classifications[url]) {
        console.log(`Got classification for ${url}:`, classifications[url]);
        // Add category information to the node data
        nodeData = {
          ...nodeData,
          category: classifications[url].category,
          categoryDescription: classifications[url].description,
        };
      } else {
        console.log(`No classification available for ${url}, using defaults`);

        // Apply default classification based on URL patterns
        if (
          url.includes("/login") ||
          url.includes("/signin") ||
          url.includes("/register")
        ) {
          nodeData.category = "auth";
          nodeData.categoryDescription = "Authentication page";
        } else if (url.includes("/dashboard")) {
          nodeData.category = "dashboard";
          nodeData.categoryDescription = "Dashboard page";
        } else if (url.includes("/product")) {
          nodeData.category = "product";
          nodeData.categoryDescription = "Product page";
        } else if (url.includes("/profile")) {
          nodeData.category = "profile";
          nodeData.categoryDescription = "Profile page";
        } else if (url === "/" || url.endsWith(".html")) {
          nodeData.category = "landing";
          nodeData.categoryDescription = "Landing page";
        } else {
          nodeData.category = "uncategorized";
          nodeData.categoryDescription = "Uncategorized page";
        }
      }
    } catch (error) {
      console.error(`Error classifying new node ${url}:`, error);
      // Default to uncategorized if classification fails
      nodeData.category = "uncategorized";
      nodeData.categoryDescription = "Uncategorized page";
    }

    // Create a new array instead of mutating the existing one
    exploreGraphData.current = {
      ...exploreGraphData.current,
      nodes: [
        ...exploreGraphData.current.nodes,
        {
          id: currentNodeId,
          position: { x: 200, y: currentNodelCount * 100 },
          data: {
            ...nodeData,
            // Store the timestamp with the image so we know when it was captured
            imageTimestamp: Date.now(),
          },
          type: "pageNode",
        },
      ],
    };

    // Pass a new object reference to ensure state update is detected
    setGraphData({ ...exploreGraphData.current });
    console.log(
      `Added node ${currentNodeId} with category ${nodeData.category}`,
    );

    // Safely store graph data with error handling
    try {
      localStorage.setItem("MAP", JSON.stringify(exploreGraphData.current));
    } catch (error) {
      console.error("Failed to save graph data to localStorage:", error);
      // App can continue functioning even if storage fails
    }
  };

  const createEdge = (
    sourceId: string,
    targetId: string,
    edgeId: string,
    label: string,
  ) => {
    // Create a new edges array
    const newEdges = [
      ...exploreGraphData.current.edges,
      {
        id: edgeId,
        source: sourceId,
        target: targetId,
        sourceHandle: edgeId,
        type: "default",
        label,
      },
    ];

    // Create a new nodes array with updated edges
    const newNodes = exploreGraphData.current.nodes.map((node) => {
      if (node.id === sourceId) {
        return {
          ...node,
          data: {
            ...node.data,
            edges: [...node.data.edges, edgeId],
          },
        };
      }
      return node;
    });

    // Update the ref with completely new objects
    exploreGraphData.current = {
      nodes: newNodes,
      edges: newEdges,
    };

    // Pass a new object reference to ensure state update is detected
    setGraphData({ ...exploreGraphData.current });

    // Safely store graph data with error handling
    try {
      localStorage.setItem("MAP", JSON.stringify(exploreGraphData.current));
    } catch (error) {
      console.error("Failed to save edge data to localStorage:", error);
      // App can continue functioning even if storage fails
    }
  };

  // Add a periodic state persistence function to ensure graph data isn't lost
  useEffect(() => {
    // Only set up timer if we have graph data to persist
    if (exploreGraphData.current?.nodes?.length > 0) {
      const persistenceInterval = setInterval(() => {
        // Check if we still have graph data to persist
        if (exploreGraphData.current?.nodes?.length > 0) {
          console.log(
            "Periodic graph data persistence:",
            exploreGraphData.current.nodes.length,
            "nodes",
          );
          // Create a new object reference to ensure state update is detected
          setGraphData({ ...exploreGraphData.current });

          try {
            localStorage.setItem(
              "MAP",
              JSON.stringify(exploreGraphData.current),
            );
          } catch (error) {
            console.error(
              "Failed to save graph data during periodic persistence:",
              error,
            );
            // App can continue functioning without this persistence
          }
        }
      }, 30000); // Every 30 seconds

      return () => clearInterval(persistenceInterval);
    }
  }, [setGraphData]); // Don't depend on exploreGraphData.current to avoid infinite re-renders

  const handleEdgeAndNodeCreation = (url: string, imageData: string) => {
    if (!url) {
      console.error("Cannot create node: URL is empty");
      return uuid(); // Return a node ID anyway to prevent further errors
    }

    // Make sure exploreGraphData.current is properly initialized
    if (!exploreGraphData.current || !exploreGraphData.current.nodes) {
      console.warn(
        "exploreGraphData.current is not properly initialized, resetting it",
      );

      // Try to load from localStorage first before resetting
      try {
        const storedMap = localStorage.getItem("MAP");
        if (storedMap) {
          const parsedMap = JSON.parse(storedMap);
          if (
            parsedMap &&
            Array.isArray(parsedMap.nodes) &&
            parsedMap.nodes.length > 0
          ) {
            console.log(
              "Restored graph data from localStorage:",
              parsedMap.nodes.length,
              "nodes",
            );
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

    // Log the URL being processed for debugging
    console.log(`Processing URL for node: ${url}`);

    // Check if this URL should be treated as a new node or update an existing one
    const canCreateNode = createEdgeOrNode(exploreGraphData.current.nodes, url);
    const nodeId = !canCreateNode.createNode
      ? (canCreateNode.node?.id as string)
      : uuid();

    // Log whether we're creating a new node or updating existing one
    console.log(
      `URL ${url} - ${canCreateNode.createNode ? "Creating new node" : "Updating existing node"} with ID ${nodeId}`,
    );

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
        console.log(
          "After creating first node, graph state:",
          JSON.stringify(exploreGraphData.current),
        );
      }
    } else if (imageData) {
      // If this URL already exists as a node but we have a new screenshot, update it
      // This ensures nodes always have the most up-to-date screenshot
      console.log(`Updating existing node ${nodeId} with new screenshot`);

      // Create a new nodes array with updated image data
      const newNodes = exploreGraphData.current.nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              imageData, // Always use the latest image
              imageTimestamp: Date.now(), // Update the timestamp to track when this image was captured
            },
          };
        }
        return node;
      });

      // Update the ref with a new object
      exploreGraphData.current = {
        ...exploreGraphData.current,
        nodes: newNodes,
      };

      // Pass a new object reference to ensure state update is detected
      setGraphData({ ...exploreGraphData.current });
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
    imageData: string,
  ) => {
    // Track if we have valid image data to save with the elements

    // Check if we should restrict exploration to the parent domain
    let shouldRestrict = false;
    let urlDomain = "";

    try {
      // Extract domain from the URL
      const urlObj = new URL(url);
      urlDomain = urlObj.hostname;

      // If parent domain is set, check if current URL's domain matches
      if (parentDomain.current && urlDomain !== parentDomain.current) {
        shouldRestrict = true;
        console.log(`Restricting exploration: URL domain ${urlDomain} differs from parent domain ${parentDomain.current}`);
      }
    } catch (e) {
      console.error(`Failed to parse URL for domain restriction: ${url}`, e);
    }

    // Only add elements to the queue if we're not restricting or domains match
    if (!shouldRestrict) {
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
            // Store the screenshot with each element in memory, but not in localStorage
            screenshot: imageData,
            parent: {
              url: (parent?.url as string) || url,
              nodeId: (parent?.nodeId as string) || nodeId,
              id: (parent?.id as string) || elementId,
            },
          };
          exploreQueue.current[url].push(exploredOutput);
        }
      }
    } else {
      console.log(`Skipped adding ${processedExploreMessage.length} elements from different domain: ${urlDomain}`);
    }

    try {
      // Create a storage-optimized version of the queue (without screenshots)
      const storageOptimizedQueue: Record<
        string,
        Omit<IExploreQueueItem, "screenshot">[]
      > = {};

      // Process each URL in the queue
      Object.keys(exploreQueue.current).forEach((queueUrl) => {
        // Limit to max 50 items per URL to prevent excessive storage
        const limitedItems = exploreQueue.current[queueUrl].slice(0, 50);

        // Remove screenshots and full source text to reduce size
        storageOptimizedQueue[queueUrl] = limitedItems.map((item) => {
          const { screenshot, source, ...rest } = item;
          return {
            ...rest,
            // Keep a shortened version of the source if needed
            source:
              source?.substring(0, 100) +
              (source && source.length > 100 ? "..." : ""),
          };
        });
      });

      localStorage.setItem(
        "started_explore",
        JSON.stringify(storageOptimizedQueue),
      );
    } catch (error) {
      console.error("Failed to save explore queue to localStorage:", error);
      // Continue without stopping execution - the app can still function without persistent storage
    }
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
    imageData: string,
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

      console.log(`Processing explore output for URL: ${url}`);

      // Extract domain from the current URL
      try {
        const currentUrl = new URL(url);
        const currentDomain = currentUrl.hostname;

        // Set parent domain if not already set
        if (!parentDomain.current) {
          parentDomain.current = currentDomain;
          console.log(`Set parent domain for exploration: ${parentDomain.current}`);
        }
      } catch (e) {
        console.error(`Failed to parse URL: ${url}`, e);
      }

      // Always process the elements for the current URL, whether we've seen it before or not
      // This ensures we don't miss any clickable elements on pages we revisit
      if (!exploreQueue.current[url]) {
        exploreQueue.current[url] = [];
        console.log(`Created new queue for URL: ${url}`);
      }

      // Find any existing node for this URL using our improved URL comparison logic
      const existingNode = exploreGraphData.current.nodes.find((node) => {
        // First check for exact match
        if (node.data.label === url) {
          return true;
        }

        // Then try normalized comparison for different domains/subdomains
        try {
          // Parse both URLs
          const currentUrl = new URL(url);
          const nodeUrl = new URL(node.data.label);

          // Check if these are different domains/subdomains with same path
          const currentDomain = currentUrl.hostname;
          const nodeDomain = nodeUrl.hostname;

          if (currentDomain !== nodeDomain) {
            // Different domains should always be treated as separate nodes
            return false;
          }

          // For same domain, compare paths
          return (
            currentUrl.pathname === nodeUrl.pathname &&
            currentUrl.search === nodeUrl.search
          );
        } catch (e) {
          // If URL parsing fails, fall back to exact match
          return false;
        }
      });

      const nodeId = existingNode
        ? existingNode.id
        : handleEdgeAndNodeCreation(url, imageData);

      // Add to route set if it's a new URL
      if (!routeSet.has(url)) {
        routeSet.add(url);
        console.log(`Added new URL to route set: ${url}`);
      }

      // Mark this URL as visited
      visitedUrls.current.add(url);
      console.log(`Marked URL as visited: ${url}`);

      // Always update the queue with the latest elements
      handleQueueUpdate(
        processedExploreMessage,
        fullResponse,
        url,
        nodeId,
        parent,
        imageData,
      );

      // Always update the screenshot, regardless of whether we've seen this URL before
      if (existingNode && imageData) {
        console.log(
          `Updating screenshot for existing node: ${nodeId} (${url})`,
        );

        // Force an update of the node's image data and timestamp
        const updatedNodes = exploreGraphData.current.nodes.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                imageData, // Always use the latest image
                imageTimestamp: Date.now(), // Update the timestamp
              },
            };
          }
          return node;
        });

        // Update the graph data with the new nodes
        exploreGraphData.current = {
          ...exploreGraphData.current,
          nodes: updatedNodes,
        };

        // Force a re-render of the graph by passing a new object reference
        setGraphData({ ...exploreGraphData.current });
      }
    }

    // Create a new array to ensure reactivity when updating routes
    exploreRoute.current = [...routeSet];

    // After any processing is done, ensure graph data is properly updated
    if (exploreGraphData.current.nodes.length > 0) {
      // Force a re-render of the graph by passing a new object reference
      setGraphData({ ...exploreGraphData.current });
      console.log(
        "Graph data updated with",
        exploreGraphData.current.nodes.length,
        "nodes",
      );
    }

    return processedExploreMessage.length > 0
      ? processedExploreMessage[0]
      : null;
  };

  const getNextToExplore = () => {
    console.log("exploreRoute.current ===>", exploreRoute.current);
    console.log("exploreQueue.current ===>", exploreQueue.current);
    console.log("visitedUrls.current ===>", Array.from(visitedUrls.current));
    console.log("visitedElements.current ===>", Array.from(visitedElements.current));
    console.log("parentDomain.current ===>", parentDomain.current);

    // Try each route in order until we find one with items in its queue
    for (let i = 0; i < exploreRoute.current.length; i++) {
      const route = exploreRoute.current[i];
      if (
        route &&
        exploreQueue.current[route] &&
        exploreQueue.current[route].length > 0
      ) {
        // Check if this route's domain matches the parent domain
        let routeDomain = "";
        let shouldSkipRoute = false;

        try {
          const routeUrl = new URL(route);
          routeDomain = routeUrl.hostname;

          // If parent domain is set and doesn't match this route's domain, skip it
          if (parentDomain.current && routeDomain !== parentDomain.current) {
            shouldSkipRoute = true;
            console.log(`Skipping route with different domain: ${route} (${routeDomain} vs ${parentDomain.current})`);
            continue; // Skip to the next route
          }
        } catch (e) {
          console.error(`Failed to parse route URL for domain check: ${route}`, e);
        }

        // If we should skip this route due to domain mismatch, continue to next route
        if (shouldSkipRoute) {
          continue;
        }

        // Filter out items that have already been visited
        const availableItems = exploreQueue.current[route].filter(item => {
          // Create a unique key for this element using URL, text, and coordinates
          const elementKey = `${item.url}|${item.text}|${item.coordinates}`;
          return !visitedElements.current.has(elementKey);
        });

        // Update the queue with only unvisited items
        exploreQueue.current[route] = availableItems;

        // If there are no unvisited items in this route, continue to the next route
        if (availableItems.length === 0) {
          console.log(`No unvisited elements for URL: ${route}`);
          continue;
        }

        // Found a route with items to explore
        const nextItem = exploreQueue.current[route].shift();
        if (nextItem) {
          // Mark this element as visited
          const elementKey = `${nextItem.url}|${nextItem.text}|${nextItem.coordinates}`;
          visitedElements.current.add(elementKey);

          // Add the URL to visitedUrls for tracking purposes
          visitedUrls.current.add(route);

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
    imageData: string,
    cost: number = 0,
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
    cost > -1 && setCost((prev: number)=> prev + cost);
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

  const onGettingExploredMode = async (imageData?: string) => {
    const nextElementToVisit = getNextToExplore();
    console.log("nextElementToVisit ===>", nextElementToVisit);
    isProcessing.current = false;

    if (nextElementToVisit) {
      setType("action");

      // Always use the latest screenshot, not the one from when the element was discovered
      // This ensures we have the current state of the page for navigation
      const elementScreenshot = imageData;

      // Include a direct instruction to take a screenshot after navigation
      const message = `In ${nextElementToVisit.url} \n Visit ${nextElementToVisit.text} on coordinate : ${nextElementToVisit.coordinates} with about this element : ${nextElementToVisit.aboutThisElement}. After clicking on this element you MUST take a screenshot by performing a click action. This screenshot is important for complete documentation of this feature.
      Do any prior steps for the successful completion of this task.`;

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
        elementScreenshot,
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
    imageData?: string,
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

      await sendExploreChatMessage(
        currentMessage,
        imageData,
        messagesRef.current.filter((msg) => !msg.isPartial),
        type,
        folderPath,
        currentChatId,
        streamingSource,
        (chunk: string) => {
          fullResponse += chunk;
          handleMessageChunk(messageId, chunk, fullResponse);
        },
        (image?: string, cost?: number) =>
          handleMessageCompletion(
            messageId,
            fullResponse,
            image || "",
            cost,
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
      // const containsUrl =
      //   /(https?:\/\/[^\s'"]+)/i.test(message) ||
      //   /\b[a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)\b/i.test(message);
      // const isExploreRequest =
      //   message.toLowerCase().includes("explore") || type === "explore";
      //
      // // If this seems to be an explore request with a URL, ensure browser is launched
      // if (isExploreRequest && containsUrl) {
      //   try {
      //     // Extract the URL from the message
      //     let urlMatch = message.match(/(https?:\/\/[^\s'"]+)/i);
      //
      //     // If no http/https URL, try to detect domain names like example.com
      //     if (!urlMatch) {
      //       urlMatch = message.match(
      //         /\b([a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)[^\s'"]*)\b/i,
      //       );
      //       if (urlMatch) {
      //         // Prepend https:// to the domain
      //         urlMatch[1] = `https://${urlMatch[1]}`;
      //       }
      //     }
      //
      //     if (urlMatch && urlMatch[1]) {
      //       console.log("Auto-launching browser for explore request with URL:", urlMatch[1]);
      //
      //       // Use our ensureBrowserAvailable helper to launch with the specific URL
      //       const launched = await ensureBrowserAvailable(urlMatch[1]);
      //
      //       if (launched) {
      //         // Update URL in UI since browser was launched successfully
      //         UIInteractionService.getInstance().handleSourceChange(
      //           streamingSource,
      //           urlMatch[1]
      //         );
      //
      //         // Mark browser as launched so we don't try again
      //         browserLaunched.current = true;
      //
      //         // Wait briefly to ensure the browser is ready
      //         await new Promise((resolve) => setTimeout(resolve, 1000));
      //       }
      //     } else {
      //       // No URL found, but we should still ensure a browser is available for explore mode
      //       await ensureBrowserAvailable();
      //     }
      //   } catch (error) {
      //     console.error("Error in auto-launch logic:", error);
      //   }
      // }

      await handleExploreMessage(message, type, imageData, undefined);
      setLatestOmniParserResult(null);
    }
  };

  const clearChat = async () => {
    if (!isChatStreaming) {
      try {
        setHasActiveAction(true);
        // Reset LLM context in the backend to ensure a fresh start
        await ModeService.resetContext("explore");
        console.log("Context reset for new explore chat");
      } catch (error) {
        console.error("Failed to reset context for new explore chat:", error);
      } finally {
        setHasActiveAction(false);
      }

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
        await executeAction(closeAction, streamingSource, secrets);
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
      visitedUrls.current = new Set();
      visitedElements.current = new Set();
      currentlyExploring.current = null;
      parentDomain.current = null; // Reset parent domain for new exploration
      setGraphData({ nodes: [], edges: [] });

      // Clear localStorage MAP data to ensure a fresh start
      try {
        localStorage.removeItem("MAP");
        localStorage.removeItem("started_explore");
        console.log("Graph data reset for new chat");
      } catch (error) {
        // This shouldn't happen with removeItem but added for completeness
        console.error("Error clearing localStorage:", error);
      }

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

      if (
        session.graphData &&
        (session.graphData.nodes || session.graphData.edges)
      ) {
        // Verify graph data structure is valid
        const validGraphData = {
          nodes: Array.isArray(session.graphData.nodes)
            ? session.graphData.nodes
            : [],
          edges: Array.isArray(session.graphData.edges)
            ? session.graphData.edges
            : [],
        };

        console.log("Graph data nodes count:", validGraphData.nodes.length);
        console.log("Graph data edges count:", validGraphData.edges.length);

        // Create new object references for all graph data to ensure reactivity
        const reactiveGraphData = {
          nodes: validGraphData.nodes.map((node) => ({
            ...node,
            data: { ...node.data },
          })),
          edges: validGraphData.edges.map((edge) => ({ ...edge })),
        };

        // Update the ref and context with new object references
        exploreGraphData.current = reactiveGraphData;
        setGraphData({ ...reactiveGraphData });

        // Log an explicit message about graph data reactivity
        console.log("Loaded graph data with new reactive references");
      } else {
        console.log("No valid graph data in session, initializing empty graph");
        exploreGraphData.current = { nodes: [], edges: [] };
        setGraphData({ nodes: [], edges: [] });
      }

      // Reset other state
      hasPartialMessage.current = false;
      activeMessageId.current = null;
      isProcessing.current = false;
      visitedUrls.current = new Set();
      visitedElements.current = new Set();
      parentDomain.current = null; // Reset parent domain when loading a session

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
