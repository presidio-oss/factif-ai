import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Convert callbacks to promises
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

// Constants
const HISTORY_DIR = path.join(process.cwd(), 'storage', 'history');
const SESSIONS_LIST_FILE = path.join(HISTORY_DIR, 'sessions.json');
const SESSION_PREFIX = 'session_';

/**
 * Service to manage history storage using the file system
 */
export class HistoryStorageService {
  /**
   * Initialize the storage directory if it doesn't exist
   */
  static async initialize(): Promise<void> {
    try {
      // Ensure the history directory exists
      await mkdir(HISTORY_DIR, { recursive: true });
      
      // Check if sessions list file exists, if not create it
      try {
        await access(SESSIONS_LIST_FILE);
      } catch (error) {
        // File doesn't exist, create an empty sessions list
        await writeFile(SESSIONS_LIST_FILE, JSON.stringify([]));
      }
    } catch (error) {
      console.error('Error initializing history storage:', error);
      throw new Error('Failed to initialize history storage');
    }
  }

  /**
   * Get the list of all session metadata
   */
  static async getSessionsList(): Promise<any[]> {
    try {
      await this.initialize();
      const data = await readFile(SESSIONS_LIST_FILE, 'utf8');
      
      // Handle empty file case
      if (!data || data.trim() === '') {
        console.warn('Sessions list file is empty');
        return [];
      }
      
      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error('Error parsing sessions list JSON:', parseError);
        
        // Create a backup of the corrupted file for debugging
        const backupPath = `${SESSIONS_LIST_FILE}.backup.${Date.now()}`;
        await writeFile(backupPath, data);
        console.warn(`Created backup of corrupted sessions list at ${backupPath}`);
        
        // Return empty array and reset the file with empty array
        await writeFile(SESSIONS_LIST_FILE, JSON.stringify([]));
        return [];
      }
    } catch (error) {
      console.error('Error reading sessions list:', error);
      return [];
    }
  }

  /**
   * Save the sessions list
   */
  static async saveSessionsList(sessions: any[]): Promise<void> {
    try {
      await this.initialize();
      await writeFile(SESSIONS_LIST_FILE, JSON.stringify(sessions, null, 2));
    } catch (error) {
      console.error('Error saving sessions list:', error);
      throw new Error('Failed to save sessions list');
    }
  }

  /**
   * Get a specific session by ID
   */
  static async getSession(sessionId: string): Promise<any> {
    try {
      await this.initialize();
      const sessionFile = path.join(HISTORY_DIR, `${SESSION_PREFIX}${sessionId}.json`);
      const data = await readFile(sessionFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Save a session
   */
  static async saveSession(session: any): Promise<void> {
    try {
      await this.initialize();
      
      // Save the full session data
      const sessionFile = path.join(HISTORY_DIR, `${SESSION_PREFIX}${session.id}.json`);
      await writeFile(sessionFile, JSON.stringify(session, null, 2));
      
      // Update the sessions list
      const sessionsList = await this.getSessionsList();
      
      // Remove this session if it already exists in the list
      const filteredList = sessionsList.filter((s: any) => s.id !== session.id);
      
      // Add the updated session meta at the beginning (most recent)
      const sessionMeta = {
        id: session.id,
        title: session.title,
        timestamp: session.timestamp,
        preview: session.preview
      };
      
      await this.saveSessionsList([sessionMeta, ...filteredList]);
    } catch (error) {
      console.error('Error saving session:', error);
      throw new Error('Failed to save session');
    }
  }

  /**
   * Delete a session
   */
  static async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.initialize();
      
      // Delete the session file
      const sessionFile = path.join(HISTORY_DIR, `${SESSION_PREFIX}${sessionId}.json`);
      try {
        await unlink(sessionFile);
      } catch (error) {
        console.warn(`File for session ${sessionId} doesn't exist or couldn't be deleted`);
      }
      
      // Update the sessions list
      const sessionsList = await this.getSessionsList();
      const updatedList = sessionsList.filter((session: any) => session.id !== sessionId);
      await this.saveSessionsList(updatedList);
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
      throw new Error(`Failed to delete session ${sessionId}`);
    }
  }

  /**
   * Migrate data from frontend localStorage to backend file storage
   */
  static async migrateFromLocalStorage(data: {
    sessionsList: any[],
    sessions: { id: string, data: any }[]
  }): Promise<void> {
    try {
      await this.initialize();
      
      // Save each session
      for (const sessionItem of data.sessions) {
        const sessionFile = path.join(HISTORY_DIR, `${SESSION_PREFIX}${sessionItem.id}.json`);
        await writeFile(sessionFile, JSON.stringify(sessionItem.data, null, 2));
      }
      
      // Save the sessions list
      await writeFile(SESSIONS_LIST_FILE, JSON.stringify(data.sessionsList, null, 2));
      
      console.log(`Successfully migrated ${data.sessions.length} sessions from localStorage`);
    } catch (error) {
      console.error('Error during localStorage migration:', error);
      throw new Error('Failed to migrate from localStorage');
    }
  }
}