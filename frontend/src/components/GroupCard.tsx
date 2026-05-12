import { useNavigate } from 'react-router-dom';

interface Group {
  id: number;
  name: string;
  description: string | null;
  my_role: string;
  member_count: number;
  task_count: number;
  created_at: string;
}

interface GroupCardProps {
  group: Group;
}

const ROLE_LABELS: Record<string, string> = {
  leader: 'Лидер',
  moderator: 'Модератор',
  executor: 'Исполнитель'
};

export default function GroupCard({ group }: GroupCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className={`card card-interactive group-card animate-fade-in group-card--${group.my_role}`}
      onClick={() => navigate(`/groups/${group.id}`)}
    >
      <span className="group-card__accent" aria-hidden="true" />

      <div className="group-card__header">
        <h3 className="group-card__name">{group.name}</h3>
        <span className={`badge badge-role-${group.my_role}`}>
          {ROLE_LABELS[group.my_role] || group.my_role}
        </span>
      </div>

      {group.description ? (
        <p className="group-card__desc">{group.description}</p>
      ) : (
        <p className="group-card__desc" style={{ opacity: 0.5, fontStyle: 'italic' }}>
          Без описания
        </p>
      )}

      <div className="group-card__stats">
        <div className="group-card__stat">
          <span className="group-card__stat-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </span>
          <span className="group-card__stat-value">{group.member_count}</span>
          <span className="group-card__stat-label">участников</span>
        </div>
        <div className="group-card__stat">
          <span className="group-card__stat-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </span>
          <span className="group-card__stat-value">{group.task_count}</span>
          <span className="group-card__stat-label">задач</span>
        </div>
      </div>
    </div>
  );
}
