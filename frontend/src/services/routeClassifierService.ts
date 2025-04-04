/**
 * Service to handle route classification operations
 */

export interface RouteCategory {
  category: string;
  description: string;
}

const API_BASE_URL = "/api";

// Cache keys
const MEMORY_CACHE_KEY = "route_classifications_memory";
const STORAGE_CACHE_KEY = "route_classifications_storage";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Service to handle route classification operations with caching
 */
export class RouteClassifierService {
  // In-memory cache for fastest access
  private static memoryCache: Record<string, RouteCategory> = {};
  
  /**
   * Initialize the cache from sessionStorage on app load
   */
  static initializeCache(): void {
    try {
      // Load from sessionStorage
      const cachedData = sessionStorage.getItem(STORAGE_CACHE_KEY);
      if (cachedData) {
        const { classifications, timestamp } = JSON.parse(cachedData);
        
        // Check if cache is still valid
        if (Date.now() - timestamp < CACHE_TTL) {
          this.memoryCache = classifications || {};
          console.log("Route classifications loaded from cache", Object.keys(this.memoryCache).length);
        } else {
          console.log("Cached classifications expired, clearing cache");
          sessionStorage.removeItem(STORAGE_CACHE_KEY);
          this.memoryCache = {};
        }
      }
    } catch (error) {
      console.error("Error initializing route classification cache:", error);
      this.memoryCache = {};
    }
  }

  /**
   * Save classifications to both memory and session storage
   */
  private static saveToCache(classifications: Record<string, RouteCategory>): void {
    try {
      // Update memory cache
      this.memoryCache = { ...this.memoryCache, ...classifications };
      
      // Update sessionStorage
      const cacheData = {
        classifications: this.memoryCache,
        timestamp: Date.now()
      };
      sessionStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(cacheData));
      
      console.log("Route classifications saved to cache", Object.keys(classifications).length);
    } catch (error) {
      console.error("Error saving route classifications to cache:", error);
    }
  }

  /**
   * Get cached classifications for routes
   * @param routes Array of URL strings to get classifications for
   * @returns Object with cached classifications
   */
  static getCachedClassifications(
    routes: string[]
  ): Record<string, RouteCategory> {
    if (!routes || !routes.length) return {};
    
    // Filter to routes we have in cache
    const cachedResults: Record<string, RouteCategory> = {};
    
    routes.forEach(route => {
      if (this.memoryCache[route]) {
        cachedResults[route] = this.memoryCache[route];
      }
    });
    
    return cachedResults;
  }

  /**
   * Classify multiple routes using the backend classification service
   * @param routes Array of URL strings to classify
   * @returns Promise with classification results
   */
  static async classifyRoutes(
    routes: string[],
  ): Promise<Record<string, RouteCategory>> {
    if (!routes || !routes.length) return {};

    // Initialize cache if not already done
    if (Object.keys(this.memoryCache).length === 0) {
      this.initializeCache();
    }
    
    // Filter out routes we already have in cache
    const routesToClassify = routes.filter(route => !this.memoryCache[route]);
    
    // If all routes are cached, return from cache immediately
    if (routesToClassify.length === 0) {
      console.log("All routes found in cache, returning cached classifications");
      return this.getCachedClassifications(routes);
    }
    
    // Make API call only for routes not in cache
    try {
      console.log("Classifying uncached routes:", routesToClassify);
      const response = await fetch(`${API_BASE_URL}/explore/classify-routes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          routes: routesToClassify,
        }),
      });

      const data = await response.json();

      if (data?.status === "success") {
        const newClassifications = data.classifications || {};
        
        // Save new classifications to cache
        this.saveToCache(newClassifications);
        
        // Return both cached and new classifications
        return { 
          ...this.getCachedClassifications(routes.filter(route => !routesToClassify.includes(route))), 
          ...newClassifications 
        };
      }

      console.error("Route classification failed:", data);
      // Fall back to cache for routes we do have
      return this.getCachedClassifications(routes);
    } catch (error) {
      console.error("Error classifying routes:", error);
      // Fall back to cache for routes we do have
      return this.getCachedClassifications(routes);
    }
  }
}

// Initialize cache when the module loads
RouteClassifierService.initializeCache();
