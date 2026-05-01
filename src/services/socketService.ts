import { Server, Socket } from "socket.io";
import Y from "yjs";
import { getSocketUserId, isSocketAuthenticated } from "../middleware/socketAuth";
import {
  getYDoc,
  getEncodedState,
  applyUpdate,
  updateAwareness,
  removeAwareness,
  addConnectedUser,
  getConnectedUserIds,
  getSessionAwareness,
  getAwarenessArray,
  removeConnectedUser,
  canEdit,
  isValidCursorPosition,
  isValidSelection,
  generateUserColor,
  getUserAwareness,
} from "./yjsService";
import {
  loadFromDatabase,
  queueAutoSave,
  saveNow,
  createManualSnapshot,
  getSessionSnapshots,
  restoreSnapshot,
  deleteSessionSnapshot,
} from "./persistenceService";
import Session from "../models/Session";
import {
  JoinSessionPayload,
  AwarenessUpdatePayload,
  SessionRole,
  UserJoinedPayload,
  UserLeftPayload,
  AwarenessState,
} from "../types";

/**
 * Socket Service - Real-Time Collaboration Engine
 * 
 * Handles all Socket.IO events for collaborative editing.
 * Implements:
 * - JWT authentication
 * - Session validation
 * - Yjs sync protocol
 * - Awareness management
 * - Role-based permission enforcement
 */

// ============================================
// Constants
// ============================================

const CURSOR_THROTTLE_MS = 30; // Throttle cursor updates to 30ms
const MAX_RECONNECT_ATTEMPTS = 3;

// Track last cursor update time per user (for throttling)
const lastCursorUpdate = new Map<string, number>();

// ============================================
// Permission Validation
// ============================================

/**
 * Get user's role in a session (from DB)
 * Returns null if user is not a member
 */
const getUserRole = async (
  sessionId: string,
  userId: string
): Promise<SessionRole | null> => {
  const session = await Session.findOne({ sessionId, state: "active" });
  if (!session) return null;

  const user = session.users.find(
    (u) => u.userId.toString() === userId
  );
  return user?.role || null;
};

/**
 * Validate session exists and is active
 * Returns session document or null
 */
const validateSession = async (sessionId: string) => {
  return Session.findOne({ sessionId, state: "active" });
};

/**
 * Validate user is a member of session
 */
const validateUserMembership = async (
  sessionId: string,
  userId: string
): Promise<boolean> => {
  const session = await Session.findOne({
    sessionId,
    state: "active",
    "users.userId": userId,
  });
  return !!session;
};

// ============================================
// Socket Handlers
// ============================================

/**
 * Initialize Socket.IO event handlers
 * Called from server.ts
 */
export const initializeSocketHandlers = (io: Server): void => {
  console.log("[SocketService] Initializing Socket.IO handlers");

  io.on("connection", (socket: Socket) => {
    console.log(`[SocketService] New connection: ${socket.id}`);

    // Verify authentication
    if (!isSocketAuthenticated(socket)) {
      console.log(`[SocketService] Unauthorized connection attempted: ${socket.id}`);
      socket.emit("error", { message: "Authentication required" });
      socket.disconnect();
      return;
    }

    const userId = getSocketUserId(socket);
    console.log(`[SocketService] User ${userId} connected`);

    // ============================================
    // Event: join-session
    // ============================================
    socket.on("join-session", async (data: JoinSessionPayload) => {
      await handleJoinSession(io, socket, data);
    });

    // ============================================
    // Event: sync (request Yjs state)
    // ============================================
    socket.on("sync", async (data: { sessionId: string }) => {
      await handleSync(io, socket, data);
    });

    // ============================================
    // Event: yjs-update (incremental changes)
    // ============================================
    socket.on("yjs-update", async (data: { sessionId: string; update: number[] }) => {
      await handleYjsUpdate(io, socket, data);
    });

    // ============================================
    // Event: awareness-update (cursor/selection)
    // ============================================
    socket.on("awareness-update", (data: AwarenessUpdatePayload) => {
      handleAwarenessUpdate(io, socket, data);
    });

    // ============================================
    // Event: disconnect
    // ============================================
    socket.on("disconnect", () => {
      handleDisconnect(io, socket);
    });
  });
};

