import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';
import TaskCard, { Task, BoardColumn } from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import TaskDetailModal from '../components/TaskDetailModal';
import MemberList, { Member } from '../components/MemberList';
import ColumnManagerModal from '../components/ColumnManagerModal';

interface GroupDetail {
  id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
  my_role: 'leader' | 'moderator' | 'executor';
  members: Member[];
}

const PRIORITY_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'critical', label: 'Критичный' },
  { value: 'high',     label: 'Высокий' },
  { value: 'medium',   label: 'Средний' },
  { value: 'low',      label: 'Низкий' }
];

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const groupId = Number(id);

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [taskModal, setTaskModal] = useState<{ open: boolean; task?: Task | null }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const [dragOverColumnId, setDragOverColumnId] = useState<number | null>(null);
  const [showColumnManager, setShowColumnManager] = useState(false);

  const fetchGroup = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/groups/${groupId}`);
      setGroup(res.data);
    } catch {
      navigate('/dashboard');
    }
  }, [groupId, navigate]);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (priorityFilter) params.set('priority', priorityFilter);
      const res = await apiClient.get(`/api/groups/${groupId}/tasks?${params}`);
      setTasks(res.data);
    } catch { /* ignore */ }
  }, [groupId, priorityFilter]);

  const fetchColumns = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/groups/${groupId}/columns`);
      setColumns(res.data);
    } catch { /* ignore */ }
  }, [groupId]);

  useEffect(() => {
    Promise.all([fetchGroup(), fetchTasks(), fetchColumns()]).finally(() => setLoading(false));
  }, [fetchGroup, fetchTasks, fetchColumns]);

  const canEdit = group?.my_role === 'leader' || group?.my_role === 'moderator';
  const isLeader = group?.my_role === 'leader';

  async function handleSaveTask(data: Partial<Task>) {
    if (taskModal.task) {
      await apiClient.put(`/api/groups/${groupId}/tasks/${taskModal.task.id}`, data);
    } else {
      await apiClient.post(`/api/groups/${groupId}/tasks`, data);
    }
    fetchTasks();
  }

  async function handleDeleteTask(taskId: number) {
    try {
      await apiClient.delete(`/api/groups/${groupId}/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при удалении');
    }
  }

  async function handleColumnChange(taskId: number, columnId: number) {
    try {
      const res = await apiClient.patch(`/api/groups/${groupId}/tasks/${taskId}/column`, { column_id: columnId });
      setTasks((prev) => prev.map((t) => t.id === taskId ? res.data : t));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при перемещении задачи');
    }
  }

  async function handleDeleteGroup() {
    if (!confirm(`Удалить группу "${group?.name}"? Это действие необратимо.`)) return;
    try {
      await apiClient.delete(`/api/groups/${groupId}`);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при удалении группы');
    }
  }

  async function handleLeaveGroup() {
    if (!confirm('Покинуть эту группу?')) return;
    try {
      await apiClient.delete(`/api/groups/${groupId}/members/${user!.id}`);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при выходе из группы');
    }
  }

  if (loading) {
    return (
      <div className="page-content loading-page">
        <div className="spinner" />
      </div>
    );
  }

  if (!group) return null;

  const tasksByColumn = (colId: number) => tasks.filter((t) => t.column_id === colId);

  const canChangeColumn = (task: Task) => {
    if (canEdit) return true;
    if (group.my_role === 'executor' && task.assigned_to === user?.id) return true;
    return false;
  };

  return (
    <div className="page-content">
      <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)' }}>
        {/* Page header */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/dashboard')}
              style={{ padding: '4px 8px', gap: 4 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Группы
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>
                {group.name}
              </h1>
              {group.description && (
                <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{group.description}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-sm)', flexShrink: 0, flexWrap: 'wrap' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate(`/groups/${groupId}/analytics`)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Аналитика
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    const res = await apiClient.post(`/api/messages/group/${groupId}`);
                    navigate(`/messages?conv=${res.data.id}`);
                  } catch { /* ignore */ }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Чат группы
              </button>
              {isLeader && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowColumnManager(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="6" height="18" rx="1"/>
                    <rect x="11" y="3" width="6" height="14" rx="1"/>
                    <rect x="19" y="3" width="2" height="10" rx="1"/>
                  </svg>
                  Колонки
                </button>
              )}
              {group.my_role === 'leader' && (
                <button className="btn btn-danger btn-sm" onClick={handleDeleteGroup}>
                  Удалить группу
                </button>
              )}
              {group.my_role !== 'leader' && (
                <button className="btn btn-ghost btn-sm" onClick={handleLeaveGroup}>
                  Покинуть группу
                </button>
              )}
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 'var(--space-sm)', color: 'var(--priority-high)', fontSize: 'var(--font-size-sm)' }}>
              {error}
            </div>
          )}
        </div>

        <div className="group-layout">
          {/* Sidebar */}
          <div className="sidebar">
            <MemberList
              groupId={groupId}
              members={group.members}
              myRole={group.my_role}
              onUpdate={fetchGroup}
            />
          </div>

          {/* Main kanban area */}
          <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
              <div className="filter-bar">
                {PRIORITY_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    className={`filter-chip ${priorityFilter === f.value ? 'active' : ''}`}
                    onClick={() => setPriorityFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => setTaskModal({ open: true, task: null })}
                disabled={columns.length === 0}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Добавить задачу
              </button>
            </div>

            {/* Kanban board */}
            {columns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__title">Нет колонок</div>
                <div className="empty-state__desc">
                  {isLeader ? 'Создайте первую колонку через кнопку «Колонки»' : 'Лидер ещё не настроил доску'}
                </div>
              </div>
            ) : (
              <div className="kanban">
                {columns.map((col) => {
                  const colTasks = tasksByColumn(col.id);
                  return (
                    <div
                      key={col.id}
                      className={`kanban-column ${dragOverColumnId === col.id ? 'kanban-column--drag-over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverColumnId(col.id); }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverColumnId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverColumnId(null);
                        const taskId = parseInt(e.dataTransfer.getData('taskId'));
                        const task = tasks.find((t) => t.id === taskId);
                        if (task && task.column_id !== col.id && canChangeColumn(task)) {
                          handleColumnChange(taskId, col.id);
                        }
                      }}
                    >
                      <div className="kanban-column__header">
                        <div className="kanban-column__title">
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color || 'var(--text-muted)', flexShrink: 0, display: 'inline-block' }} />
                          {col.name}
                          {col.is_completion && (
                            <span className="col-badge-completion" style={{ marginLeft: 6 }}>✓</span>
                          )}
                        </div>
                        <span className="kanban-column__count">{colTasks.length}</span>
                      </div>

                      <div className="kanban-column__tasks">
                        {colTasks.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: 'var(--space-lg)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                            Нет задач
                          </div>
                        ) : (
                          colTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              columns={columns}
                              canEdit={canEdit}
                              draggable={canChangeColumn(task)}
                              onClick={(t) => setDetailTask(t)}
                              onEdit={(t) => setTaskModal({ open: true, task: t })}
                              onDelete={(tid) => setConfirmDelete(tid)}
                              onColumnChange={canChangeColumn(task) ? handleColumnChange : undefined}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task detail modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          canEdit={canEdit}
          groupId={groupId}
          onEdit={(t) => { setDetailTask(null); setTaskModal({ open: true, task: t }); }}
          onClose={() => setDetailTask(null)}
        />
      )}

      {/* Task modal */}
      {taskModal.open && (
        <TaskModal
          task={taskModal.task}
          members={group.members}
          columns={columns}
          groupId={groupId}
          onSave={handleSaveTask}
          onClose={() => setTaskModal({ open: false })}
        />
      )}

      {/* Column manager */}
      {showColumnManager && (
        <ColumnManagerModal
          groupId={groupId}
          onClose={() => setShowColumnManager(false)}
          onSaved={() => { fetchColumns(); fetchTasks(); }}
        />
      )}

      {/* Delete confirm modal */}
      {confirmDelete !== null && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__header">
              <h2 className="modal__title">Удалить задачу?</h2>
              <button className="modal__close" onClick={() => setConfirmDelete(null)}>×</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>
              Это действие нельзя отменить.
            </p>
            <div className="modal__footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Отмена
              </button>
              <button className="btn btn-danger" onClick={() => handleDeleteTask(confirmDelete)}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
