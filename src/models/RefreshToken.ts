import mongoose, { Schema, model, Document } from 'mongoose';
import { IRefreshToken } from '../types/index';


const refreshTokenSchema = new Schema<IRefreshToken>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  revoked: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Cleanup expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IRefreshToken & Document>('RefreshToken', refreshTokenSchema);

