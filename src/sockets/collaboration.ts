import { Server, Socket } from 'socket.io';
import Session from '../models/Session';
import UserDoc from '../models/User';
import { getYDoc, debounceSave, getSessionById } from '../services/sessionService';

type User = typeof UserDoc;

interface WebsocketProvider {
  doc: any;
  destroy(): void;
}

interface ExtendedSocketData {
  userId: string;
  username: string;
  sessionId: string;
  role: string;
  color?: string;
}

const providers: Map<string, WebsocketProvider> = new Map();
const userColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe'];

export const initCollaboration = async (io: Server) => {
  const Y = await import('yjs');

  io.on('connection', async (socket: Socket) => {
    const data = socket.data as ExtendedSocketData;
    if (!data.userId) {
      socket.disconnect();
      return;
    }

    // Get user info
    const user = await UserDoc.findById(data.userId).select('username avatar') as any;

    data.username = user?.username || 'Anonymous';
    
    socket.on('join-session', async (sessionId: string) => {
      // Server-side validation
      const session = await getSessionById(sessionId, data.userId);
      if (!session) {
        socket.emit('error', { message: 'Session not found or access denied' });
        return;
      }

      // Role/permission check
      const member = session.members.find((m: any) => m.userId.toString() === data.userId);
      data.role = member?.role || 'viewer';
      data.sessionId = sessionId;
      
      const doc = await getYDoc(sessionId);
      
      // Custom Yjs sync via Socket.io rooms (no external WS dependency)
      const providerKey = `${socket.id}-${sessionId}`;
      providers.set(providerKey, { doc, destroy: () => {} });
      
      const color = userColors[Math.floor(Math.random() * userColors.length)];
      data.color = color;
      
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

    socket.on('cursor-update', async (cursor: any) => {
      if (!data.sessionId) return;
      
      const cursorData = {
        ...cursor,
        userId: data.userId,
        username: data.username,
        color: data.color || userColors[Math.floor(Math.random() * userColors.length)]
      };
      
      socket.to(`session-${data.sessionId}`).emit('cursor-update', cursorData);
      
      const session = await Session.findById(data.sessionId);
      if (session && session.cursors) {
        (session.cursors as any).set(data.userId, cursorData);
        await session.save();
      }
    });

    socket.on('code-change', (update: Uint8Array) => {
      if (!data.sessionId || data.role === 'viewer') return;
      
      const providerKey = `${socket.id}-${data.sessionId}`;
      const provider = providers.get(providerKey);
      
      if (provider && provider.doc) {
        Y.applyUpdate(provider.doc, update);
        debounceSave(data.sessionId!, provider.doc);
        socket.to(`session-${data.sessionId}`).emit('yjs-update', update);
      }
    });

    socket.on('disconnect', () => {
      if (data.sessionId) {
        socket.to(`session-${data.sessionId}`).emit('user-left', data.userId);
        const providerKey = `${socket.id}-${data.sessionId}`;
        const provider = providers.get(providerKey);
        if (provider) {
          provider.destroy();
          providers.delete(providerKey);
        }
      }
    });
  });
};

export default initCollaboration;

