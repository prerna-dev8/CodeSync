import mongoose from 'mongoose';
import type { ObjectId } from 'mongoose';
import Session from '../models/Session';
import { generateToken } from '../utils/crypto';
import { sendSessionInviteEmail } from './emailService';
import { SessionRole, ISession } from '../types';

const INVITE_EXPIRY = 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE = 3000;

const debounceTimeouts = new Map<string, NodeJS.Timeout>();
const docCache = new Map<string, any>();

export const createSession = async (title: string, ownerId: string) => {
  const session = await Session.create({
    title,
    ownerId,
    members: [{ userId: ownerId, role: 'owner' as SessionRole }]
  });
  return session;
};

export const getUserSessions = async (userId: string): Promise<any[]> => {
  const sessions = await Session.find({
    'members.userId': userId,
  }).populate('ownerId', 'username email').populate('members.userId', 'username avatar');
  return sessions.filter((s: any) => s.state === 'active') as any[];
};

export const getSessionById = async (sessionId: string, userId: string) => {
  const session = await Session.findOne({ _id: sessionId, 'members.userId': userId })
    .populate('ownerId', 'username email')
    .populate('members.userId', 'username avatar');
  if (!session || session.state === 'archived') return null;
  return session;
};

export const joinSession = async (sessionId: string, userId: string, inviteToken?: string): Promise<boolean> => {
  const session = await Session.findById(sessionId);
  if (!session || session.state === 'archived') return false;

  if (inviteToken) {
    const invite = session.inviteTokens.find((it: any) => it.token === inviteToken && it.expiresAt > new Date());
    if (!invite) return false;
    // session.inviteTokens = session.inviteTokens.filter((it: any) => it.token !== invite.token);

  } else if (!session.members.find((m: any) => m.userId.toString() === userId)) {
    return false;
  }

  const memberIndex = session.members.findIndex((m: any) => m.userId.toString() === userId);
  if (memberIndex === -1) {
session.members.push({ userId: new mongoose.Types.ObjectId(userId), role: 'viewer' as SessionRole, joinedAt: new Date() });
  }
  await session.save();
  return true;
};

export const changeMemberRole = async (sessionId: string, ownerId: string, targetUserId: string, role: SessionRole): Promise<boolean> => {
  if (role === 'owner') return false;

  const session = await Session.findOne({ _id: sessionId, ownerId });
  if (!session) return false;

  const member = session.members.find((m: any) => m.userId.toString() === targetUserId);
  if (!member) return false;

  member.role = role;
  await session.save();
  return true;
};

export const archiveSession = async (sessionId: string, ownerId: string): Promise<boolean> => {
  const session = await Session.findOne({ _id: sessionId, ownerId });
  if (!session) return false;

  session.state = 'archived';
  await session.save();
  return true;
};

export const generateInviteToken = async (sessionId: string, senderId: string): Promise<string> => {
  const session = await Session.findOne({ _id: sessionId, 'members.userId': senderId });
  if (!session) throw new Error('Session not found');

  const { raw } = generateToken();
  session.inviteTokens!.push({
    token: raw,
    expiresAt: new Date(Date.now() + INVITE_EXPIRY),
  });
  await session.save();
  return raw;
};

export const sendSessionInvite = async (sessionId: string, email: string, senderId: string): Promise<void> => {
  const token = await generateInviteToken(sessionId, senderId);
  await sendSessionInviteEmail(email, token, sessionId);
};

// Yjs persistence
export const getYDoc = async (sessionId: string) => {
  let doc = docCache.get(sessionId);
  if (!doc) {
    const yjs = await import('yjs');
    const session = await Session.findById(sessionId);
    doc = new yjs.Doc();
    if (session?.docState) {
      yjs.applyUpdate(doc, new Uint8Array(session.docState));
    }
    docCache.set(sessionId, doc);
  }
  return doc;
};

export const saveYDoc = async (sessionId: string, doc: any): Promise<void> => {
  const yjs = await import('yjs');
  const update = yjs.encodeStateAsUpdate(doc);
  const session = await Session.findById(sessionId);
  if (session) {
    session.docState = Buffer.from(update);
    await session.save();
  }
};

export const debounceSave = (sessionId: string, doc: any): void => {
  if (debounceTimeouts.has(sessionId)) {
    clearTimeout(debounceTimeouts.get(sessionId));
  }
  const timeout = setTimeout(async () => {
    await saveYDoc(sessionId, doc);
    debounceTimeouts.delete(sessionId);
  }, SAVE_DEBOUNCE);
  debounceTimeouts.set(sessionId, timeout);
};

export const cleanupSessionDoc = async (sessionId: string): Promise<void> => {
  debounceTimeouts.delete(sessionId);
  docCache.delete(sessionId);
};   




