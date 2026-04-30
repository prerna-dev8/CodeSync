import { Response } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import Session, {
  findBySessionId,
  addUserToSession,
  findUserSessions,
  archiveSession,
  SessionRole,
} from "../models/Session";
import SessionInvite from "../models/SessionInvite";
import { AuthRequest } from "../types";

const SESSION_ID_LENGTH = 10;
const MAX_COLLISION_RETRIES = 3;
const INVITE_EXPIRY_HOURS = 24;
const INVITE_ROLES: ReadonlyArray<Exclude<SessionRole, "owner">> = ["editor", "viewer"];

/**
 * Generates a cryptographically secure session ID.
 * 
 * @returns 10-character hexadecimal string
 */
const generateSessionId = (): string => {
  return crypto.randomBytes(SESSION_ID_LENGTH / 2).toString("hex");
};

const generateInviteCode = (): string => {
  return crypto.randomBytes(SESSION_ID_LENGTH / 2).toString("hex");
};

const isInviteRole = (role: unknown): role is Exclude<SessionRole, "owner"> => {
  return typeof role === "string" && INVITE_ROLES.includes(role as Exclude<SessionRole, "owner">);
};

const isSessionOwner = (session: { users: Array<{ userId: mongoose.Types.ObjectId; role: SessionRole }> }, userId: mongoose.Types.ObjectId): boolean => {
  return session.users.some(
    (user) => user.userId.toString() === userId.toString() && user.role === "owner"
  );
};

/**
 * Creates a new collaboration session.
 * 
 * Security rules:
 * - User is extracted ONLY from JWT (req.userId set by verifyAccessToken middleware)
 * - Never trust client input for user identity
 * - Session ID uses cryptographically secure random generator
 * - Uniqueness ensured with retry on collision
 * - Uses atomic $addToSet to prevent duplicate user entries
 */
export const createSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID not found in token" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    let sessionId: string;
    let retries = 0;
    let created = false;

    while (!created && retries < MAX_COLLISION_RETRIES) {
      sessionId = generateSessionId();

      try {
        const session = await Session.create({
          sessionId,
          users: [
            {
              userId: userObjectId,
              role: "owner" as const,
            },
          ],
          state: "active" as const,
        });

        created = true;

        res.status(201).json({
          message: "Session created",
          sessionId: session.sessionId,
        });
      } catch (error: unknown) {
        const err = error as { code?: number };
        if (err.code === 11000) {
          retries++;
          if (retries >= MAX_COLLISION_RETRIES) {
            res.status(500).json({ message: "Failed to generate unique session ID" });
            return;
          }
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error("Session creation error:", error);
    res.status(500).json({ message: "Failed to create session" });
  }
};

/**
 * GET /session/:sessionId
 * 
 * Join/retrieve a session.
 * - Validate JWT
 * - Check session exists
 * - Check session.state === "active"
 * - If user is not a member, add as "viewer"
 * - Operation is idempotent and atomic
 * 
 * Rules:
 * - Each user appears ONLY ONCE in session.users
 * - If user already exists, DO NOT modify role
 * - Do NOT allow duplicates under concurrent requests ($addToSet)
 */
export const getSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID not found in token" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session ID is required" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Check if session exists
    const session = await findBySessionId(sessionId);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    // Check if session is active
    if (session.state !== "active") {
      res.status(403).json({ message: "Session is archived" });
      return;
    }

    // Check if user is already a member
    const isMember = session.users.some(
      (u) => u.userId.toString() === userObjectId.toString()
    );

    if (!isMember) {
      // Add user as viewer (atomic, idempotent)
      await addUserToSession(sessionId, userObjectId, "viewer");
    }

    // Fetch updated session to return current user info
    const updatedSession = await findBySessionId(sessionId);
    const currentUser = updatedSession?.users.find(
      (u) => u.userId.toString() === userObjectId.toString()
    );

    res.status(200).json({
      sessionId: updatedSession?.sessionId,
      state: updatedSession?.state,
      role: currentUser?.role,
      users: updatedSession?.users.map((u) => ({
        userId: u.userId.toString(),
        role: u.role,
      })),
    });
  } catch (error) {
    console.error("Get session error:", error);
    res.status(500).json({ message: "Failed to get session" });
  }
};

/**
 * GET /sessions
 * 
 * Return all sessions for authenticated user.
 * - Extract userId ONLY from JWT
 */
export const getUserSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID not found in token" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const sessions = await findUserSessions(userObjectId);

    res.status(200).json({
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        state: session.state,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        role: session.users.find((u) => u.userId.toString() === userObjectId.toString())?.role,
      })),
    });
  } catch (error) {
    console.error("Get user sessions error:", error);
    res.status(500).json({ message: "Failed to get sessions" });
  }
};

