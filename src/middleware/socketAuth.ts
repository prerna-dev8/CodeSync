import { Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { JwtPayload } from "../types";
import { AuthenticatedSocket } from "../types";

/**
 * Socket.IO Authentication Middleware
 * 
 * Security rules:
 * - Verify JWT token signature and expiry ONLY (stateless, no DB lookup)
 * - Extract userId ONLY from JWT payload
 * - Reject all unauthenticated connections immediately
 * - Attach userId to socket object for use in handlers
 */

export interface SocketAuthMiddleware {
  (socket: Socket, next: (err?: Error) => void): void;
}

/**
 * Create authentication middleware for Socket.IO
 * Verifies JWT token from handshake auth or query parameter
 */
export const createSocketAuthMiddleware = (): SocketAuthMiddleware => {
  return (socket: Socket, next: (err?: Error) => void): void => {
    try {
      // Support token from multiple sources (prioritize auth.token for v3+ clients)
      const token = 
        (socket.handshake.auth as any)?.token || 
        socket.handshake.query?.token as string ||
        (socket.handshake.headers?.authorization as string)?.replace("Bearer ", "");

      // Reject if no token provided
      if (!token) {
        console.log(`[SocketAuth] No token provided for socket ${socket.id}`);
        return next(new Error("Authentication required: No token provided"));
      }

      // Verify JWT signature and expiry (stateless verification)
      const decoded = verifyToken(token) as JwtPayload | null;

      // Verify decoded payload contains userId
      if (!decoded?.id) {
        console.log(`[SocketAuth] Invalid token for socket ${socket.id}`);
        return next(new Error("Authentication required: Invalid token"));
      }

      // Attach userId to socket - this is the ONLY trusted source of user identity
      (socket as any as AuthenticatedSocket).userId = decoded.id;

      console.log(`[SocketAuth] Authenticated socket ${socket.id} for user ${decoded.id}`);
      next();
    } catch (error) {
      console.log(`[SocketAuth] Token verification failed for socket ${socket.id}`);
      next(new Error("Authentication required: Token verification failed"));
    }
  };
};

/**
 * Get userId from authenticated socket
 * Returns null if not authenticated
 */
export const getSocketUserId = (socket: Socket): string | null => {
  const authSocket = socket as any as AuthenticatedSocket;
  return authSocket.userId || null;
};

/**
 * Check if socket is authenticated
 */
export const isSocketAuthenticated = (socket: Socket): boolean => {
  return !!getSocketUserId(socket);
};
