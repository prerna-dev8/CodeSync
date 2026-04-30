import { Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { AuthRequest } from "../types";

/**
 * Stateless JWT verification middleware.
 * 
 * Security rules:
 * - Extracts userId ONLY from JWT payload
 * - Validates JWT signature and expiry ONLY (no DB lookup)
 * - Does NOT trust client input for user identity
 * - Keeps system stateless
 */
export const verifyAccessToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists and has Bearer token format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Access token required" });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Access token required" });
    return;
  }

  try {
    // Verify JWT signature and expiry ONLY
    // This is stateless - no DB lookup required
    const decoded = verifyToken(token);

    // Extract userId from JWT payload only
    // Never trust client input for user identity
    if (!decoded.id) {
      res.status(401).json({ message: "Invalid token payload" });
      return;
    }

    // Attach userId to request for use in controllers
    // This is the ONLY trusted source of user identity
    req.userId = decoded.id;
    next();
  } catch (error) {
    // JWT verification failed (invalid signature or expired)
    res.status(401).json({ message: "Invalid or expired access token" });
  }
};
