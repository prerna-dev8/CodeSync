import mongoose, { Schema, Document } from "mongoose";
import { SessionRole } from "./Session";

export interface ISessionInvite extends Document {
  sessionId: string;
  email: string;
  role: Exclude<SessionRole, "owner">;
  code: string;
  expiresAt: Date;
  createdBy: mongoose.Types.ObjectId;
  usedBy?: mongoose.Types.ObjectId;
  usedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sessionInviteSchema = new Schema<ISessionInvite>(
  {
    sessionId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["editor", "viewer"], required: true },
    code: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    usedAt: { type: Date },
  },
  { timestamps: true }
);

sessionInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ISessionInvite>("SessionInvite", sessionInviteSchema);
