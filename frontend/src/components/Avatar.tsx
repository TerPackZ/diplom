interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export default function Avatar({ src, name, size = 36, className = '' }: AvatarProps) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        width={size}
        height={size}
        className={`avatar ${className}`}
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback to initials on broken image
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      className={`avatar-initials ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}
