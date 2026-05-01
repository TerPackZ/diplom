import { useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/Avatar';
import AvatarCropModal from '../components/AvatarCropModal';
import apiClient from '../api/client';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [description, setDescription] = useState(user?.description || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [cropFile, setCropFile] = useState<File | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiClient.put('/api/users/me', {
        display_name: displayName || undefined,
        username,
        description: description || undefined
      });
      updateUser(res.data);
      setSuccess('Профиль успешно обновлён');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null);
    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('avatar', blob, 'avatar.jpg');
    try {
      const res = await apiClient.post('/api/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      updateUser({ avatar_url: res.data.avatar_url });
      setSuccess('Аватар обновлён');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки аватара');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page-content">
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onClose={() => setCropFile(null)}
        />
      )}
      <div
        className="container animate-fade-in"
        style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)', maxWidth: 640 }}
      >
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 'var(--space-xl)' }}>
          Профиль
        </h1>

        {/* Avatar & name section */}
        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
            {/* Clickable avatar */}
            <div
              style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => fileInputRef.current?.click()}
              title="Нажмите для смены аватара"
            >
              <Avatar
                src={user?.avatar_url}
                name={user?.display_name || user?.username}
                size={80}
              />
              <div
                className="avatar-overlay"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity var(--transition-base)'
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = '1')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = '0')}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xl)' }}>
                {user?.display_name || user?.username}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                @{user?.username}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Загрузка...' : 'Сменить аватар'}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>

          {/* Edit form */}
          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="displayName">Отображаемое имя</label>
                <input
                  id="displayName"
                  className="form-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ваше имя"
                  maxLength={60}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="username">Username</label>
                <div className="input-group">
                  <span className="input-group__icon">@</span>
                  <input
                    id="username"
                    className="form-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    pattern="[a-zA-Z0-9_]{3,30}"
                    required
                    maxLength={30}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">О себе</label>
              <textarea
                id="description"
                className="form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Расскажите о себе..."
                rows={3}
                maxLength={300}
              />
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                {description.length}/300
              </span>
            </div>

            {error   && <p className="form-error">{error}</p>}
            {success && <p className="form-success">{success}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>

        {/* Account info */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-md)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Аккаунт
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'Email', value: user?.email },
              { label: 'Участник с', value: user?.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' }
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                  gap: 'var(--space-md)'
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{label}</span>
                <span style={{ fontSize: 'var(--font-size-sm)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
