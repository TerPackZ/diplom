import { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import GroupCard from '../components/GroupCard';

interface Group {
  id: number;
  name: string;
  description: string | null;
  my_role: string;
  member_count: number;
  task_count: number;
  created_at: string;
}

export default function DashboardPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const fetchGroups = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/groups');
      setGroups(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      await apiClient.post('/api/groups', { name: groupName.trim(), description: groupDesc.trim() || undefined });
      setGroupName('');
      setGroupDesc('');
      setShowCreate(false);
      fetchGroups();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Ошибка при создании');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page-content">
      <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xl)' }}>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
              Мои группы
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              {groups.length} {groups.length === 1 ? 'группа' : groups.length < 5 ? 'группы' : 'групп'}
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Создать группу
          </button>
        </div>

        {/* Create group modal */}
        {showCreate && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
            <div className="modal">
              <div className="modal__header">
                <h2 className="modal__title">Новая группа</h2>
                <button className="modal__close" onClick={() => setShowCreate(false)}>×</button>
              </div>
              <form onSubmit={handleCreateGroup}>
                <div className="modal__body">
                  <div className="form-group">
                    <label className="form-label">Название *</label>
                    <input
                      className="form-input"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Название группы"
                      required
                      autoFocus
                      maxLength={100}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Описание</label>
                    <textarea
                      className="form-textarea"
                      value={groupDesc}
                      onChange={(e) => setGroupDesc(e.target.value)}
                      placeholder="Необязательное описание..."
                      rows={3}
                    />
                  </div>
                  {createError && <p className="form-error">{createError}</p>}
                </div>
                <div className="modal__footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={creating}>
                    {creating ? 'Создание...' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Groups grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-3xl)' }}>
            <div className="spinner" />
          </div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🗂️</div>
            <p className="empty-state__title">Нет групп</p>
            <p className="empty-state__desc">Создайте первую группу, чтобы начать работу</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              Создать группу
            </button>
          </div>
        ) : (
          <div
            className="stagger"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 'var(--space-md)'
            }}
          >
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
