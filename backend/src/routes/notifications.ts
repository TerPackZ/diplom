import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router();
router.use(authenticate);

// GET /api/notifications — last 40 notifications for current user
router.get('/', (req: AuthRequest, res: Response): void => {
  const rows = db.prepare(`
    SELECT id, type, title, body, data, is_read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 40
  `).all(req.user!.id) as any[];

  // Parse JSON data field
  const notifications = rows.map((n) => ({
    ...n,
    is_read: Boolean(n.is_read),
    data: n.data ? JSON.parse(n.data) : null
  }));

  res.json(notifications);
});

// GET /api/notifications/unread-count
router.get('/unread-count', (req: AuthRequest, res: Response): void => {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(req.user!.id) as any;
  res.json({ count: row.count });
});

// POST /api/notifications/read-all — mark all as read
router.post('/read-all', (req: AuthRequest, res: Response): void => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', (req: AuthRequest, res: Response): void => {
  const notifId = parseInt(req.params.id);
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(notifId, req.user!.id) as any;
  if (!row) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);
  res.json({ ok: true });
});

// DELETE /api/notifications/:id — delete one
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const notifId = parseInt(req.params.id);
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(notifId, req.user!.id) as any;
  if (!row) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  db.prepare('DELETE FROM notifications WHERE id = ?').run(notifId);
  res.json({ ok: true });
});

export default router;
