import "dotenv/config";
import express, { RequestHandler } from "express";
import cors from "cors";
import * as authController from "./controllers/authController";
import * as sessionController from "./controllers/sessionController";
import { protect } from "./middleware/auth";
import { verifyAccessToken } from "./middleware/verifyToken";
import errorHandler from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

app.post("/api/auth/register", authController.register);
app.get("/api/auth/verify-email", authController.verifyEmail);
app.post("/api/auth/resend-verification", authController.resendVerification);
app.post("/api/auth/login", authController.login);
app.post("/api/auth/forgot-password", authController.forgotPassword);
app.post("/api/auth/reset-password", authController.resetPassword);
app.get("/api/auth/me", protect as RequestHandler, authController.me as RequestHandler);
app.get("/api/auth/google", authController.googleAuth);
app.get("/api/auth/google/callback", authController.googleCallback);

// Session routes (protected with stateless JWT verification)
app.post("/api/session", verifyAccessToken as RequestHandler, sessionController.createSession as RequestHandler);
app.get("/api/session", verifyAccessToken as RequestHandler, sessionController.getUserSessions as RequestHandler);
app.get("/api/session/:sessionId", verifyAccessToken as RequestHandler, sessionController.getSession as RequestHandler);
app.post("/api/session/:sessionId/archive", verifyAccessToken as RequestHandler, sessionController.archiveSessionHandler as RequestHandler);

app.use(errorHandler);

export default app;
