import { Request, Response } from 'express';
import { HistoryStorageService } from '../services/HistoryStorageService';

/**
 * Controller for handling explore history endpoints
 */
export const historyController = {
  /**
   * Get all sessions metadata
   */
  getSessions: async (req: Request, res: Response) => {
    try {
      const sessions = await HistoryStorageService.getSessionsList();
      res.json(sessions);
    } catch (error) {
      console.error('Error getting sessions:', error);
      res.status(500).json({
        error: 'Failed to retrieve sessions',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Get a specific session by ID
   */
  getSession: async (req: Request, res: Response) => {
    try {
      let { id } = req.params;
      
      // Log the received ID for debugging
      console.log('Received session ID request:', id);
      
      // Handle URL-encoded hash symbols
      if (id && typeof id === 'string') {
        // Replace URL-encoded # (%23) with actual # if needed
        id = id.replace(/%23/g, '#');
      }
      
      // Additional validation
      if (!id || id.trim() === '') {
        return res.status(400).json({ 
          error: 'Invalid session ID',
          details: 'Session ID cannot be empty'
        });
      }
      
      console.log('Fetching session with ID:', id);
      const session = await HistoryStorageService.getSession(id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json(session);
    } catch (error) {
      console.error('Error getting session:', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Save a session
   */
  saveSession: async (req: Request, res: Response) => {
    try {
      const session = req.body;
      
      if (!session || !session.id) {
        return res.status(400).json({ error: 'Invalid session data' });
      }
      
      await HistoryStorageService.saveSession(session);
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving session:', error);
      res.status(500).json({
        error: 'Failed to save session',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Delete a session
   */
  deleteSession: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await HistoryStorageService.deleteSession(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({
        error: 'Failed to delete session',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  /**
   * Migrate data from localStorage to file storage
   */
  migrateFromLocalStorage: async (req: Request, res: Response) => {
    try {
      const migrationData = req.body;
      
      if (!migrationData || !migrationData.sessionsList || !migrationData.sessions) {
        return res.status(400).json({ error: 'Invalid migration data' });
      }
      
      await HistoryStorageService.migrateFromLocalStorage(migrationData);
      res.json({ 
        success: true, 
        message: `Successfully migrated ${migrationData.sessions.length} sessions` 
      });
    } catch (error) {
      console.error('Error during migration:', error);
      res.status(500).json({
        error: 'Failed to migrate data',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};
