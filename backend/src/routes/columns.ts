import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router({ mergeParams: true });
router.use(authenticate);

function getMemberRole(groupId: number, userId: number): string | null {
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as { role: string } | undefined;
  return m?.role ?? null;
}

// GET /api/groups/:groupId/columns
router.get('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!getMemberRole(groupId, req.user!.id)) {
    res.status(403).json({ error: 'Not a group member' }); return;
  }
  const columns = db.prepare(
    'SELECT id, name, position, color, is_completion FROM board_columns WHERE group_id = ? ORDER BY position ASC'
  ).all(groupId) as any[];
  res.json(columns.map(c => ({ ...c, is_completion: Boolean(c.is_completion) })));
});

// POST /api/groups/:groupId/columns — leader only
router.post('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const role = getMemberRole(groupId, req.user!.id);
  if (role !== 'leader') {
    res.status(403).json({ error: 'Only leader can manage columns' }); return;
  }

  const { name, color } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: 'Name required' }); return; }
  if (name.trim().length > 50) { res.status(400).json({ error: 'Name too long' }); return; }

  const maxPos = (db.prepare(
    'SELECT COALESCE(MAX(position), -1) as max_pos FROM board_columns WHERE group_id = ?'
  ).get(groupId) as { max_pos: number }).max_pos;

  const result = db.prepare(
    'INSERT INTO board_columns (group_id, name, position, color, is_completion) VALUES (?, ?, ?, ?, 0)'
  ).run(groupId, name.trim(), maxPos + 1, color ?? null);

  const col = db.prepare(
    'SELECT id, name, position, color, is_completion FROM board_columns WHERE id = ?'
  ).get(result.lastInsertRowid) as any;
  res.status(201).json({ ...col, is_completion: Boolean(col.is_completion) });
});

// PUT /api/groups/:groupId/columns/:colId — rename / change color / change is_completion
router.put('/:colId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const colId = parseInt(req.params.colId);
  const role = getMemberRole(groupId, req.user!.id);
  if (role !== 'leader') {
    res.status(403).json({ error: 'Only leader can manage columns' }); return;
  }

  const col = db.prepare(
    'SELECT id FROM board_columns WHERE id = ? AND group_id = ?'
  ).get(colId, groupId);
  if (!col) { res.status(404).json({ error: 'Column not found' }); return; }

  const { name, color, is_completion } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    if (!name.trim() || name.trim().length > 50) {
      res.status(400).json({ error: 'Invalid name' }); return;
    }
    updates.push('name = ?'); values.push(name.trim());
  }
  if (color !== undefined) { updates.push('color = ?'); values.push(color || null); }
  if (is_completion !== undefined) {
    if (is_completion) {
      // Only one completion column per group — unset others
      db.prepare('UPDATE board_columns SET is_completion = 0 WHERE group_id = ?').run(groupId);
    }
    updates.push('is_completion = ?'); values.push(is_completion ? 1 : 0);
  }

  if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  values.push(colId);
  db.prepare(`UPDATE board_columns SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  // Resync task statuses for this group (since is_completion may have changed)
  if (is_completion !== undefined) syncGroupTaskStatuses(groupId);

  const updated = db.prepare(
    'SELECT id, name, position, color, is_completion FROM board_columns WHERE id = ?'
  ).get(colId) as any;
  res.json({ ...updated, is_completion: Boolean(updated.is_completion) });
});

// DELETE /api/groups/:groupId/columns/:colId
router.delete('/:colId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const colId = parseInt(req.params.colId);
  const role = getMemberRole(groupId, req.user!.id);
  if (role !== 'leader') {
    res.status(403).json({ error: 'Only leader can manage columns' }); return;
  }

  const col = db.prepare(
    'SELECT id, position, is_completion FROM board_columns WHERE id = ? AND group_id = ?'
  ).get(colId, groupId) as { id: number; position: number; is_completion: number } | undefined;
  if (!col) { res.status(404).json({ error: 'Column not found' }); return; }

  const totalCols = (db.prepare(
    'SELECT COUNT(*) as cnt FROM board_columns WHERE group_id = ?'
  ).get(groupId) as { cnt: number }).cnt;

  if (totalCols <= 1) {
    res.status(400).json({ error: 'Cannot delete the last column' }); return;
  }

  const taskCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM tasks WHERE column_id = ?'
  ).get(colId) as { cnt: number }).cnt;

  if (taskCount > 0) {
    res.status(400).json({ error: 'Move tasks to another column before deleting' }); return;
  }

  db.prepare('DELETE FROM board_columns WHERE id = ?').run(colId);

  // Re-pack positions
  const remaining = db.prepare(
    'SELECT id FROM board_columns WHERE group_id = ? ORDER BY position ASC'
  ).all(groupId) as { id: number }[];
  const stmt = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?');
  remaining.forEach((r, i) => stmt.run(i, r.id));

  // If we removed the only completion column, mark the last one
  if (col.is_completion) {
    const last = db.prepare(
      'SELECT id FROM board_columns WHERE group_id = ? ORDER BY position DESC LIMIT 1'
    ).get(groupId) as { id: number } | undefined;
    if (last) db.prepare('UPDATE board_columns SET is_completion = 1 WHERE id = ?').run(last.id);
    syncGroupTaskStatuses(groupId);
  }

  res.json({ ok: true });
});

// PATCH /api/groups/:groupId/columns/reorder — body: { order: [colId, colId, ...] }
router.patch('/reorder', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const role = getMemberRole(groupId, req.user!.id);
  if (role !== 'leader') {
    res.status(403).json({ error: 'Only leader can manage columns' }); return;
  }

  const { order } = req.body;
  if (!Array.isArray(order)) {
    res.status(400).json({ error: 'order must be an array of column IDs' }); return;
  }

  // Validate all columns belong to this group
  const placeholders = order.map(() => '?').join(',');
  const cols = db.prepare(
    `SELECT id FROM board_columns WHERE group_id = ? AND id IN (${placeholders})`
  ).all(groupId, ...order) as { id: number }[];

  if (cols.length !== order.length) {
    res.status(400).json({ error: 'Invalid column IDs' }); return;
  }

  const stmt = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?');
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, i) => stmt.run(i, id));
  });
  tx(order);

  // Resync statuses since position changed
  syncGroupTaskStatuses(groupId);

  res.json({ ok: true });
});

// Helper: keep tasks.status in sync with column membership (used by analytics & legacy code)
export function syncGroupTaskStatuses(groupId: number): void {
  const cols = db.prepare(
    'SELECT id, position, is_completion FROM board_columns WHERE group_id = ? ORDER BY position ASC'
  ).all(groupId) as { id: number; position: number; is_completion: number }[];

  for (const c of cols) {
    const status = c.is_completion ? 'done' : (c.position === 0 ? 'todo' : 'in_progress');
    db.prepare('UPDATE tasks SET status = ? WHERE column_id = ?').run(status, c.id);
  }
}

export default router;
