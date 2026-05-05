import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import Avatar from './Avatar';

interface Comment {
  id: number;
  task_id: number;
  user_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface TaskCommentsProps {
  groupId: number;
  taskId: number;
}

function formatDate(dateStr: string) {
  const utc = dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const date = new Date(utc);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} ч назад`;

  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function TaskComments({ groupId, taskId }: TaskCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  const currentUserId = JSON.parse(localStorage.getItem('user') || '{}').id;

  useEffect(() => {
    loadComments();
  }, [groupId, taskId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/groups/${groupId}/tasks/${taskId}/comments`);
      setComments(res.data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await apiClient.post(`/api/groups/${groupId}/tasks/${taskId}/comments`, {
        content: newComment.trim()
      });
      setComments([...comments, res.data]);
      setNewComment('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось добавить комментарий');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (commentId: number) => {
    if (!editContent.trim()) return;

    try {
      const res = await apiClient.put(`/api/groups/${groupId}/tasks/${taskId}/comments/${commentId}`, {
        content: editContent.trim()
      });
      setComments(comments.map(c => c.id === commentId ? res.data : c));
      setEditingId(null);
      setEditContent('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось обновить комментарий');
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Удалить комментарий?')) return;

    try {
      await apiClient.delete(`/api/groups/${groupId}/tasks/${taskId}/comments/${commentId}`);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось удалить комментарий');
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-md)', color: 'var(--text-muted)' }}>Загрузка комментариев...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {comments.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', margin: 0 }}>
            Комментариев пока нет
          </p>
        ) : (
          comments.map(comment => (
            <div
              key={comment.id}
              style={{
                padding: 'var(--space-sm)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                gap: 'var(--space-sm)'
              }}
            >
              <Avatar src={comment.avatar_url} name={comment.display_name || comment.username} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>
                    {comment.display_name || comment.username}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {formatDate(comment.created_at)}
                  </span>
                  {comment.created_at !== comment.updated_at && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                      (изменено)
                    </span>
                  )}
                </div>
                {editingId === comment.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      style={{
                        width: '100%',
                        minHeight: 60,
                        padding: 'var(--space-xs)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-1)',
                        color: 'var(--text-primary)',
                        fontSize: 'var(--font-size-sm)',
                        resize: 'vertical'
                      }}
                    />
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                        onClick={() => handleEdit(comment.id)}
                      >
                        Сохранить
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 'var(--font-size-xs)', padding: '4px 8px' }}
                        onClick={cancelEdit}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {comment.content}
                    </p>
                    {comment.user_id === currentUserId && (
                      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 4 }}>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 'var(--font-size-xs)',
                            cursor: 'pointer',
                            padding: 0
                          }}
                          onClick={() => startEdit(comment)}
                        >
                          Изменить
                        </button>
                        <button
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 'var(--font-size-xs)',
                            cursor: 'pointer',
                            padding: 0
                          }}
                          onClick={() => handleDelete(comment.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Добавить комментарий..."
          style={{
            width: '100%',
            minHeight: 60,
            padding: 'var(--space-sm)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-2)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-sm)',
            resize: 'vertical'
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!newComment.trim() || submitting}
          style={{ alignSelf: 'flex-end', fontSize: 'var(--font-size-sm)' }}
        >
          {submitting ? 'Отправка...' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}
