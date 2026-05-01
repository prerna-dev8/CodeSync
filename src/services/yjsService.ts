import Y from "yjs";
import { SessionRole, AwarenessState, CursorPosition, SelectionRange } from "../types";
import Session from "../models/Session";

/**
 * Yjs Document Management Service
 * 
 * Maintains real-time collaborative document state using Yjs CRDT.
 * All operations are session-isolated and in-memory.
 * 
 * CRITICAL RULES:
 * - DO NOT store in database
 * - DO NOT implement custom diff/merge (Yjs handles it)
 * - Each session has isolated document state
 */

// ============================================
// In-Memory Storage
// ============================================

/** Yjs document storage: sessionId -> Y.Doc */
const yDocs = new Map<string, Y.Doc>();

/** Awareness storage: sessionId -> userId -> AwarenessState */
const awarenessData = new Map<string, Map<string, AwarenessState>>();

/** Connected users tracking: sessionId -> userId -> socketId */
const connectedUsers = new Map<string, Map<string, string>>();

// ============================================
// Document Operations
// ============================================

/**
 * Get or create a Yjs document for a session
 * If document doesn't exist, create new Y.Doc with empty state
 */
export const getYDoc = (sessionId: string): Y.Doc => {
  let doc = yDocs.get(sessionId);
  if (!doc) {
    doc = new Y.Doc();
    yDocs.set(sessionId, doc);
    console.log(`[YjsService] Created new document for session ${sessionId}`);
  }
  return doc;
};

/**
 * Get Yjs document if exists, else return null
 */
export const getYDocIfExists = (sessionId: string): Y.Doc | null => {
  return yDocs.get(sessionId) || null;
};

/**
 * Get full document state as Uint8Array
 * Used for sync protocol step 2
 */
export const getEncodedState = (sessionId: string): Uint8Array => {
  const doc = getYDoc(sessionId);
  return Y.encodeStateAsUpdate(doc);
};

/**
 * Apply update from client to Yjs document
 * Handles incremental changes
 */
export const applyUpdate = (sessionId: string, update: Uint8Array): void => {
  const doc = getYDoc(sessionId);
  Y.applyUpdate(doc, update);
};

/**
 * Check if session has a document
 */
export const hasDocument = (sessionId: string): boolean => {
  return yDocs.has(sessionId);
};

// ============================================
// Awareness Operations
// ============================================

/**
 * Initialize awareness for new session
 */
const initSessionAwareness = (sessionId: string): void => {
  if (!awarenessData.has(sessionId)) {
    awarenessData.set(sessionId, new Map());
  }
};

/**
 * Get awareness data for session
 */
export const getSessionAwareness = (
  sessionId: string
): Map<string, AwarenessState> | null => {
  initSessionAwareness(sessionId);
  return awarenessData.get(sessionId) || null;
};

/**
 * Get all awareness states for a session (array format)
 */
export const getAwarenessArray = (sessionId: string): AwarenessState[] => {
  const awareness = getSessionAwareness(sessionId);
  if (!awareness) return [];
  return Array.from(awareness.values());
};

/**
 * Update awareness for specific user
 * Handles partial updates (cursor, selection, etc.)
 */
export const updateAwareness = (
  sessionId: string,
  userId: string,
  data: Partial<AwarenessState>
): void => {
  initSessionAwareness(sessionId);
  const awareness = awarenessData.get(sessionId)!;
  
  const existing = awareness.get(userId);
  if (existing) {
    // Merge with existing state
    awareness.set(userId, { ...existing, ...data } as AwarenessState);
  } else {
    // Create new awareness entry
    awareness.set(userId, data as AwarenessState);
  }
};

/**
 * Get specific user's awareness state
 */
export const getUserAwareness = (
  sessionId: string,
  userId: string
): AwarenessState | null => {
  const awareness = awarenessData.get(sessionId);
  return awareness?.get(userId) || null;
};

/**
 * Remove user from awareness
 */
