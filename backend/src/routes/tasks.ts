import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

// mergeParams: true is CRITICAL — without it `:groupId` from the parent router is undefined
const router = Router({ mergeParams: true });
router.use(authenticate);

function getMemberRole(groupId: number, userId: number): string | null {
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  return m?.role || null;
}

// GET /api/groups/:groupId/tasks
router.get('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { status, priority } = req.query;

  let query = `
    SELECT t.id, t.title, t.description, t.priority, t.status,
           t.created_by, t.assigned_to, t.created_at, t.updated_at,
           u1.username as created_by_username, u1.display_name as created_by_name,
           u2.username as assigned_to_username, u2.display_name as assigned_to_name,
           u2.avatar_url as assigned_to_avatar
    FROM tasks t
    LEFT JOIN users u1 ON t.created_by = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    WHERE t.group_id = ?
  `;
  const params: any[] = [groupId];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }
  if (priority) {
    query += ' AND t.priority = ?';
    params.push(priority);
  }

  query += ' ORDER BY CASE t.priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END, t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks);
});

// POST /api/groups/:groupId/tasks
router.post('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { title, description, priority, status, assigned_to } = req.body;

  if (!title?.trim()) {
    res.status(400).json({ error: 'Task title is required' });
    return;
  }

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const validStatuses = ['todo', 'in_progress', 'done'];

  const taskPriority = priority || 'medium';
  const taskStatus = status || 'todo';

  if (!validPriorities.includes(taskPriority)) {
    res.status(400).json({ error: 'Invalid priority' });
    return;
  }
  if (!validStatuses.includes(taskStatus)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  // Validate assigned_to is a group member
  if (assigned_to) {
    const assigneeMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, assigned_to) as any;
    if (!assigneeMember) {
      res.status(400).json({ error: 'Assignee must be a group member' });
      return;
    }
  }

  const result = db.prepare(`
    INSERT INTO tasks (group_id, title, description, priority, status, created_by, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(groupId, title.trim(), description?.trim() || null, taskPriority, taskStatus, req.user!.id, assigned_to || null);

  const task = db.prepare(`
    SELECT t.id, t.title, t.description, t.priority, t.status,
           t.created_by, t.assigned_to, t.created_at, t.updated_at,
           u1.username as created_by_username, u1.display_name as created_by_name,
           u2.username as assigned_to_username, u2.display_name as assigned_to_name,
           u2.avatar_url as assigned_to_avatar
    FROM tasks t
    LEFT JOIN users u1 ON t.created_by = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(task);
});

// PUT /api/groups/:groupId/tasks/:taskId — leader/moderator only
router.put('/:taskId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  if (role !== 'leader' && role !== 'moderator') {
    res.status(403).json({ error: 'Only leader or moderator can edit tasks' });
    return;
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId) as any;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const { title, description, priority, status, assigned_to } = req.body;

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];

  if (title !== undefined) {
    if (!title.trim()) {
      res.status(400).json({ error: 'Title cannot be empty' });
      return;
    }
    updates.push('title = ?');
    values.push(title.trim());
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description?.trim() || null);
  }
  if (priority !== undefined) {
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(priority)) {
      res.status(400).json({ error: 'Invalid priority' });
      return;
    }
    updates.push('priority = ?');
    values.push(priority);
  }
  if (status !== undefined) {
    const validStatuses = ['todo', 'in_progress', 'done'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    updates.push('status = ?');
    values.push(status);
  }
  if (assigned_to !== undefined) {
    if (assigned_to !== null) {
      const assigneeMember = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, assigned_to) as any;
      if (!assigneeMember) {
        res.status(400).json({ error: 'Assignee must be a group member' });
        return;
      }
    }
    updates.push('assigned_to = ?');
    values.push(assigned_to);
  }

  values.push(taskId, groupId);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND group_id = ?`).run(...values);

  const updated = db.prepare(`
    SELECT t.id, t.title, t.description, t.priority, t.status,
           t.created_by, t.assigned_to, t.created_at, t.updated_at,
           u1.username as created_by_username, u1.display_name as created_by_name,
           u2.username as assigned_to_username, u2.display_name as assigned_to_name,
           u2.avatar_url as assigned_to_avatar
    FROM tasks t
    LEFT JOIN users u1 ON t.created_by = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    WHERE t.id = ?
  `).get(taskId);

  res.json(updated);
});

// DELETE /api/groups/:groupId/tasks/:taskId — leader/moderator only
router.delete('/:taskId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  if (role !== 'leader' && role !== 'moderator') {
    res.status(403).json({ error: 'Only leader or moderator can delete tasks' });
    return;
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId) as any;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  db.prepare('DELETE FROM tasks WHERE id = ? AND group_id = ?').run(taskId, groupId);
  res.json({ message: 'Task deleted' });
});

// PATCH /api/groups/:groupId/tasks/:taskId/status
router.patch('/:taskId/status', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const { status } = req.body;
  const validStatuses = ['todo', 'in_progress', 'done'];

  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const task = db.prepare('SELECT id, assigned_to FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId) as any;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Executors can only change status of their own assigned tasks
  if (role === 'executor' && task.assigned_to !== req.user!.id) {
    res.status(403).json({ error: 'Executors can only update status of their assigned tasks' });
    return;
  }

  db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, taskId);

  const updated = db.prepare(`
    SELECT t.id, t.title, t.description, t.priority, t.status,
           t.created_by, t.assigned_to, t.created_at, t.updated_at,
           u1.username as created_by_username, u1.display_name as created_by_name,
           u2.username as assigned_to_username, u2.display_name as assigned_to_name,
           u2.avatar_url as assigned_to_avatar
    FROM tasks t
    LEFT JOIN users u1 ON t.created_by = u1.id
    LEFT JOIN users u2 ON t.assigned_to = u2.id
    WHERE t.id = ?
  `).get(taskId);

  res.json(updated);
});

export default router;
