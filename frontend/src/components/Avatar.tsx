import { useSocket } from '../context/SocketContext';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  userId?: number;
  showStatus?: boolean;
}

export default function Avatar({
  src, name, size = 36, className = '', userId, showStatus = false
}: AvatarProps) {
  const { isOnline } = useSocket();
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const online = !!(showStatus && userId && isOnline(userId));

  const inner = src ? (
    <img
      src={src}
      alt={name || 'Avatar'}
      width={size}
      height={size}
      className={`avatar ${className}`}
      style={{ width: size, height: size }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  ) : (
    <div
      className={`avatar-initials ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );

  if (!showStatus || !userId) return inner;

  const dotSize = Math.max(8, Math.round(size * 0.28));

  return (
    <span className="avatar-wrapper" style={{ width: size, height: size }}>
      {inner}
      <span
        className={`avatar-status ${online ? 'avatar-status--online' : 'avatar-status--offline'}`}
        style={{ width: dotSize, height: dotSize }}
        title={online ? 'Онлайн' : 'Не в сети'}
      />
    </span>
  );
}
