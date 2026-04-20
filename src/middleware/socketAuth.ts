import { Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
// No appError needed

export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token as string;
  if (!token || !token.startsWith('Bearer ')) {
    return next(new Error('No token provided'));
  }

  try {
    const decoded = verifyAccessToken(token.split(' ')[1]);
    socket.data.userId = decoded.id;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
};

