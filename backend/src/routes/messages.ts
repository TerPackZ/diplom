import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';
import { getIo, canAccessConversation } from '../lib/socket';

const router = Router();
router.use(authenticate);

// ── upload (chat attachments) ───────────────────────────────────────────────

const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'chat');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

function deleteChatFile(filename: string | null) {
  if (!filename) return;
  const file = path.join(__dirname, '..', '..', 'uploads', 'chat', filename);
  if (fs.existsSync(file)) {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

// Friendship helper for DM permission check
function areFriends(a: number, b: number): boolean {
  return !!db.prepare(`
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).get(a, b, b, a);
}

// Single SELECT used everywhere; LEFT JOIN brings the replied-to message info
const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id, m.user_id, m.content, m.is_deleted, m.created_at, m.updated_at,
         m.attachment_filename, m.attachment_original, m.attachment_size, m.attachment_mime,
         m.reply_to_message_id,
         u.username, u.display_name, u.avatar_url,
         r.id as _reply_id,
         r.content as _reply_content,
         r.user_id as _reply_user_id,
         r.is_deleted as _reply_is_deleted,
         r.attachment_original as _reply_attachment_original,
         r.attachment_mime as _reply_attachment_mime,
         ru.username as _reply_username,
         ru.display_name as _reply_display_name
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN messages r ON r.id = m.reply_to_message_id
  LEFT JOIN users ru ON ru.id = r.user_id
`;

function getMessageReactions(messageId: number, viewerId: number) {
  return db.prepare(`
    SELECT emoji,
           COUNT(*) as count,
           MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as by_me
    FROM message_reactions
    WHERE message_id = ?
    GROUP BY emoji
    ORDER BY MIN(created_at) ASC
  `).all(viewerId, messageId) as { emoji: string; count: number; by_me: number }[];
}

function attachReactionsBulk(rows: any[], viewerId: number): any[] {
  if (rows.length === 0) return rows;
  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const all = db.prepare(`
    SELECT message_id, emoji,
           COUNT(*) as count,
           MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as by_me,
           MIN(created_at) as first_at
    FROM message_reactions
    WHERE message_id IN (${placeholders})
    GROUP BY message_id, emoji
    ORDER BY first_at ASC
  `).all(viewerId, ...ids) as { message_id: number; emoji: string; count: number; by_me: number }[];

  const byMsg = new Map<number, { emoji: string; count: number; by_me: boolean }[]>();
  for (const r of all) {
    const arr = byMsg.get(r.message_id) || [];
    arr.push({ emoji: r.emoji, count: r.count, by_me: !!r.by_me });
    byMsg.set(r.message_id, arr);
  }
  return rows.map(r => ({ ...r, reactions: byMsg.get(r.id) || [] }));
}

function enrichMessage(row: any, viewerId?: number): any {
  if (!row) return row;
  const reply = row._reply_id ? {
    id: row._reply_id,
    content: row._reply_content,
    user_id: row._reply_user_id,
    is_deleted: row._reply_is_deleted,
    attachment_original: row._reply_attachment_original,
    attachment_mime: row._reply_attachment_mime,
    username: row._reply_username,
    display_name: row._reply_display_name
  } : null;
  const cleaned: any = { ...row, reply_to: reply };
  for (const k of Object.keys(cleaned)) if (k.startsWith('_')) delete cleaned[k];

  if (viewerId !== undefined) {
    cleaned.reactions = getMessageReactions(row.id, viewerId)
      .map(r => ({ emoji: r.emoji, count: r.count, by_me: !!r.by_me }));
  } else {
    cleaned.reactions = [];
  }
  return cleaned;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function getConversationMemberIds(conversationId: number): number[] {
  const conv = db.prepare(
    'SELECT type, group_id FROM conversations WHERE id = ?'
  ).get(conversationId) as { type: string; group_id: number | null } | undefined;
  if (!conv) return [];

  if (conv.type === 'direct') {
    return (db.prepare(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ?'
    ).all(conversationId) as { user_id: number }[]).map(r => r.user_id);
  }

  return (db.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ?'
  ).all(conv.group_id) as { user_id: number }[]).map(r => r.user_id);
}

function emitToConversationMembers(conversationId: number, event: string, payload: unknown): void {
  const io = getIo();
  if (!io) return;
  const memberIds = getConversationMemberIds(conversationId);
  for (const uid of memberIds) {
    io.to(`user:${uid}`).emit(event, payload);
  }
  console.log(`[socket] emit ${event} → ${memberIds.length} members of conv:${conversationId}`);
}

// Broadcast new message:
//  - 'new_message' → all members (updates sidebar / unread counter)
//  - 'chat_notification' → all members except the sender AND except those who muted this conv
function broadcastMessage(conversationId: number, message: any): void {
  const io = getIo();
  if (!io) return;
  const memberIds = getConversationMemberIds(conversationId);

  const mutedStmt = db.prepare(
    'SELECT is_muted FROM conversation_reads WHERE conversation_id = ? AND user_id = ?'
  );

  for (const uid of memberIds) {
    io.to(`user:${uid}`).emit('new_message', message);

    if (uid === message.user_id) continue;
    const row = mutedStmt.get(conversationId, uid) as { is_muted: number } | undefined;
    if (row?.is_muted) continue;

    io.to(`user:${uid}`).emit('chat_notification', message);
  }
  console.log(`[socket] broadcast message → ${memberIds.length} members of conv:${conversationId}`);
}

function getConversationWithMeta(conversationId: number, userId: number) {
  const conv = db.prepare('SELECT id, type, group_id, created_at FROM conversations WHERE id = ?')
    .get(conversationId) as { id: number; type: string; group_id: number | null; created_at: string } | undefined;
  if (!conv) return null;

  const lastMessage = db.prepare(`
    SELECT m.id, m.content, m.created_at, u.display_name, u.username
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.conversation_id = ? AND m.is_deleted = 0
    ORDER BY m.created_at DESC LIMIT 1
  `).get(conversationId) as any;

  const readRow = db.prepare(
    'SELECT last_read_message_id, is_muted FROM conversation_reads WHERE conversation_id = ? AND user_id = ?'
  ).get(conversationId, userId) as { last_read_message_id: number; is_muted: number } | undefined;
  const lastRead = readRow?.last_read_message_id ?? 0;
  const isMuted = !!readRow?.is_muted;

  const unreadCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND id > ? AND user_id != ? AND is_deleted = 0'
  ).get(conversationId, lastRead, userId) as { cnt: number }).cnt;

  if (conv.type === 'direct') {
    const other = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = ? AND cm.user_id != ?
    `).get(conversationId, userId) as any;

    // What's the highest message id the OTHER user has read? Used for "✓✓" receipts.
    const otherReadRow = other ? db.prepare(
      'SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = ? AND user_id = ?'
    ).get(conversationId, other.id) as { last_read_message_id: number } | undefined : undefined;

    return {
      ...conv,
      other_user: other,
      last_message: lastMessage ?? null,
      unread_count: unreadCount,
      is_muted: isMuted,
      other_last_read_id: otherReadRow?.last_read_message_id ?? 0
    };
  }

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(conv.group_id) as any;
  const memberCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?'
  ).get(conv.group_id) as { cnt: number }).cnt;
  return {
    ...conv, group, member_count: memberCount,
    last_message: lastMessage ?? null,
    unread_count: unreadCount,
    is_muted: isMuted,
    other_last_read_id: 0
  };
}

// ── GET /api/messages/conversations ─────────────────────────────────────────

router.get('/conversations', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;

  // Direct conversations this user is in
  const directIds = (db.prepare(`
    SELECT cm.conversation_id
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.user_id = ? AND c.type = 'direct'
  `).all(userId) as { conversation_id: number }[]).map(r => r.conversation_id);

  // Group conversations for groups this user belongs to
  const groupIds = (db.prepare(`
    SELECT c.id as conversation_id
    FROM conversations c
    JOIN group_members gm ON gm.group_id = c.group_id
    WHERE gm.user_id = ? AND c.type = 'group'
  `).all(userId) as { conversation_id: number }[]).map(r => r.conversation_id);

  const allIds = [...new Set([...directIds, ...groupIds])];
  const conversations = allIds
    .map(id => getConversationWithMeta(id, userId))
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const ta = a.last_message?.created_at ?? a.created_at;
      const tb = b.last_message?.created_at ?? b.created_at;
      return tb > ta ? 1 : -1;
    });

  res.json(conversations);
});

// ── GET /api/messages/unread-count ──────────────────────────────────────────

router.get('/unread-count', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;

  const directIds = (db.prepare(`
    SELECT cm.conversation_id
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.user_id = ? AND c.type = 'direct'
  `).all(userId) as { conversation_id: number }[]).map(r => r.conversation_id);

  const groupIds = (db.prepare(`
    SELECT c.id as conversation_id
    FROM conversations c
    JOIN group_members gm ON gm.group_id = c.group_id
    WHERE gm.user_id = ? AND c.type = 'group'
  `).all(userId) as { conversation_id: number }[]).map(r => r.conversation_id);

  const allIds = [...new Set([...directIds, ...groupIds])];
  let total = 0;
  for (const convId of allIds) {
    const readRow = db.prepare(
      'SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = ? AND user_id = ?'
    ).get(convId, userId) as { last_read_message_id: number } | undefined;
    const lastRead = readRow?.last_read_message_id ?? 0;
    const cnt = (db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND id > ? AND user_id != ? AND is_deleted = 0'
    ).get(convId, lastRead, userId) as { cnt: number }).cnt;
    total += cnt;
  }

  res.json({ count: total });
});

// ── POST /api/messages/direct/:userId ───────────────────────────────────────

router.post('/direct/:userId', (req: AuthRequest, res: Response): void => {
  const meId = req.user!.id;
  const otherId = parseInt(req.params.userId);

  if (meId === otherId) { res.status(400).json({ error: 'Cannot chat with yourself' }); return; }

  const other = db.prepare(
    'SELECT id, dm_permission FROM users WHERE id = ?'
  ).get(otherId) as { id: number; dm_permission: string } | undefined;
  if (!other) { res.status(404).json({ error: 'User not found' }); return; }

  if (other.dm_permission === 'friends_only' && !areFriends(meId, otherId)) {
    res.status(403).json({ error: 'Этот пользователь принимает сообщения только от друзей' });
    return;
  }

  // Check if direct conversation already exists
  const existing = db.prepare(`
    SELECT cm1.conversation_id
    FROM conversation_members cm1
    JOIN conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id AND cm2.user_id = ?
    JOIN conversations c ON c.id = cm1.conversation_id AND c.type = 'direct'
    WHERE cm1.user_id = ?
  `).get(otherId, meId) as { conversation_id: number } | undefined;

  if (existing) {
    res.json(getConversationWithMeta(existing.conversation_id, meId));
    return;
  }

  const conv = db.prepare(
    "INSERT INTO conversations (type) VALUES ('direct')"
  ).run();
  const convId = conv.lastInsertRowid as number;
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)')
    .run(convId, meId);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)')
    .run(convId, otherId);

  res.status(201).json(getConversationWithMeta(convId, meId));
});

// ── POST /api/messages/group/:groupId ───────────────────────────────────────

router.post('/group/:groupId', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const groupId = parseInt(req.params.groupId);

  const member = db.prepare(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);
  if (!member) { res.status(403).json({ error: 'Not a group member' }); return; }

  const existing = db.prepare(
    "SELECT id FROM conversations WHERE type = 'group' AND group_id = ?"
  ).get(groupId) as { id: number } | undefined;

  if (existing) {
    res.json(getConversationWithMeta(existing.id, userId));
    return;
  }

  const conv = db.prepare(
    "INSERT INTO conversations (type, group_id) VALUES ('group', ?)"
  ).run(groupId);
  res.status(201).json(getConversationWithMeta(conv.lastInsertRowid as number, userId));
});

// ── GET /api/messages/conversations/:id/messages ────────────────────────────

router.get('/conversations/:id/messages', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const convId = parseInt(req.params.id);
  const before = req.query.before ? parseInt(req.query.before as string) : null;
  const limit = Math.min(parseInt((req.query.limit as string) || '50'), 100);

  if (!canAccessConversation(userId, convId)) {
    res.status(403).json({ error: 'Access denied' }); return;
  }

  const rows = before
    ? db.prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
        .all(convId, before, limit)
    : db.prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ?`)
        .all(convId, limit);

  // Enrich reply_to fields message-by-message, then bulk-attach reactions
  const enriched = (rows as any[]).map(r => enrichMessage(r)); // empty reactions
  const withReactions = attachReactionsBulk(enriched, userId);
  res.json(withReactions.reverse());
});

// ── POST /api/messages/conversations/:id/send ───────────────────────────────

function validateReplyTo(replyToRaw: unknown, convId: number): number | null | { error: string } {
  if (replyToRaw === undefined || replyToRaw === null || replyToRaw === '') return null;
  const replyId = Number(replyToRaw);
  if (!Number.isFinite(replyId) || replyId <= 0) return { error: 'Invalid reply_to' };
  const original = db.prepare(
    'SELECT id FROM messages WHERE id = ? AND conversation_id = ?'
  ).get(replyId, convId);
  if (!original) return { error: 'Replied-to message not found in this conversation' };
  return replyId;
}

router.post('/conversations/:id/send', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const convId = parseInt(req.params.id);
  const { content, reply_to } = req.body;

  if (!content?.trim()) { res.status(400).json({ error: 'Content required' }); return; }
  if (!canAccessConversation(userId, convId)) {
    res.status(403).json({ error: 'Access denied' }); return;
  }

  const replyId = validateReplyTo(reply_to, convId);
  if (replyId && typeof replyId === 'object') { res.status(400).json({ error: replyId.error }); return; }

  const result = db.prepare(
    'INSERT INTO messages (conversation_id, user_id, content, reply_to_message_id) VALUES (?, ?, ?, ?)'
  ).run(convId, userId, content.trim(), replyId);

  const message = enrichMessage(
    db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(result.lastInsertRowid),
    userId
  );

  broadcastMessage(convId, message);
  res.status(201).json(message);
});

