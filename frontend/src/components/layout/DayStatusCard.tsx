import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { uryDashboardService, type NeedsAttentionItem, type PlanStatus } from '../../services/dashboard';

type PhaseKey = 'Plan' | 'Issue' | 'Prep' | 'Service' | 'Count' | 'Close';

const PHASES: PhaseKey[] = ['Plan', 'Issue', 'Prep', 'Service', 'Count', 'Close'];

/**
 * Maps a sales-plan status string to how much of the day-phase strip should
 * read as "done" vs "current". Until the backend exposes a real phase field,
 * this is a best-effort approximation driven by `PlanStatus.status` alone —
 * it intentionally stays conservative (defaults to "Plan" as current) rather
 * than fabricating a phase we can't support with real data.
 */
const resolveCurrentPhaseIndex = (status: string | null): number => {
  if (!status) return 0;
  const normalized = status.toLowerCase();
  if (normalized.includes('close')) return 5;
  if (normalized.includes('count')) return 4;
  if (normalized.includes('service') || normalized.includes('open')) return 3;
  if (normalized.includes('prep')) return 2;
  if (normalized.includes('issue')) return 1;
  return 0;
};

const getToday = (): string => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

const formatCardDate = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

interface PhaseSegmentProps {
  label: PhaseKey;
  state: 'done' | 'current' | 'upcoming';
}

const PhaseSegment: React.FC<PhaseSegmentProps> = ({ label, state }) => (
  <span
    title={label}
    className={`h-[3px] flex-1 rounded-sm ${
      state === 'done' ? 'bg-success-500' : state === 'current' ? 'bg-primary' : 'bg-gray-200'
    }`}
  />
);

interface DayStatusCardProps {
  /** Renders a compact phase-strip-only version for the icon-only sidebar. */
  isCollapsed?: boolean;
}

export const DayStatusCard: React.FC<DayStatusCardProps> = ({ isCollapsed = false }) => {
  const { activeBranchId } = useBranchContext();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionItem[]>([]);

  const today = getToday();

  useEffect(() => {
    if (!activeBranchId) {
      setLoading(false);
      setError(false);
      setPlanStatus(null);
      setNeedsAttention([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    Promise.all([
      uryDashboardService.getPlanStatus(activeBranchId, today),
      uryDashboardService.getNeedsAttention(activeBranchId),
    ])
      .then(([status, attention]) => {
        if (cancelled) return;
        setPlanStatus(status);
        setNeedsAttention(attention);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, today]);

  const currentPhaseIndex = resolveCurrentPhaseIndex(planStatus?.status ?? null);
  const attentionCount = needsAttention.length;

  if (isCollapsed) {
    return (
      <div
        title={loading ? 'Loading…' : error ? 'Status unavailable' : planStatus?.status ?? 'No plan yet'}
        className="mx-2 mt-0.5 mb-2.5 p-1.5 rounded-lg border border-gray-200 bg-white flex flex-col items-center gap-1.5"
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
            loading ? 'bg-gray-300' : error ? 'bg-destructive' : 'bg-success-500'
          }`}
        />
        <div className="flex flex-col gap-[3px] w-full">
          {PHASES.map((phase, index) => (
            <PhaseSegment
              key={phase}
              label={phase}
              state={index < currentPhaseIndex ? 'done' : index === currentPhaseIndex ? 'current' : 'upcoming'}
            />
          ))}
        </div>
        {!loading && attentionCount > 0 && (
          <Badge variant="warning" size="sm" className="h-4 px-1 text-[9px]">
            {attentionCount}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="mx-2.5 mt-0.5 mb-2.5 p-2.5 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-semibold text-gray-900">{formatCardDate(today)}</span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-gray-500">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              loading ? 'bg-gray-300' : error ? 'bg-destructive' : 'bg-success-500'
            }`}
          />
          {loading ? 'Loading…' : error ? 'Status unavailable' : planStatus?.status ?? 'No plan yet'}
        </span>
      </div>

      <div className="flex gap-[3px] my-2">
        {PHASES.map((phase, index) => (
          <PhaseSegment
            key={phase}
            label={phase}
            state={index < currentPhaseIndex ? 'done' : index === currentPhaseIndex ? 'current' : 'upcoming'}
          />
        ))}
      </div>

      <div className="flex items-center text-[11px] text-gray-500">
        {loading ? (
          <span className="text-gray-400">Loading…</span>
        ) : (
          <>
            <Badge variant={attentionCount > 0 ? 'warning' : 'success'} size="sm">
              {attentionCount}
            </Badge>
            <span className="ml-1.5">need attention</span>
            <Link to="/dashboard" className="ml-auto text-primary font-medium hover:underline">
              Open →
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default DayStatusCard;
