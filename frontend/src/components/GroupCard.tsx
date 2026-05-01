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
      className="card card-interactive group-card animate-fade-in"
      onClick={() => navigate(`/groups/${group.id}`)}
    >
      <div className="group-card__header">
        <h3 className="group-card__name">{group.name}</h3>
        <span className={`badge badge-role-${group.my_role}`}>
          {ROLE_LABELS[group.my_role] || group.my_role}
        </span>
      </div>

      {group.description && (
        <p className="group-card__desc">{group.description}</p>
      )}

      <div className="group-card__stats">
        <div className="group-card__stat">
          <span className="group-card__stat-value">{group.member_count}</span>
          <span className="group-card__stat-label">участников</span>
        </div>
        <div className="group-card__stat">
          <span className="group-card__stat-value">{group.task_count}</span>
          <span className="group-card__stat-label">задач</span>
        </div>
      </div>
    </div>
  );
}
