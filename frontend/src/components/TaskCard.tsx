import { useState } from 'react';
import Avatar from './Avatar';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in_progress' | 'done';
  created_by: number;
  assigned_to: number | null;
  created_by_username: string;
  created_by_name: string | null;
  assigned_to_username: string | null;
  assigned_to_name: string | null;
  assigned_to_avatar: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskCardProps {
  task: Task;
  canEdit: boolean;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onStatusChange?: (taskId: number, status: Task['status']) => void;
  onClick?: (task: Task) => void;
  draggable?: boolean;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критичный'
};

const STATUS_OPTIONS: { value: Task['status']; label: string }[] = [
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Готово' }
];

export default function TaskCard({ task, canEdit, onEdit, onDelete, onStatusChange, onClick, draggable: isDraggable }: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    onStatusChange?.(task.id, e.target.value as Task['status']);
  };

  return (
    <div
      className={`task-card ${isDragging ? 'task-card--dragging' : ''}`}
      draggable={isDraggable}
      onClick={() => onClick?.(task)}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onDragStart={(e) => {
        e.dataTransfer.setData('taskId', String(task.id));
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p className="task-card__title">{task.title}</p>
        {canEdit && (
          <div className="task-card__actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-ghost btn-icon"
              style={{ padding: '4px', borderRadius: 'var(--radius-sm)' }}
              onClick={(e) => { e.stopPropagation(); onEdit(task); }}
              title="Редактировать"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              className="btn btn-danger btn-icon"
              style={{ padding: '4px', borderRadius: 'var(--radius-sm)' }}
              onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
              title="Удалить"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="task-card__meta">
        <span className={`badge badge-priority-${task.priority}`}>
          <span className={`priority-dot priority-dot-${task.priority}`} />
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      {onStatusChange && (
        <div style={{ marginTop: 8 }}>
          <select
            className="form-select"
            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 28px 4px 8px' }}
            value={task.status}
            onChange={handleStatusChange}
            onClick={(e) => e.stopPropagation()}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {task.assigned_to_name && (
        <div className="task-card__assignee">
          <Avatar
            src={task.assigned_to_avatar}
            name={task.assigned_to_name}
            size={16}
          />
          <span>{task.assigned_to_name}</span>
        </div>
      )}
    </div>
  );
}
