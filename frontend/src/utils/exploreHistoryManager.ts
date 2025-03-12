import { IExploreGraphData, IExploreSession, IExploreSessionMeta } from "@/types/message.types";
import { 
  removeImageDataFromMessages,
  pruneMessages,
  safeGetItem
} from "./storageUtil";
import * as api from "../services/api";

const SESSIONS_LIST_KEY = 'explore_sessions_list';
const SESSION_PREFIX = 'explore_session_';

/**
 * Retrieves the list of recent explore sessions metadata
 */
export const getSessionsList = async (): Promise<IExploreSessionMeta[]> => {
  try {
    const sessionsList = await api.getSessionsList();
    return sessionsList || [];
  } catch (error) {
    console.error('Failed to fetch sessions list', error);
    return [];
  }
};

/**
 * Retrieves a specific explore session by ID
 */
export const getSession = async (sessionId: string): Promise<IExploreSession | null> => {
  // Validate session ID first
  if (!sessionId || typeof sessionId !== 'string') {
    console.warn("Attempted to fetch session with invalid sessionId type");
    return null;
  }
  
  const trimmedId = sessionId.trim();
  if (trimmedId === '') {
    console.warn("Attempted to fetch session with empty sessionId");
    return null;
  }
  
  try {
    // Forward to api with validation already done
    console.log(`Retrieving session: ${trimmedId}`);
    return await api.getSession(trimmedId);
  } catch (error) {
    // Just return null without logging for most common error case
    return null;
  }
};

/**
 * Saves an explore session
 */
export const saveSession = async (session: IExploreSession): Promise<void> => {
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
    
    // Save the session to backend
    await api.saveSession(storageSession);
  } catch (error) {
    console.error('Failed to save session', error);
  }
};

/**
 * Deletes an explore session
 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  try {
    // Remove from backend storage
    await api.deleteSession(sessionId);
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}`, error);
  }
};

/**
 * Migrates data from localStorage to backend file storage
 * This should be called once when the app starts
 */
export const migrateFromLocalStorage = async (): Promise<boolean> => {
  try {
    const sessionsList = safeGetItem(SESSIONS_LIST_KEY);
    if (!sessionsList) {
      console.log('No sessions to migrate from localStorage');
      return false;
    }
    
    const sessionsListData = JSON.parse(sessionsList);
    
    // Gather all session data
    const sessionData = [];
    for (const meta of sessionsListData) {
      const sessionId = meta.id;
      const sessionItem = safeGetItem(`${SESSION_PREFIX}${sessionId}`);
      if (sessionItem) {
        sessionData.push({
          id: sessionId,
          data: JSON.parse(sessionItem)
        });
      }
    }
    
    // Send to backend for migration
    const migrationData = {
      sessionsList: sessionsListData,
      sessions: sessionData
    };
    
    await api.migrateFromLocalStorage(migrationData);
    
    console.log(`Successfully migrated ${sessionData.length} sessions from localStorage`);
    return true;
  } catch (error) {
    console.error('Failed to migrate data from localStorage', error);
    return false;
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
export const updateCurrentSession = async (
  chatId: string, 
  messages: any[], 
  graphData: IExploreGraphData
): Promise<void> => {
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
  
  await saveSession(session);
};
