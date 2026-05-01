import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';
import NotificationPanel from './NotificationPanel';
import apiClient from '../api/client';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  const isActive = (path: string) => location.pathname === path;

  // Refresh pending friend request count on every route change
  useEffect(() => {
    if (!user) { setPendingCount(0); return; }
    apiClient.get('/api/friends/requests')
      .then((res) => setPendingCount(res.data.length))
      .catch(() => setPendingCount(0));
  }, [user, location.pathname]);

  const handleUnreadChange = useCallback((_count: number) => {
    // Could use this to do something global if needed
  }, []);

  return (
    <>
      <nav className="navbar">
        <div className="navbar__inner">
          <div className="navbar__logo" onClick={() => navigate('/dashboard')}>
            TaskTracker
          </div>

          {user && (
            <div className="navbar__nav">
              <button
                className={`navbar__link ${isActive('/dashboard') ? 'active' : ''}`}
                onClick={() => navigate('/dashboard')}
              >
                Группы
              </button>
              <button
                className={`navbar__link ${isActive('/friends') ? 'active' : ''}`}
                onClick={() => navigate('/friends')}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                Друзья
                {pendingCount > 0 && (
                  <span className="nav-badge">{pendingCount}</span>
                )}
              </button>
            </div>
          )}

          <div className="navbar__right">
            {user ? (
              <>
                <button
                  className="theme-toggle"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
                >
                  {theme === 'dark' ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/>
                      <line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/>
                      <line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                </button>
                <NotificationPanel onUnreadChange={handleUnreadChange} />
                <button
                  className="navbar__link"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 10px 4px 4px'
                  }}
                  onClick={() => navigate('/profile')}
                >
                  <Avatar src={user.avatar_url} name={user.display_name || user.username} size={28} />
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {user.display_name || user.username}
                  </span>
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '6px 12px', fontSize: 'var(--font-size-sm)' }}
                  onClick={logout}
                >
                  Выйти
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/login')}>
                  Войти
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/register')}>
                  Регистрация
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom navigation */}
      {user && (
        <nav className="mobile-nav">
          <button
            className={`mobile-nav__item ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span>Группы</span>
          </button>

          <button
            className={`mobile-nav__item ${isActive('/friends') ? 'active' : ''}`}
            onClick={() => navigate('/friends')}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {pendingCount > 0 && (
                <span className="mobile-nav__badge">{pendingCount}</span>
              )}
            </span>
            <span>Друзья</span>
          </button>

          <button
            className={`mobile-nav__item ${isActive('/profile') ? 'active' : ''}`}
            onClick={() => navigate('/profile')}
          >
            <Avatar src={user.avatar_url} name={user.display_name || user.username} size={24} />
            <span>Профиль</span>
          </button>
        </nav>
      )}
    </>
  );
}