// ============================================
// Join Session Handler
// ============================================

/**
 * Handle join-session event
 * 
 * Steps:
 * 1. Verify JWT (already done by middleware)
 * 2. Validate session exists
 * 3. Validate session.state === "active"
 * 4. Validate user is a member of session.users
 * 5. Join socket room
 * 6. Initialize awareness
 * 7. Broadcast user-joined
 */
const handleJoinSession = async (
  io: Server,
  socket: Socket,
  data: JoinSessionPayload
): Promise<void> => {
  const { sessionId } = data;
  const userId = getSocketUserId(socket);

  if (!userId) {
    socket.emit("error", { message: "User not authenticated" });
    return;
  }

  if (!sessionId) {
    socket.emit("error", { message: "Session ID is required" });
    return;
  }

  try {
    // Step 1: Validate session exists
    const session = await validateSession(sessionId);
    if (!session) {
      socket.emit("error", { message: "Session not found" });
      return;
    }

    // Step 2: Validate session is active (already checked above, but explicit)
    if (session.state !== "active") {
      socket.emit("error", { message: "Session is not active" });
      return;
    }

    // Step 3: Validate user is a member
    const isMember = await validateUserMembership(sessionId, userId);
    if (!isMember) {
      socket.emit("error", { message: "Not a member of this session" });
      return;
    }

    // Step 4: Get user's role
    const role = await getUserRole(sessionId, userId);
    if (!role) {
      socket.emit("error", { message: "Failed to get user role" });
      return;
    }

    // Step 5: Join socket room
    socket.join(sessionId);

    // Attach session info to socket
    (socket as any).sessionId = sessionId;
    (socket as any).role = role;

    // Step 6: Track connected user
    addConnectedUser(sessionId, userId, socket.id);

    // Step 7: Initialize awareness
    const existingAwareness = getUserAwareness(sessionId, userId);
    if (!existingAwareness) {
      updateAwareness(sessionId, userId, {
        userId,
        role,
        color: generateUserColor(userId, sessionId),
      });
    }

    // Step 8: Broadcast user-joined
    const joinPayload: UserJoinedPayload = {
      userId,
      role,
      sessionId,
    };
    io.to(sessionId).emit("user-joined", joinPayload);

    // Step 9: Send current awareness state to joining user
    const awarenessArray = getAwarenessArray(sessionId);
    socket.emit("awareness-state", awarenessArray);

    // Step 10: Send Yjs document state (sync protocol step 2)
    const yDoc = getYDoc(sessionId);
    const state = Y.encodeStateAsUpdate(yDoc);
    socket.emit("sync", {
      sessionId,
      state: Array.from(state),
    });

    console.log(`[SocketService] User ${userId} joined session ${sessionId} as ${role}`);
  } catch (error) {
    console.error("[SocketService] Join session error:", error);
    socket.emit("error", { message: "Failed to join session" });
}
};

// ============================================
// Sync Handler
// ============================================

/**
 * Handle sync event (request full Yjs state)
 * Implements sync protocol step 1 -> step 2
 */
const handleSync = async (
  io: Server,
  socket: Socket,
  data: { sessionId: string }
): Promise<void> => {
  const { sessionId } = data;
  const userId = getSocketUserId(socket);

  if (!userId) {
    socket.emit("error", { message: "User not authenticated" });
    return;
  }

  // Verify user is in session
  const isConnected = getConnectedUserIds(sessionId).includes(userId);
  if (!isConnected) {
    socket.emit("error", { message: "Not connected to session" });
    return;
  }

  // Send full state (sync step 2)
  const yDoc = getYDoc(sessionId);
  const state = Y.encodeStateAsUpdate(yDoc);
  socket.emit("sync", {
    sessionId,
    state: Array.from(state),
  });
};

// ============================================
// Yjs Update Handler
// ============================================

