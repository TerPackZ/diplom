import { useEffect, useState } from 'react';
import type { Task } from './TaskCard';
import { getDeadlineInfo } from './TaskCard';
import Avatar from './Avatar';
import TaskComments from './TaskComments';
import TaskAttachments from './TaskAttachments';

interface TaskDetailModalProps {
  task: Task;
  canEdit: boolean;
  onEdit: (task: Task) => void;
  onClose: () => void;
  groupId: number;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критичный'
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Готово'
};

function formatDate(dateStr: string) {
  const utc = dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Date(utc).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function TaskDetailModal({ task, canEdit, onEdit, onClose, groupId }: TaskDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'files'>('details');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal__header">
          <h2 className="modal__title" style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.3 }}>
            {task.title}
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-xs)',
          borderBottom: '1px solid var(--border)',
          padding: '0 var(--space-lg)'
        }}>
          <button
            onClick={() => setActiveTab('details')}
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'details' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'details' ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'details' ? 600 : 400,
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm)'
            }}
          >
            Детали
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'comments' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'comments' ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'comments' ? 600 : 400,
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm)'
            }}
          >
            Комментарии
          </button>
          <button
            onClick={() => setActiveTab('files')}
            style={{
              padding: 'var(--space-sm) var(--space-md)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'files' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'files' ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: activeTab === 'files' ? 600 : 400,
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm)'
            }}
          >
            Файлы
          </button>
        </div>

        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {activeTab === 'details' && (
            <>
          {/* Priority + Status badges */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <span className={`badge badge-priority-${task.priority}`}>
              <span className={`priority-dot priority-dot-${task.priority}`} />
              {PRIORITY_LABELS[task.priority]}
            </span>
            <span className="badge" style={{ background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>
              {STATUS_LABELS[task.status]}
            </span>
          </div>

          {/* Description */}
          {task.description ? (
            <div className="task-detail__section">
              <div className="task-detail__label">Описание</div>
              <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                {task.description}
              </p>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, fontSize: 'var(--font-size-sm)' }}>
              Описание не указано
            </p>
          )}

          {/* Deadline */}
          {task.due_date && (() => {
            const dl = getDeadlineInfo(task.due_date, task.status === 'done');
            return (
              <div className="task-detail__section">
                <div className="task-detail__label">Срок выполнения</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge badge-deadline badge-deadline--${dl?.severity ?? 'later'}`}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {dl?.label ?? task.due_date}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    {new Date(task.due_date.length <= 10 ? task.due_date + 'T00:00:00' : task.due_date)
                      .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Assignees */}
          <div className="task-detail__section">
            <div className="task-detail__label">
              Исполнители {task.assignees.length > 0 && <span style={{ color: 'var(--text-muted)' }}>· {task.assignees.length}</span>}
            </div>
            {task.assignees.length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>Никто не назначен</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {task.assignees.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar
                      src={a.avatar_url}
                      name={a.display_name || a.username}
                      size={24}
                      userId={a.id}
                      showStatus
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      {a.display_name || a.username}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                      @{a.username}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Creator */}
          <div className="task-detail__section">
            <div className="task-detail__label">Создал</div>
            <span style={{ fontSize: 'var(--font-size-sm)' }}>
              {task.created_by_name || task.created_by_username}
              {task.created_by_name && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@{task.created_by_username}</span>
              )}
            </span>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
            <div className="task-detail__section">
              <div className="task-detail__label">Создано</div>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {formatDate(task.created_at)}
              </span>
            </div>
            <div className="task-detail__section">
              <div className="task-detail__label">Обновлено</div>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {formatDate(task.updated_at)}
              </span>
            </div>
          </div>
            </>
          )}

          {activeTab === 'comments' && (
            <TaskComments groupId={groupId} taskId={task.id} />
          )}

          {activeTab === 'files' && (
            <TaskAttachments groupId={groupId} taskId={task.id} />
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => { onClose(); onEdit(task); }}>
              Редактировать
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
