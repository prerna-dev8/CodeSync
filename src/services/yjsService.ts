import Y from "yjs";
import { Server, Socket } from "socket.io";
import Session from "../models/Session";

// Session-based Yjs document storage (in-memory)
// In production, use Redis or LevelDB for scaling
const docs = new Map<string, Y.Doc>();

// Awareness storage per session (in-memory only)
// DO NOT store in database
const awarenessData = new Map<string, Map<string, AwarenessState>>();

// Connected users tracking (sessionId -> userId -> socketId)
const connectedUsers = new Map<string, Map<string, string>>();

export interface AwarenessState {
  userId: string;
  displayName?: string;
  role: "owner" | "editor" | "viewer";
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  color: string;
}

/**
 * Get or create a Yjs document for a session
 */
export const getYDoc = (sessionId: string): Y.Doc => {
  if (!docs.has(sessionId)) {
    docs.set(sessionId, new Y.Doc());
  }
  return docs.get(sessionId)!;
};

/**
 * Get awareness data for a session
 */
export const getAwarenessData = (
  sessionId: string
): Map<string, AwarenessState> | undefined => {
  return awarenessData.get(sessionId);
};

/**
 * Update awareness for a specific user
 */
export const updateAwareness = (
  sessionId: string,
  userId: string,
  data: Partial<AwarenessState>
): void => {
  let sessionAwareness = awarenessData.get(sessionId);
  if (!sessionAwareness) {
    sessionAwareness = new Map();
    awarenessData.set(sessionId, sessionAwareness);
  }

  const existing = sessionAwareness.get(userId);
  if (existing) {
    sessionAwareness.set(userId, { ...existing, ...data });
  } else {
    sessionAwareness.set(userId, data as AwarenessState);
  }
};

/**
 * Remove user from awareness
 */
export const removeAwareness = (sessionId: string, userId: string): void => {
  const sessionAwareness = awarenessData.get(sessionId);
  if (sessionAwareness) {
    sessionAwareness.delete(userId);
  }

  // Also remove from connected users
  const sessionConnections = connectedUsers.get(sessionId);
  if (sessionConnections) {
    sessionConnections.delete(userId);
  }
};

/**
 * Get connected users in a session
 */
export const getConnectedUsers = (sessionId: string): string[] => {
  const sessionConnections = connectedUsers.get(sessionId);
  if (!sessionConnections) return [];
  return Array.from(sessionConnections.keys());
};

/**
 * Add user to connected users tracking
 */
export const addConnectedUser = (
  sessionId: string,
  userId: string,
  socketId: string
): void => {
  let sessionConnections = connectedUsers.get(sessionId);
  if (!sessionConnections) {
    sessionConnections = new Map();
    connectedUsers.set(sessionId, sessionConnections);
  }
  sessionConnections.set(userId, socketId);
};

/**
 * Generate deterministic color from userId
 */
export const generateUserColor = (userId: string, sessionId: string): string => {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F8B500", "#00CED1",
  ];

  // Generate consistent index from userId + sessionId
  let hash = 0;
  const combined = userId + sessionId;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
};

/**
 * Validate user role for a session
 */
export const getUserRole = async (
  sessionId: string,
  userId: string
): Promise<"owner" | "editor" | "viewer" | null> => {
  const session = await Session.findOne({ sessionId, state: "active" });
  if (!session) return null;

  const user = session.users.find(
    (u) => u.userId.toString() === userId
  );
  return user?.role ?? null;
};

/**
 * Can user edit the document?
 * Strict enforcement: owner/editor can edit, viewer cannot
 */
export const canEdit = (role: "owner" | "editor" | "viewer" | null): boolean => {
  return role === "owner" || role === "editor";
};

/**
 * Clean up session resources
 */
export const cleanupSession = (sessionId: string): void => {
  docs.delete(sessionId);
  awarenessData.delete(sessionId);
  connectedUsers.delete(sessionId);
};

/**
 * Initialize Socket.IO event handlers
 */
