import mongoose, { Schema, model, Types } from 'mongoose';
import { ISession, SessionRole } from '../types';

const sessionMemberSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: Object.values(SessionRole), required: true },
  joinedAt: { type: Date, default: Date.now },
});

const sessionInviteSchema = new Schema({
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

const sessionSchema = new Schema({
  title: { type: String, required: true, maxLength: 100 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [sessionMemberSchema],
  state: { type: String, enum: ['active', 'archived'], default: 'active' },
  inviteTokens: [sessionInviteSchema],
  maxMembers: { type: Number, default: 50 },
  idleTimeout: Date,
  docState: { type: Buffer }, // Yjs snapshot
  cursors: { 
    type: Map, 
    of: {
      userId: String,
      username: String,
      color: String,
      position: {
        line: Number,
        ch: Number
      },
      selection: {
        anchor: Number,
        head: Number
      }
    }
  },
  presence: { 
    type: Map, 
    of: {
      userId: String,
      username: String,
      color: String,
      isActive: Boolean
    }
  }
}, {
  timestamps: true,
});

export type ISessionDoc = mongoose.Document & {
  _id: Types.ObjectId;
  title: string;
  ownerId: Types.ObjectId;
  members: Array<{
    userId: Types.ObjectId;
    role: SessionRole;
    joinedAt: Date;
  }>;
  state: 'active' | 'archived';
  inviteTokens: Array<{
    token: string;
    expiresAt: Date;
  }>;
  maxMembers: number;
  idleTimeout?: Date;
  docState?: Buffer;
  cursors?: Map<string, any>;
  presence?: Map<string, any>;
};

export default model('Session', sessionSchema);

