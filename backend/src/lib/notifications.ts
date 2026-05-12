import db from '../db/database';
import { getIo } from './socket';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'role_changed'
  | 'added_to_group';

interface CreateParams {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export function createNotification({ userId, type, title, body, data }: CreateParams): void {
  const result = db.prepare(
    'INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, title, body ?? null, data ? JSON.stringify(data) : null);

  const notification = {
    id: result.lastInsertRowid,
    type,
    title,
    body: body ?? null,
    data: data ?? null,
    is_read: false,
    created_at: new Date().toISOString()
  };

  try {
    const io = getIo();
    if (io) {
      io.to(`user:${userId}`).emit('new_notification', notification);
      console.log(`[socket] emit new_notification → user:${userId} (${type})`);
    } else {
      console.warn('[socket] io not initialized, cannot emit notification');
    }
  } catch (e) {
    console.error('[socket] failed to emit notification', e);
  }
}
