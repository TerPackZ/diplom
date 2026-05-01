import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/database';

const router = Router();

router.post('/register', (req: Request, res: Response): void => {
  const { username, email, password, display_name } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: 'username, email and password are required' });
    return;
  }

  if (username.length < 3 || username.length > 30) {
    res.status(400).json({ error: 'Username must be 3-30 characters' });
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: 'Username can only contain letters, numbers and underscores' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username) as any;
  if (existingUser) {
    res.status(409).json({ error: 'User with this email or username already exists' });
    return;
  }

  const password_hash = bcrypt.hashSync(password, 10);

  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(username, email, password_hash, display_name || username);

  const user = db.prepare('SELECT id, username, email, display_name, avatar_url, description, created_at FROM users WHERE id = ?').get(result.lastInsertRowid) as any;

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as any
  );

  res.status(201).json({ token, user });
});

router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as any
  );

  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

export default router;
