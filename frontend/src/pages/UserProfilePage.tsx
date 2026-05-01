import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';

interface UserProfile {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  description: string | null;
  created_at: string;
}

type FriendStatus = 'none' | 'sent' | 'received' | 'accepted';

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (user && String(user.id) === id) {
      navigate('/profile', { replace: true });
      return;
    }

    async function load() {
      try {
        const [profileRes, friendsRes, requestsRes, sentRes] = await Promise.all([
          apiClient.get(`/api/users/${id}`),
          apiClient.get('/api/friends'),
          apiClient.get('/api/friends/requests'),
          apiClient.get('/api/friends/sent')
        ]);

        setProfile(profileRes.data);

        const userId = parseInt(id!);
        const friends: any[] = friendsRes.data;
        const requests: any[] = requestsRes.data;
        const sent: any[] = sentRes.data;

        if (friends.some((f) => f.id === userId)) {
          setFriendStatus('accepted');
        } else if (sent.some((s) => s.addressee_id === userId || s.id === userId)) {
          setFriendStatus('sent');
        } else if (requests.some((r) => r.requester_id === userId)) {
          setFriendStatus('received');
        } else {
          setFriendStatus('none');
        }
      } catch {
        setError('Пользователь не найден');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, user, navigate]);

  function showMsg(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  }

  async function handleSendRequest() {
    try {
      const res = await apiClient.post(`/api/friends/send/${id}`);
      setFriendStatus(res.data.status === 'accepted' ? 'accepted' : 'sent');
      showMsg(res.data.message || 'Запрос отправлен');
    } catch (err: any) {
      showMsg(err.response?.data?.error || 'Ошибка');
    }
  }

  async function handleAccept() {
    try {
      await apiClient.put(`/api/friends/accept/${id}`);
      setFriendStatus('accepted');
      showMsg('Теперь вы друзья!');
    } catch (err: any) {
      showMsg(err.response?.data?.error || 'Ошибка');
    }
  }

  async function handleRemove() {
    if (!confirm('Удалить из друзей?')) return;
    try {
      await apiClient.delete(`/api/friends/remove/${id}`);
      setFriendStatus('none');
    } catch (err: any) {
      showMsg(err.response?.data?.error || 'Ошибка');
    }
  }

  if (loading) {
    return (
      <div className="page-content loading-page">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-content">
        <div className="container" style={{ paddingTop: 'var(--space-xl)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div
        className="container animate-fade-in"
        style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)', maxWidth: 640 }}
      >
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 'var(--space-lg)' }}
          onClick={() => navigate(-1)}
        >
          ← Назад
        </button>

        <div className="card">
          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
            <Avatar
              src={profile?.avatar_url}
              name={profile?.display_name || profile?.username}
              size={80}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xl)' }}>
                {profile?.display_name || profile?.username}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 10 }}>
                @{profile?.username}
              </div>

              {/* Friend action button */}
              {friendStatus === 'accepted' && (
                <button className="btn btn-danger btn-sm" onClick={handleRemove}>
                  Удалить из друзей
                </button>
              )}
              {friendStatus === 'sent' && (
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                  Запрос отправлен
                </span>
              )}
              {friendStatus === 'received' && (
                <button className="btn btn-primary btn-sm" onClick={handleAccept}>
                  Принять запрос
                </button>
              )}
              {friendStatus === 'none' && (
                <button className="btn btn-secondary btn-sm" onClick={handleSendRequest}>
                  + Добавить в друзья
                </button>
              )}
            </div>
          </div>

          {profile?.description && (
            <div style={{ padding: '16px 0', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {profile.description}
              </p>
            </div>
          )}

          <div style={{ paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border)', marginTop: profile?.description ? 0 : 'var(--space-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 'var(--font-size-sm)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Участник с</span>
              <span>
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {actionMsg && (
          <div style={{
            marginTop: 'var(--space-md)',
            padding: '10px 16px',
            borderRadius: 'var(--radius)',
            background: 'rgba(124, 58, 237, 0.15)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--accent-from)',
            animation: 'fadeIn 0.2s ease'
          }}>
            {actionMsg}
          </div>
        )}
      </div>
    </div>
  );
}
