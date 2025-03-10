import express from "express";
import { ExploreController } from "../controllers/exploreController";

const router = express.Router();

// Health check endpoint
router.get("/health", ExploreController.healthCheck);

// Main explore message endpoint
router.post("/message", ExploreController.handleExploreMessage);
router.get("/current-path", ExploreController.handleExploreCurrentPath);

// Route classification endpoint
router.post("/classify-routes", ExploreController.classifyRoutes);

export default router;
