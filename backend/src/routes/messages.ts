import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';
import { getIo, canAccessConversation } from '../lib/socket';

const router = Router();
router.use(authenticate);

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
    'SELECT last_read_message_id FROM conversation_reads WHERE conversation_id = ? AND user_id = ?'
  ).get(conversationId, userId) as { last_read_message_id: number } | undefined;
  const lastRead = readRow?.last_read_message_id ?? 0;

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
    return { ...conv, other_user: other, last_message: lastMessage ?? null, unread_count: unreadCount };
  }

  const group = db.prepare('SELECT id, name FROM groups WHERE id = ?').get(conv.group_id) as any;
  const memberCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?'
  ).get(conv.group_id) as { cnt: number }).cnt;
  return { ...conv, group, member_count: memberCount, last_message: lastMessage ?? null, unread_count: unreadCount };
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

  const friend = db.prepare(`
    SELECT id FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).get(meId, otherId, otherId, meId);
  if (!friend) { res.status(403).json({ error: 'You must be friends first' }); return; }

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
    ? db.prepare(`
        SELECT m.id, m.conversation_id, m.user_id, m.content, m.is_deleted, m.created_at, m.updated_at,
               u.username, u.display_name, u.avatar_url
        FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = ? AND m.id < ?
        ORDER BY m.id DESC LIMIT ?
      `).all(convId, before, limit)
    : db.prepare(`
        SELECT m.id, m.conversation_id, m.user_id, m.content, m.is_deleted, m.created_at, m.updated_at,
               u.username, u.display_name, u.avatar_url
        FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = ?
        ORDER BY m.id DESC LIMIT ?
      `).all(convId, limit);

  res.json((rows as any[]).reverse());
});

// ── POST /api/messages/conversations/:id/send ───────────────────────────────

router.post('/conversations/:id/send', (req: AuthRequest, res: Response): void => {
  const userId = req.user!.id;
  const convId = parseInt(req.params.id);
  const { content } = req.body;

  if (!content?.trim()) { res.status(400).json({ error: 'Content required' }); return; }
  if (!canAccessConversation(userId, convId)) {
    res.status(403).json({ error: 'Access denied' }); return;
  }

  const result = db.prepare(
    'INSERT INTO messages (conversation_id, user_id, content) VALUES (?, ?, ?)'
  ).run(convId, userId, content.trim());

  const message = db.prepare(`
    SELECT m.id, m.conversation_id, m.user_id, m.content, m.is_deleted, m.created_at, m.updated_at,
           u.username, u.display_name, u.avatar_url
    FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid) as any;

  // Emit to all conversation members' personal user rooms (works regardless of page)
  emitToConversationMembers(convId, 'new_message', message);

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

  db.prepare('UPDATE messages SET is_deleted = 1, content = ? WHERE id = ?')
    .run('Сообщение удалено', msgId);

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

  res.json({ ok: true });
});

export default router;
