/**
 * Service to handle route classification operations
 */

export interface RouteCategory {
  category: string;
  description: string;
}

const API_BASE_URL = "/api";

/**
 * Service to handle route classification operations
 */
export class RouteClassifierService {
  /**
   * Classify multiple routes using the backend classification service
   * @param routes Array of URL strings to classify
   * @returns Promise with classification results
   */
  static async classifyRoutes(
    routes: string[],
  ): Promise<Record<string, RouteCategory>> {
    try {
      const response = await fetch(`${API_BASE_URL}/explore/classify-routes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          routes,
        }),
      });

      const data = await response.json();

      if (data?.status === "success") {
        return data.classifications || {};
      }

      console.error("Route classification failed:", data);
      return {};
    } catch (error) {
      console.error("Error classifying routes:", error);
      return {};
    }
  }
}
