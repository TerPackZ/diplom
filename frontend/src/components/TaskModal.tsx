import { useEffect, useMemo, useState } from 'react';
import type { Task, BoardColumn } from './TaskCard';
import type { Member } from './MemberList';
import Avatar from './Avatar';

interface TaskModalProps {
  task?: Task | null;
  members: Member[];
  columns: BoardColumn[];
  groupId: number;
  onSave: (data: Partial<Task> & { assignees?: number[] }) => Promise<void>;
  onClose: () => void;
}

const PRIORITIES = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'critical', label: 'Критичный' }
];

const ROLE_LABELS: Record<string, string> = {
  leader: 'Лидер',
  moderator: 'Модератор',
  executor: 'Исполнитель'
};

export default function TaskModal({ task, members, columns, onSave, onClose }: TaskModalProps) {
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'medium');
  const [columnId, setColumnId] = useState<number>(task?.column_id ?? (columns[0]?.id ?? 0));
  const [dueDate, setDueDate] = useState<string>(
    task?.due_date ? task.due_date.slice(0, 10) : ''
  );
  const [assigneeIds, setAssigneeIds] = useState<Set<number>>(
    new Set((task?.assignees ?? []).map(a => a.id))
  );
  const [memberFilter, setMemberFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.display_name || '').toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q)
    );
  }, [members, memberFilter]);

  function toggleAssignee(userId: number) {
    setAssigneeIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Введите название задачи'); return; }

    setSaving(true);
    setError('');

    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        column_id: columnId,
        due_date: dueDate || null,
        assignees: Array.from(assigneeIds)
      } as any);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Произошла ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal__header">
          <h2 className="modal__title">{isEdit ? 'Редактировать задачу' : 'Создать задачу'}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal__body">
            <div className="form-group">
              <label className="form-label">Название *</label>
              <input
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Что нужно сделать?"
                autoFocus
                maxLength={200}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Описание</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Подробности задачи..."
                rows={3}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label">Приоритет</label>
                <select
                  className="form-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task['priority'])}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Колонка</label>
                <select
                  className="form-select"
                  value={columnId}
                  onChange={(e) => setColumnId(parseInt(e.target.value))}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Срок выполнения
                {dueDate && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDueDate('')}
                    style={{ padding: '2px 8px', fontSize: 'var(--font-size-xs)', marginLeft: 8 }}
                  >
                    очистить
                  </button>
                )}
              </label>
              <input
                type="date"
                className="form-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>
                  Исполнители {assigneeIds.size > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({assigneeIds.size})</span>}
                </label>
                {assigneeIds.size > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setAssigneeIds(new Set())}
                    style={{ padding: '2px 8px', fontSize: 'var(--font-size-xs)' }}
                  >
                    Очистить
                  </button>
                )}
              </div>

              <input
                className="form-input"
                placeholder="Поиск..."
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                style={{ marginBottom: 6 }}
              />

              <div className="assignee-picker">
                {filteredMembers.length === 0 ? (
                  <div style={{ padding: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                    Никого не найдено
                  </div>
                ) : (
                  filteredMembers.map(m => {
                    const checked = assigneeIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`assignee-row ${checked ? 'assignee-row--checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(m.id)}
                        />
                        <Avatar src={m.avatar_url} name={m.display_name || m.username} size={28} userId={m.id} showStatus />
                        <div className="assignee-row__info">
                          <div className="assignee-row__name">{m.display_name || m.username}</div>
                          <div className="assignee-row__role">@{m.username} · {ROLE_LABELS[m.role] || m.role}</div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {error && <p className="form-error">{error}</p>}
          </div>

          <div className="modal__footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
