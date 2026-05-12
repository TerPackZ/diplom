import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend
} from 'recharts';
import apiClient from '../api/client';
import Avatar from '../components/Avatar';
import { SkeletonAnalyticsCard, SkeletonBar } from '../components/Skeleton';

// ── Types ────────────────────────────────────────────────────────────────────

interface Overview {
  total: number;
  by_status: { todo: number; in_progress: number; done: number };
  by_priority: { low: number; medium: number; high: number; critical: number };
  completed_week: number;
  created_week: number;
  member_count: number;
  completion_rate: number;
}

interface CumulativeFlowPoint {
  date: string;
  todo: number;
  in_progress: number;
  done: number;
}

interface VelocityPoint { week: string; completed: number; }
interface ActivityPoint { date: string; count: number; }

interface Contributor {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  total_assigned: number;
  completed: number;
  open: number;
  created: number;
}

interface CycleTime { todo: number; in_progress: number; total_to_done: number; }

interface Group { id: number; name: string; }

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  todo: '#6B7280',
  in_progress: '#2563EB',
  done: '#10B981',
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED'
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Выполнено'
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический'
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(h: number): string {
  if (h === 0) return '—';
  if (h < 1) return `${Math.round(h * 60)} мин`;
  if (h < 24) return `${h.toFixed(1)} ч`;
  const days = h / 24;
  return `${days.toFixed(1)} д`;
}

