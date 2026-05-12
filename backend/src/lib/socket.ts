import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../db/database';

interface JwtPayload { userId: number; }
interface AuthSocket extends Socket { userId: number; }

let io: SocketServer;

export function initSocket(server: HttpServer): SocketServer {
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : true;

  io = new SocketServer(server, {
    cors: { origin: corsOrigin, credentials: true }
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string }).token ||
      (socket.handshake.query.token as string | undefined);
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret'
      ) as JwtPayload;
      (socket as AuthSocket).userId = payload.userId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as AuthSocket).userId;

    socket.join(`user:${userId}`);
    console.log(`[socket] connect user:${userId} (socket=${socket.id})`);

    socket.on('disconnect', (reason) => {
      console.log(`[socket] disconnect user:${userId} (${reason})`);
    });

    socket.on('join_conversation', (conversationId: number) => {
      if (!canAccessConversation(userId, conversationId)) return;
      socket.join(`conv:${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId: number) => {
      socket.leave(`conv:${conversationId}`);
    });

    socket.on('typing', ({ conversationId }: { conversationId: number }) => {
      if (!canAccessConversation(userId, conversationId)) return;
      const user = db.prepare(
        'SELECT username, display_name FROM users WHERE id = ?'
      ).get(userId) as { username: string; display_name: string | null } | undefined;
      socket.to(`conv:${conversationId}`).emit('user_typing', {
        userId,
        username: user?.display_name || user?.username,
        conversationId
      });
    });

    socket.on('stop_typing', ({ conversationId }: { conversationId: number }) => {
      socket.to(`conv:${conversationId}`).emit('user_stop_typing', {
        userId,
        conversationId
      });
    });
  });

  return io;
}

export function getIo(): SocketServer {
  return io;
}

export function canAccessConversation(userId: number, conversationId: number): boolean {
  const conv = db.prepare(
    'SELECT id, type, group_id FROM conversations WHERE id = ?'
  ).get(conversationId) as { id: number; type: string; group_id: number | null } | undefined;
  if (!conv) return false;

  if (conv.type === 'direct') {
    return !!db.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
    ).get(conversationId, userId);
  }

  return !!db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(conv.group_id, userId);
}