// ── POST /api/messages/conversations/:id/upload — send with file attachment ──

router.post('/conversations/:id/upload', chatUpload.single('file'), (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const convId = parseInt(req.params.id);
  const text = (req.body.content || '').toString().trim();
  const file = req.file;

  if (!file) { res.status(400).json({ error: 'File required' }); return; }

  if (!canAccessConversation(userId, convId)) {
    deleteChatFile(file.filename);
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const replyId = validateReplyTo(req.body.reply_to, convId);
  if (replyId && typeof replyId === 'object') {
    deleteChatFile(file.filename);
    res.status(400).json({ error: replyId.error });
    return;
  }

  const result = db.prepare(`
    INSERT INTO messages
      (conversation_id, user_id, content, attachment_filename, attachment_original, attachment_size, attachment_mime, reply_to_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(convId, userId, text, file.filename, file.originalname, file.size, file.mimetype, replyId);

  const message = enrichMessage(
    db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(result.lastInsertRowid),
    userId
  );

  broadcastMessage(convId, message);
  res.status(201).json(message);
});

// ── DELETE /api/messages/:messageId ─────────────────────────────────────────

router.delete('/:messageId', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const msgId = parseInt(req.params.messageId);

  const msg = db.prepare(
    'SELECT id, conversation_id, user_id FROM messages WHERE id = ?'
  ).get(msgId) as { id: number; conversation_id: number; user_id: number } | undefined;

  if (!msg) { res.status(404).json({ error: 'Message not found' }); return; }

  if (msg.user_id !== userId) {
    // Leaders/moderators of group can also delete
    const conv = db.prepare('SELECT type, group_id FROM conversations WHERE id = ?')
      .get(msg.conversation_id) as { type: string; group_id: number | null } | undefined;
    if (conv?.type === 'group') {
      const member = db.prepare(
        "SELECT role FROM group_members WHERE group_id = ? AND user_id = ?"
      ).get(conv.group_id, userId) as { role: string } | undefined;
      if (!member || member.role === 'executor') {
        res.status(403).json({ error: 'Forbidden' }); return;
      }
    } else {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
  }

  // If message had a file attachment — delete the file too
  const msgRow = db.prepare(
    'SELECT attachment_filename FROM messages WHERE id = ?'
  ).get(msgId) as { attachment_filename: string | null } | undefined;
  if (msgRow?.attachment_filename) deleteChatFile(msgRow.attachment_filename);

  db.prepare(`
    UPDATE messages SET
      is_deleted = 1,
      content = ?,
      attachment_filename = NULL,
      attachment_original = NULL,
      attachment_size = NULL,
      attachment_mime = NULL
    WHERE id = ?
  `).run('Сообщение удалено', msgId);

  emitToConversationMembers(msg.conversation_id, 'message_deleted', {
    messageId: msgId,
    conversationId: msg.conversation_id
  });

  res.json({ ok: true });
});

// ── PATCH /api/messages/conversations/:id/read ──────────────────────────────

router.patch('/conversations/:id/read', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const convId = parseInt(req.params.id);

  if (!canAccessConversation(userId, convId)) {
    res.status(403).json({ error: 'Access denied' }); return;
  }

  const lastMsg = db.prepare(
    'SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1'
  ).get(convId) as { id: number } | undefined;

  if (!lastMsg) { res.json({ ok: true }); return; }

  db.prepare(`
    INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id)
    VALUES (?, ?, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id
  `).run(convId, userId, lastMsg.id);

  // Notify other members so they can update read receipts in real time
  emitToConversationMembers(convId, 'conversation_read', {
    conversationId: convId,
    userId,
    lastReadId: lastMsg.id
  });

  res.json({ ok: true });
});

// ── PATCH /api/messages/conversations/:id/mute ──────────────────────────────

router.patch('/conversations/:id/mute', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const convId = parseInt(req.params.id);
  const { muted } = req.body;

  if (!canAccessConversation(userId, convId)) {
    res.status(403).json({ error: 'Access denied' }); return;
  }

  const isMuted = muted ? 1 : 0;

  db.prepare(`
    INSERT INTO conversation_reads (conversation_id, user_id, last_read_message_id, is_muted)
    VALUES (?, ?, 0, ?)
    ON CONFLICT(conversation_id, user_id) DO UPDATE SET is_muted = excluded.is_muted
  `).run(convId, userId, isMuted);

  res.json({ ok: true, is_muted: !!isMuted });
});

// ── POST /api/messages/messages/:messageId/reactions — toggle a reaction ────

const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '👏', '👎'];

router.post('/messages/:messageId/reactions', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const msgId = parseInt(req.params.messageId);
  const { emoji } = req.body;

  if (!emoji || typeof emoji !== 'string' || !ALLOWED_EMOJIS.includes(emoji)) {
    res.status(400).json({ error: 'Invalid emoji' }); return;
  }

  const msg = db.prepare(
    'SELECT id, conversation_id, is_deleted FROM messages WHERE id = ?'
  ).get(msgId) as { id: number; conversation_id: number; is_deleted: number } | undefined;
  if (!msg) { res.status(404).json({ error: 'Message not found' }); return; }
  if (msg.is_deleted) { res.status(400).json({ error: 'Message is deleted' }); return; }
  if (!canAccessConversation(userId, msg.conversation_id)) {
    res.status(403).json({ error: 'Access denied' }); return;
  }

  // Toggle: insert if missing, delete if present
  const existing = db.prepare(
    'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?'
  ).get(msgId, userId, emoji) as { id: number } | undefined;

  let action: 'add' | 'remove';
  if (existing) {
    db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
    action = 'remove';
  } else {
    db.prepare(
      'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)'
    ).run(msgId, userId, emoji);
    action = 'add';
  }

  // Notify all conversation members. Each frontend recomputes by_me locally
  // from the userId in the payload, so we can send one canonical event.
  try {
    const io = getIo();
    if (io) {
      const memberIds = getConversationMemberIds(msg.conversation_id);
      for (const uid of memberIds) {
        io.to(`user:${uid}`).emit('message_reaction', {
          messageId: msgId,
          conversationId: msg.conversation_id,
          userId,
          emoji,
          action
        });
      }
    }
  } catch { /* ignore */ }

  res.json({
    ok: true,
    action,
    reactions: getMessageReactions(msgId, userId)
      .map(r => ({ emoji: r.emoji, count: r.count, by_me: !!r.by_me }))
  });
});

export default router;
