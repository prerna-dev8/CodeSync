
import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/db";
import app from "./app";

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*" },
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});

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
