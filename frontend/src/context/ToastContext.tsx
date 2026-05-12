import React, { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  onClick?: () => void;
  avatarSrc?: string | null;
  avatarName?: string;
  title?: string;
  duration?: number;
}

interface ShowOptions {
  type?: ToastType;
  onClick?: () => void;
  avatarSrc?: string | null;
  avatarName?: string;
  title?: string;
  duration?: number;
}

interface ToastContextValue {
  show: (message: string, typeOrOpts?: ToastType | ShowOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

let nextId = 1;

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, typeOrOpts?: ToastType | ShowOptions) => {
    const opts: ShowOptions = typeof typeOrOpts === 'string'
      ? { type: typeOrOpts }
      : (typeOrOpts || {});
    const id = nextId++;
    const duration = opts.duration ?? 3500;
    setToasts(prev => [...prev, {
      id,
      message,
      type: opts.type ?? 'info',
      onClick: opts.onClick,
      avatarSrc: opts.avatarSrc,
      avatarName: opts.avatarName,
      title: opts.title,
      duration
    }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => {
          const hasAvatar = t.title !== undefined || t.avatarName !== undefined;
          return (
            <div
              key={t.id}
              className={`toast toast--${t.type} ${t.onClick ? 'toast--clickable' : ''}`}
              onClick={() => {
                if (t.onClick) { t.onClick(); dismiss(t.id); }
                else dismiss(t.id);
              }}
            >
              {hasAvatar ? (
                <span className="toast__avatar">
                  {t.avatarSrc ? (
                    <img src={t.avatarSrc} alt="" />
                  ) : (
                    <span className="toast__avatar-initials">{getInitials(t.avatarName)}</span>
                  )}
                </span>
              ) : (
                <span className="toast__icon">
                  {t.type === 'success' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {t.type === 'error' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  )}
                  {t.type === 'info' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                  )}
                </span>
              )}
              <div className="toast__body">
                {t.title && <div className="toast__title">{t.title}</div>}
                <div className="toast__message">{t.message}</div>
              </div>
              <button
                className="toast__close"
                onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
                aria-label="Закрыть"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
