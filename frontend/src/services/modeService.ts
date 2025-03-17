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
   * This method uses a double-switch approach to thoroughly reset context:
   * 1. First switches to the opposite mode to force context reset
   * 2. Then switches back to the target mode with a clean slate
   * 
   * While this approach might seem unusual, it's a reliable way to ensure 
   * complete context reset as it forces the LLM system to rebuild memory structures.
   * 
   * @param targetMode The mode to reset to ('explore' or 'regression')
   * @returns Promise resolving to the result of the reset operation
   */
  static async resetContext(targetMode: "explore" | "regression"): Promise<any> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Resetting context for ${targetMode} mode`);
    
    try {
      // First, reset the provider by switching to the opposite mode
      const oppositeMode = targetMode === "explore" ? "regression" : "explore";
      console.log(`[${timestamp}] Step 1: Switching to ${oppositeMode} mode to clear context`);
      await this.switchMode(oppositeMode);
      
      // Wait briefly to ensure the reset completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Then switch back to the intended mode with fresh context
      console.log(`[${timestamp}] Step 2: Switching back to ${targetMode} mode with fresh context`);
      const result = await this.switchMode(targetMode);
      console.log(`[${timestamp}] Context reset complete for ${targetMode} mode`);
      return result;
    } catch (error) {
      console.error(`[${timestamp}] Error resetting context:`, error);
      throw error;
    }
  }
}

export default ModeService;
