import Y from "yjs";
import mongoose from "mongoose";
import { Server, Socket } from "socket.io";
import SessionCode, {
  getLatestCode,
  saveCode,
  updateCode,
} from "../models/SessionCode";
import Snapshot, {
  getSnapshots,
  getSnapshotById,
  createSnapshot,
  deleteSnapshot,
  deleteAllSnapshots,
  shouldCreateAutoSnapshot,
} from "../models/Snapshot";
import { getYDoc, getUserRole, canEdit } from "./yjsService";
import { getSocketUserId } from "../middleware/socketAuth";
import Session from "../models/Session";

// ============================================
// Constants
// ============================================

/**
 * Auto-save debounce interval
 * Wait 3 seconds after last change before saving
 */
const AUTO_SAVE_INTERVAL_MS = 3000;

/**
 * Auto-snapshot interval (minutes)
 */
const AUTO_SNAPSHOT_INTERVAL_MINUTES = 10;

/**
 * Max snapshots per session
 */
const MAX_SNAPSHOTS = 20;

// ============================================
// State
// ============================================

/**
 * Track pending saves per session
 * Key: sessionId, Value: setTimeout reference
 */
const pendingSaves = new Map<string, NodeJS.Timeout>();

/**
 * Track pending snapshots per session
 * Key: sessionId, Value: setTimeout reference
 */
const pendingSnapshots = new Map<string, NodeJS.Timeout>();

// ============================================
// Public Functions
// ============================================

/**
 * Initialize persistence handlers
 * Called from socketService when user joins session
 */
export const initializePersistence = (io: Server): void => {
  // Auto-save and snapshot handlers are triggered by Yjs updates
  // No special initialization needed
  console.log("[PersistenceService] Initialized");
};

/**
 * Load latest code from database
 * Returns code and Yjs state
 * Called when user joins session
 */
export const loadFromDatabase = async (
  sessionId: string
): Promise<{
  code: string;
  codeState: Uint8Array | null;
  language: string;
} | null> => {
  try {
    const sessionCode = await getLatestCode(sessionId);
    if (!sessionCode) {
      // No saved code yet
      return null;
    }

    return {
      code: sessionCode.code,
      codeState: sessionCode.codeState
        ? new Uint8Array(sessionCode.codeState)
        : null,
      language: sessionCode.language,
    };
  } catch (error) {
    console.error("[PersistenceService] Load error:", error);
    return null;
  }
};

/**
 * Queue auto-save for session
 * Debounced - waits 3 seconds after last change
 * Called after each Yjs update
 */
export const queueAutoSave = async (
  io: Server,
  sessionId: string,
  userId: string
): Promise<void> => {
  // Clear any pending save for this session
  const existingTimeout = pendingSaves.get(sessionId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Schedule new save
  const timeout = setTimeout(async () => {
    await performAutoSave(io, sessionId, userId);
    pendingSaves.delete(sessionId);

    // Check if should create auto-snapshot
    await checkAutoSnapshot(io, sessionId, userId);
  }, AUTO_SAVE_INTERVAL_MS);

  pendingSaves.set(sessionId, timeout);
};

/**
 * Save code immediately (manual trigger)
 * Called by user action
 */
export const saveNow = async (
  io: Server,
  sessionId: string,
  userId: string,
  language: string = "javascript"
): Promise<boolean> => {
  try {
    // Get current Yjs document
    const ydoc = getYDoc(sessionId);
    const code = ydoc.getText("code").toString();
    const codeState = Y.encodeStateAsUpdate(ydoc);

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Save to database
    await saveCode(
      sessionId,
      code,
      Buffer.from(codeState),
      language,
      userObjectId
    );

    // Notify user
    const socket = io.sockets.sockets.get(
      Array.from(io.sockets.adapter.rooms.get(sessionId) || [])[0]
    );
    if (socket) {
      socket.emit("saved", { sessionId, timestamp: Date.now() });
    }

    console.log(`[PersistenceService] Saved session ${sessionId}`);
    return true;
  } catch (error) {
    console.error("[PersistenceService] Save error:", error);
    return false;
  }
};

/**
 * Create manual snapshot
 * Users can trigger this manually
 */
export const createManualSnapshot = async (
  sessionId: string,
  userId: string,
  name: string = ""
): Promise<boolean> => {
  try {
    const ydoc = getYDoc(sessionId);
    const code = ydoc.getText("code").toString();
    const codeState = Y.encodeStateAsUpdate(ydoc);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    await createSnapshot(
      sessionId,
      code,
      Buffer.from(codeState),
      "javascript",
      userObjectId,
      name,
      false // not auto
    );

    console.log(`[PersistenceService] Manual snapshot created for ${sessionId}`);
    return true;
  } catch (error) {
    console.error("[PersistenceService] Snapshot error:", error);
    return false;
  }
};

/**
 * Get snapshots for session
 * Returns list of snapshots (newest first)
 */
export const getSessionSnapshots = async (
  sessionId: string
): Promise<
  Array<{
    id: string;
    name: string;
    createdAt: Date;
    isAuto: boolean;
  }>
> => {
  const snapshots = await getSnapshots(sessionId, MAX_SNAPSHOTS);
  return snapshots.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    createdAt: s.createdAt,
    isAuto: s.isAuto,
  }));
};

