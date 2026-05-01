import mongoose, { Schema, Document } from "mongoose";

/**
 * SessionCode - Stores latest code state for collaborative editing
 *
 * Purpose:
 * - Primary persistence for current code
 * - Overwritten on each auto-save (not append)
 * - Loaded on session join
 */
export interface ISessionCode extends Document {
  sessionId: string;
  code: string; // Current code content (plain text for display)
  codeState: Buffer; // Yjs document state (binary) for full restoration
  language: string; // Programming language (javascript, typescript, python, etc.)
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId; // Last user who made changes
}

const sessionCodeSchema = new Schema<ISessionCode>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    code: { type: String, default: "" },
    codeState: { type: Buffer, default: null },
    language: { type: String, default: "javascript" },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: false }
);

// Index for fast lookups
sessionCodeSchema.index({ sessionId: 1 });

export default mongoose.model<ISessionCode>("SessionCode", sessionCodeSchema);

// ============================================
// Static Methods
// ============================================

/**
 * Get latest code for session
 * Returns null if no code exists
 */
export async function getLatestCode(
  sessionId: string
): Promise<ISessionCode | null> {
  return mongoose
    .model<ISessionCode>("SessionCode")
    .findOne({ sessionId }) as Promise<ISessionCode | null>;
}

/**
 * Save latest code state
 * Atomic upsert - creates or updates
 */
export async function saveCode(
  sessionId: string,
  code: string,
  codeState: Buffer,
  language: string,
  userId: mongoose.Types.ObjectId
): Promise<ISessionCode> {
  return mongoose
    .model<ISessionCode>("SessionCode")
    .findOneAndUpdate(
      { sessionId },
      {
        $set: {
          code,
          codeState,
          language,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    ) as Promise<ISessionCode>;
}

/**
 * Update code only (no codeState)
 */
export async function updateCode(
  sessionId: string,
  code: string,
  userId: mongoose.Types.ObjectId
): Promise<ISessionCode | null> {
  return mongoose
    .model<ISessionCode>("SessionCode")
    .findOneAndUpdate(
      { sessionId },
      {
        $set: {
          code,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      },
      { new: true }
    ) as Promise<ISessionCode | null>;
}
