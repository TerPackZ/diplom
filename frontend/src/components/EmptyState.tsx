import React from 'react';

type IllustrationKind = 'groups' | 'friends' | 'tasks' | 'chats' | 'messages' | 'notifications' | 'generic';

interface Props {
  kind?: IllustrationKind;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function Illustration({ kind }: { kind: IllustrationKind }) {
  const common = { width: 96, height: 96, viewBox: '0 0 96 96', fill: 'none' as const, xmlns: 'http://www.w3.org/2000/svg' };

  // Wrapper with gradient circle background
  const wrap = (inner: React.ReactNode) => (
    <svg {...common} className="empty-svg">
      <defs>
        <linearGradient id={`g-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(124, 58, 237, 0.18)" />
          <stop offset="100%" stopColor="rgba(37, 99, 235, 0.10)" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="44" fill={`url(#g-${kind})`} />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {inner}
      </g>
    </svg>
  );

  switch (kind) {
    case 'groups':
      return wrap(<>
        <rect x="28" y="34" width="40" height="32" rx="3" />
        <line x1="28" y1="44" x2="68" y2="44" />
        <circle cx="36" cy="39" r="1.5" fill="currentColor" />
        <circle cx="42" cy="39" r="1.5" fill="currentColor" />
        <line x1="34" y1="52" x2="62" y2="52" opacity="0.6" />
        <line x1="34" y1="58" x2="54" y2="58" opacity="0.4" />
      </>);
    case 'friends':
      return wrap(<>
        <circle cx="38" cy="44" r="8" />
        <path d="M26 66 a12 12 0 0 1 24 0" />
        <circle cx="60" cy="40" r="6" />
        <path d="M54 60 a10 10 0 0 1 16 0" />
      </>);
    case 'tasks':
      return wrap(<>
        <rect x="30" y="28" width="36" height="42" rx="3" />
        <polyline points="38,42 42,46 50,38" />
        <line x1="38" y1="54" x2="58" y2="54" opacity="0.5" />
        <line x1="38" y1="60" x2="52" y2="60" opacity="0.4" />
      </>);
    case 'chats':
      return wrap(<>
        <path d="M28 36 h32 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-22 l-10 8 v-8 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4 z" />
        <circle cx="40" cy="48" r="1.5" fill="currentColor" />
        <circle cx="48" cy="48" r="1.5" fill="currentColor" />
        <circle cx="56" cy="48" r="1.5" fill="currentColor" />
      </>);
    case 'messages':
      return wrap(<>
        <path d="M28 56 v-20 a4 4 0 0 1 4 -4 h32 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-22 l-10 8 v-8 z" />
        <line x1="38" y1="42" x2="58" y2="42" opacity="0.6" />
        <line x1="38" y1="50" x2="52" y2="50" opacity="0.4" />
      </>);
    case 'notifications':
      return wrap(<>
        <path d="M48 24 v6" />
        <path d="M58 38 a10 10 0 0 0 -20 0 v12 l-4 6 h28 l-4 -6 z" />
        <path d="M44 64 a4 4 0 0 0 8 0" />
      </>);
    default:
      return wrap(<>
        <rect x="32" y="32" width="32" height="32" rx="4" />
        <line x1="40" y1="44" x2="56" y2="44" opacity="0.5" />
        <line x1="40" y1="52" x2="50" y2="52" opacity="0.4" />
      </>);
  }
}

export default function EmptyState({ kind = 'generic', title, description, action, className = '' }: Props) {
  return (
    <div className={`empty-illustration ${className}`}>
      <Illustration kind={kind} />
      <div className="empty-illustration__title">{title}</div>
      {description && <div className="empty-illustration__desc">{description}</div>}
      {action && <div className="empty-illustration__action">{action}</div>}
    </div>
  );
}
