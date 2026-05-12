export function SkeletonBar({ width = '100%', height = 12 }: { width?: string | number; height?: number }) {
  return <div className="skeleton skeleton-bar" style={{ width, height }} />;
}

export function SkeletonCircle({ size = 36 }: { size?: number }) {
  return <div className="skeleton skeleton-circle" style={{ width: size, height: size }} />;
}

export function SkeletonGroupCard() {
  return (
    <div className="card group-card-skeleton">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <SkeletonBar width="60%" height={20} />
        <SkeletonBar width={70} height={20} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        <SkeletonBar width="100%" height={10} />
        <SkeletonBar width="80%" height={10} />
      </div>
      <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <SkeletonBar width={60} height={14} />
        <SkeletonBar width={60} height={14} />
      </div>
    </div>
  );
}

export function SkeletonConversationRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
      <SkeletonCircle size={44} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBar width="60%" height={12} />
        <SkeletonBar width="80%" height={10} />
      </div>
    </div>
  );
}

export function SkeletonMessage({ own = false }: { own?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      flexDirection: own ? 'row-reverse' : 'row',
      maxWidth: '65%',
      alignSelf: own ? 'flex-end' : 'flex-start'
    }}>
      {!own && <SkeletonCircle size={32} />}
      <div className="skeleton" style={{
        height: 36,
        width: 120 + Math.random() * 100,
        borderRadius: 16
      }} />
    </div>
  );
}

export function SkeletonAnalyticsCard() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SkeletonBar width={34} height={34} />
      <SkeletonBar width="60%" height={10} />
      <SkeletonBar width="40%" height={24} />
    </div>
  );
}

export function SkeletonTaskCard() {
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SkeletonBar width="80%" height={14} />
      <SkeletonBar width={70} height={18} />
    </div>
  );
}
