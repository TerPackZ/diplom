import { useEffect, useState } from 'react';
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

  useEffect(() => { loadComments(); /* eslint-disable-next-line */ }, [groupId, taskId]);

  async function loadComments() {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/groups/${groupId}/tasks/${taskId}/comments`);
      setComments(res.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/api/groups/${groupId}/tasks/${taskId}/comments`, {
        content: newComment.trim()
      });
      setComments(prev => [...prev, res.data]);
      setNewComment('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось добавить комментарий');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(commentId: number) {
    if (!editContent.trim()) return;
    try {
      const res = await apiClient.put(`/api/groups/${groupId}/tasks/${taskId}/comments/${commentId}`, {
        content: editContent.trim()
      });
      setComments(prev => prev.map(c => c.id === commentId ? res.data : c));
      setEditingId(null);
      setEditContent('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось обновить комментарий');
    }
  }

  async function handleDelete(commentId: number) {
    if (!confirm('Удалить комментарий?')) return;
    try {
      await apiClient.delete(`/api/groups/${groupId}/tasks/${taskId}/comments/${commentId}`);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Не удалось удалить комментарий');
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditContent(comment.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent('');
  }

  return (
    <div className="comments">
      {loading ? (
        <div className="comments__skeleton">
          {[1, 2].map(i => (
            <div key={i} className="comment-skeleton">
              <div className="skeleton skeleton-circle" />
              <div className="comment-skeleton__body">
                <div className="skeleton skeleton-bar" style={{ width: '30%' }} />
                <div className="skeleton skeleton-bar" style={{ width: '90%' }} />
                <div className="skeleton skeleton-bar" style={{ width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="empty-illustration">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-illustration__svg">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <div className="empty-illustration__title">Пока нет комментариев</div>
          <div className="empty-illustration__desc">Будь первым кто оставит комментарий</div>
        </div>
      ) : (
        <div className="comments__list">
          {comments.map(comment => {
            const isOwn = comment.user_id === currentUserId;
            const isEditing = editingId === comment.id;
            const wasEdited = comment.created_at !== comment.updated_at;

            return (
              <div key={comment.id} className={`comment ${isOwn ? 'comment--own' : ''}`}>
                <Avatar
                  src={comment.avatar_url}
                  name={comment.display_name || comment.username}
                  size={32}
                  userId={comment.user_id}
                  showStatus
                />
                <div className="comment__body">
                  <div className="comment__header">
                    <span className="comment__author">
                      {comment.display_name || comment.username}
                    </span>
                    <span className="comment__time">{formatDate(comment.created_at)}</span>
                    {wasEdited && <span className="comment__edited">изменено</span>}
                  </div>

                  {isEditing ? (
                    <div className="comment__edit">
                      <textarea
                        className="form-textarea"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="comment__edit-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleEdit(comment.id)}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={cancelEdit}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="comment__bubble">
                        {comment.content}
                      </div>
                      {isOwn && (
                        <div className="comment__actions">
                          <button
                            type="button"
                            className="comment__action"
                            onClick={() => startEdit(comment)}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="comment__action comment__action--danger"
                            onClick={() => handleDelete(comment.id)}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            </svg>
                            Удалить
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form className="comments__form" onSubmit={handleSubmit}>
        <textarea
          className="form-textarea comments__input"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Написать комментарий..."
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSubmit(e as any);
            }
          }}
        />
        <button
          type="submit"
          className="btn btn-primary comments__submit"
          disabled={!newComment.trim() || submitting}
        >
          {submitting ? '...' : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
