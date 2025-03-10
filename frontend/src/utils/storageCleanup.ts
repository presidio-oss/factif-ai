/**
 * Utility functions for cleaning up browser storage
 */

import { safeGetItem, safeRemoveItem } from "./storageUtil";

const EXPLORE_CHAT_PREFIX = 'explore_chat_';
const EXPLORE_SESSION_PREFIX = 'explore_session_';
const MAX_AGE_DAYS = 14; // Data older than this will be removed

/**
 * Removes old explore mode data from localStorage
 * @returns {number} Number of items removed
 */
export const cleanupOldExploreData = (): number => {
  let removedCount = 0;
  
  try {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000));
    
    // Find all keys in localStorage
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        allKeys.push(key);
      }
    }
    
    // Filter keys related to explore mode
    const exploreKeys = allKeys.filter(key => 
      key.startsWith(EXPLORE_CHAT_PREFIX) || 
      key.startsWith(EXPLORE_SESSION_PREFIX)
    );
    
    // Check each key's timestamp and remove if it's too old
    exploreKeys.forEach(key => {
      const data = safeGetItem(key);
      if (data) {
        try {
          const json = JSON.parse(data);
          
          // Check for timestamp in the data
          if (json.timestamp) {
            const itemDate = new Date(json.timestamp);
            if (itemDate < cutoffDate) {
              safeRemoveItem(key);
              removedCount++;
            }
          } else {
            // If we can't find a timestamp, check for messages that might have timestamps
            if (json.messages && Array.isArray(json.messages) && json.messages.length > 0) {
              const newestMessageDate = new Date(json.messages[json.messages.length - 1].timestamp);
              if (newestMessageDate < cutoffDate) {
                safeRemoveItem(key);
                removedCount++;
              }
            }
          }
        } catch (e) {
          // If we can't parse the JSON, it might be corrupted data
          safeRemoveItem(key);
          removedCount++;
        }
      }
    });
    
    return removedCount;
  } catch (e) {
    console.error('Error cleaning up storage:', e);
    return removedCount;
  }
};

/**
 * Emergency cleanup that removes most explore data to fix quota issues
 * @returns {number} Number of items removed
 */
export const emergencyStorageCleanup = (): number => {
  let removedCount = 0;

  try {
    // Find all keys in localStorage
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        allKeys.push(key);
      }
    }
    
    // Remove all explore chat data except the most recent one
    const chatKeys = allKeys.filter(key => key.startsWith(EXPLORE_CHAT_PREFIX));

    // Sort by timestamp (most recent last)
    chatKeys.sort((a, b) => {
      const timestampA = parseInt(a.split('_').pop() || '0', 10);
      const timestampB = parseInt(b.split('_').pop() || '0', 10);
      return timestampA - timestampB;
    });
    
    // Keep only the most recent chat
    if (chatKeys.length > 1) {
      const keysToRemove = chatKeys.slice(0, chatKeys.length - 1);
      keysToRemove.forEach(key => {
        safeRemoveItem(key);
        removedCount++;
      });
    }
    
    // Also clean up the graph data which can be large
    if (localStorage.getItem('MAP')) {
      try {
        const mapData = JSON.parse(localStorage.getItem('MAP') || '{}');
        
        // Remove image data from nodes
        if (mapData.nodes && Array.isArray(mapData.nodes)) {
          mapData.nodes = mapData.nodes.map((node: any) => {
            if (node.data && node.data.imageData) {
              return {
                ...node,
                data: {
                  ...node.data,
                  imageData: undefined
                }
              };
            }
            return node;
          });
          
          localStorage.setItem('MAP', JSON.stringify(mapData));
          removedCount++;
        }
      } catch (e) {
        console.error('Error cleaning up MAP data:', e);
      }
    }
    
    return removedCount;
  } catch (e) {
    console.error('Error during emergency storage cleanup:', e);
    return removedCount;
  }
};
