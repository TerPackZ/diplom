import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import groupsRoutes from './routes/groups';
import tasksRoutes from './routes/tasks';
import taskCommentsRoutes from './routes/task-comments';
import taskAttachmentsRoutes from './routes/task-attachments';
import friendsRoutes from './routes/friends';
import notificationsRoutes from './routes/notifications';
import messagesRoutes from './routes/messages';
import analyticsRoutes from './routes/analytics';
import columnsRoutes from './routes/columns';
import { initSocket } from './lib/socket';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/groups/:groupId/tasks', tasksRoutes);
app.use('/api/groups/:groupId/tasks/:taskId/comments', taskCommentsRoutes);
app.use('/api/groups/:groupId/tasks/:taskId/attachments', taskAttachmentsRoutes);
app.use('/api/groups/:groupId/analytics', analyticsRoutes);
app.use('/api/groups/:groupId/columns', columnsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

const server = http.createServer(app);
initSocket(server);

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Open in browser: http://YOUR_VM_IP:${PORT}`);
});

export default app;