/**
 * Handle yjs-update event (incremental changes from client)
 * 
 * CRITICAL: Enforce role-based permissions
 * - owner/editor: CAN update document
 * - viewer: DENY all edit events
 */
const handleYjsUpdate = async (
  io: Server,
  socket: Socket,
  data: { sessionId: string; update: number[] }
): Promise<void> => {
  const { sessionId, update } = data;
  const userId = getSocketUserId(socket);

  if (!userId) {
    socket.emit("error", { message: "User not authenticated" });
    return;
  }

  const role = (socket as any).role as SessionRole;

  // STRICT ENFORCEMENT: Viewers cannot edit
  if (!canEdit(role)) {
    console.log(`[SocketService] Viewer ${userId} attempted to edit session ${sessionId}`);
    socket.emit("error", { message: "Permission denied: Viewers cannot edit" });
    return;
  }

  // Apply update to Yjs document
  try {
    applyUpdate(sessionId, new Uint8Array(update));

    // Broadcast update to other clients in session
    socket.to(sessionId).emit("yjs-update", {
      sessionId,
      update,
    });
  } catch (error) {
    console.error("[SocketService] Yjs update error:", error);
    socket.emit("error", { message: "Failed to apply update" });
  }
};

// ============================================
// Awareness Update Handler
// ============================================

/**
 * Handle awareness-update event (cursor/selection)
 * 
 * CRITICAL: Enforce role-based permissions
 * - owner/editor: CAN update cursor/selection
 * - viewer: DENY cursor/selection changes (but can still see others)
 * 
 * Performance:
 * - Throttle cursor updates (30ms)
 * - Validate cursor positions
 * - Ignore redundant updates
 */
const handleAwarenessUpdate = (
  io: Server,
  socket: Socket,
  data: AwarenessUpdatePayload
): void => {
  const { sessionId, cursor, selection } = data;
  const userId = getSocketUserId(socket);

  if (!userId) {
    socket.emit("error", { message: "User not authenticated" });
    return;
  }

  const role = (socket as any).role as SessionRole;

  // STRICT ENFORCEMENT: Viewers cannot update their own cursor/selection
  // (but they CAN see other users' cursors)
  if (!canEdit(role)) {
    // Silently ignore - don't error, just don't update own awareness
    return;
  }

  // Validate cursor position (non-negative)
  if (!isValidCursorPosition(cursor)) {
    console.log(`[SocketService] Invalid cursor position from ${userId}`);
    return;
  }

  // Validate selection range
  if (!isValidSelection(selection)) {
    console.log(`[SocketService] Invalid selection from ${userId}`);
    return;
  }

  // Throttle cursor updates
  const now = Date.now();
  const lastUpdate = lastCursorUpdate.get(userId) || 0;
  if (now - lastUpdate < CURSOR_THROTTLE_MS) {
    return; // Skip redundant update
  }
  lastCursorUpdate.set(userId, now);

  // Update awareness state
  updateAwareness(sessionId, userId, {
    cursor,
    selection,
  });

  // Broadcast to other users in session
  socket.to(sessionId).emit("awareness-update", {
    userId,
    cursor,
    selection,
  });
};

// ============================================
// Disconnect Handler
// ============================================

/**
 * Handle disconnect event
 * 
 * Steps:
 * 1. Remove user from awareness
 * 2. Remove user from connected users
 * 3. Broadcast user-left event
 */
const handleDisconnect = (io: Server, socket: Socket): void => {
  const userId = getSocketUserId(socket);
  const sessionId = (socket as any).sessionId as string;

  if (sessionId && userId) {
    // Step 1: Remove from awareness
    removeAwareness(sessionId, userId);

    // Step 2: Remove from connected users
    removeConnectedUser(sessionId, userId);

    // Step 3: Broadcast user-left
    const leavePayload: UserLeftPayload = { userId };
    io.to(sessionId).emit("user-left", leavePayload);

    console.log(`[SocketService] User ${userId} disconnected from session ${sessionId}`);
  }

  console.log(`[SocketService] Socket disconnected: ${socket.id}`);
};
