import axios from "axios";

/**
 * Service for handling mode switching with explicit context cleanup
 */
export class ModeService {
  /**
   * Switches the application mode and ensures LLM context is reset
   * 
   * @param mode The mode to switch to ('explore' or 'regression')
   * @returns Promise resolving to the API response
   */
  static async switchMode(mode: "explore" | "regression"): Promise<any> {
    try {
      const response = await axios.post("/api/mode/switch", { mode });
      return response.data;
    } catch (error) {
      console.error("Error switching mode:", error);
      throw error;
    }
  }

  /**
   * Checks the current LLM provider status
   * 
   * @returns Promise resolving to provider availability status
   */
  static async checkModeStatus(): Promise<{ providerAvailable: boolean }> {
    try {
      const response = await axios.get("/api/mode/status");
      return response.data;
    } catch (error) {
      console.error("Error checking mode status:", error);
      throw error;
    }
  }

  /**
   * Resets the LLM context to prevent contamination between sessions
   * 
   * @param targetMode The mode to reset to ('explore' or 'regression')
   * @returns Promise resolving to the result of the reset operation
   */
  static async resetContext(targetMode: "explore" | "regression"): Promise<any> {
    console.log(`Resetting context for ${targetMode} mode`);
    
    try {
      // First, reset the provider by switching to the opposite mode
      const oppositeMode = targetMode === "explore" ? "regression" : "explore";
      await this.switchMode(oppositeMode);
      
      // Wait briefly to ensure the reset completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then switch back to the intended mode with fresh context
      return await this.switchMode(targetMode);
    } catch (error) {
      console.error("Error resetting context:", error);
      throw error;
    }
  }
}

export default ModeService;