/**
 * Restore from snapshot
 * Loads snapshot content into Yjs document
 * Broadcasts to all users in session
 */
export const restoreSnapshot = async (
  io: Server,
  sessionId: string,
  snapshotId: string,
  userId: string
): Promise<boolean> => {
  try {
    // Verify user is member with edit permission
    const role = await getUserRole(sessionId, userId);
    if (!canEdit(role)) {
      console.log(`[PersistenceService] Permission denied for ${userId}`);
      return false;
    }

    const snapshot = await getSnapshotById(snapshotId);
    if (!snapshot || snapshot.sessionId !== sessionId) {
      console.log(`[PersistenceService] Snapshot not found: ${snapshotId}`);
      return false;
    }

    // Get Yjs document
    const ydoc = getYDoc(sessionId);

    // Apply snapshot state
    if (snapshot.codeState) {
      Y.applyUpdate(ydoc, new Uint8Array(snapshot.codeState));
    } else if (snapshot.code) {
      // Fallback to plain code
      ydoc.getText("code").delete(0, ydoc.getText("code").length);
      ydoc.getText("code").insert(0, snapshot.code);
    }

    // Broadcast to all users
    const state = Y.encodeStateAsUpdate(ydoc);
    io.to(sessionId).emit("sync", {
      sessionId,
      state: Array.from(state),
    });
    io.to(sessionId).emit("snapshot-restored", {
      sessionId,
      snapshotId,
      timestamp: Date.now(),
    });

    // Queue save after restore
    await queueAutoSave(io, sessionId, userId);

    console.log(`[PersistenceService] Restored snapshot ${snapshotId}`);
    return true;
  } catch (error) {
    console.error("[PersistenceService] Restore error:", error);
    return false;
  }
};

/**
 * Delete snapshot
 * Only session members can delete
 */
export const deleteSessionSnapshot = async (
  sessionId: string,
  snapshotId: string,
  userId: string
): Promise<boolean> => {
  try {
    // Verify user is member
    const role = await getUserRole(sessionId, userId);
    if (!role) {
      return false;
    }

    return await deleteSnapshot(snapshotId);
  } catch (error) {
    console.error("[PersistenceService] Delete error:", error);
    return false;
  }
};

/**
 * Cleanup session resources
 * Called when session is archived
 */
export const cleanupSession = (sessionId: string): void => {
  // Clear pending saves
  const saveTimeout = pendingSaves.get(sessionId);
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    pendingSaves.delete(sessionId);
  }

  // Clear pending snapshots
  const snapshotTimeout = pendingSnapshots.get(sessionId);
  if (snapshotTimeout) {
    clearTimeout(snapshotTimeout);
    pendingSnapshots.delete(sessionId);
  }

  console.log(`[PersistenceService] Cleaned up session ${sessionId}`);
};

// ============================================
// Private Functions
// ============================================

/**
 * Perform auto-save
 * Gets code from Yjs and saves to database
 */
async function performAutoSave(
  io: Server,
  sessionId: string,
  userId: string
): Promise<void> {
  try {
    // Get session to verify still exists
    const session = await Session.findOne({
      sessionId,
      state: "active",
    });
    if (!session) {
      console.log(`[PersistenceService] Session not found: ${sessionId}`);
      return;
    }

    // Get current code from Yjs
    const ydoc = getYDoc(sessionId);
    const code = ydoc.getText("code").toString();
    const codeState = Y.encodeStateAsUpdate(ydoc);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Save to database (overwrite latest)
    await saveCode(
      sessionId,
      code,
      Buffer.from(codeState),
      "javascript",
      userObjectId
    );

    // Optionally broadcast save confirmation
    io.to(sessionId).emit("autosaved", {
      sessionId,
      timestamp: Date.now(),
    });

    console.log(`[PersistenceService] Auto-saved session ${sessionId}`);
  } catch (error) {
    console.error("[PersistenceService] Auto-save error:", error);
  }
}

/**
 * Check if should create auto-snapshot
 * Creates snapshot every 10-15 minutes if enabled
 */
async function checkAutoSnapshot(
  io: Server,
  sessionId: string,
  userId: string
): Promise<void> {
  try {
    // Check if enough time passed since last auto-snapshot
    const shouldSnapshot = await shouldCreateAutoSnapshot(sessionId);
    if (!shouldSnapshot) {
      return;
    }

    // Get current code from Yjs
    const ydoc = getYDoc(sessionId);
    const code = ydoc.getText("code").toString();
    const codeState = Y.encodeStateAsUpdate(ydoc);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Create auto-snapshot
    await createSnapshot(
      sessionId,
      code,
      Buffer.from(codeState),
      "javascript",
      userObjectId,
      "",
      true // isAuto
    );

    // Broadcast notification
    io.to(sessionId).emit("snapshot-created", {
      sessionId,
      timestamp: Date.now(),
      isAuto: true,
    });

    console.log(`[PersistenceService] Auto-snapshot created for ${sessionId}`);
  } catch (error) {
    console.error("[PersistenceService] Auto-snapshot error:", error);
  }
}
