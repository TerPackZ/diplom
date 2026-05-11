import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router({ mergeParams: true });
router.use(authenticate);

function checkAccess(groupId: number, userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
}

function dateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

function parseUtc(s: string): Date {
  if (s.includes('Z') || s.includes('+')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

// ── GET /api/groups/:groupId/analytics/overview ─────────────────────────────

router.get('/overview', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!checkAccess(groupId, req.user!.id)) { res.status(403).json({ error: 'Access denied' }); return; }

  const counts = db.prepare(`
    SELECT status, COUNT(*) as cnt FROM tasks WHERE group_id = ? GROUP BY status
  `).all(groupId) as { status: string; cnt: number }[];

  const priorityCounts = db.prepare(`
    SELECT priority, COUNT(*) as cnt FROM tasks WHERE group_id = ? GROUP BY priority
  `).all(groupId) as { priority: string; cnt: number }[];

  const byStatus = { todo: 0, in_progress: 0, done: 0 };
  counts.forEach(r => { (byStatus as any)[r.status] = r.cnt; });

  const byPriority = { low: 0, medium: 0, high: 0, critical: 0 };
  priorityCounts.forEach(r => { (byPriority as any)[r.priority] = r.cnt; });

  const total = byStatus.todo + byStatus.in_progress + byStatus.done;

  // Completed last 7 days
  const completedWeek = (db.prepare(`
    SELECT COUNT(*) as cnt FROM task_status_history
    WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)
      AND to_status = 'done'
      AND changed_at >= datetime('now', '-7 days')
  `).get(groupId) as { cnt: number }).cnt;

  // Created last 7 days
  const createdWeek = (db.prepare(
    `SELECT COUNT(*) as cnt FROM tasks WHERE group_id = ? AND created_at >= datetime('now', '-7 days')`
  ).get(groupId) as { cnt: number }).cnt;

  // Members count
  const memberCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?'
  ).get(groupId) as { cnt: number }).cnt;

  const completionRate = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;

  res.json({
    total,
    by_status: byStatus,
    by_priority: byPriority,
    completed_week: completedWeek,
    created_week: createdWeek,
    member_count: memberCount,
    completion_rate: completionRate
  });
});

// ── GET /api/groups/:groupId/analytics/cumulative-flow ──────────────────────
// Stacked area: for each day in range, count tasks in each status

router.get('/cumulative-flow', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!checkAccess(groupId, req.user!.id)) { res.status(403).json({ error: 'Access denied' }); return; }

  const days = Math.min(parseInt((req.query.days as string) || '30'), 90);

  const tasks = db.prepare(
    'SELECT id, created_at FROM tasks WHERE group_id = ?'
  ).all(groupId) as { id: number; created_at: string }[];

  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) { res.json([]); return; }

  const placeholders = taskIds.map(() => '?').join(',');
  const history = db.prepare(
    `SELECT task_id, to_status, changed_at FROM task_status_history
     WHERE task_id IN (${placeholders}) ORDER BY changed_at ASC`
  ).all(...taskIds) as { task_id: number; to_status: string; changed_at: string }[];

  // Group history by task
  const taskHistory = new Map<number, { to_status: string; changed_at: Date }[]>();
  history.forEach(h => {
    const arr = taskHistory.get(h.task_id) || [];
    arr.push({ to_status: h.to_status, changed_at: parseUtc(h.changed_at) });
    taskHistory.set(h.task_id, arr);
  });

  const result: { date: string; todo: number; in_progress: number; done: number }[] = [];
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(23, 59, 59, 999);

    let todo = 0, in_progress = 0, done = 0;
    for (const task of tasks) {
      const created = parseUtc(task.created_at);
      if (created > day) continue; // task didn't exist yet

      const hist = taskHistory.get(task.id) || [];
      // Find latest status change at or before this day
      let status = 'todo';
      for (const h of hist) {
        if (h.changed_at <= day) status = h.to_status;
        else break;
      }
      if (status === 'todo') todo++;
      else if (status === 'in_progress') in_progress++;
      else if (status === 'done') done++;
    }

    result.push({ date: dateOnly(day), todo, in_progress, done });
  }

  res.json(result);
});

// ── GET /api/groups/:groupId/analytics/velocity ─────────────────────────────
// Tasks moved to 'done' per week, last 8 weeks

router.get('/velocity', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!checkAccess(groupId, req.user!.id)) { res.status(403).json({ error: 'Access denied' }); return; }

  const weeks = Math.min(parseInt((req.query.weeks as string) || '8'), 26);

  const rows = db.prepare(`
    SELECT changed_at FROM task_status_history
    WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)
      AND to_status = 'done'
      AND changed_at >= datetime('now', ?)
  `).all(groupId, `-${weeks * 7} days`) as { changed_at: string }[];

  // Bucket by week (Monday start)
  const result: { week: string; completed: number }[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - i * 7);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const completed = rows.filter(r => {
      const d = parseUtc(r.changed_at);
      return d >= weekStart && d <= weekEnd;
    }).length;

    const label = `${weekStart.getDate()}.${(weekStart.getMonth() + 1).toString().padStart(2, '0')}`;
    result.push({ week: label, completed });
  }

  res.json(result);
});

