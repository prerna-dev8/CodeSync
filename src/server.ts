
import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/db";
import app from "./app";
import { createSocketAuthMiddleware } from "./middleware/socketAuth";
import { initializeSocketHandlers } from "./services/socketService";

const httpServer = http.createServer(app);

// Initialize Socket.IO with authentication middleware
const io = new Server(httpServer, {
  cors: { 
    origin: true, // Dynamically reflects the incoming request's origin
    credentials: true,
  },
});

// Apply Socket.IO authentication middleware
io.use(createSocketAuthMiddleware());

// Initialize Socket event handlers
initializeSocketHandlers(io);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  httpServer
    .listen(PORT, () => console.log(`Server running on port ${PORT}`))
    .on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Another server instance is running.`);
        console.error(`Use the existing server on http://localhost:${PORT} — do not start a new one.`);
        process.exit(1);
      }
      console.error("Server error:", err.message);
      process.exit(1);
    });
});
