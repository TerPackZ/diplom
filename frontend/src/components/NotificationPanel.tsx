import { useEffect, useRef, useState, useCallback } from 'react';
import apiClient from '../api/client';

interface Notification {
  id: number;
  type: 'friend_request' | 'friend_accepted' | 'role_changed' | 'added_to_group';
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<Notification['type'], string> = {
  friend_request: '🤝',
  friend_accepted: '✅',
  role_changed: '🏷️',
  added_to_group: '👥',
};

function timeAgo(dateStr: string): string {
  // SQLite CURRENT_TIMESTAMP stores UTC without timezone suffix — force UTC parsing
  const utc = dateStr.includes('Z') || dateStr.includes('+')
    ? dateStr
    : dateStr.replace(' ', 'T') + 'Z';
  const diff = (Date.now() - new Date(utc).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return `${Math.floor(diff / 86400)} д назад`;
}

interface Props {
  onUnreadChange: (count: number) => void;
}

export default function NotificationPanel({ onUnreadChange }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/notifications/unread-count');
      const count = res.data.count ?? 0;
      setUnreadCount(count);
      onUnreadChange(count);
    } catch {
      // ignore
    }
  }, [onUnreadChange]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/notifications');
      setNotifications(res.data);
      const unread = res.data.filter((n: Notification) => !n.is_read).length;
      setUnreadCount(unread);
      onUnreadChange(unread);
    } catch {
      // ignore
    }
  }, [onUnreadChange]);

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Fetch full list when panel opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function handleReadAll() {
    await apiClient.post('/api/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    onUnreadChange(0);
  }

  async function handleReadOne(id: number) {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || notif.is_read) return;
    await apiClient.patch(`/api/notifications/${id}/read`);
    const updated = notifications.map((n) => n.id === id ? { ...n, is_read: true } : n);
    setNotifications(updated);
    const unread = updated.filter((n) => !n.is_read).length;
    setUnreadCount(unread);
    onUnreadChange(unread);
  }

  async function handleDelete(id: number) {
    await apiClient.delete(`/api/notifications/${id}`);
    const updated = notifications.filter((n) => n.id !== id);
    setNotifications(updated);
    const unread = updated.filter((n) => !n.is_read).length;
    setUnreadCount(unread);
    onUnreadChange(unread);
  }

  return (
    <div className="notif-wrapper" ref={panelRef}>
      {/* Bell button */}
      <button
        className={`btn btn-ghost btn-icon notif-bell ${open ? 'notif-bell--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Уведомления"
        aria-label="Уведомления"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="notif-panel animate-fade-in">
          <div className="notif-panel__header">
            <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>Уведомления</span>
            {unreadCount > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px' }} onClick={handleReadAll}>
                Прочитать все
              </button>
            )}
          </div>

          <div className="notif-panel__list">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <span style={{ fontSize: 24 }}>🔔</span>
                <span>Нет уведомлений</span>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.is_read ? 'notif-item--unread' : ''}`}
                  style={{ cursor: !n.is_read ? 'pointer' : 'default' }}
                  onClick={() => handleReadOne(n.id)}
                  title={!n.is_read ? 'Нажмите, чтобы отметить как прочитанное' : undefined}
                >
                  <span className="notif-item__icon">{TYPE_ICON[n.type] ?? '📌'}</span>
                  <div className="notif-item__body">
                    <div className="notif-item__title">{n.title}</div>
                    {n.body && <div className="notif-item__text">{n.body}</div>}
                    <div className="notif-item__time">{timeAgo(n.created_at)}</div>
                  </div>
                  <button
                    className="notif-item__close"
                    onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                    title="Удалить"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
