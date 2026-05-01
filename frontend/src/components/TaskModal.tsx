import { useState, useEffect } from 'react';
import type { Task } from './TaskCard';
import type { Member } from './MemberList';

interface TaskModalProps {
  task?: Task | null;
  members: Member[];
  groupId: number;
  onSave: (data: Partial<Task>) => Promise<void>;
  onClose: () => void;
}

const PRIORITIES = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'critical', label: 'Критичный' }
];

const STATUSES = [
  { value: 'todo', label: 'К выполнению' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'done', label: 'Готово' }
];

export default function TaskModal({ task, members, onSave, onClose }: TaskModalProps) {
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'medium');
  const [status, setStatus] = useState<Task['status']>(task?.status || 'todo');
  const [assignedTo, setAssignedTo] = useState<string>(task?.assigned_to?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
        status,
        assigned_to: assignedTo ? Number(assignedTo) : null
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
          <button className="modal__close" onClick={onClose}>×</button>
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
                <label className="form-label">Статус</label>
                <select
                  className="form-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Task['status'])}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Исполнитель</label>
              <select
                className="form-select"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">— Не назначен —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name || m.username} ({m.role === 'leader' ? 'Лидер' : m.role === 'moderator' ? 'Модератор' : 'Исполнитель'})
                  </option>
                ))}
              </select>
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
