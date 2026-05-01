import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';
import { createNotification } from '../lib/notifications';

const router = Router();
router.use(authenticate);

function getMemberRole(groupId: number, userId: number): string | null {
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  return m?.role || null;
}

// GET /api/groups — groups the user belongs to
router.get('/', (req: AuthRequest, res: Response): void => {
  const groups = db.prepare(`
    SELECT g.id, g.name, g.description, g.created_by, g.created_at,
           gm.role as my_role,
           (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
           (SELECT COUNT(*) FROM tasks WHERE group_id = g.id) as task_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC
  `).all(req.user!.id);

  res.json(groups);
});

// POST /api/groups — create group
router.post('/', (req: AuthRequest, res: Response): void => {
  const { name, description } = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: 'Group name is required' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO groups (name, description, created_by) VALUES (?, ?, ?)'
  ).run(name.trim(), description?.trim() || null, req.user!.id);

  const groupId = result.lastInsertRowid as number;

  // Add creator as leader
  db.prepare(
    'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
  ).run(groupId, req.user!.id, 'leader');

  const group = db.prepare(`
    SELECT g.id, g.name, g.description, g.created_by, g.created_at, 'leader' as my_role,
           1 as member_count, 0 as task_count
    FROM groups g WHERE g.id = ?
  `).get(groupId);

  res.status(201).json(group);
});

// GET /api/groups/:id
router.get('/:id', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.id);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const group = db.prepare(`
    SELECT g.id, g.name, g.description, g.created_by, g.created_at
    FROM groups g WHERE g.id = ?
  `).get(groupId) as any;

  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, gm.role, gm.joined_at
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END
  `).all(groupId);

  res.json({ ...group, my_role: role, members });
});

// DELETE /api/groups/:id — leader only
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.id);
  const role = getMemberRole(groupId, req.user!.id);

  if (role !== 'leader') {
    res.status(403).json({ error: 'Only the leader can delete the group' });
    return;
  }

  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
  res.json({ message: 'Group deleted' });
});

// POST /api/groups/:id/members — add member
router.post('/:id/members', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.id);
  const myRole = getMemberRole(groupId, req.user!.id);

  if (!myRole || (myRole !== 'leader' && myRole !== 'moderator')) {
    res.status(403).json({ error: 'Only leader or moderator can add members' });
    return;
  }

  const { userId, role } = req.body;

  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const validRoles = ['leader', 'moderator', 'executor'];
  const memberRole = role || 'executor';

  if (!validRoles.includes(memberRole)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  // Moderator cannot assign leader role
  if (myRole === 'moderator' && memberRole === 'leader') {
    res.status(403).json({ error: 'Moderators cannot assign leader role' });
    return;
  }

  // Only friends can be added to groups
  const areFriends = db.prepare(`
    SELECT id FROM friendships
    WHERE status = 'accepted'
      AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))
  `).get(req.user!.id, userId, userId, req.user!.id);

  if (!areFriends) {
    res.status(403).json({ error: 'Можно добавлять только друзей. Сначала подружитесь с пользователем.' });
    return;
  }

  const targetUser = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(userId) as any;
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const existing = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  if (existing) {
    res.status(409).json({ error: 'User is already a member' });
    return;
  }

  db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(groupId, userId, memberRole);

  const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId) as any;
  createNotification({ userId: Number(userId), type: 'added_to_group', title: 'Вас добавили в группу', body: `Вы были добавлены в группу «${group?.name}»`, data: { groupId } });

  res.status(201).json({ ...targetUser, role: memberRole });
});

// PUT /api/groups/:id/members/:userId — change role (leader only)
router.put('/:id/members/:userId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const myRole = getMemberRole(groupId, req.user!.id);

  if (myRole !== 'leader') {
    res.status(403).json({ error: 'Only the leader can change roles' });
    return;
  }

  if (targetUserId === req.user!.id) {
    res.status(400).json({ error: 'Cannot change your own role' });
    return;
  }

  const { role } = req.body;
  const validRoles = ['leader', 'moderator', 'executor'];

  if (!validRoles.includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, targetUserId) as any;
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  // If promoting to leader, demote current leader to moderator
  if (role === 'leader') {
    db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run('moderator', groupId, req.user!.id);
  }

  db.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').run(role, groupId, targetUserId);

  const groupInfo = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId) as any;
  const ROLE_LABELS: Record<string, string> = { leader: 'Лидер', moderator: 'Модератор', executor: 'Исполнитель' };
  createNotification({ userId: targetUserId, type: 'role_changed', title: 'Изменена ваша роль', body: `В группе «${groupInfo?.name}» вам назначена роль: ${ROLE_LABELS[role] || role}`, data: { groupId, newRole: role } });

  const updated = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, gm.role
    FROM group_members gm JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ? AND gm.user_id = ?
  `).get(groupId, targetUserId);

  res.json(updated);
});

// DELETE /api/groups/:id/members/:userId — remove member
router.delete('/:id/members/:userId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.id);
  const targetUserId = parseInt(req.params.userId);
  const myRole = getMemberRole(groupId, req.user!.id);

  if (!myRole) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const targetRole = getMemberRole(groupId, targetUserId);
  if (!targetRole) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const isSelf = targetUserId === req.user!.id;

  // Leader cannot be removed (they must delete the group or transfer leadership first)
  if (targetRole === 'leader' && !isSelf) {
    res.status(403).json({ error: 'Cannot remove the leader' });
    return;
  }

  // Permission check
  if (!isSelf) {
    if (myRole === 'executor') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    if (myRole === 'moderator' && targetRole !== 'executor') {
      res.status(403).json({ error: 'Moderators can only remove executors' });
      return;
    }
  }

  // Prevent leader from leaving without transferring
  if (isSelf && myRole === 'leader') {
    const otherMembers = db.prepare('SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND user_id != ?').get(groupId, req.user!.id) as any;
    if (otherMembers.cnt > 0) {
      res.status(400).json({ error: 'Transfer leadership before leaving the group' });
      return;
    }
    // Last member (leader) leaving — delete the group
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    res.json({ message: 'Group deleted as you were the last member' });
    return;
  }

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, targetUserId);
  res.json({ message: 'Member removed' });
});

export default router;
