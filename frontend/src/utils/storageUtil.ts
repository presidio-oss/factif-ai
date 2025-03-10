/**
 * Utility functions for working with localStorage with size limits and fallbacks
 */

const MAX_ITEM_SIZE = 1024 * 1024; // 1MB per item maximum
const MAX_MESSAGES_PER_CHAT = 50; // Limit number of messages to store per chat
const LOCAL_STORAGE_AVAILABLE = checkLocalStorageAvailable();

/**
 * Check if localStorage is available and working
 */
function checkLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Safely get an item from localStorage with fallback to in-memory storage
 */
export const safeGetItem = (key: string): string | null => {
  if (!LOCAL_STORAGE_AVAILABLE) return null;
  
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('Error getting item from localStorage:', error);
    return null;
  }
};

/**
 * Safely set an item in localStorage with size checking
 */
export const safeSetItem = (key: string, value: string): boolean => {
  if (!LOCAL_STORAGE_AVAILABLE) return false;
  
  try {
    // Check if the value exceeds our maximum size limit
    if (value.length > MAX_ITEM_SIZE) {
      console.warn(`Item size for ${key} exceeds limit (${value.length} > ${MAX_ITEM_SIZE}). Truncating.`);
      return false;
    }
    
    // Try to set the item
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    // If we get an error (likely quota exceeded)
    console.error('Error setting item in localStorage:', error);
    
    try {
      // Try to clear some space by removing this item
      localStorage.removeItem(key);
    } catch {
      // If we still can't free space, there's not much we can do
    }
    
    return false;
  }
};

/**
 * Safely remove an item from localStorage
 */
export const safeRemoveItem = (key: string): void => {
  if (!LOCAL_STORAGE_AVAILABLE) return;
  
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Error removing item from localStorage:', error);
  }
};

/**
 * Prune messages to control size
 */
export const pruneMessages = (messages: any[]): any[] => {
  // If we have too many messages, only keep the most recent ones
  if (messages.length > MAX_MESSAGES_PER_CHAT) {
    // Keep the first message (often contains context) and the most recent ones
    const firstMessage = messages[0];
    const recentMessages = messages.slice(-MAX_MESSAGES_PER_CHAT + 1);
    return [firstMessage, ...recentMessages];
  }
  
  return messages;
};

/**
 * Remove image data from messages to save space
 */
export const removeImageDataFromMessages = (messages: any[]): any[] => {
  return messages.map(msg => {
    // Create a copy without modifying the original
    const newMsg = { ...msg };
    
    // Remove any large image data properties
    if (newMsg.imageData) {
      delete newMsg.imageData;
    }
    
    if (newMsg.screenshot) {
      delete newMsg.screenshot;
    }
    
    return newMsg;
  });
};

/**
 * Clean up localStorage by removing old chat data
 */
export const cleanupOldChats = (currentChatId: string): void => {
  if (!LOCAL_STORAGE_AVAILABLE) return;
  
  try {
    // Find all keys related to explore chats
    const chatKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('explore_chat_') && key !== `explore_chat_${currentChatId}`) {
        chatKeys.push(key);
      }
    }
    
    // Sort by timestamp in the key (assuming format includes timestamp)
    chatKeys.sort((a, b) => {
      const timestampA = parseInt(a.split('_').pop() || '0', 10);
      const timestampB = parseInt(b.split('_').pop() || '0', 10);
      return timestampA - timestampB;
    });
    
    // Remove the oldest chats if we have more than 10
    if (chatKeys.length > 10) {
      chatKeys.slice(0, chatKeys.length - 10).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  } catch (error) {
    console.warn('Error cleaning up old chats:', error);
  }
};
