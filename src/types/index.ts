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

export interface IRefreshTokenDoc extends Document {
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  revoked: boolean;
}
export type IRefreshToken = IRefreshTokenDoc;

export interface AuthRequest extends Request {
  user?: {
    _id: any;
    username: string;
    email: string;
    avatar?: string;
    isVerified: boolean;
  };
}

export interface JwtPayload {
  id: string;
}

export const SessionRole = {
  OWNER: 'owner' as const,
  EDITOR: 'editor' as const,
  VIEWER: 'viewer' as const,
} as const;
export type SessionRole = typeof SessionRole[keyof typeof SessionRole];

export interface ISessionMember {
  userId: string | IUser;
  role: SessionRole;
  joinedAt: Date;
}

export interface ISessionInvite {
  token: string;
  expiresAt: Date;
}

export interface ISessionPresence {
  userId?: string;
  username?: string;
  color?: string;
  isActive?: boolean;
}

export interface ISessionCursor {
  userId: string;
  username?: string;
  color?: string;
  position?: { line?: number; ch?: number };
  selection?: { anchor?: number; head?: number };
}

export interface ISession {
  title: string;
  ownerId: string | IUser;
  members: ISessionMember[];
  state: 'active' | 'archived';
  inviteTokens: ISessionInvite[];
  idleTimeout?: Date;
  maxMembers?: number;
  docState?: Buffer;
  cursors?: Record<string, ISessionCursor> | Map<string, ISessionCursor>;
  presence?: Record<string, ISessionPresence> | Map<string, ISessionPresence>;
}

export interface SocketData {
  userId: string;
  username: string;
  role: SessionRole;
  sessionId: string;
  color?: string;
}

// ========== NEW EXECUTION TYPES ==========
export type Language = 'cpp' | 'c' | 'python' | 'javascript';
export type ExecutionState = 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'stopped';

export interface IExecution extends Document {
  executionId: string;
  sessionId: string;
  documentVersionId: string;
  language: Language;
  codeSnapshot: string;
  stdin: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  state: ExecutionState;
  createdAt: Date;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  containerId: string;
}

