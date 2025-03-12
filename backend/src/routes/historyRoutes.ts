import express from 'express';
import { historyController } from '../controllers/historyController';

const router = express.Router();

// Get all sessions metadata
router.get('/sessions', historyController.getSessions);

// Handle missing session ID
router.get('/session/', (req, res) => {
  return res.status(400).json({ 
    error: 'Session ID is required', 
    hint: 'Use /api/history/sessions to get all sessions or /api/history/session/:id for a specific session' 
  });
});

// Get a specific session
router.get('/session/:id', historyController.getSession);

// Save a session
router.post('/session', historyController.saveSession);

// Handle missing session ID for deletion
router.delete('/session/', (req, res) => {
  return res.status(400).json({ 
    error: 'Session ID is required', 
    hint: 'Use /api/history/session/:id to delete a specific session' 
  });
});

// Delete a session
router.delete('/session/:id', historyController.deleteSession);

// Migrate from localStorage
router.post('/migrate', historyController.migrateFromLocalStorage);

export default router;
