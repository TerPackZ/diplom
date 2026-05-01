import { useEffect } from 'react';
import type { Task } from './TaskCard';
import Avatar from './Avatar';

interface TaskDetailModalProps {
  task: Task;
  canEdit: boolean;
  onEdit: (task: Task) => void;
  onClose: () => void;
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

export default function TaskDetailModal({ task, canEdit, onEdit, onClose }: TaskDetailModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal__header">
          <h2 className="modal__title" style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.3 }}>
            {task.title}
          </h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
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

          {/* Assignee */}
          <div className="task-detail__section">
            <div className="task-detail__label">Исполнитель</div>
            {task.assigned_to_name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar src={task.assigned_to_avatar} name={task.assigned_to_name} size={24} />
                <span>{task.assigned_to_name}</span>
                {task.assigned_to_username && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    @{task.assigned_to_username}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>Не назначен</span>
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
