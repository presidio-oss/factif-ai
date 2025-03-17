import express from "express";
import { ModeController } from "../controllers/modeController";

const router = express.Router();

/**
 * @route POST /api/mode/switch
 * @desc Switch between application modes and reset provider state
 * @access Public
 */
router.post("/switch", ModeController.switchMode);

/**
 * @route GET /api/mode/status
 * @desc Get current mode status
 * @access Public
 */
router.get("/status", ModeController.getMode);

export default router;
