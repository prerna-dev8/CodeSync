import mongoose, { Schema, Document } from "mongoose";

/**
 * Snapshot - Time-stamped code backup
 *
 * Purpose:
 * - Manual or automatic backup
 * - Version history for recovery
 * - Max 20 snapshots per session (auto-cleanup oldest)
 */
export interface ISnapshot extends Document {
  sessionId: string;
  code: string; // Code content at snapshot time
  codeState: Buffer; // Yjs binary state
  language: string; // Programming language
  name: string; // Optional snapshot name (manual) or auto-generated
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId; // User who triggered snapshot
  isAuto: boolean; // true = auto-snapshot, false = manual
}

const snapshotSchema = new Schema<ISnapshot>(
  {
    sessionId: { type: String, required: true, index: true },
    code: { type: String, default: "" },
    codeState: { type: Buffer, default: null },
    language: { type: String, default: "javascript" },
    name: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isAuto: { type: Boolean, default: false },
  },
  { timestamps: false }
);

// Compound index for efficient queries
snapshotSchema.index({ sessionId: 1, createdAt: -1 });

export default mongoose.model<ISnapshot>("Snapshot", snapshotSchema);

// ============================================
// Constants
// ============================================

const MAX_SNAPSHOTS_PER_SESSION = 20;

// ============================================
// Static Methods
// ============================================

/**
 * Get all snapshots for a session
 * Sorted by createdAt descending (newest first)
 */
export async function getSnapshots(
  sessionId: string,
  limit: number = 20
): Promise<ISnapshot[]> {
  return mongoose
    .model<ISnapshot>("Snapshot")
    .find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(limit) as Promise<ISnapshot[]>;
}

/**
 * Get a specific snapshot by ID
 */
export async function getSnapshotById(
  snapshotId: string
): Promise<ISnapshot | null> {
  return mongoose
    .model<ISnapshot>("Snapshot")
    .findOne({ _id: snapshotId }) as Promise<ISnapshot | null>;
}

/**
 * Create a new snapshot
 * Enforces max snapshot limit (oldest deleted if exceeded)
 */
export async function createSnapshot(
  sessionId: string,
  code: string,
  codeState: Buffer,
  language: string,
  userId: mongoose.Types.ObjectId,
  name: string = "",
  isAuto: boolean = false
): Promise<ISnapshot> {
  // Create new snapshot
  const snapshot = await mongoose.model<ISnapshot>("Snapshot").create({
    sessionId,
    code,
    codeState,
    language,
    name: name || generateSnapshotName(isAuto),
    createdAt: new Date(),
    createdBy: userId,
    isAuto,
  });

  // Cleanup old snapshots if over limit
  await cleanupOldSnapshots(sessionId);

  return snapshot;
}

/**
 * Delete a specific snapshot
 */
export async function deleteSnapshot(
  snapshotId: string
): Promise<boolean> {
  const result = await mongoose
    .model<ISnapshot>("Snapshot")
    .deleteOne({ _id: snapshotId });
  return result.deletedCount > 0;
}

/**
 * Delete all snapshots for a session
 */
export async function deleteAllSnapshots(sessionId: string): Promise<number> {
  const result = await mongoose
    .model<ISnapshot>("Snapshot")
    .deleteMany({ sessionId });
  return result.deletedCount;
}

/**
 * Get latest snapshot for session
 * Returns null if none exist
 */
export async function getLatestSnapshot(
  sessionId: string
): Promise<ISnapshot | null> {
  return mongoose
    .model<ISnapshot>("Snapshot")
    .findOne({ sessionId })
    .sort({ createdAt: -1 }) as Promise<ISnapshot | null>;
}

// ============================================
// Private Helpers
// ============================================

/**
 * Generate snapshot name
 */
function generateSnapshotName(isAuto: boolean): string {
  const now = new Date();
  if (isAuto) {
    return `Auto-${now.toISOString()}`;
  }
  return `Manual-${now.toISOString()}`;
}

/**
 * Cleanup old snapshots when limit exceeded
 * Deletes oldest snapshots first
 */
async function cleanupOldSnapshots(sessionId: string): Promise<void> {
  const count = await mongoose
    .model<ISnapshot>("Snapshot")
    .countDocuments({ sessionId });

  if (count > MAX_SNAPSHOTS_PER_SESSION) {
    // Delete oldest snapshots (excess count)
    const excessCount = count - MAX_SNAPSHOTS_PER_SESSION;
    await mongoose
      .model<ISnapshot>("Snapshot")
      .deleteMany({
        sessionId,
        _id: {
          $in: await mongoose
            .model<ISnapshot>("Snapshot")
            .find({ sessionId })
            .sort({ createdAt: 1 })
            .limit(excessCount)
            .distinct("_id"),
        },
      });
  }
}

/**
 * Check if enough time passed for auto-snapshot
 * Returns true if last auto-snapshot > 10 minutes ago
 */
export async function shouldCreateAutoSnapshot(sessionId: string): Promise<boolean> {
  const LAST_AUTO_SNAPSHOT_MINUTES = 10;

  const latestAuto = await mongoose
    .model<ISnapshot>("Snapshot")
    .findOne({ sessionId, isAuto: true })
    .sort({ createdAt: -1 });

  if (!latestAuto) {
    // No previous auto-snapshot, create one
    return true;
  }

  const minutesSinceLastAuto = (Date.now() - latestAuto.createdAt.getTime()) / 1000 / 60;
  return minutesSinceLastAuto >= LAST_AUTO_SNAPSHOT_MINUTES;
}
