import mongoose, { Schema, Document } from "mongoose";

export type SessionRole = "owner" | "editor" | "viewer";
export type SessionState = "active" | "archived";

export interface ISessionUser {
  userId: mongoose.Types.ObjectId;
  role: SessionRole;
}

export interface ISession extends Document {
  sessionId: string;
  users: ISessionUser[];
  state: SessionState;
  createdAt: Date;
  updatedAt: Date;
}

const sessionUserSchema = new Schema<ISessionUser>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], required: true },
  },
  { _id: false }
);

const sessionSchema = new Schema<ISession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    users: { type: [sessionUserSchema], required: true },
    state: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
sessionSchema.index({ "users.userId": 1 });
sessionSchema.index({ state: 1 });
sessionSchema.index({ sessionId: 1, "users.userId": 1 }, { unique: true });

export default mongoose.model<ISession>("Session", sessionSchema);

// Static methods for atomic operations
export async function findBySessionId(sessionId: string): Promise<ISession | null> {
  return mongoose.model<ISession>("Session").findOne({ sessionId }) as Promise<ISession | null>;
}

export async function findUserInSession(sessionId: string, userId: mongoose.Types.ObjectId): Promise<ISession | null> {
  return mongoose.model<ISession>("Session").findOne({
    sessionId,
    "users.userId": userId,
  }) as Promise<ISession | null>;
}

export async function addUserToSession(
  sessionId: string,
  userId: mongoose.Types.ObjectId,
  role: SessionRole
): Promise<mongoose.Document | null> {
  // Use findOneAndUpdate with upsert: false and $addToSet to prevent duplicates
  // This ensures atomic, idempotent operation
  return mongoose.model<ISession>("Session").findOneAndUpdate(
    { sessionId },
    {
      $addToSet: {
        users: { userId, role },
      },
    },
    { new: true }
  ) as Promise<mongoose.Document | null>;
}

export async function findUserSessions(userId: mongoose.Types.ObjectId): Promise<ISession[]> {
  return mongoose.model<ISession>("Session").find({
    "users.userId": userId,
  }) as Promise<ISession[]>;
}

export async function archiveSession(sessionId: string, userId: mongoose.Types.ObjectId): Promise<ISession | null> {
  // Only owner can archive - check user role first
  const session = await mongoose.model<ISession>("Session").findOne({
    sessionId,
    "users.userId": userId,
    "users.role": "owner",
  });

  if (!session) {
    return null;
  }

  return mongoose.model<ISession>("Session").findOneAndUpdate(
    { sessionId, state: "active" },
    { $set: { state: "archived" } },
    { new: true }
  ) as Promise<ISession | null>;
}
