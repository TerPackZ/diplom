import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';

const router = Router({ mergeParams: true });
router.use(authenticate);

function getMemberRole(groupId: number, userId: number): string | null {
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  return m?.role || null;
}

// GET /api/groups/:groupId/tasks/:taskId/comments
router.get('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId) as any;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const comments = db.prepare(`
    SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, c.updated_at,
           u.username, u.display_name, u.avatar_url
    FROM task_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).all(taskId);

  res.json(comments);
});

// POST /api/groups/:groupId/tasks/:taskId/comments
router.post('/', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND group_id = ?').get(taskId, groupId) as any;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const { content } = req.body;

  if (!content?.trim()) {
    res.status(400).json({ error: 'Comment content is required' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO task_comments (task_id, user_id, content)
    VALUES (?, ?, ?)
  `).run(taskId, req.user!.id, content.trim());

  const comment = db.prepare(`
    SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, c.updated_at,
           u.username, u.display_name, u.avatar_url
    FROM task_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(comment);
});

// PUT /api/groups/:groupId/tasks/:taskId/comments/:commentId
router.put('/:commentId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const commentId = parseInt(req.params.commentId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const comment = db.prepare(`
    SELECT c.id, c.user_id, t.group_id
    FROM task_comments c
    JOIN tasks t ON c.task_id = t.id
    WHERE c.id = ? AND c.task_id = ? AND t.group_id = ?
  `).get(commentId, taskId, groupId) as any;

  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  if (comment.user_id !== req.user!.id) {
    res.status(403).json({ error: 'You can only edit your own comments' });
    return;
  }

  const { content } = req.body;

  if (!content?.trim()) {
    res.status(400).json({ error: 'Comment content is required' });
    return;
  }

  db.prepare(`
    UPDATE task_comments
    SET content = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(content.trim(), commentId);

  const updated = db.prepare(`
    SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, c.updated_at,
           u.username, u.display_name, u.avatar_url
    FROM task_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(commentId);

  res.json(updated);
});

// DELETE /api/groups/:groupId/tasks/:taskId/comments/:commentId
router.delete('/:commentId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const commentId = parseInt(req.params.commentId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const comment = db.prepare(`
    SELECT c.id, c.user_id, t.group_id
    FROM task_comments c
    JOIN tasks t ON c.task_id = t.id
    WHERE c.id = ? AND c.task_id = ? AND t.group_id = ?
  `).get(commentId, taskId, groupId) as any;

  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  // Only comment author or leader/moderator can delete
  if (comment.user_id !== req.user!.id && role !== 'leader' && role !== 'moderator') {
    res.status(403).json({ error: 'You can only delete your own comments' });
    return;
  }

  db.prepare('DELETE FROM task_comments WHERE id = ?').run(commentId);
  res.json({ message: 'Comment deleted' });
});

export default router;
