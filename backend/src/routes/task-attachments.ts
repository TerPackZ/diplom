import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import db from '../db/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router({ mergeParams: true });
router.use(authenticate);

function getMemberRole(groupId: number, userId: number): string | null {
  const m = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  return m?.role || null;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'attachments');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Allow common file types
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain',
      'text/csv'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// GET /api/groups/:groupId/tasks/:taskId/attachments
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

  const attachments = db.prepare(`
    SELECT a.id, a.task_id, a.user_id, a.filename, a.original_filename,
           a.file_size, a.mime_type, a.created_at,
           u.username, u.display_name, u.avatar_url
    FROM task_attachments a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.task_id = ?
    ORDER BY a.created_at DESC
  `).all(taskId);

  res.json(attachments);
});

// POST /api/groups/:groupId/tasks/:taskId/attachments
router.post('/', upload.single('file'), (req: AuthRequest, res: Response): void => {
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

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO task_attachments (task_id, user_id, filename, original_filename, file_size, mime_type, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    req.user!.id,
    req.file.filename,
    req.file.originalname,
    req.file.size,
    req.file.mimetype,
    req.file.path
  );

  const attachment = db.prepare(`
    SELECT a.id, a.task_id, a.user_id, a.filename, a.original_filename,
           a.file_size, a.mime_type, a.created_at,
           u.username, u.display_name, u.avatar_url
    FROM task_attachments a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(attachment);
});

// GET /api/groups/:groupId/tasks/:taskId/attachments/:attachmentId/download
router.get('/:attachmentId/download', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const attachmentId = parseInt(req.params.attachmentId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const attachment = db.prepare(`
    SELECT a.*, t.group_id
    FROM task_attachments a
    JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ? AND a.task_id = ? AND t.group_id = ?
  `).get(attachmentId, taskId, groupId) as any;

  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  if (!fs.existsSync(attachment.file_path)) {
    res.status(404).json({ error: 'File not found on server' });
    return;
  }

  res.download(attachment.file_path, attachment.original_filename);
});

// DELETE /api/groups/:groupId/tasks/:taskId/attachments/:attachmentId
router.delete('/:attachmentId', (req: AuthRequest, res: Response): void => {
  const groupId = parseInt(req.params.groupId);
  const taskId = parseInt(req.params.taskId);
  const attachmentId = parseInt(req.params.attachmentId);
  const role = getMemberRole(groupId, req.user!.id);

  if (!role) {
    res.status(403).json({ error: 'You are not a member of this group' });
    return;
  }

  const attachment = db.prepare(`
    SELECT a.*, t.group_id
    FROM task_attachments a
    JOIN tasks t ON a.task_id = t.id
    WHERE a.id = ? AND a.task_id = ? AND t.group_id = ?
  `).get(attachmentId, taskId, groupId) as any;

  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  // Only attachment uploader or leader/moderator can delete
  if (attachment.user_id !== req.user!.id && role !== 'leader' && role !== 'moderator') {
    res.status(403).json({ error: 'You can only delete your own attachments' });
    return;
  }

  // Delete file from filesystem
  if (fs.existsSync(attachment.file_path)) {
    fs.unlinkSync(attachment.file_path);
  }

  db.prepare('DELETE FROM task_attachments WHERE id = ?').run(attachmentId);
  res.json({ message: 'Attachment deleted' });
});

export default router;
