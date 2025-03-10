import { useEffect, useState, useRef } from 'react';
import { cleanupOldExploreData } from '@/utils/storageCleanup';

/**
 * Component that manages browser storage periodically
 * This runs in the background and helps prevent quota exceeded errors
 */
const StorageManager = () => {
  // Reference to track if component is mounted
  const isMountedRef = useRef(true);
  // Ref to track last cleanup time instead of state to avoid infinite rerenders
  const lastCleanupRef = useRef<Date | null>(null);
  
  useEffect(() => {
    // Set mounted flag
    isMountedRef.current = true;
    
    // Try to get last cleanup time from localStorage
    try {
      const storedTime = localStorage.getItem('storage_last_cleanup');
      if (storedTime) {
        lastCleanupRef.current = new Date(storedTime);
      }
    } catch (e) {
      console.warn('Could not read last cleanup time:', e);
    }
    
    // Function to perform a cleanup
    const performCleanup = () => {
      try {
        if (!isMountedRef.current) return;
        
        // Clean up old data
        const removedCount = cleanupOldExploreData();
        if (removedCount > 0) {
          console.log(`Storage cleanup: removed ${removedCount} old items`);
        }
        
        // Update the last cleanup time
        const now = new Date();
        localStorage.setItem('storage_last_cleanup', now.toISOString());
        lastCleanupRef.current = now;
      } catch (e) {
        console.error('Error during scheduled cleanup:', e);
      }
    };
    
    // Check if we need to run a cleanup now
    const shouldCleanupNow = () => {
      if (!lastCleanupRef.current) return true;
      
      // Calculate time since last cleanup
      const now = new Date();
      const hoursSinceLastCleanup = 
        (now.getTime() - lastCleanupRef.current.getTime()) / (1000 * 60 * 60);
      
      // Run cleanup if it's been more than 24 hours
      return hoursSinceLastCleanup >= 24;
    };
    
    // Schedule the initial cleanup check after a short delay
    const initialCleanupTimeout = setTimeout(() => {
      if (shouldCleanupNow()) {
        performCleanup();
      }
    }, 2000); // Delay initial cleanup to avoid render issues
    
    // Set up periodic check every hour
    const intervalId = setInterval(() => {
      if (shouldCleanupNow()) {
        performCleanup();
      }
    }, 60 * 60 * 1000); // Check every hour
    
    // Also clean up when storage is running low
    const checkStorageUsage = async () => {
      if (!isMountedRef.current) return;
      
      try {
        // Use the Storage API if available
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage && estimate.quota) {
            const usageRatio = estimate.usage / estimate.quota;
            
            // If we're using more than 80% of storage, run cleanup
            if (usageRatio > 0.8) {
              console.warn('Storage usage high (>80%), running cleanup');
              performCleanup();
            }
          }
        }
      } catch (e) {
        console.warn('Error checking storage usage:', e);
      }
    };
    
    // Schedule storage check with a delay to avoid render issues
    const initialStorageCheckTimeout = setTimeout(() => {
      checkStorageUsage();
    }, 5000);
    
    // Check storage usage every 5 minutes
    const storageCheckId = setInterval(checkStorageUsage, 5 * 60 * 1000);
    
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
      
      // Clean up all timers
      clearTimeout(initialCleanupTimeout);
      clearTimeout(initialStorageCheckTimeout);
      clearInterval(intervalId);
      clearInterval(storageCheckId);
    };
  }, []); // Empty dependency array - setup only once
  
  // This is a background component, so it doesn't render anything
  return null;
};

export default StorageManager;
