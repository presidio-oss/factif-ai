import { useEffect, useState } from 'react';
import { cleanupOldExploreData } from '@/utils/storageCleanup';

/**
 * Component that manages browser storage periodically
 * This runs in the background and helps prevent quota exceeded errors
 */
const StorageManager = () => {
  // State to track last cleanup time
  const [lastCleanup, setLastCleanup] = useState<Date | null>(null);
  
  useEffect(() => {
    // Try to get last cleanup time from localStorage
    try {
      const storedTime = localStorage.getItem('storage_last_cleanup');
      if (storedTime) {
        setLastCleanup(new Date(storedTime));
      }
    } catch (e) {
      console.warn('Could not read last cleanup time:', e);
    }
    
    // Function to perform a cleanup
    const performCleanup = () => {
      try {
        // Clean up old data
        const removedCount = cleanupOldExploreData();
        if (removedCount > 0) {
          console.log(`Storage cleanup: removed ${removedCount} old items`);
        }
        
        // Update the last cleanup time
        const now = new Date();
        localStorage.setItem('storage_last_cleanup', now.toISOString());
        setLastCleanup(now);
      } catch (e) {
        console.error('Error during scheduled cleanup:', e);
      }
    };
    
    // Check if we need to run a cleanup now
    const shouldCleanupNow = () => {
      if (!lastCleanup) return true;
      
      // Calculate time since last cleanup
      const now = new Date();
      const hoursSinceLastCleanup = 
        (now.getTime() - lastCleanup.getTime()) / (1000 * 60 * 60);
      
      // Run cleanup if it's been more than 24 hours
      return hoursSinceLastCleanup >= 24;
    };
    
    // Run initial cleanup if needed
    if (shouldCleanupNow()) {
      performCleanup();
    }
    
    // Set up periodic check every hour
    const intervalId = setInterval(() => {
      if (shouldCleanupNow()) {
        performCleanup();
      }
    }, 60 * 60 * 1000); // Check every hour
    
    // Also clean up when storage is running low
    const checkStorageUsage = async () => {
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
    
    // Check storage usage every 5 minutes
    const storageCheckId = setInterval(checkStorageUsage, 5 * 60 * 1000);
    
    // Initial storage check
    checkStorageUsage();
    
    return () => {
      clearInterval(intervalId);
      clearInterval(storageCheckId);
    };
  }, [lastCleanup]);
  
  // This is a background component, so it doesn't render anything
  return null;
};

export default StorageManager;
