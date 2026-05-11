import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router({ mergeParams: true });
router.use(authenticate);

function getMemberRole(groupId: number, userId: number): string | null {
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  return m?.role || null;
}

function recordStatusChange(taskId: number, fromStatus: string | null, toStatus: string, userId: number): void {
  db.prepare(
    'INSERT INTO task_status_history (task_id, from_status, to_status, changed_by) VALUES (?, ?, ?, ?)'
  ).run(taskId, fromStatus, toStatus, userId);
}

// Derive legacy status value from a column's position/is_completion
function statusForColumn(column: { position: number; is_completion: number }): string {
  if (column.is_completion) return 'done';
  if (column.position === 0) return 'todo';
  return 'in_progress';
}

function getColumn(columnId: number, groupId: number) {
  return db.prepare(
    'SELECT id, group_id, position, is_completion FROM board_columns WHERE id = ? AND group_id = ?'
  ).get(columnId, groupId) as { id: number; group_id: number; position: number; is_completion: number } | undefined;
}

function getFirstColumn(groupId: number) {
  return db.prepare(
    'SELECT id, group_id, position, is_completion FROM board_columns WHERE group_id = ? ORDER BY position ASC LIMIT 1'
  ).get(groupId) as { id: number; group_id: number; position: number; is_completion: number } | undefined;
}

const TASK_SELECT = `
  SELECT t.id, t.title, t.description, t.priority, t.status, t.column_id,
         t.created_by, t.assigned_to, t.created_at, t.updated_at,
         u1.username as created_by_username, u1.display_name as created_by_name,
         u2.username as assigned_to_username, u2.display_name as assigned_to_name,
         u2.avatar_url as assigned_to_avatar
  FROM tasks t
  LEFT JOIN users u1 ON t.created_by = u1.id
  LEFT JOIN users u2 ON t.assigned_to = u2.id
`;

// GET /api/groups/:groupId/tasks
router.get('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!getMemberRole(groupId, req.user!.id)) {
    res.status(403).json({ error: 'You are not a member of this group' }); return;
  }

  const { priority, column_id } = req.query;

  let query = `${TASK_SELECT} WHERE t.group_id = ?`;
  const params: any[] = [groupId];

  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (column_id) { query += ' AND t.column_id = ?'; params.push(parseInt(column_id as string)); }

  query += ` ORDER BY CASE t.priority
                       WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                       WHEN 'medium' THEN 2 ELSE 3 END,
                     t.created_at DESC`;

  res.json(db.prepare(query).all(...params));
});

// POST /api/groups/:groupId/tasks
router.post('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!getMemberRole(groupId, req.user!.id)) {
    res.status(403).json({ error: 'You are not a member of this group' }); return;
  }

  const { title, description, priority, column_id, assigned_to } = req.body;

  if (!title?.trim()) { res.status(400).json({ error: 'Task title is required' }); return; }

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const taskPriority = priority || 'medium';
  if (!validPriorities.includes(taskPriority)) {
    res.status(400).json({ error: 'Invalid priority' }); return;
  }

  let column = column_id ? getColumn(column_id, groupId) : null;
  if (column_id && !column) {
    res.status(400).json({ error: 'Invalid column' }); return;
  }
  if (!column) column = getFirstColumn(groupId) ?? null;
  if (!column) { res.status(400).json({ error: 'Group has no columns' }); return; }

  if (assigned_to) {
    const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, assigned_to);
    if (!member) { res.status(400).json({ error: 'Assignee must be a group member' }); return; }
  }

  const taskStatus = statusForColumn(column);

  const result = db.prepare(`
    INSERT INTO tasks (group_id, title, description, priority, status, column_id, created_by, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId, title.trim(), description?.trim() || null,
    taskPriority, taskStatus, column.id, req.user!.id, assigned_to || null
  );

  recordStatusChange(result.lastInsertRowid as number, null, taskStatus, req.user!.id);

  res.status(201).json(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(result.lastInsertRowid));
});

// PUT /api/groups/:groupId/tasks/:taskId
router.put('/:taskId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);
  if (!role) { res.status(403).json({ error: 'You are not a member of this group' }); return; }
  if (role !== 'leader' && role !== 'moderator') {
    res.status(403).json({ error: 'Only leader or moderator can edit tasks' }); return;
  }

  const task = db.prepare('SELECT id, status, column_id FROM tasks WHERE id = ? AND group_id = ?')
    .get(taskId, groupId) as { id: number; status: string; column_id: number | null } | undefined;
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const { title, description, priority, column_id, assigned_to } = req.body;

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];
  let newStatus: string | null = null;

  if (title !== undefined) {
    if (!title.trim()) { res.status(400).json({ error: 'Title cannot be empty' }); return; }
    updates.push('title = ?'); values.push(title.trim());
  }
  if (description !== undefined) {
    updates.push('description = ?'); values.push(description?.trim() || null);
  }
  if (priority !== undefined) {
    const valid = ['low', 'medium', 'high', 'critical'];
    if (!valid.includes(priority)) { res.status(400).json({ error: 'Invalid priority' }); return; }
    updates.push('priority = ?'); values.push(priority);
  }
  if (column_id !== undefined) {
    const col = getColumn(column_id, groupId);
    if (!col) { res.status(400).json({ error: 'Invalid column' }); return; }
    updates.push('column_id = ?'); values.push(col.id);
    const status = statusForColumn(col);
    updates.push('status = ?'); values.push(status);
    if (status !== task.status) newStatus = status;
  }
  if (assigned_to !== undefined) {
    if (assigned_to !== null) {
      const member = db.prepare('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, assigned_to);
      if (!member) { res.status(400).json({ error: 'Assignee must be a group member' }); return; }
    }
    updates.push('assigned_to = ?'); values.push(assigned_to);
  }

  values.push(taskId, groupId);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND group_id = ?`).run(...values);

  if (newStatus) recordStatusChange(taskId, task.status, newStatus, req.user!.id);

  res.json(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(taskId));
});

// DELETE /api/groups/:groupId/tasks/:taskId
router.delete('/:taskId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);
  if (!role) { res.status(403).json({ error: 'You are not a member of this group' }); return; }
  if (role !== 'leader' && role !== 'moderator') {
    res.status(403).json({ error: 'Only leader or moderator can delete tasks' }); return;
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  db.prepare('DELETE FROM tasks WHERE id = ? AND group_id = ?').run(taskId, groupId);
  res.json({ message: 'Task deleted' });
});

// PATCH /api/groups/:groupId/tasks/:taskId/column — move to another column
router.patch('/:taskId/column', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);
  if (!role) { res.status(403).json({ error: 'You are not a member of this group' }); return; }

  const { column_id } = req.body;
  const col = getColumn(column_id, groupId);
  if (!col) { res.status(400).json({ error: 'Invalid column' }); return; }

  const task = db.prepare('SELECT id, assigned_to, status, column_id FROM tasks WHERE id = ? AND group_id = ?')
    .get(taskId, groupId) as { id: number; assigned_to: number | null; status: string; column_id: number | null } | undefined;
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  if (role === 'executor' && task.assigned_to !== req.user!.id) {
    res.status(403).json({ error: 'Executors can only move their assigned tasks' }); return;
  }

  const newStatus = statusForColumn(col);
  db.prepare(
    'UPDATE tasks SET column_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(col.id, newStatus, taskId);

  if (newStatus !== task.status) recordStatusChange(taskId, task.status, newStatus, req.user!.id);

  res.json(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(taskId));
});

export default router;
