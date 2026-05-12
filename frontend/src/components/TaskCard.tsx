import { useState } from 'react';
import Avatar from './Avatar';

export interface BoardColumn {
  id: number;
  name: string;
  position: number;
  color: string | null;
  is_completion: boolean;
}

export interface Assignee {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in_progress' | 'done';
  column_id: number | null;
  due_date: string | null;
  created_by: number;
  assignees: Assignee[];
  created_by_username: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type DeadlineSeverity = 'overdue' | 'today' | 'soon' | 'later' | 'done';

export interface DeadlineInfo {
  severity: DeadlineSeverity;
  label: string;
  short: string;
}

export function getDeadlineInfo(dueDate: string | null, isDone: boolean): DeadlineInfo | null {
  if (!dueDate) return null;
  const due = new Date(dueDate.length <= 10 ? `${dueDate}T23:59:59` : dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  const short = due.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  if (isDone) {
    return { severity: 'done', label: short, short };
  }
  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return { severity: 'overdue', label: days === 1 ? 'Просрочено на день' : `Просрочено на ${days} дн.`, short };
  }
  if (diffDays === 0) return { severity: 'today', label: 'Сегодня', short };
  if (diffDays === 1) return { severity: 'soon', label: 'Завтра', short };
  if (diffDays <= 3) return { severity: 'soon', label: `Через ${diffDays} дн.`, short };
  return { severity: 'later', label: short, short };
}

interface TaskCardProps {
  task: Task;
  columns: BoardColumn[];
  canEdit: boolean;
  onEdit: (task: Task) => void;
  onDelete: (taskId: number) => void;
  onColumnChange?: (taskId: number, columnId: number) => void;
  onClick?: (task: Task) => void;
  draggable?: boolean;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критичный'
};

export default function TaskCard({
  task, columns, canEdit, onEdit, onDelete, onColumnChange, onClick, draggable: isDraggable
}: TaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleColumnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    onColumnChange?.(task.id, parseInt(e.target.value));
  };

  const assignees = task.assignees || [];

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
        {(() => {
          const dl = getDeadlineInfo(task.due_date, task.status === 'done');
          if (!dl) return null;
          return (
            <span className={`badge badge-deadline badge-deadline--${dl.severity}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {dl.label}
            </span>
          );
        })()}
      </div>

      {onColumnChange && (
        <div style={{ marginTop: 8 }}>
          <select
            className="form-select"
            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 28px 4px 8px' }}
            value={task.column_id ?? ''}
            onChange={handleColumnChange}
            onClick={(e) => e.stopPropagation()}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {assignees.length > 0 && (
        <div className="task-card__assignees">
          <AssigneeStack assignees={assignees} />
          {assignees.length === 1 && (
            <span className="task-card__assignee-name">
              {assignees[0].display_name || assignees[0].username}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AssigneeStack({ assignees, size = 22, max = 3 }: { assignees: Assignee[]; size?: number; max?: number }) {
  const visible = assignees.slice(0, max);
  const extra = assignees.length - visible.length;

  return (
    <div className="avatar-stack" style={{ ['--stack-size' as any]: `${size}px` }}>
      {visible.map(a => (
        <span key={a.id} className="avatar-stack__item" title={a.display_name || a.username}>
          <Avatar src={a.avatar_url} name={a.display_name || a.username} size={size} userId={a.id} showStatus />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="avatar-stack__more"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
          title={`Ещё ${extra}`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
