import Session from '../models/Session';
import User from '../models/User';
import { generateToken } from '../utils/crypto';
import { sendSessionInviteEmail } from './emailService';
import { SessionRole, ISession } from '../types';

const INVITE_EXPIRY = 24 * 60 * 60 * 1000; // 24h
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30min

export const createSession = async (title: string, ownerId: string): Promise<any> => {
  const session = await Session.create({
    title,
    ownerId,
    members: [{ userId: ownerId, role: 'owner' as SessionRole }],
  });
  return session;
};

export const getUserSessions = async (userId: string): Promise<ISession[]> => {
  const sessions = await Session.find({
    'members.userId': userId,
  }).populate('ownerId', 'username email').populate('members.userId', 'username avatar');
  return sessions.filter(s => s.state === 'active') as any[];
};

export const getSessionById = async (sessionId: string, userId: string): Promise<ISession | null> => {
  const session = await Session.findOne({ _id: sessionId, 'members.userId': userId })
    .populate('ownerId', 'username email')
    .populate('members.userId', 'username avatar');
  if (!session || session.state === 'archived') return null;
  return session;
};

export const joinSession = async (sessionId: string, userId: string, inviteToken?: string): Promise<boolean> => {
  const session = await Session.findById(sessionId);
  if (!session || session.state === 'archived') return false;

  // Check invite if provided
  if (inviteToken) {
    const invite = session.inviteTokens.find(it => it.token === inviteToken && it.expiresAt > new Date());
  if (!invite) return false;
    session.inviteTokens = session.inviteTokens.filter((it: any) => it.token !== invite.token);
  } else if (!session.members.find(m => m.userId.toString() === userId)) {
    return false;
  }

  // Add/update member
  const memberIndex = session.members.findIndex(m => m.userId.toString() === userId);
  if (memberIndex === -1) {
    session.members.push({ userId, role: 'viewer' as SessionRole, joinedAt: new Date() });
  }
  await session.save();
  return true;
};

export const changeMemberRole = async (sessionId: string, ownerId: string, targetUserId: string, role: SessionRole): Promise<boolean> => {
  if (role === 'owner') return false; // Can't change to owner

  const session = await Session.findOne({ _id: sessionId, ownerId });
  if (!session) return false;

  const member = session.members.find(m => m.userId.toString() === targetUserId);
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
  session.inviteTokens.push({
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

// Yjs persistence (CRDT)
import * as Y from 'yjs';

let docCache: Map<string, Y.Doc> = new Map();
const SAVE_DEBOUNCE = 3000; // 3s

export const getYDoc = async (sessionId: string): Promise<Y.Doc> => {
  let doc = docCache.get(sessionId);
  if (!doc) {
    const session = await Session.findById(sessionId);
    doc = new Y.Doc();
    if (session?.docState) {
      Y.applyUpdate(doc, session.docState);
    }
    docCache.set(sessionId, doc);
  }
  return doc;
};

export const saveYDoc = async (sessionId: string, doc: Y.Doc): Promise<void> => {
  const update = Y.encodeStateAsUpdate(doc);
  const session = await Session.findById(sessionId);
  if (session) {
    session.docState = Buffer.from(update);
    await session.save();
  }
};

// Debounced save
export const debounceSave = (sessionId: string, doc: Y.Doc): void => {
  const timeout = setTimeout(() => saveYDoc(sessionId, doc), SAVE_DEBOUNCE);
  // Clear previous timeout if called again
};

export const cleanupSessionDoc = async (sessionId: string): Promise<void> => {
  docCache.delete(sessionId);
};

