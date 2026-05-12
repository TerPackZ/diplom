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

// Validate assignees: all must be group members; returns the unique sanitized list or null on error
function sanitizeAssignees(groupId: number, raw: unknown): number[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: 'assignees must be an array of user IDs' };

  const ids = Array.from(new Set(raw.map(v => Number(v)))).filter(v => Number.isFinite(v) && v > 0);

  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const validMembers = (db.prepare(
    `SELECT user_id FROM group_members WHERE group_id = ? AND user_id IN (${placeholders})`
  ).all(groupId, ...ids) as { user_id: number }[]).map(r => r.user_id);

  if (validMembers.length !== ids.length) {
    return { error: 'All assignees must be group members' };
  }

  return ids;
}

function setTaskAssignees(taskId: number, userIds: number[]): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
    if (userIds.length === 0) return;
    const stmt = db.prepare('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)');
    for (const uid of userIds) stmt.run(taskId, uid);
  });
  tx();
}

function getTaskAssignees(taskId: number): { id: number; username: string; display_name: string | null; avatar_url: string | null }[] {
  return db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.task_id = ?
    ORDER BY u.display_name, u.username
  `).all(taskId) as any[];
}

function isAssignee(taskId: number, userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?').get(taskId, userId);
}

const TASK_SELECT = `
  SELECT t.id, t.title, t.description, t.priority, t.status, t.column_id,
         t.due_date, t.created_by, t.created_at, t.updated_at,
         u1.username as created_by_username, u1.display_name as created_by_name
  FROM tasks t
  LEFT JOIN users u1 ON t.created_by = u1.id
`;

function sanitizeDueDate(raw: unknown): string | null | { error: string } {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return { error: 'due_date must be a string (YYYY-MM-DD) or null' };
  // Accept YYYY-MM-DD or full ISO; store as-is. Basic shape check.
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(raw)) {
    return { error: 'Invalid due_date format' };
  }
  return raw;
}

function enrichTask(task: any) {
  if (!task) return task;
  return { ...task, assignees: getTaskAssignees(task.id) };
}

// GET /api/groups/:groupId/tasks
router.get('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!getMemberRole(groupId, req.user!.id)) {
    res.status(403).json({ error: 'You are not a member of this group' }); return;
  }

  const { priority, column_id, assignee, deadline } = req.query;

  let query = `${TASK_SELECT} WHERE t.group_id = ?`;
  const params: any[] = [groupId];

  if (priority)  { query += ' AND t.priority = ?';  params.push(priority); }
  if (column_id) { query += ' AND t.column_id = ?'; params.push(parseInt(column_id as string)); }
  if (assignee)  {
    query += ' AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)';
    params.push(parseInt(assignee as string));
  }

  if (deadline === 'overdue') {
    query += " AND t.due_date IS NOT NULL AND date(t.due_date) < date('now') AND t.status != 'done'";
  } else if (deadline === 'week') {
    query += " AND t.due_date IS NOT NULL AND date(t.due_date) <= date('now', '+7 days') AND date(t.due_date) >= date('now') AND t.status != 'done'";
  } else if (deadline === 'none') {
    query += ' AND t.due_date IS NULL';
  }

  query += ` ORDER BY CASE t.priority
                       WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                       WHEN 'medium' THEN 2 ELSE 3 END,
                     t.created_at DESC`;

  const tasks = db.prepare(query).all(...params) as any[];
  res.json(tasks.map(enrichTask));
});

// POST /api/groups/:groupId/tasks
router.post('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!getMemberRole(groupId, req.user!.id)) {
    res.status(403).json({ error: 'You are not a member of this group' }); return;
  }

  const { title, description, priority, column_id, assignees, due_date } = req.body;

  if (!title?.trim()) { res.status(400).json({ error: 'Task title is required' }); return; }

  const validPriorities = ['low', 'medium', 'high', 'critical'];
  const taskPriority = priority || 'medium';
  if (!validPriorities.includes(taskPriority)) {
    res.status(400).json({ error: 'Invalid priority' }); return;
  }

  let column = column_id ? getColumn(column_id, groupId) : null;
  if (column_id && !column) { res.status(400).json({ error: 'Invalid column' }); return; }
  if (!column) column = getFirstColumn(groupId) ?? null;
  if (!column) { res.status(400).json({ error: 'Group has no columns' }); return; }

  const ids = sanitizeAssignees(groupId, assignees);
  if (!Array.isArray(ids)) { res.status(400).json({ error: ids.error }); return; }

  const dueDate = sanitizeDueDate(due_date);
  if (dueDate && typeof dueDate === 'object') { res.status(400).json({ error: dueDate.error }); return; }

  const taskStatus = statusForColumn(column);

  const result = db.prepare(`
    INSERT INTO tasks (group_id, title, description, priority, status, column_id, due_date, created_by, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    groupId, title.trim(), description?.trim() || null,
    taskPriority, taskStatus, column.id, dueDate as string | null, req.user!.id, ids[0] ?? null
  );

  const taskId = result.lastInsertRowid as number;
  setTaskAssignees(taskId, ids);
  recordStatusChange(taskId, null, taskStatus, req.user!.id);

  res.status(201).json(enrichTask(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(taskId)));
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

  const { title, description, priority, column_id, assignees, due_date } = req.body;

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];
  let newStatus: string | null = null;

  if (due_date !== undefined) {
    const dd = sanitizeDueDate(due_date);
    if (dd && typeof dd === 'object') { res.status(400).json({ error: dd.error }); return; }
    updates.push('due_date = ?'); values.push(dd as string | null);
  }

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

  let newAssigneeIds: number[] | null = null;
  if (assignees !== undefined) {
    const ids = sanitizeAssignees(groupId, assignees);
    if (!Array.isArray(ids)) { res.status(400).json({ error: ids.error }); return; }
    newAssigneeIds = ids;
    updates.push('assigned_to = ?'); values.push(ids[0] ?? null);
  }

  values.push(taskId, groupId);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND group_id = ?`).run(...values);

  if (newAssigneeIds !== null) setTaskAssignees(taskId, newAssigneeIds);
  if (newStatus) recordStatusChange(taskId, task.status, newStatus, req.user!.id);

  res.json(enrichTask(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(taskId)));
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

// PATCH /api/groups/:groupId/tasks/:taskId/column
router.patch('/:taskId/column', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);
  if (!role) { res.status(403).json({ error: 'You are not a member of this group' }); return; }

  const { column_id } = req.body;
  const col = getColumn(column_id, groupId);
  if (!col) { res.status(400).json({ error: 'Invalid column' }); return; }

  const task = db.prepare('SELECT id, status, column_id FROM tasks WHERE id = ? AND group_id = ?')
    .get(taskId, groupId) as { id: number; status: string; column_id: number | null } | undefined;
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  // Executors may move only tasks they're assigned to
  if (role === 'executor' && !isAssignee(taskId, req.user!.id)) {
    res.status(403).json({ error: 'Executors can only move their assigned tasks' }); return;
  }

  const newStatus = statusForColumn(col);
  db.prepare(
    'UPDATE tasks SET column_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(col.id, newStatus, taskId);

  if (newStatus !== task.status) recordStatusChange(taskId, task.status, newStatus, req.user!.id);

  res.json(enrichTask(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(taskId)));
});

export default router;
