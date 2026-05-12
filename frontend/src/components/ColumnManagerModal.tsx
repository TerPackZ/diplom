import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import type { BoardColumn } from './TaskCard';

interface Props {
  groupId: number;
  onClose: () => void;
  onSaved: () => void;
}

const PRESET_COLORS = [
  '#6B7280', '#2563EB', '#10B981', '#F59E0B',
  '#EF4444', '#7C3AED', '#EC4899', '#14B8A6'
];

export default function ColumnManagerModal({ groupId, onClose, onSaved }: Props) {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await apiClient.get(`/api/groups/${groupId}/columns`);
      setColumns(r.data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Не удалось загрузить колонки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [groupId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    setError('');
    try {
      await apiClient.post(`/api/groups/${groupId}/columns`, { name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      await load();
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(col: BoardColumn) {
    setEditingId(col.id);
    setEditName(col.name);
    setEditColor(col.color);
  }

  async function saveEdit() {
    if (!editName.trim() || editingId === null) return;
    setError('');
    try {
      await apiClient.put(`/api/groups/${groupId}/columns/${editingId}`, {
        name: editName.trim(),
        color: editColor
      });
      setEditingId(null);
      await load();
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка');
    }
  }

  async function handleDelete(colId: number) {
    if (!confirm('Удалить колонку? Если в ней есть задачи — сначала переместите их.')) return;
    setError('');
    try {
      await apiClient.delete(`/api/groups/${groupId}/columns/${colId}`);
      await load();
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка');
    }
  }

  async function setCompletion(colId: number) {
    setError('');
    try {
      await apiClient.put(`/api/groups/${groupId}/columns/${colId}`, { is_completion: true });
      await load();
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка');
    }
  }

  async function move(colId: number, direction: -1 | 1) {
    const idx = columns.findIndex(c => c.id === colId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= columns.length) return;
    const reordered = [...columns];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setColumns(reordered);
    setError('');
    try {
      await apiClient.patch(`/api/groups/${groupId}/columns/reorder`, {
        order: reordered.map(c => c.id)
      });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Ошибка');
      await load();
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal__header">
          <h2 className="modal__title">Колонки доски</h2>
          <button className="modal__close" onClick={onClose} aria-label="Закрыть">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal__body">
          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-lg)' }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2 }} />
            </div>
          ) : (
            <>
              <div className="col-manager-list">
                {columns.map((c, i) => (
                  <div key={c.id} className="col-manager-row">
                    <div className="col-manager-row__order">
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => move(c.id, -1)}
                        disabled={i === 0}
                        title="Вверх"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="18 15 12 9 6 15"/>
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => move(c.id, 1)}
                        disabled={i === columns.length - 1}
                        title="Вниз"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                    </div>

                    {editingId === c.id ? (
                      <>
                        <input
                          className="form-input"
                          style={{ flex: 1, padding: '6px 10px' }}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                        />
                        <div className="col-manager-row__colors">
                          {PRESET_COLORS.map(col => (
                            <button
                              key={col}
                              className={`col-color-dot ${editColor === col ? 'col-color-dot--active' : ''}`}
                              style={{ background: col }}
                              onClick={() => setEditColor(col)}
                              title={col}
                            />
                          ))}
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={saveEdit}>OK</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>×</button>
                      </>
                    ) : (
                      <>
                        <span
                          className="col-color-dot col-color-dot--lg"
                          style={{ background: c.color || 'var(--text-muted)' }}
                        />
                        <span style={{ flex: 1, fontWeight: 600 }}>
                          {c.name}
                          {c.is_completion && (
                            <span className="col-badge-completion" title="Колонка завершения">
                              ✓ завершение
                            </span>
                          )}
                        </span>
                        <button
                          className="btn btn-ghost btn-icon"
                          title="Редактировать"
                          onClick={() => startEdit(c)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        {!c.is_completion && (
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Сделать колонкой завершения"
                            onClick={() => setCompletion(c.id)}
                          >
                            ✓
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-icon"
                          title="Удалить"
                          onClick={() => handleDelete(c.id)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="col-manager-add">
                <input
                  className="form-input"
                  placeholder="Название новой колонки"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  maxLength={50}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                />
                <div className="col-manager-row__colors">
                  {PRESET_COLORS.map(col => (
                    <button
                      key={col}
                      className={`col-color-dot ${newColor === col ? 'col-color-dot--active' : ''}`}
                      style={{ background: col }}
                      onClick={() => setNewColor(col)}
                    />
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleAdd}
                  disabled={!newName.trim() || adding}
                >
                  Добавить
                </button>
              </div>
            </>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
