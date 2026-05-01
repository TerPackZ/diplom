import db from '../db/database';

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
  db.prepare(
    'INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, title, body ?? null, data ? JSON.stringify(data) : null);
}
