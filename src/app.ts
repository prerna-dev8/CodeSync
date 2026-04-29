import "dotenv/config";
import express, { RequestHandler } from "express";
import cors from "cors";
import * as authController from "./controllers/authController";
import { protect } from "./middleware/auth";
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

app.use(errorHandler);

export default app;