export const removeAwareness = (sessionId: string, userId: string): void => {
  const awareness = awarenessData.get(sessionId);
  if (awareness) {
    awareness.delete(userId);
  }
  // Also remove from connected users
  removeConnectedUser(sessionId, userId);
};

// ============================================
// Connected Users Management
// ============================================

/**
 * Track connected user (sessionId + userId -> socketId)
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
 * Get socket ID for user in session
 */
export const getUserSocketId = (
  sessionId: string,
  userId: string
): string | null => {
  const sessionConnections = connectedUsers.get(sessionId);
  return sessionConnections?.get(userId) || null;
};

/**
 * Remove connected user
 */
export const removeConnectedUser = (
  sessionId: string,
  userId: string
): void => {
  const sessionConnections = connectedUsers.get(sessionId);
  if (sessionConnections) {
    sessionConnections.delete(userId);
  }
};

/**
 * Get all connected user IDs in session
 */
export const getConnectedUserIds = (sessionId: string): string[] => {
  const sessionConnections = connectedUsers.get(sessionId);
  if (!sessionConnections) return [];
  return Array.from(sessionConnections.keys());
};

/**
 * Check if user is connected to session
 */
export const isUserConnected = (
  sessionId: string,
  userId: string
): boolean => {
  return getConnectedUserIds(sessionId).includes(userId);
};

// ============================================
// Role & Permission Helpers
// ============================================

/**
 * Get user's role in a session from database
 * Returns null if user is not a member or session doesn't exist
 */
export const getUserRole = async (
  sessionId: string,
  userId: string
): Promise<SessionRole | null> => {
  const session = await Session.findOne({
    sessionId,
    state: "active",
  });
  if (!session) return null;

  const user = session.users.find(
    (u) => u.userId.toString() === userId
  );
  return user?.role ?? null;
};

/**
 * Validate if role can edit (owner or editor only)
 */
export const canEdit = (role: SessionRole | null): boolean => {
  return role === "owner" || role === "editor";
};

/**
 * Validate cursor position (must be non-negative)
 */
export const isValidCursorPosition = (
  cursor: CursorPosition | undefined
): boolean => {
  if (!cursor) return true; // undefined is valid
  return cursor.line >= 0 && cursor.column >= 0;
};

/**
 * Validate selection range
 */
export const isValidSelection = (
  selection: SelectionRange | undefined
): boolean => {
  if (!selection) return true;
  const { startLine, startColumn, endLine, endColumn } = selection;
  return (
    startLine >= 0 &&
    startColumn >= 0 &&
    endLine >= 0 &&
    endColumn >= 0
  );
};

// ============================================
// Color Generation
// ============================================

/**
 * Predefined color palette for user avatars
 */
const COLOR_PALETTE = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F8B500", "#00CED1",
  "#FF69B4", "#32CD32", "#FFA500", "#6A5ACD",
];

/**
 * Generate deterministic color from userId + sessionId
 * Same user in same session always gets same color
 */
export const generateUserColor = (userId: string, sessionId: string): string => {
  const combined = userId + sessionId;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
};

// ============================================
// Session Cleanup
// ============================================

/**
 * Clean up all resources for a session
 * Call when session is archived or becomes inactive
 */
export const cleanupSession = (sessionId: string): void => {
  yDocs.delete(sessionId);
  awarenessData.delete(sessionId);
  connectedUsers.delete(sessionId);
  console.log(`[YjsService] Cleaned up session ${sessionId}`);
};

/**
 * Get debug info for session (development only)
 */
export const getSessionDebugInfo = (sessionId: string): {
  hasDoc: boolean;
  connectedUsers: number;
  awarenessSize: number;
} => {
  return {
    hasDoc: yDocs.has(sessionId),
    connectedUsers: connectedUsers.get(sessionId)?.size || 0,
    awarenessSize: awarenessData.get(sessionId)?.size || 0,
  };
};