export const initializeSocketHandlers = (io: Server): void => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) {
        return next(new Error("Authentication required"));
      }

      // Verify JWT (signature + expiry only, no DB lookup)
      const decoded = verifyToken(token);
      if (!decoded?.id) {
        return next(new Error("Invalid token"));
      }

      // Attach userId to socket
      (socket as any).userId = decoded.id;
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id, "User:", (socket as any).userId);

    // Join session handler
    socket.on("join-session", async (data: { sessionId: string }) => {
      await handleJoinSession(io, socket, data);
    });

    // Awareness update handler (cursor, selection)
    socket.on("awareness-update", (data: Partial<AwarenessState>) => {
      handleAwarenessUpdate(io, socket, data);
    });

    // Yjs sync handler
    socket.on("sync", (data: { sessionId: string }) => {
      handleSync(io, socket, data);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      handleDisconnect(io, socket);
    });
  });
};

/**
 * Handle join session event
 */
const handleJoinSession = async (
  io: Server,
  socket: Socket,
  data: { sessionId: string }
): Promise<void> => {
  const { sessionId } = data;
  const userId = (socket as any).userId;

  try {
    // Validate session exists
    const session = await Session.findOne({ sessionId, state: "active" });
    if (!session) {
      socket.emit("error", { message: "Session not found" });
      return;
    }

    // Validate user is a member
    const userRole = await getUserRole(sessionId, userId);
    if (!userRole) {
      socket.emit("error", { message: "Not a member of this session" });
      return;
    }

    // Join socket room
    socket.join(sessionId);

    // Track connected user
    addConnectedUser(sessionId, userId, socket.id);

    // Initialize awareness if not exists
    const existingAwareness = awarenessData.get(sessionId)?.get(userId);
    if (!existingAwareness) {
      updateAwareness(sessionId, userId, {
        userId,
        role: userRole,
        color: generateUserColor(userId, sessionId),
      });
    }

    // Broadcast user joined
    io.to(sessionId).emit("user-joined", {
      userId,
      role: userRole,
      sessionId,
    });

    // Send current awareness state to the user
    const awareness = getAwarenessData(sessionId);
    socket.emit("awareness-state", Array.from(awareness?.values() || []));

    // Send Yjs document state
    const ydoc = getYDoc(sessionId);
    const state = Y.encodeStateAsUpdate(ydoc);
    socket.emit("sync", { state: Array.from(state) });

    console.log(`User ${userId} joined session ${sessionId} as ${userRole}`);
  } catch (error) {
    console.error("Join session error:", error);
    socket.emit("error", { message: "Failed to join session" });
  }
};

/**
 * Handle awareness update (cursor, selection)
 */
const handleAwarenessUpdate = (
  io: Server,
  socket: Socket,
  data: Partial<AwarenessState>
): void => {
  const userId = (socket as any).userId;
  const sessionId = Array.from(socket.rooms).find(
    (r) => r !== socket.id && r.startsWith("session:")
  );

  if (!sessionId) {
    return; // User not in a session
  }

  // Get user's role
  const awareness = awarenessData.get(sessionId);
  const userState = awareness?.get(userId);

  if (!userState) return;

  // Strict role enforcement: viewers cannot modify cursor/selection
  if (!canEdit(userState.role)) {
    return; // Ignore updates from viewers
  }

  // Validate cursor position
  if (data.cursor) {
    if (data.cursor.line < 0 || data.cursor.column < 0) {
      return; // Reject invalid positions
    }
  }

  // Update awareness
  updateAwareness(sessionId, userId, data);

  // Broadcast to session (excluding sender)
  socket.to(sessionId).emit("awareness-update", {
    userId,
    ...data,
  });
};

/**
 * Handle sync request
 */
const handleSync = (
  io: Server,
  socket: Socket,
  data: { sessionId: string }
): void => {
  const { sessionId } = data;
  const ydoc = getYDoc(sessionId);
  const state = Y.encodeStateAsUpdate(ydoc);

  // Send full state to requesting client
  socket.emit("sync", { state: Array.from(state) });
};

/**
 * Handle disconnect
 */
const handleDisconnect = (io: Server, socket: Socket): void => {
  const userId = (socket as any).userId;
  const sessionId = Array.from(socket.rooms).find(
    (r) => r !== socket.id
  );

  if (sessionId && userId) {
    // Remove from awareness
    removeAwareness(sessionId, userId);

    // Broadcast user left
    io.to(sessionId).emit("user-left", { userId });

    console.log(`User ${userId} left session ${sessionId}`);
  }

  console.log("Socket disconnected:", socket.id);
};

// Import verifyToken from jwt utils
import { verifyToken } from "../utils/jwt";
