import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { useToast } from '../context/ToastContext';

interface FriendUser {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FriendRequest extends FriendUser {
  requester_id: number;
  created_at: string;
}

interface SearchUser extends FriendUser {
  friendStatus?: 'none' | 'sent' | 'received' | 'accepted';
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendUser[]>([]);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const [loading, setLoading] = useState(true);
  const [showSent, setShowSent] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [friendsRes, requestsRes, sentRes] = await Promise.all([
        apiClient.get('/api/friends'),
        apiClient.get('/api/friends/requests'),
        apiClient.get('/api/friends/sent')
      ]);
      setFriends(friendsRes.data);
      setRequests(requestsRes.data);
      setSent(sentRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Derive friend status for search results
  function getFriendStatus(userId: number): SearchUser['friendStatus'] {
    if (friends.some((f) => f.id === userId)) return 'accepted';
    if (sent.some((s) => (s as any).addressee_id === userId || s.id === userId)) return 'sent';
    if (requests.some((r) => r.requester_id === userId)) return 'received';
    return 'none';
  }

  async function handleSearch(q: string) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await apiClient.get(`/api/users/search?q=${encodeURIComponent(q)}`);
      const results: SearchUser[] = res.data.map((u: FriendUser) => ({
        ...u,
        friendStatus: getFriendStatus(u.id)
      }));
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleSendRequest(userId: number) {
    try {
      const res = await apiClient.post(`/api/friends/send/${userId}`);
      toast.show(res.data.message || 'Запрос отправлен', 'success');
      fetchAll();
      setSearchResults((prev) =>
        prev.map((u) => u.id === userId ? { ...u, friendStatus: res.data.status === 'accepted' ? 'accepted' : 'sent' } : u)
      );
    } catch (err: any) {
      toast.show(err.response?.data?.error || 'Ошибка', 'error');
    }
  }

  async function handleAccept(requesterId: number) {
    try {
      await apiClient.put(`/api/friends/accept/${requesterId}`);
      toast.show('Запрос принят', 'success');
      fetchAll();
    } catch (err: any) {
      toast.show(err.response?.data?.error || 'Ошибка', 'error');
    }
  }

  async function handleDecline(requesterId: number) {
    try {
      await apiClient.delete(`/api/friends/decline/${requesterId}`);
      fetchAll();
    } catch (err: any) {
      toast.show(err.response?.data?.error || 'Ошибка', 'error');
    }
  }

  async function handleRemoveFriend(userId: number) {
    if (!confirm('Удалить из друзей?')) return;
    try {
      await apiClient.delete(`/api/friends/remove/${userId}`);
      toast.show('Удалён из друзей', 'info');
      fetchAll();
      setSearchResults((prev) =>
        prev.map((u) => u.id === userId ? { ...u, friendStatus: 'none' } : u)
      );
    } catch (err: any) {
      toast.show(err.response?.data?.error || 'Ошибка', 'error');
    }
  }

  const statusButton = (user: SearchUser) => {
    switch (user.friendStatus) {
      case 'accepted':
        return (
          <button className="btn btn-danger btn-sm" onClick={() => handleRemoveFriend(user.id)}>
            Удалить
          </button>
        );
      case 'sent':
        return <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Запрос отправлен</span>;
      case 'received':
        return (
          <button className="btn btn-primary btn-sm" onClick={() => handleAccept(user.id)}>
            Принять
          </button>
        );
      default:
        return (
          <button className="btn btn-secondary btn-sm" onClick={() => handleSendRequest(user.id)}>
            + Добавить
          </button>
        );
    }
  };

  if (loading) {
    return (
      <div className="page-content loading-page">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container animate-fade-in" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)', maxWidth: 720 }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 'var(--space-xl)' }}>
          Друзья
        </h1>

        {/* Search section */}
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
            Найти пользователя
          </h2>
          <div style={{ position: 'relative' }}>
            <div className="input-group">
              <span className="input-group__icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
              <input
                className="form-input"
                placeholder="Поиск по username..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            {search.length >= 2 && (
              <div style={{ marginTop: 'var(--space-sm)' }}>
                {searching ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Поиск...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-md)', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Пользователи не найдены
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-sm)',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius)',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/users/${user.id}`)}>
                          <Avatar src={user.avatar_url} name={user.display_name || user.username} size={36} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                            {user.display_name || user.username}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                            @{user.username}
                          </div>
                        </div>
                        {statusButton(user)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Incoming requests */}
        {requests.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              Входящие запросы
              <span className="nav-badge" style={{ animation: 'none' }}>{requests.length}</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {requests.map((req) => (
                <div
                  key={req.requester_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    animation: 'fadeIn 0.2s ease'
                  }}
                >
                  <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/users/${req.requester_id}`)}>
                    <Avatar src={req.avatar_url} name={req.display_name || req.username} size={36} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      {req.display_name || req.username}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                      @{req.username}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleAccept(req.requester_id)}
                    >
                      Принять
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDecline(req.requester_id)}
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        <div className="card">
          <h2 style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
            Мои друзья · {friends.length}
          </h2>
          {friends.length === 0 ? (
            <EmptyState
              kind="friends"
              title="Пока нет друзей"
              description="Найдите пользователей через поиск выше и отправьте запрос дружбы"
            />
          ) : (
            <div
              className="stagger"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 'var(--space-sm)'
              }}
            >
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  className="card animate-fade-in"
                  style={{ background: 'var(--surface-2)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}
                >
                  <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/users/${friend.id}`)}>
                    <Avatar src={friend.avatar_url} name={friend.display_name || friend.username} size={40} userId={friend.id} showStatus />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {friend.display_name || friend.username}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                      @{friend.username}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon"
                    style={{ padding: '4px', opacity: 0.4, flexShrink: 0 }}
                    title="Удалить из друзей"
                    onClick={() => handleRemoveFriend(friend.id)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sent requests (collapsible) */}
        {sent.length > 0 && (
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <button
              className="collapse-toggle"
              onClick={() => setShowSent(v => !v)}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                style={{ transform: showSent ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform var(--transition-base)' }}
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              Исходящие запросы · {sent.length}
            </button>
            {showSent && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'var(--space-sm)' }}>
                {sent.map((s: any) => (
                  <div key={s.addressee_id || s.id} className="user-row">
                    <Avatar src={s.avatar_url} name={s.display_name || s.username} size={32} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                        {s.display_name || s.username}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        @{s.username} · ожидает ответа
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
