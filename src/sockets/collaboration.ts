// src/sockets/collaboration.ts - Yjs + Socket.io real-time
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getYDoc, saveYDoc, debounceSave, getSessionById } from '../services/sessionService';
import Session from '../models/Session';
import User from '../models/User';
import { SocketData, SessionRole } from '../types';

const providers: Map<string, WebsocketProvider> = new Map();
const userColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe'];

export const initCollaboration = (io: Server) => {
  io.on('connection', async (socket: Socket) => {
    const data = socket.data as SocketData;
    if (!data.userId) {
      socket.disconnect();
      return;
    }

    // Get user info
    const user = await User.findById(data.userId).select('username avatar');
    data.username = user?.username || 'Anonymous';
    
    socket.on('join-session', async (sessionId: string) => {
      // Server-side validation
      const session = await getSessionById(sessionId, data.userId);
      if (!session) {
        socket.emit('error', { message: 'Session not found or access denied' });
        return;
      }

      // Role/permission check
      const member = session.members.find(m => m.userId.toString() === data.userId);
      data.role = member?.role || 'viewer';
      data.sessionId = sessionId;
      
      // Yjs WebSocket provider
      const doc = await getYDoc(sessionId);
      const provider = new WebsocketProvider('ws://localhost:5000', `session-${sessionId}`, doc, { socket });
      
      providers.set(`${socket.id}-${sessionId}`, provider);
      
      // Presence
      const color = userColors[Math.floor(Math.random() * userColors.length)];
      const presence = {
        userId: data.userId,
        username: data.username,
        color,
        isActive: true
      };
      
      socket.to(`session-${sessionId}`).emit('user-joined', presence);
      socket.join(`session-${sessionId}`);
      
      // Initial state sync
      socket.emit('session-state', { 
        doc: Y.encodeStateAsUpdate(doc),
        presence: session.presence || {},
        cursors: session.cursors || {}
      });
      
      console.log(`${data.username} joined session ${sessionId} as ${data.role}`);
    });

    socket.on('cursor-update', (cursor: any) => {
      if (!data.sessionId) return;
      
      // Role check - viewers can send cursors
      const cursorData = {
        ...cursor,
        userId: data.userId,
        username: data.username,
        color: data.color || userColors[Math.floor(Math.random() * userColors.length)]
      };
      
      socket.to(`session-${data.sessionId}`).emit('cursor-update', cursorData);
      
      // Persist cursor
      const session = await Session.findById(data.sessionId);
      if (session) {
        if (!session.cursors) session.cursors = {};
        session.cursors[data.userId] = cursorData;
        session.save();
      }
    });

    socket.on('code-change', (update: Uint8Array) => {
      if (!data.sessionId || data.role === 'viewer') return; // Block viewers
      
      const provider = providers.get(`${socket.id}-${data.sessionId}`);
      if (provider && provider.doc) {
        Y.applyUpdate(provider.doc, new Uint8Array(update));
        debounceSave(data.sessionId, provider.doc);
        socket.to(`session-${data.sessionId}`).emit('yjs-update', update);
      }
    });

    socket.on('disconnect', () => {
      if (data.sessionId) {
        socket.to(`session-${data.sessionId}`).emit('user-left', data.userId);
        const provider = providers.get(`${socket.id}-${data.sessionId}`);
        if (provider) {
          provider.destroy();
          providers.delete(`${socket.id}-${data.sessionId}`);
        }
      }
    });
  });
};

export default initCollaboration;

