import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
  },
  filename: (req: any, file, cb) => {
    const userId = req.user?.id || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${userId}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const USER_FIELDS = 'id, username, email, display_name, avatar_url, description, dm_permission, created_at';

// GET /api/users/me
router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  const user = db.prepare(
    `SELECT ${USER_FIELDS} FROM users WHERE id = ?`
  ).get(req.user!.id) as any;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});

// PUT /api/users/me
router.put('/me', authenticate, (req: AuthRequest, res: Response): void => {
  const { display_name, username, description, dm_permission } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (display_name !== undefined) {
    updates.push('display_name = ?');
    values.push(display_name);
  }
  if (username !== undefined) {
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      res.status(400).json({ error: 'Invalid username format' });
      return;
    }
    // Check uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user!.id) as any;
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }
    updates.push('username = ?');
    values.push(username);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  if (dm_permission !== undefined) {
    if (dm_permission !== 'everyone' && dm_permission !== 'friends_only') {
      res.status(400).json({ error: 'Invalid dm_permission value' });
      return;
    }
    updates.push('dm_permission = ?');
    values.push(dm_permission);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(req.user!.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare(
    `SELECT ${USER_FIELDS} FROM users WHERE id = ?`
  ).get(req.user!.id) as any;

  res.json(updated);
});

// POST /api/users/me/avatar
router.post('/me/avatar', authenticate, upload.single('avatar'), (req: AuthRequest, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // Delete old avatar if exists
  const currentUser = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user!.id) as any;
  if (currentUser?.avatar_url) {
    const oldPath = path.join(__dirname, '..', '..', currentUser.avatar_url.replace(/^\//, ''));
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  const avatarUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user!.id);

  res.json({ avatar_url: avatarUrl });
});

function areFriends(a: number, b: number): boolean {
  return !!db.prepare(`
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).get(a, b, b, a);
}

function canRequesterMessage(targetId: number, requesterId: number): boolean {
  if (targetId === requesterId) return false;
  const target = db.prepare('SELECT dm_permission FROM users WHERE id = ?').get(targetId) as { dm_permission: string } | undefined;
  if (!target) return false;
  if (target.dm_permission === 'everyone') return true;
  return areFriends(targetId, requesterId);
}

// GET /api/users/search?q=query
router.get('/search', authenticate, (req: AuthRequest, res: Response): void => {
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  const users = db.prepare(
    `SELECT id, username, display_name, avatar_url, dm_permission
     FROM users
     WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?
     LIMIT 20`
  ).all(`%${q}%`, `%${q}%`, req.user!.id) as any[];

  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    can_message: u.dm_permission === 'everyone' || areFriends(u.id, req.user!.id)
  })));
});

// GET /api/users/:id - public profile (must be after /search and /me routes)
router.get('/:id', authenticate, (req: AuthRequest, res: Response): void => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const user = db.prepare(
    'SELECT id, username, display_name, avatar_url, description, created_at FROM users WHERE id = ?'
  ).get(userId) as any;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ ...user, can_message: canRequesterMessage(userId, req.user!.id) });
});

export default router;
