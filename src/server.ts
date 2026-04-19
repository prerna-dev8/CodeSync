import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/db";
import * as authController from "./controllers/authController";
import { protect } from "./middleware/auth";
import { requireVerified } from "./middleware/requireVerified";
import errorHandler from "./middleware/errorHandler";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "*" },
});

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

// Auth routes
app.post("/api/auth/register", authController.register);
app.get("/api/auth/verify-email", authController.verifyEmail);
app.post("/api/auth/resend-verification", authController.resendVerification);
app.post("/api/auth/login", authController.login);
app.post("/api/auth/forgot-password", authController.forgotPassword);
app.post("/api/auth/reset-password", authController.resetPassword);
// app.get("/api/auth/me", protect, authController.me);
app.get("/api/auth/google", authController.googleAuth);
app.get("/api/auth/google/callback", authController.googleCallback);

app.use(errorHandler);

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.on("disconnect", () => console.log("Socket disconnected:", socket.id));
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
