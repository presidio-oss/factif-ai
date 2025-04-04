import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import chatRoutes from "./routes/chatRoutes";
import fileSystemRoutes from "./routes/fileSystemRoutes";
import actionRoutes from "./routes/actionRoutes";
import exploreRoutes from "./routes/exploreRoutes";
import historyRoutes from "./routes/historyRoutes";
import modeRoutes from "./routes/modeRoutes";
import StreamingSourceService from "./services/StreamingSourceService";
import { StreamingController } from "./controllers/streamingController";
import { ActionExecutorService } from "./services/actionExecutorService";

const app = express();
const httpServer = createServer(app);

const allowedOrigins = ["http://localhost:5173", "http://localhost:5174"];

// Configure Socket.IO with CORS
const io = new SocketServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Initialize services and controllers
export const streamingService = new StreamingSourceService(io);
export const actionExecutorService = new ActionExecutorService({ io });
const streamingController = new StreamingController(streamingService);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// Configure JSON body parser with increased limit
app.use(express.json({ limit: "50mb" }));

// Routes
app.use("/api/", chatRoutes);
app.use("/api/filesystem", fileSystemRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/mode", modeRoutes);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("New connection established.");

  // Streaming related events
  socket.on("start-stream", (params) =>
    streamingController.handleStartStream(socket, params)
  );
  socket.on("browser-action", (params) =>
    streamingController.handleBrowserAction(socket, params)
  );
  socket.on("request-screenshot", (params) =>
    streamingController.handleRequestScreenshot(socket, params)
  );
  socket.on("stop-browser", (params) =>
    streamingController.handleStopBrowser(socket, params)
  );
  socket.on("disconnect", () => streamingController.handleDisconnect());

  socket.on("error", (error) => {
    socket.emit("browser-error", {
      message: error?.message || "Unknown error occurred",
    });
  });
});

// Global error handler
app.use(errorHandler);

// ASCII art for server startup
console.log(`
 ______   ______     ______     ______   __     ______   ______     __    
/\\  ___\\ /\\  __ \\   /\\  ___\\   /\\__  _\\ /\\ \\   /\\  ___\\ /\\  __ \\   /\\ \\   
\\ \\  __\\ \\ \\  __ \\  \\ \\ \\____  \\/_/\\ \\/ \\ \\ \\  \\ \\  __\\ \\ \\  __ \\  \\ \\ \\  
 \\ \\_\\    \\ \\_\\ \\_\\  \\ \\_____\\    \\ \\_\\  \\ \\_\\  \\ \\_\\    \\ \\_\\ \\_\\  \\ \\_\\ 
  \\/_/     \\/_/\\/_/   \\/_____/     \\/_/   \\/_/   \\/_/     \\/_/\\/_/   \\/_/
`);

// Start server
httpServer.listen(config.port, () => {
  io.sockets.emit("browser-console", {
    type: "info",
    message: `Server running on port ${config.port}`,
  });
});

// Handle server errors
httpServer.on("error", (error) => {
  io.sockets.emit("browser-console", {
    type: "error",
    message: `Server error: ${error.message || "Unknown error"}`,
  });
});
