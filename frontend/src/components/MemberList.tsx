import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';

export interface Member {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'leader' | 'moderator' | 'executor';
}

interface MemberListProps {
  groupId: number;
  members: Member[];
  myRole: string;
  onUpdate: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  leader: 'Лидер',
  moderator: 'Модератор',
  executor: 'Исполнитель'
};

export default function MemberList({ groupId, members, myRole, onUpdate }: MemberListProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState('');

  const canManage = myRole === 'leader' || myRole === 'moderator';

  async function handleSearch(q: string) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await apiClient.get(`/api/friends/search?q=${encodeURIComponent(q)}`);
      const memberIds = new Set(members.map((m) => m.id));
      setSearchResults(res.data.filter((u: any) => !memberIds.has(u.id)));
    } catch {
      setSearchResults([]);
    }
  }

  async function handleAddMember(userId: number) {
    try {
      await apiClient.post(`/api/groups/${groupId}/members`, { userId, role: 'executor' });
      setSearch('');
      setSearchResults([]);
      setShowSearch(false);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при добавлении');
    }
  }

  async function handleChangeRole(userId: number, role: string) {
    try {
      await apiClient.put(`/api/groups/${groupId}/members/${userId}`, { role });
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при изменении роли');
    }
  }

  async function handleRemoveMember(userId: number) {
    if (!confirm('Удалить участника из группы?')) return;
    try {
      await apiClient.delete(`/api/groups/${groupId}/members/${userId}`);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при удалении');
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="sidebar__header">
        <span className="sidebar__title">Участники · {members.length}</span>
        {canManage && (
          <button
            className="btn btn-ghost btn-icon"
            style={{ padding: '4px', fontSize: '18px', lineHeight: 1 }}
            onClick={() => { setShowSearch(!showSearch); setError(''); }}
            title="Добавить участника"
          >
            +
          </button>
        )}
      </div>

      {/* Search box */}
      {showSearch && canManage && (
        <div style={{ padding: 'var(--space-sm)', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <input
            className="form-input"
            style={{ fontSize: 'var(--font-size-sm)' }}
            placeholder="Поиск по username..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map((u) => (
                <div key={u.id} className="search-dropdown__item" onClick={() => handleAddMember(u.id)}>
                  <Avatar src={u.avatar_url} name={u.display_name || u.username} size={28} />
                  <div>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      {u.display_name || u.username}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      @{u.username}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {search.length >= 2 && searchResults.length === 0 && (
            <div style={{ padding: '8px 4px', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              Нет совпадений среди друзей
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: 'var(--space-sm)', color: 'var(--priority-high)', fontSize: 'var(--font-size-xs)' }}>
          {error}
        </div>
      )}

      {/* Member list — two-row layout: name/username on top, role on second line */}
      <div className="sidebar__content">
        {members.map((member) => {
          const isMe = member.id === user?.id;
          const canChangeThisRole = myRole === 'leader' && !isMe;
          const canRemoveThis = canManage && !isMe && member.role !== 'leader';

          return (
            <div key={member.id} className="member-item" style={{ alignItems: 'flex-start' }}>
              {/* Avatar */}
              <div style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => navigate(`/users/${member.id}`)}>
                <Avatar
                  src={member.avatar_url}
                  name={member.display_name || member.username}
                  size={32}
                />
              </div>

              {/* Name + username + role — stacked vertically */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 4,
                }}>
                  <span style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {member.display_name || member.username}
                  </span>

                  {/* Remove button — top-right of the card */}
                  {canRemoveThis && (
                    <button
                      className="btn btn-ghost btn-icon"
                      style={{ padding: '2px', opacity: 0.4, flexShrink: 0 }}
                      onClick={() => handleRemoveMember(member.id)}
                      title="Удалить участника"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Username */}
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 5 }}>
                  @{member.username}
                </div>

                {/* Role — either select (leader view) or badge */}
                {canChangeThisRole ? (
                  <select
                    className="form-select"
                    style={{ fontSize: 'var(--font-size-xs)', padding: '3px 24px 3px 8px', width: '100%' }}
                    value={member.role}
                    onChange={(e) => handleChangeRole(member.id, e.target.value)}
                  >
                    <option value="leader">Лидер</option>
                    <option value="moderator">Модератор</option>
                    <option value="executor">Исполнитель</option>
                  </select>
                ) : (
                  <span className={`badge badge-role-${member.role}`}>
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
