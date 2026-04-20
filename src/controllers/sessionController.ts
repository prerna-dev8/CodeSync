import { Request, Response, NextFunction } from 'express';
import * as sessionService from '../services/sessionService';
import { AuthRequest } from '../types';

export const createSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;
    const session = await sessionService.createSession(title, req.user!._id.toString());
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
};

export const getUserSessions = async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await sessionService.getUserSessions(req.user!._id.toString());
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

export const getSession = async (req: AuthRequest, res: Response) => {
  try {
    const session = await sessionService.getSessionById(req.params.id, req.user!._id.toString());
    if (!session) return res.status(404).json({ message: 'Session not found or archived' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

export const joinSession = async (req: AuthRequest, res: Response) => {
  try {
    const { inviteToken } = req.body;
    const success = await sessionService.joinSession(req.params.id, req.user!._id.toString(), inviteToken);
    if (!success) return res.status(403).json({ message: 'Cannot join session' });
    res.json({ message: 'Joined successfully' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

export const changeRole = async (req: AuthRequest, res: Response) => {
  try {
    const { targetUserId, role } = req.body;
    const success = await sessionService.changeMemberRole(req.params.id, req.user!._id.toString(), targetUserId, role);
    if (!success) return res.status(403).json({ message: 'Cannot change role' });
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

export const archiveSession = async (req: AuthRequest, res: Response) => {
  try {
    const success = await sessionService.archiveSession(req.params.id, req.user!._id.toString());
    if (!success) return res.status(403).json({ message: 'Cannot archive' });
    res.json({ message: 'Session archived' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

export const generateInvite = async (req: AuthRequest, res: Response) => {
  try {
    const token = await sessionService.generateInviteToken(req.params.id, req.user!._id.toString());
    res.json({ token, url: `${process.env.CLIENT_URL}/join/${req.params.id}?token=${token}` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

export const sendInviteEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
    await sessionService.sendSessionInvite(req.params.id, email, req.user!._id.toString());

    res.json({ message: 'Invite sent' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
};