function formatShortDate(s: string): string {
  const d = new Date(s);
  return `${d.getDate()}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ── Heatmap component ────────────────────────────────────────────────────────

function ActivityHeatmap({ data }: { data: ActivityPoint[] }) {
  const max = Math.max(...data.map(d => d.count), 1);

  // Group data into weeks (columns), 7 rows
  const weeks: ActivityPoint[][] = [];
  let currentWeek: ActivityPoint[] = [];

  // Find day of week of first point — fill leading empty cells
  if (data.length > 0) {
    const firstDay = new Date(data[0].date).getDay();
    // Convert to Mon-based (0=Mon..6=Sun)
    const mondayBased = (firstDay + 6) % 7;
    for (let i = 0; i < mondayBased; i++) {
      currentWeek.push({ date: '', count: -1 });
    }
  }

  data.forEach(point => {
    const dayOfWeek = (new Date(point.date).getDay() + 6) % 7;
    currentWeek[dayOfWeek] = point;
    if (dayOfWeek === 6) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push({ date: '', count: -1 });
    weeks.push(currentWeek);
  }

  const intensity = (count: number) => {
    if (count < 0) return 'transparent';
    if (count === 0) return 'var(--surface-2)';
    const ratio = count / max;
    if (ratio < 0.25) return 'rgba(124, 58, 237, 0.25)';
    if (ratio < 0.5) return 'rgba(124, 58, 237, 0.5)';
    if (ratio < 0.75) return 'rgba(124, 58, 237, 0.75)';
    return 'rgba(124, 58, 237, 1)';
  };

  return (
    <div className="heatmap">
      <div className="heatmap__grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap__col">
            {week.map((day, di) => (
              <div
                key={di}
                className="heatmap__cell"
                style={{ background: intensity(day.count) }}
                title={day.date ? `${day.date}: ${day.count} действий` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap__legend">
        <span>Меньше</span>
        <div className="heatmap__cell" style={{ background: 'var(--surface-2)' }} />
        <div className="heatmap__cell" style={{ background: 'rgba(124, 58, 237, 0.25)' }} />
        <div className="heatmap__cell" style={{ background: 'rgba(124, 58, 237, 0.5)' }} />
        <div className="heatmap__cell" style={{ background: 'rgba(124, 58, 237, 0.75)' }} />
        <div className="heatmap__cell" style={{ background: 'rgba(124, 58, 237, 1)' }} />
        <span>Больше</span>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const groupId = parseInt(id || '0');
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [flow, setFlow] = useState<CumulativeFlowPoint[]>([]);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [cycleTime, setCycleTime] = useState<CycleTime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    Promise.all([
      apiClient.get(`/api/groups/${groupId}`),
      apiClient.get(`/api/groups/${groupId}/analytics/overview`),
      apiClient.get(`/api/groups/${groupId}/analytics/cumulative-flow?days=30`),
      apiClient.get(`/api/groups/${groupId}/analytics/velocity?weeks=8`),
      apiClient.get(`/api/groups/${groupId}/analytics/activity?weeks=12`),
      apiClient.get(`/api/groups/${groupId}/analytics/contributors`),
      apiClient.get(`/api/groups/${groupId}/analytics/cycle-time`)
    ])
      .then(([groupRes, ovRes, flowRes, velRes, actRes, contribRes, cycleRes]) => {
        setGroup(groupRes.data);
        setOverview(ovRes.data);
        setFlow(flowRes.data);
        setVelocity(velRes.data);
        setActivity(actRes.data);
        setContributors(contribRes.data);
        setCycleTime(cycleRes.data);
      })
      .catch(() => setError('Не удалось загрузить аналитику'))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) {
    return (
      <div className="page-content">
        <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)' }}>
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <SkeletonBar width={140} height={30} />
            <div style={{ height: 8 }} />
            <SkeletonBar width={200} height={14} />
          </div>
          <div className="analytics-cards">
            {[1, 2, 3, 4, 5].map(i => <SkeletonAnalyticsCard key={i} />)}
          </div>
          <div className="analytics-section">
            <SkeletonBar width="40%" height={20} />
            <div style={{ height: 16 }} />
            <SkeletonBar width="100%" height={280} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !overview || !group) {
    return (
      <div className="page-content">
        <div className="container" style={{ paddingTop: 'var(--space-xl)' }}>
          <div className="empty-state">
            <div className="empty-state__icon">⚠️</div>
            <div className="empty-state__title">{error || 'Ошибка'}</div>
          </div>
        </div>
      </div>
    );
  }

  const statusPie = [
    { name: STATUS_LABELS.todo, value: overview.by_status.todo, color: COLORS.todo },
    { name: STATUS_LABELS.in_progress, value: overview.by_status.in_progress, color: COLORS.in_progress },
    { name: STATUS_LABELS.done, value: overview.by_status.done, color: COLORS.done }
  ].filter(d => d.value > 0);

  const priorityPie = [
    { name: PRIORITY_LABELS.low, value: overview.by_priority.low, color: COLORS.low },
    { name: PRIORITY_LABELS.medium, value: overview.by_priority.medium, color: COLORS.medium },
    { name: PRIORITY_LABELS.high, value: overview.by_priority.high, color: COLORS.high },
    { name: PRIORITY_LABELS.critical, value: overview.by_priority.critical, color: COLORS.critical }
  ].filter(d => d.value > 0);

  const flowChartData = flow.map(p => ({
    date: formatShortDate(p.date),
    [STATUS_LABELS.todo]: p.todo,
    [STATUS_LABELS.in_progress]: p.in_progress,
    [STATUS_LABELS.done]: p.done
  }));

  return (
    <div className="page-content">
      <div className="container" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-3xl)' }}>
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/groups/${groupId}`)}
            style={{ padding: '4px 8px', gap: 4, marginBottom: 8 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Назад к группе
          </button>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Аналитика
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>{group.name}</p>
        </div>

        {/* Overview cards */}
        <div className="analytics-cards">
          <div className="analytics-card">
            <div className="analytics-card__icon analytics-card__icon--accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
              </svg>
            </div>
            <div className="analytics-card__label">Всего задач</div>
            <div className="analytics-card__value">{overview.total}</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-card__icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: COLORS.done }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="analytics-card__label">Закрыто за неделю</div>
            <div className="analytics-card__value" style={{ color: COLORS.done }}>
              {overview.completed_week}
            </div>
          </div>
          <div className="analytics-card">
            <div className="analytics-card__icon" style={{ background: 'rgba(37, 99, 235, 0.12)', color: COLORS.in_progress }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <div className="analytics-card__label">Создано за неделю</div>
            <div className="analytics-card__value" style={{ color: COLORS.in_progress }}>
              {overview.created_week}
            </div>
          </div>
          <div className="analytics-card">
            <div className="analytics-card__icon analytics-card__icon--accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <div className="analytics-card__label">Прогресс</div>
            <div className="analytics-card__value">{overview.completion_rate}%</div>
          </div>
          <div className="analytics-card">
            <div className="analytics-card__icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--role-leader)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="analytics-card__label">Участников</div>
            <div className="analytics-card__value">{overview.member_count}</div>
          </div>
        </div>

        {/* Cumulative Flow */}
        <div className="analytics-section">
          <h3 className="analytics-section__title">Кумулятивный поток (Cumulative Flow)</h3>
          <p className="analytics-section__hint">
            Распределение задач по статусам за последние 30 дней
          </p>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <AreaChart data={flowChartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text)'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey={STATUS_LABELS.todo} stackId="1" stroke={COLORS.todo} fill={COLORS.todo} fillOpacity={0.7} />
                <Area type="monotone" dataKey={STATUS_LABELS.in_progress} stackId="1" stroke={COLORS.in_progress} fill={COLORS.in_progress} fillOpacity={0.7} />
                <Area type="monotone" dataKey={STATUS_LABELS.done} stackId="1" stroke={COLORS.done} fill={COLORS.done} fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Two-column row: status pie + priority pie */}
        <div className="analytics-row">
          <div className="analytics-section">
            <h3 className="analytics-section__title">По статусам</h3>
            <div style={{ width: '100%', height: 260 }}>
              {statusPie.length === 0 ? (
                <div className="empty-state" style={{ height: '100%' }}>
                  <div className="empty-state__title">Нет данных</div>
                </div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={statusPie}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={90}
                      dataKey="value"
                      label={(entry) => `${entry.value}`}
                    >
                      {statusPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="analytics-section">
            <h3 className="analytics-section__title">По приоритетам</h3>
            <div style={{ width: '100%', height: 260 }}>
              {priorityPie.length === 0 ? (
                <div className="empty-state" style={{ height: '100%' }}>
                  <div className="empty-state__title">Нет данных</div>
                </div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={priorityPie}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={90}
                      dataKey="value"
                      label={(entry) => `${entry.value}`}
                    >
                      {priorityPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Velocity */}
        <div className="analytics-section">
          <h3 className="analytics-section__title">Velocity (закрыто задач по неделям)</h3>
          <p className="analytics-section__hint">Последние 8 недель</p>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={velocity} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8
                  }}
                  formatter={(value) => [value, 'Задач закрыто']}
                />
                <Bar dataKey="completed" fill={COLORS.done} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cycle time */}
        {cycleTime && (
          <div className="analytics-section">
            <h3 className="analytics-section__title">Среднее время в статусах</h3>
            <p className="analytics-section__hint">
              Сколько в среднем задача находится в каждом этапе
            </p>
            <div className="analytics-cycle">
              <div className="analytics-cycle__item">
                <div className="analytics-cycle__label" style={{ color: COLORS.todo }}>К выполнению</div>
                <div className="analytics-cycle__value">{formatHours(cycleTime.todo)}</div>
              </div>
              <div className="analytics-cycle__arrow">→</div>
              <div className="analytics-cycle__item">
                <div className="analytics-cycle__label" style={{ color: COLORS.in_progress }}>В работе</div>
                <div className="analytics-cycle__value">{formatHours(cycleTime.in_progress)}</div>
              </div>
              <div className="analytics-cycle__arrow">→</div>
              <div className="analytics-cycle__item analytics-cycle__item--highlight">
                <div className="analytics-cycle__label">Полный цикл</div>
                <div className="analytics-cycle__value">{formatHours(cycleTime.total_to_done)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Activity Heatmap */}
        <div className="analytics-section">
          <h3 className="analytics-section__title">Карта активности</h3>
          <p className="analytics-section__hint">
            Задачи, изменения статуса и комментарии за последние 12 недель
          </p>
          <ActivityHeatmap data={activity} />
        </div>

        {/* Contributors */}
        <div className="analytics-section">
          <h3 className="analytics-section__title">Вклад участников</h3>
          {contributors.length === 0 ? (
            <div className="empty-state"><div className="empty-state__title">Нет данных</div></div>
          ) : (
            <div className="analytics-contrib-list">
              {contributors.map((c, i) => {
                const total = c.completed + c.open;
                const completionPct = total > 0 ? Math.round((c.completed / total) * 100) : 0;
                return (
                  <div key={c.id} className="analytics-contrib-row">
                    <div className="analytics-contrib-rank">#{i + 1}</div>
                    <Avatar src={c.avatar_url} name={c.display_name || c.username} size={36} />
                    <div className="analytics-contrib-info">
                      <div className="analytics-contrib-name">{c.display_name || c.username}</div>
                      <div className="analytics-contrib-stats">
                        <span style={{ color: COLORS.done }}>✓ {c.completed} закрыто</span>
                        <span style={{ color: COLORS.in_progress }}>● {c.open} открыто</span>
                        <span style={{ color: 'var(--text-muted)' }}>+ {c.created} создал</span>
                      </div>
                    </div>
                    <div className="analytics-contrib-bar">
                      <div
                        className="analytics-contrib-bar__fill"
                        style={{ width: `${completionPct}%` }}
                      />
                      <span className="analytics-contrib-bar__label">{completionPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