/**
 * POST /session/:sessionId/archive
 * 
 * Archive a session (owner only).
 * - Validate JWT
 * - Check user is owner
 * - Change state to "archived"
 */
export const archiveSessionHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID not found in token" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session ID is required" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const session = await archiveSession(sessionId, userObjectId);

    if (!session) {
      res.status(403).json({ message: "Only owner can archive session or session not found" });
      return;
    }

    res.status(200).json({
      message: "Session archived",
      sessionId: session.sessionId,
      state: session.state,
    });
  } catch (error) {
    console.error("Archive session error:", error);
    res.status(500).json({ message: "Failed to archive session" });
  }
};

/**
 * POST /session/:sessionId/invites
 *
 * Create role-based invite codes for a session. Each invite receives a unique
 * code that expires after 24 hours.
 */
export const createSessionInvites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;
    const invites = req.body.invites;

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID not found in token" });
      return;
    }

    if (!sessionId) {
      res.status(400).json({ message: "Session ID is required" });
      return;
    }

    if (!Array.isArray(invites) || invites.length === 0) {
      res.status(400).json({ message: "Invites must be a non-empty array" });
      return;
    }

    const session = await findBySessionId(sessionId);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    if (session.state !== "active") {
      res.status(403).json({ message: "Session is archived" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    if (!isSessionOwner(session, userObjectId)) {
      res.status(403).json({ message: "Only session owner can create invites" });
      return;
    }

    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
    const createdInvites = [];

    for (const invite of invites) {
      const email = typeof invite?.email === "string" ? invite.email.trim().toLowerCase() : "";
      const role = invite?.role;

      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        res.status(400).json({ message: "Each invite requires a valid email" });
        return;
      }

      if (!isInviteRole(role)) {
        res.status(400).json({ message: "Invite role must be editor or viewer" });
        return;
      }

      let inviteDoc = null;
      let retries = 0;

      while (!inviteDoc && retries < MAX_COLLISION_RETRIES) {
        try {
          inviteDoc = await SessionInvite.create({
            sessionId,
            email,
            role,
            code: generateInviteCode(),
            expiresAt,
            createdBy: userObjectId,
          });
        } catch (error: unknown) {
          const err = error as { code?: number };
          if (err.code === 11000) {
            retries++;
          } else {
            throw error;
          }
        }
      }

      if (!inviteDoc) {
        res.status(500).json({ message: "Failed to generate unique invite code" });
        return;
      }

      createdInvites.push({
        email: inviteDoc.email,
        role: inviteDoc.role,
        code: inviteDoc.code,
        expiresAt: inviteDoc.expiresAt,
      });
    }

    res.status(201).json({
      message: "Invites created",
      sessionId,
      invites: createdInvites,
    });
  } catch (error) {
    console.error("Create invites error:", error);
    res.status(500).json({ message: "Failed to create invites" });
  }
};

/**
 * POST /session/invites/redeem
 *
 * Redeem an unexpired invite code and add the authenticated user to the
 * corresponding active session with the invite role.
 */
export const redeemSessionInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const code = typeof req.body.code === "string" ? req.body.code.trim() : "";

    if (!userId) {
      res.status(401).json({ message: "Unauthorized: User ID not found in token" });
      return;
    }

    if (!code) {
      res.status(400).json({ message: "Invite code is required" });
      return;
    }

    const invite = await SessionInvite.findOne({
      code,
      expiresAt: { $gt: new Date() },
      usedAt: { $exists: false },
    });

    if (!invite) {
      res.status(404).json({ message: "Invite code not found or expired" });
      return;
    }

    const session = await findBySessionId(invite.sessionId);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    if (session.state !== "active") {
      res.status(403).json({ message: "Session is archived" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const existingUser = session.users.find(
      (user) => user.userId.toString() === userObjectId.toString()
    );

    if (!existingUser) {
      await addUserToSession(invite.sessionId, userObjectId, invite.role);
    }

    await SessionInvite.updateOne(
      { _id: invite._id, usedAt: { $exists: false } },
      { $set: { usedBy: userObjectId, usedAt: new Date() } }
    );

    res.status(200).json({
      message: "Invite code accepted",
      sessionId: invite.sessionId,
      role: existingUser?.role ?? invite.role,
    });
  } catch (error) {
    console.error("Redeem invite error:", error);
    res.status(500).json({ message: "Failed to redeem invite" });
  }
};
