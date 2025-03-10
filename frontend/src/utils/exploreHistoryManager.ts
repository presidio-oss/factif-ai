import { IExploreGraphData, IExploreSession, IExploreSessionMeta } from "@/types/message.types";
import { 
  safeGetItem, 
  safeSetItem, 
  safeRemoveItem, 
  removeImageDataFromMessages,
  pruneMessages
} from "./storageUtil";

const MAX_SESSIONS = 5;
const SESSIONS_LIST_KEY = 'explore_sessions_list';
const SESSION_PREFIX = 'explore_session_';

/**
 * Retrieves the list of recent explore sessions metadata
 */
export const getSessionsList = (): IExploreSessionMeta[] => {
  try {
    const sessionsList = safeGetItem(SESSIONS_LIST_KEY);
    return sessionsList ? JSON.parse(sessionsList) : [];
  } catch (error) {
    console.error('Failed to parse sessions list', error);
    return [];
  }
};

/**
 * Saves the list of recent explore sessions metadata
 */
export const saveSessionsList = (sessions: IExploreSessionMeta[]): void => {
  try {
    // Ensure we keep only the most recent sessions
    const limitedSessions = sessions.slice(0, MAX_SESSIONS);
    safeSetItem(SESSIONS_LIST_KEY, JSON.stringify(limitedSessions));
  } catch (error) {
    console.error('Failed to save sessions list', error);
  }
};

/**
 * Retrieves a specific explore session by ID
 */
export const getSession = (sessionId: string): IExploreSession | null => {
  try {
    const sessionData = safeGetItem(`${SESSION_PREFIX}${sessionId}`);
    return sessionData ? JSON.parse(sessionData) : null;
  } catch (error) {
    console.error(`Failed to parse session ${sessionId}`, error);
    return null;
  }
};

/**
 * Saves an explore session
 */
export const saveSession = (session: IExploreSession): void => {
  try {
    // Prepare session data for storage
    const storageSession = { ...session };
    
    // Prune messages to control size
    if (storageSession.messages) {
      storageSession.messages = pruneMessages(storageSession.messages);
      
      // Remove large image data from messages
      storageSession.messages = removeImageDataFromMessages(storageSession.messages);
    }
    
    // Prune graph data if it's too large
    if (storageSession.graphData && storageSession.graphData.nodes) {
      // Remove image data from nodes to reduce size
      storageSession.graphData = {
        ...storageSession.graphData,
        nodes: storageSession.graphData.nodes.map(node => {
          if (node.data && node.data.imageData) {
            // Create a copy without the image data
            return {
              ...node,
              data: {
                ...node.data,
                imageData: undefined // Remove the large image data
              }
            };
          }
          return node;
        })
      };
    }
    
    // Save the full session data
    safeSetItem(`${SESSION_PREFIX}${session.id}`, JSON.stringify(storageSession));
    
    // Update the sessions list
    const sessionsList = getSessionsList();
    
    // Remove this session if it already exists in the list
    const filteredList = sessionsList.filter(s => s.id !== session.id);
    
    // Add the updated session meta at the beginning (most recent)
    const sessionMeta: IExploreSessionMeta = {
      id: session.id,
      title: session.title,
      timestamp: session.timestamp,
      preview: session.preview
    };
    
    saveSessionsList([sessionMeta, ...filteredList]);
  } catch (error) {
    console.error('Failed to save session', error);
  }
};

/**
 * Deletes an explore session
 */
export const deleteSession = (sessionId: string): void => {
  try {
    // Remove from localStorage
    safeRemoveItem(`${SESSION_PREFIX}${sessionId}`);
    
    // Update the sessions list
    const sessionsList = getSessionsList();
    const updatedList = sessionsList.filter(session => session.id !== sessionId);
    saveSessionsList(updatedList);
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}`, error);
  }
};

/**
 * Creates a preview text from messages
 */
export const createPreviewText = (messages: any[]): string => {
  // Find the first non-system message from the user
  const userMessage = messages.find(msg => msg.isUser && msg.text)?.text;
  
  if (userMessage) {
    // Limit preview length
    return userMessage.length > 60 
      ? `${userMessage.substring(0, 60)}...` 
      : userMessage;
  }
  
  return "New conversation";
};

/**
 * Creates a title from messages or URL
 */
export const createSessionTitle = (messages: any[]): string => {
  // Try to find a URL in the first user message
  for (const msg of messages) {
    if (msg.isUser && msg.text) {
      // Check for URLs
      const urlMatch = msg.text.match(/(https?:\/\/[^\s'"]+)/i);
      if (urlMatch) {
        try {
          const url = new URL(urlMatch[0]);
          // Use the hostname as title
          return url.hostname.replace(/^www\./, '');
        } catch {
          // Invalid URL, continue with other strategies
        }
      }
      
      // Check if the message starts with "Explore"
      if (msg.text.toLowerCase().startsWith('explore')) {
        const words = msg.text.split(' ').slice(1, 4); // Get a few words after "Explore"
        if (words.length > 0) {
          return `${words.join(' ')}...`;
        }
      }
      
      // Use first few words of the message
      const words = msg.text.split(' ').slice(0, 4);
      return words.join(' ').length > 25 
        ? `${words.join(' ').substring(0, 25)}...` 
        : words.join(' ');
    }
  }
  
  return `Exploration ${new Date().toLocaleDateString()}`;
};

/**
 * Updates the session for the current chat
 */
export const updateCurrentSession = (
  chatId: string, 
  messages: any[], 
  graphData: IExploreGraphData
): void => {
  if (!chatId || messages.length === 0) return;
  
  const title = createSessionTitle(messages);
  const preview = createPreviewText(messages);
  
  const session: IExploreSession = {
    id: chatId,
    title,
    timestamp: new Date().toISOString(),
    preview,
    messages,
    graphData
  };
  
  saveSession(session);
};
