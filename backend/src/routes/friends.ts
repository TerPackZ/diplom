import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';
import { createNotification } from '../lib/notifications';

const router = Router();
router.use(authenticate);

// Helper: get friendship record (either direction)
function getFriendship(userId1: number, userId2: number): any {
  return db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
  `).get(userId1, userId2, userId2, userId1);
}

// GET /api/friends — accepted friends list
router.get('/', (req: AuthRequest, res: Response): void => {
  const friends = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, u.description,
           f.created_at as friends_since
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = u.id
    )
    WHERE f.status = 'accepted'
      AND (f.requester_id = ? OR f.addressee_id = ?)
    ORDER BY u.username ASC
  `).all(req.user!.id, req.user!.id, req.user!.id);

  res.json(friends);
});

// GET /api/friends/search?q= — search among accepted friends (for MemberList)
router.get('/search', (req: AuthRequest, res: Response): void => {
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  const friends = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = u.id
    )
    WHERE f.status = 'accepted'
      AND (f.requester_id = ? OR f.addressee_id = ?)
      AND u.username LIKE ?
    LIMIT 10
  `).all(req.user!.id, req.user!.id, req.user!.id, `%${q}%`);

  res.json(friends);
});

// GET /api/friends/requests — incoming pending requests
router.get('/requests', (req: AuthRequest, res: Response): void => {
  const requests = db.prepare(`
    SELECT f.id, f.requester_id, f.created_at,
           u.username, u.display_name, u.avatar_url
    FROM friendships f
    JOIN users u ON f.requester_id = u.id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.user!.id);

  res.json(requests);
});

// GET /api/friends/sent — outgoing pending requests
router.get('/sent', (req: AuthRequest, res: Response): void => {
  const sent = db.prepare(`
    SELECT f.id, f.addressee_id, f.created_at,
           u.username, u.display_name, u.avatar_url
    FROM friendships f
    JOIN users u ON f.addressee_id = u.id
    WHERE f.requester_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.user!.id);

  res.json(sent);
});

// POST /api/friends/send/:userId — send friend request
router.post('/send/:userId', (req: AuthRequest, res: Response): void => {
  const targetId = parseInt(req.params.userId);
  const myId = req.user!.id;

  if (targetId === myId) {
    res.status(400).json({ error: 'Нельзя добавить себя в друзья' });
    return;
  }

  const targetUser = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(targetId) as any;
  if (!targetUser) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }

  const existing = getFriendship(myId, targetId);
  if (existing) {
    if (existing.status === 'accepted') {
      res.status(409).json({ error: 'Вы уже друзья' });
      return;
    }
    if (existing.status === 'pending') {
      // If the other person already sent us a request — auto-accept
      if (existing.requester_id === targetId) {
        db.prepare(`UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(existing.id);
        const me = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(myId) as any;
        const myName = me?.display_name || me?.username || 'Пользователь';
        createNotification({ userId: targetId, type: 'friend_accepted', title: 'Запрос в друзья принят', body: `${myName} принял ваш запрос в друзья`, data: { userId: myId } });
        res.json({ status: 'accepted', message: 'Запрос принят автоматически' });
        return;
      }
      res.status(409).json({ error: 'Запрос уже отправлен' });
      return;
    }
    if (existing.status === 'declined') {
      res.status(403).json({ error: 'Пользователь отклонил ваш запрос' });
      return;
    }
  }

  db.prepare('INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)').run(myId, targetId, 'pending');

  const me = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(myId) as any;
  const myName = me?.display_name || me?.username || 'Пользователь';
  createNotification({ userId: targetId, type: 'friend_request', title: 'Новый запрос в друзья', body: `${myName} хочет добавить вас в друзья`, data: { userId: myId } });

  res.status(201).json({ message: 'Запрос дружбы отправлен', user: targetUser });
});

// PUT /api/friends/accept/:requesterId — accept incoming request
router.put('/accept/:requesterId', (req: AuthRequest, res: Response): void => {
  const requesterId = parseInt(req.params.requesterId);
  const myId = req.user!.id;

  const friendship = db.prepare(
    'SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = ?'
  ).get(requesterId, myId, 'pending') as any;

  if (!friendship) {
    res.status(404).json({ error: 'Запрос не найден' });
    return;
  }

  db.prepare(`UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(friendship.id);

  const me = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(myId) as any;
  const myName = me?.display_name || me?.username || 'Пользователь';
  createNotification({ userId: requesterId, type: 'friend_accepted', title: 'Запрос в друзья принят', body: `${myName} принял ваш запрос в друзья`, data: { userId: myId } });

  const friend = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(requesterId);
  res.json({ message: 'Запрос принят', friend });
});

// DELETE /api/friends/decline/:requesterId — decline incoming request
router.delete('/decline/:requesterId', (req: AuthRequest, res: Response): void => {
  const requesterId = parseInt(req.params.requesterId);
  const myId = req.user!.id;

  const friendship = db.prepare(
    'SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = ?'
  ).get(requesterId, myId, 'pending') as any;

  if (!friendship) {
    res.status(404).json({ error: 'Запрос не найден' });
    return;
  }

  db.prepare(`UPDATE friendships SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(friendship.id);

  res.json({ message: 'Запрос отклонён' });
});

// DELETE /api/friends/remove/:userId — remove friend (either direction)
router.delete('/remove/:userId', (req: AuthRequest, res: Response): void => {
  const targetId = parseInt(req.params.userId);
  const myId = req.user!.id;

  const friendship = getFriendship(myId, targetId) as any;

  if (!friendship || friendship.status !== 'accepted') {
    res.status(404).json({ error: 'Дружба не найдена' });
    return;
  }

  db.prepare('DELETE FROM friendships WHERE id = ?').run(friendship.id);
  res.json({ message: 'Друг удалён' });
});

export default router;
