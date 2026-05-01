import { Request } from "express";
import { Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  email: string;
  password?: string;
  googleId?: string;
  isVerified: boolean;
  verificationToken?: string;
  verificationTokenExpiry?: Date;
  passwordResetToken?: string;
  passwordResetTokenExpiry?: Date;
  avatar?: string;
  comparePassword(plain: string): Promise<boolean>;
}

export interface AuthRequest extends Request {
  user?: IUser;
  userId?: string; // Extracted from JWT token only (stateless verification)
}

export interface JwtPayload {
  id: string;
}

// ============================================
// WebSocket & Collaboration Types
// ============================================

export type SessionRole = "owner" | "editor" | "viewer";

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

/**
 * Awareness state broadcast to all users
 * Stored in-memory only (DO NOT persist to DB)
 */
export interface AwarenessState {
  userId: string;
  displayName?: string;
  role: SessionRole;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  color: string;
}

/**
 * Socket.IO event payload for joining a session
 */
export interface JoinSessionPayload {
  sessionId: string;
  token: string; // JWT access token (REQUIRED)
}

/**
 * Yjs sync message payloads
 * Protocol: Step 1 (request state) -> Step 2 (sync full state)
 */
export interface YjsSyncRequest {
  sessionId: string;
}

export interface YjsSyncResponse {
  sessionId: string;
  state: number[]; // Uint8Array as base64 or number array
}

/**
 * Yjs update message (incremental changes)
 */
export interface YjsUpdateMessage {
  sessionId: string;
  update: number[]; // Uint8Array encoded as number[]
}

/**
 * Awareness update payload from client
 */
export interface AwarenessUpdatePayload {
  sessionId: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
}

/**
 * User joined event payload
 */
export interface UserJoinedPayload {
  userId: string;
  role: SessionRole;
  sessionId: string;
}

/**
 * User left event payload
 */
export interface UserLeftPayload {
  userId: string;
}

/**
 * Error event payload
 */
export interface SocketErrorPayload {
  message: string;
  code?: string;
}

/**
 * Authenticated socket with user information
 */
export interface AuthenticatedSocket {
  userId: string;
  sessionId?: string;
  role?: SessionRole;
}
