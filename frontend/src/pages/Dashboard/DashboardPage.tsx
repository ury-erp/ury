import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import {
  BaselineStats,
  DailyPnlSummary,
  DashboardStats,
  NeedsAttentionItem,
  PlanStatus,
  ShiftMetrics,
  uryDashboardService,
} from '../../services/dashboard';

const getToday = () => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

const formatHeaderDate = (isoDate: string) => {
  const date = new Date(`${isoDate}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
};

const buildSummaryLine = (items: NeedsAttentionItem[]): string => {
  if (items.length === 0) {
    return 'All clear — no issues need attention.';
  }

  const clauses: string[] = [];

  const tableOccupiedItems = items.filter((item) => item.type === 'table_occupied_long');
  if (tableOccupiedItems.length > 0) {
    const count = tableOccupiedItems.length;
    clauses.push(`${count} table${count === 1 ? '' : 's'} past 60 min`);
  }

  const kotErrorItems = items.filter((item) => item.type === 'kot_errors');
  if (kotErrorItems.length > 0) {
    const count = kotErrorItems.length;
    const minutesMatch = kotErrorItems[0]?.message?.match(/(\d+)\s*min/i);
    const minutesAgo = minutesMatch ? minutesMatch[1] : null;
    clauses.push(
      minutesAgo
        ? `${count} KOT error${count === 1 ? '' : 's'}, ${minutesAgo} min ago`
        : `${count} KOT error${count === 1 ? '' : 's'}`,
    );
  }

  const unclosedSessionItems = items.filter((item) => item.type === 'unclosed_pos_session');
  if (unclosedSessionItems.length > 0) {
    clauses.push("Yesterday's session still open");
  }

  const pendingPaymentItems = items.filter((item) => item.type === 'pending_payment');
  if (pendingPaymentItems.length > 0) {
    const count = pendingPaymentItems.length;
    clauses.push(`${count} pending payment${count === 1 ? '' : 's'}`);
  }

  return clauses.length > 0 ? clauses.join(' · ') : 'All clear — no issues need attention.';
};

const formatCurrency = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

const getDailyPnlNetProfit = (pnl: DailyPnlSummary | null): number | undefined => {
  return pnl?.summary?.find((row) => row.key === 'net_profit')?.amount;
};

const formatVsBaseline = (todaysSales: number | undefined, medianSales: number | undefined): string => {
  if (!medianSales || !Number.isFinite(medianSales) || medianSales <= 0 || todaysSales === undefined) {
    return '—';
  }
  const pct = ((todaysSales - medianSales) / medianSales) * 100;
  if (!Number.isFinite(pct)) return '—';
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
};

// Maps a needs-attention item to where the user should go to act on it.
// Some targets live in this app (react-router `to`), others live in a
// sibling SPA (`pos`) that we can only reach via a full page href since
// there is no shared router between apps.
interface AttentionLinkTarget {
  kind: 'internal' | 'external';
  to: string;
  label: string;
  note?: string;
}

const getAttentionLinkTarget = (item: NeedsAttentionItem): AttentionLinkTarget | null => {
  switch (item.type) {
    case 'kot_errors':
      return { kind: 'internal', to: '/kot-error-log', label: 'View KOT error log' };
    case 'table_occupied_long':
      return {
        kind: 'internal',
        to: '/table',
        label: 'View tables',
        note: 'Opens table setup — a per-table live view is not available yet.',
      };
    case 'unclosed_pos_session':
      return { kind: 'external', to: '/pos/open-entries', label: 'View open POS sessions' };
    case 'pending_payment':
      return {
        kind: 'external',
        to: '/pos/open-entries',
        label: 'View POS sessions',
        note: 'A dedicated pending-payments view is not available yet — this opens open POS sessions.',
      };
    default:
      return null;
  }
};

const referenceCountLabel = (item: NeedsAttentionItem): string | null => {
  const count = item.reference?.names?.length;
  if (!count) return null;
  return `${count} record${count === 1 ? '' : 's'}`;
};

export const DashboardPage: React.FC = () => {
  const { activeBranchId, refreshTrigger } = useBranchContext();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionItem[]>([]);
  const [baseline, setBaseline] = useState<BaselineStats | null>(null);
  const [shiftMetrics, setShiftMetrics] = useState<ShiftMetrics | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [dailyPnl, setDailyPnl] = useState<DailyPnlSummary | null>(null);
  const [cancelledCount, setCancelledCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const today = getToday();

  useEffect(() => {
    if (!activeBranchId || activeBranchId === 'all') {
      // Service Board is inherently branch-scoped -- there is no meaningful
      // "all branches" view for a single shift's operational status. Fail
      // closed with a clear, actionable message instead of calling the API.
      setStats(null);
      setNeedsAttention([]);
      setBaseline(null);
      setShiftMetrics(null);
      setPlanStatus(null);
      setDailyPnl(null);
      setCancelledCount(0);
      setError('Select a specific branch above to view its Service Board.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [statsRes, attentionRes, baselineRes, shiftRes, planRes, pnlRes, cancelledRes] = await Promise.all([
          uryDashboardService.getDashboardStats(activeBranchId),
          uryDashboardService.getNeedsAttention(activeBranchId),
          uryDashboardService.getBaseline(activeBranchId),
          uryDashboardService.getShiftMetrics(activeBranchId),
          uryDashboardService.getPlanStatus(activeBranchId, today),
          // Daily P&L is manager-gated on the backend (report_api.require_manager)
          // and cancelled-invoices count is a minor extra -- neither should break
          // the core Service Board for a non-manager viewer or a transient error.
          uryDashboardService.getDailyPnlSummary(activeBranchId, today).catch(() => null),
          uryDashboardService.getCancelledInvoicesCount(activeBranchId).catch(() => 0),
        ]);
        if (cancelled) return;
        setStats(statsRes);
        setNeedsAttention(attentionRes);
        setBaseline(baselineRes);
        setShiftMetrics(shiftRes);
        setPlanStatus(planRes);
        setDailyPnl(pnlRes);
        setCancelledCount(cancelledRes);
      } catch (err) {
        console.error('Failed to load Service Board data:', err);
        if (!cancelled) {
          setError('Unable to load the Service Board for this branch.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, refreshTrigger, today]);

  const vsBaseline = formatVsBaseline(shiftMetrics?.sales ?? stats?.todays_sales, baseline?.median_sales);
  const planStatusLabel = planStatus?.status || 'No plan';
  const todaysSalesLabel = formatCurrency(stats?.todays_sales);
  const dailyPnlNetProfit = getDailyPnlNetProfit(dailyPnl);
  const dailyPnlStatusLabel = dailyPnl?.exists ? formatCurrency(dailyPnlNetProfit) : 'Not yet generated';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Service Board — {formatHeaderDate(today)}</h1>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center p-10">
          <Spinner />
        </Card>
      ) : error ? (
        <Card className="border-destructive bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
      ) : (
        <>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">{buildSummaryLine(needsAttention)}</p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-xs font-medium text-text-tertiary">Today's Sales</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{todaysSalesLabel}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-text-tertiary">Daily P&amp;L</p>
                {cancelledCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {cancelledCount} cancelled
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-2xl font-semibold text-foreground">{dailyPnlStatusLabel}</p>
              <Link
                to="/reports/daily-pnl"
                className="mt-1 inline-block text-xs font-medium text-primary hover:text-primary hover:underline"
              >
                View Daily P&amp;L report
              </Link>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-xs font-medium text-text-tertiary">Vs. Baseline</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{vsBaseline}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-text-tertiary">Plan Status</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{planStatusLabel}</p>
            </Card>
          </div>

          <Card className="p-4">
            <p className="text-sm font-medium text-muted-foreground">Needs Attention</p>
            {needsAttention.length === 0 ? (
              <p className="mt-2 text-sm text-text-tertiary">
                No issues right now — service is running smoothly.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {needsAttention.map((item, index) => {
                  const target = getAttentionLinkTarget(item);
                  const countLabel = referenceCountLabel(item);
                  return (
                    <li
                      key={`${item.type}-${index}`}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm text-foreground">
                          {item.message}
                          {countLabel ? <span className="text-text-tertiary"> · {countLabel}</span> : null}
                        </p>
                        {target?.note ? <p className="mt-0.5 text-xs text-text-tertiary">{target.note}</p> : null}
                      </div>
                      {target ? (
                        target.kind === 'internal' ? (
                          <Link
                            to={target.to}
                            className="text-sm font-medium text-primary hover:text-primary hover:underline"
                          >
                            {target.label}
                          </Link>
                        ) : (
                          <a
                            href={target.to}
                            className="text-sm font-medium text-primary hover:text-primary hover:underline"
                          >
                            {target.label}
                          </a>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