// ── GET /api/groups/:groupId/analytics/activity ─────────────────────────────
// GitHub-style heatmap: activity count per day for last N weeks

router.get('/activity', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!checkAccess(groupId, req.user!.id)) { res.status(403).json({ error: 'Access denied' }); return; }

  const weeks = Math.min(parseInt((req.query.weeks as string) || '12'), 52);
  const days = weeks * 7;

  // Collect activity from: task creations, status changes, comments
  const taskCreates = db.prepare(
    `SELECT date(created_at) as day, COUNT(*) as cnt FROM tasks
     WHERE group_id = ? AND created_at >= date('now', ?)
     GROUP BY date(created_at)`
  ).all(groupId, `-${days} days`) as { day: string; cnt: number }[];

  const statusChanges = db.prepare(
    `SELECT date(changed_at) as day, COUNT(*) as cnt FROM task_status_history
     WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)
       AND changed_at >= date('now', ?)
     GROUP BY date(changed_at)`
  ).all(groupId, `-${days} days`) as { day: string; cnt: number }[];

  const comments = db.prepare(
    `SELECT date(created_at) as day, COUNT(*) as cnt FROM task_comments
     WHERE task_id IN (SELECT id FROM tasks WHERE group_id = ?)
       AND created_at >= date('now', ?)
     GROUP BY date(created_at)`
  ).all(groupId, `-${days} days`) as { day: string; cnt: number }[];

  const map = new Map<string, number>();
  for (const r of [...taskCreates, ...statusChanges, ...comments]) {
    map.set(r.day, (map.get(r.day) || 0) + r.cnt);
  }

  const result: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dayStr = dateOnly(d);
    result.push({ date: dayStr, count: map.get(dayStr) || 0 });
  }

  res.json(result);
});

// ── GET /api/groups/:groupId/analytics/contributors ─────────────────────────
// Top contributors by closed tasks

router.get('/contributors', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!checkAccess(groupId, req.user!.id)) { res.status(403).json({ error: 'Access denied' }); return; }

  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*) FROM tasks WHERE group_id = ? AND assigned_to = u.id) as total_assigned,
      (SELECT COUNT(*) FROM tasks WHERE group_id = ? AND assigned_to = u.id AND status = 'done') as completed,
      (SELECT COUNT(*) FROM tasks WHERE group_id = ? AND assigned_to = u.id AND status != 'done') as open,
      (SELECT COUNT(*) FROM tasks WHERE group_id = ? AND created_by = u.id) as created
    FROM users u
    JOIN group_members gm ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY completed DESC, total_assigned DESC
  `).all(groupId, groupId, groupId, groupId, groupId) as any[];

  res.json(rows);
});

// ── GET /api/groups/:groupId/analytics/cycle-time ───────────────────────────
// Average time tasks spend in each status (in hours)

router.get('/cycle-time', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  if (!checkAccess(groupId, req.user!.id)) { res.status(403).json({ error: 'Access denied' }); return; }

  const taskIds = (db.prepare('SELECT id FROM tasks WHERE group_id = ?')
    .all(groupId) as { id: number }[]).map(r => r.id);
  if (taskIds.length === 0) { res.json({ todo: 0, in_progress: 0, total_to_done: 0 }); return; }

  const placeholders = taskIds.map(() => '?').join(',');
  const history = db.prepare(
    `SELECT task_id, from_status, to_status, changed_at FROM task_status_history
     WHERE task_id IN (${placeholders}) ORDER BY task_id, changed_at ASC`
  ).all(...taskIds) as { task_id: number; from_status: string | null; to_status: string; changed_at: string }[];

  const taskHist = new Map<number, typeof history>();
  history.forEach(h => {
    const arr = taskHist.get(h.task_id) || [];
    arr.push(h);
    taskHist.set(h.task_id, arr);
  });

  let todoMs = 0, todoCount = 0;
  let progMs = 0, progCount = 0;
  let totalMs = 0, totalCount = 0;
  const now = new Date();

  for (const [, hist] of taskHist) {
    for (let i = 0; i < hist.length; i++) {
      const curr = hist[i];
      const next = hist[i + 1];
      const startTime = parseUtc(curr.changed_at);
      const endTime = next ? parseUtc(next.changed_at) : now;
      const durationMs = endTime.getTime() - startTime.getTime();
      if (curr.to_status === 'todo') { todoMs += durationMs; todoCount++; }
      else if (curr.to_status === 'in_progress') { progMs += durationMs; progCount++; }
    }
    // Total time from creation to first 'done'
    const created = parseUtc(hist[0].changed_at);
    const firstDone = hist.find(h => h.to_status === 'done');
    if (firstDone) {
      totalMs += parseUtc(firstDone.changed_at).getTime() - created.getTime();
      totalCount++;
    }
  }

  const toHours = (ms: number, count: number) => count > 0 ? Math.round((ms / count) / 36000) / 100 : 0;

  res.json({
    todo: toHours(todoMs, todoCount),
    in_progress: toHours(progMs, progCount),
    total_to_done: toHours(totalMs, totalCount)
  });
});

export default router;
