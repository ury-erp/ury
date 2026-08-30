import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, KpiStrip, cn } from '@ury/ui';
import { useState, useEffect } from 'react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency } from '@ury/core';
import { getOpenPosOpeningEntries, type OpenPosOpeningEntry } from '../lib/pos-closing-api';

// Helper function to format relative time
function getRelativeTime(creationDate: string): string {
  const now = new Date();
  const date = new Date(creationDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// Helper to format ETA minutes into readable time
function formatETA(minutes: number | null): string {
  if (minutes === null) return 'Holds';
  if (minutes <= 90) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `~${hours} hr ${mins > 0 ? `${mins} min` : ''}`.trim();
}

// Helper to format date for open sessions display
function formatOpenSessionDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);

    if (diffHours === 0) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ${diffMins}m ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

/**
 * One table moves through five stages during service, and the same five colours
 * have to read identically in the legend, in the bars and in the summary line.
 * Declaring them once — on the token ramps rather than raw palette classes —
 * is what lets a cashier learn the colour language on this screen and carry it
 * to the Tables screen.
 */
type StageKey = 'open' | 'seated' | 'fired' | 'served' | 'over';

const STAGES: { key: StageKey; label: string; bar: string; chip: string; dot: string }[] = [
  { key: 'open', label: 'Open', bar: 'bg-muted-foreground', chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  { key: 'seated', label: 'Seated', bar: 'bg-primary-200', chip: 'bg-primary-50 text-primary-700', dot: 'bg-primary-200' },
  { key: 'fired', label: 'Fired', bar: 'bg-primary-400', chip: 'bg-primary-100 text-primary-800', dot: 'bg-primary-400' },
  { key: 'served', label: 'Served', bar: 'bg-primary-700', chip: 'bg-primary-200 text-primary-900', dot: 'bg-primary-700' },
  { key: 'over', label: 'Over time', bar: 'bg-destructive', chip: 'bg-destructive-tint text-destructive', dot: 'bg-destructive' },
];

const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<StageKey, (typeof STAGES)[number]>;

/**
 * Every panel on this page is the same object: a title, optional trailing
 * meta, then body. Hand-rolling that header nine times is what made the old
 * page read as nine unrelated boxes. Matches the `.panel`/`.sect` spec: a
 * flat hairline border, no shadow, dense padding, and a plain-text header
 * with no decorative icon tile.
 */
function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card variant="ghost" padding="none" className={cn('rounded-[9px] border border-hair bg-card', className)}>
      <CardContent className="p-[14px_16px]">
        <div className="mb-[9px] flex items-center justify-between gap-3">
          <h2 className="text-[12.5px] font-semibold text-foreground">{title}</h2>
          {meta ? <div className="ml-auto text-[11.5px] text-text-tertiary">{meta}</div> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function PanelState({ kind, children }: { kind: 'loading' | 'error' | 'empty'; children: React.ReactNode }) {
  return (
    <p className={cn('text-sm', kind === 'error' ? 'text-destructive' : 'text-text-tertiary')}>{children}</p>
  );
}

export default function Dashboard() {
  const { posProfile } = usePOSStore();
  const [stats, setStats] = useState<any[]>([]);
  const [serviceLine, setServiceLine] = useState<any[]>([]);
  const [shiftMetrics, setShiftMetrics] = useState<any>(null);
  const [baseline, setBaseline] = useState<any>(null);
  const [floorLoad, setFloorLoad] = useState<any[]>([]);
  const [runningLow, setRunningLow] = useState<any[]>([]);
  const [needsAttention, setNeedsAttention] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [openEntries, setOpenEntries] = useState<OpenPosOpeningEntry[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [serviceLineLoading, setServiceLineLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [floorLoadLoading, setFloorLoadLoading] = useState(false);
  const [runningLowLoading, setRunningLowLoading] = useState(false);
  const [needsAttentionLoading, setNeedsAttentionLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [openEntriesLoading, setOpenEntriesLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [serviceLineError, setServiceLineError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [floorLoadError, setFloorLoadError] = useState<string | null>(null);
  const [runningLowError, setRunningLowError] = useState<string | null>(null);
  const [needsAttentionError, setNeedsAttentionError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [openEntriesError, setOpenEntriesError] = useState<string | null>(null);

  useEffect(() => {
    if (!posProfile?.branch) return;

    const fetchDashboardData = async () => {
      const { call } = await import('@ury/core');

      // Fetch dashboard stats
      setStatsLoading(true);
      setStatsError(null);
      try {
        const statsRes = await call.get('ury.ury.api.ury_dashboard.get_dashboard_stats', {
          branch: posProfile.branch
        });
        const statsData = statsRes.message;
        const occupancy = statsData.total_tables
          ? statsData.active_tables / statsData.total_tables
          : 0;
        setStats([
          {
            label: "Today's Sales",
            value: formatCurrency(statsData.todays_sales),
            tone: 'success'
          },
          {
            label: 'Orders Today',
            value: String(statsData.orders_today)
          },
          {
            label: 'Avg. Order Value',
            value: formatCurrency(statsData.avg_order_value)
          },
          {
            label: 'Active Tables',
            value: `${statsData.active_tables} / ${statsData.total_tables}`,
            // A near-full floor is the one stat on this row that is actionable,
            // so it earns warning tone only when it actually matters.
            tone: occupancy >= 0.85 ? 'warning' : undefined,
            hint: occupancy >= 0.85 ? 'Floor nearly full' : undefined
          }
        ]);
      } catch (err) {
        setStatsError('Failed to load stats');
        console.error('Error fetching stats:', err);
      } finally {
        setStatsLoading(false);
      }

      // Fetch service line
      setServiceLineLoading(true);
      setServiceLineError(null);
      try {
        const serviceRes = await call.get('ury.ury.api.ury_service_line.get_service_line', {
          branch: posProfile.branch
        });
        const serviceData = Array.isArray(serviceRes.message) ? serviceRes.message : [];
        setServiceLine(serviceData);
      } catch (err) {
        setServiceLineError('Failed to load service line');
        console.error('Error fetching service line:', err);
      } finally {
        setServiceLineLoading(false);
      }

      // Fetch shift metrics and baseline
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const metricsRes = await call.get('ury.ury.api.ury_dashboard.get_shift_metrics', {
          branch: posProfile.branch
        });
        setShiftMetrics(metricsRes.message);

        const baselineRes = await call.get('ury.ury.api.ury_dashboard.get_baseline', {
          branch: posProfile.branch
        });
        setBaseline(baselineRes.message);
      } catch (err) {
        setMetricsError('Failed to load metrics');
        console.error('Error fetching metrics:', err);
      } finally {
        setMetricsLoading(false);
      }

      // Fetch floor load
      setFloorLoadLoading(true);
      setFloorLoadError(null);
      try {
        const floorRes = await call.get('ury.ury.api.ury_dashboard.get_floor_load', {
          branch: posProfile.branch
        });
        const floorData = Array.isArray(floorRes.message) ? floorRes.message : [];
        setFloorLoad(floorData);
      } catch (err) {
        setFloorLoadError('Failed to load floor load');
        console.error('Error fetching floor load:', err);
      } finally {
        setFloorLoadLoading(false);
      }

      // Fetch running low items
      setRunningLowLoading(true);
      setRunningLowError(null);
      try {
        const runningRes = await call.get('ury.ury.api.ury_service_line.get_running_low', {
          branch: posProfile.branch
        });
        const runningData = Array.isArray(runningRes.message) ? runningRes.message : [];
        setRunningLow(runningData);
      } catch (err) {
        setRunningLowError('Failed to load running low items');
        console.error('Error fetching running low:', err);
      } finally {
        setRunningLowLoading(false);
      }

      // Fetch needs attention
      setNeedsAttentionLoading(true);
      setNeedsAttentionError(null);
      try {
        const attentionRes = await call.get('ury.ury.api.ury_dashboard.get_needs_attention', {
          branch: posProfile.branch
        });
        const attentionData = attentionRes.message;
        if (Array.isArray(attentionData) && attentionData.length > 0) {
          const processedAttention = attentionData.map((item, idx) => ({
            id: idx,
            message: item.message,
            icon: item.severity === 'high' ? AlertTriangle : Clock,
            severity: item.severity
          }));
          setNeedsAttention(processedAttention);
        } else {
          setNeedsAttention([]);
        }
      } catch (err) {
        setNeedsAttentionError('Failed to load needs attention');
        console.error('Error fetching needs attention:', err);
      } finally {
        setNeedsAttentionLoading(false);
      }

      // Fetch recent notifications
      setNotificationsLoading(true);
      setNotificationsError(null);
      try {
        const params = new URLSearchParams({
          doctype: 'Notification Log',
          fields: JSON.stringify(['name', 'subject', 'creation']),
          order_by: 'creation desc',
          limit_page_length: '10'
        });
        const notificationsRes = await fetch(
          `/api/method/frappe.client.get_list?${params.toString()}`
        );
        if (!notificationsRes.ok) throw new Error('Failed to fetch notifications');
        const notificationsData = await notificationsRes.json();
        const processedNotifications = (notificationsData.message || []).map((notif: any) => ({
          id: notif.name,
          message: notif.subject,
          timestamp: getRelativeTime(notif.creation)
        }));
        setNotifications(processedNotifications);
      } catch (err) {
        setNotificationsError('Failed to load notifications');
        console.error('Error fetching notifications:', err);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchDashboardData();
  }, [posProfile?.branch]);

  // Fetch open sessions
  useEffect(() => {
    if (!posProfile?.name) return;

    const fetchOpenEntries = async () => {
      setOpenEntriesLoading(true);
      setOpenEntriesError(null);
      try {
        const data = await getOpenPosOpeningEntries(posProfile.name);
        setOpenEntries(data);
      } catch (err) {
        setOpenEntriesError('Failed to load open sessions');
        console.error('Error fetching open entries:', err);
      } finally {
        setOpenEntriesLoading(false);
      }
    };

    fetchOpenEntries();
  }, [posProfile?.name]);

  // Calculate max minutes for service line bar height
  const maxMinutes = Math.max(90, ...serviceLine.filter(t => t.minutes !== null).map((t: any) => t.minutes), 1);
  const maxTableCount = Math.max(...floorLoad.map((f: any) => f.table_count), 1);

  const stageCounts = STAGES.map((stage) => ({
    ...stage,
    count: serviceLine.filter((t: any) => t.stage === stage.key).length,
  }));
  const overCount = stageCounts.find((s) => s.key === 'over')?.count ?? 0;

  const hasHighSeverity = needsAttention.some((item) => item.severity === 'high');
  const attentionResolved = !needsAttentionLoading && !needsAttentionError && needsAttention.length === 0;

  return (
    <div className="h-full overflow-y-auto bg-muted">
      <div className="mx-auto max-w-screen-2xl p-6 space-y-5">
        {/* Page header — states where you are and that the numbers are live. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Shift Overview</h1>
            <p className="mt-0.5 text-sm text-text-tertiary">
              {posProfile?.branch ? `${posProfile.branch} · ` : ''}Live floor status for the current shift
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-success-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success-600" />
            </span>
            Live
          </span>
        </div>

        {/*
          Attention comes first and full-width. The old page buried this in the
          left column below three neutral panels, which meant the one thing a
          cashier must act on had the same visual weight as a copy of yesterday's
          median cover count.
        */}
        {needsAttentionError ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-destructive">
            Failed to load attention items
          </div>
        ) : needsAttentionLoading ? null : attentionResolved ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-success-200 bg-success-50 px-4 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
            <p className="text-sm font-medium text-success-800">All clear — nothing needs attention right now.</p>
          </div>
        ) : (
          <div
            className={cn(
              'overflow-hidden rounded-xl border-l-4 shadow-sm',
              hasHighSeverity
                ? 'border-l-destructive bg-destructive-tint ring-1 ring-destructive-tint-border'
                : 'border-l-warning-400 bg-warning-50 ring-1 ring-warning-200'
            )}
          >
            <div className="flex items-start gap-3 p-4">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  hasHighSeverity ? 'bg-destructive text-white' : 'bg-warning-400 text-warning-foreground'
                )}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2
                    className={cn(
                      'text-sm font-semibold',
                      hasHighSeverity ? 'text-destructive' : 'text-warning-900'
                    )}
                  >
                    Needs Attention
                  </h2>
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 font-mono text-xs font-bold tabular-nums',
                      hasHighSeverity ? 'bg-destructive text-white' : 'bg-warning-400 text-warning-foreground'
                    )}
                  >
                    {needsAttention.length}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {needsAttention.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <li key={item.id} className="flex items-center gap-2.5">
                        <ItemIcon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            item.severity === 'high' ? 'text-destructive' : 'text-warning-600'
                          )}
                        />
                        <p
                          className={cn(
                            'text-sm',
                            item.severity === 'high' ? 'font-medium text-destructive' : 'text-warning-900'
                          )}
                        >
                          {item.message}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Stat strip */}
        {statsError ? (
          <div className="text-sm text-destructive">Failed to load stats</div>
        ) : statsLoading ? (
          <div className="h-20 animate-pulse rounded-lg border border-border bg-card" />
        ) : (
          <KpiStrip items={stats} />
        )}

        {/* Service Line — the operational heart of the screen. */}
        <Panel
          title="Service Line"
          meta={
            overCount > 0 ? (
              <span className="inline-flex h-[19px] items-center gap-[5px] rounded-[5px] bg-destructive-tint px-[7px] text-[11px] font-semibold text-destructive">
                <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" />
                <span className="font-mono tabular-nums">{overCount}</span> over time
              </span>
            ) : serviceLine.length > 0 ? (
              `${serviceLine.length} tables tracked`
            ) : undefined
          }
        >
          {serviceLineError ? (
            <PanelState kind="error">Failed to load service line</PanelState>
          ) : serviceLineLoading ? (
            <PanelState kind="loading">Loading…</PanelState>
          ) : serviceLine.length === 0 ? (
            <PanelState kind="empty">No tables currently seated.</PanelState>
          ) : (
            <div>
              {/*
                Legend chips, not 12px dots. Each stage carries its live count,
                so the legend doubles as the shift summary and a cashier reads
                "4 fired, 1 over" without decoding a bar chart.
              */}
              <div className="mb-[14px] flex flex-wrap gap-1.5">
                {stageCounts.map((stage) => (
                  <span
                    key={stage.key}
                    className={cn(
                      'inline-flex h-[19px] items-center gap-[5px] rounded-[5px] px-[7px] text-[11px] font-medium',
                      stage.chip,
                      stage.count === 0 && 'opacity-45'
                    )}
                  >
                    <span className={cn('h-[5px] w-[5px] shrink-0 rounded-full', stage.dot)} />
                    {stage.label}
                    <span className="font-mono tabular-nums font-semibold">{stage.count}</span>
                  </span>
                ))}
              </div>

              {/* Bars */}
              <div className="flex items-end gap-2 overflow-x-auto border-b border-hair pb-3">
                {serviceLine.map((table: any, idx: number) => {
                  const stage = STAGE_BY_KEY[table.stage as StageKey] ?? STAGE_BY_KEY.open;
                  const isOver = table.stage === 'over';
                  const barHeight = table.minutes !== null ? (table.minutes / maxMinutes) * 100 : 5;

                  return (
                    <div
                      key={idx}
                      className="flex w-11 shrink-0 flex-col items-center"
                      title={`${table.table} · ${stage.label}${table.minutes !== null ? ` · ${table.minutes} min` : ''}`}
                    >
                      <span
                        className={cn(
                          'mb-1 h-4 font-mono text-[11px] tabular-nums',
                          isOver ? 'text-destructive' : 'text-text-tertiary'
                        )}
                      >
                        {table.minutes !== null ? table.minutes : ''}
                      </span>
                      <div className="flex h-28 w-full items-end justify-center rounded-md bg-hair p-1">
                        <div
                          className={cn(
                            'w-full rounded-sm transition-all duration-200 ease-out',
                            stage.bar,
                            isOver && 'ring-2 ring-destructive/25'
                          )}
                          style={{ height: `${barHeight}%`, minHeight: '6px' }}
                        />
                      </div>
                      <span
                        className={cn(
                          'mt-1.5 w-full truncate rounded px-1 py-0.5 text-center text-[11px] font-medium',
                          isOver ? 'bg-destructive-tint text-destructive' : 'text-muted-foreground'
                        )}
                      >
                        {table.table}
                      </span>
                    </div>
                  );
                })}
              </div>

              {overCount > 0 && (
                <p className="mt-3 text-sm font-medium text-destructive">
                  {overCount} table{overCount !== 1 ? 's' : ''} running over time — check on them before the next fire.
                </p>
              )}
            </div>
          )}
        </Panel>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          {/* Left column */}
          <div className="space-y-5">
            <Panel
              title="Tonight vs Baseline"
              meta={baseline?.sample_days > 0 ? `${baseline.sample_days}-day median` : undefined}
            >
              {metricsError ? (
                <PanelState kind="error">Failed to load metrics</PanelState>
              ) : metricsLoading ? (
                <PanelState kind="loading">Loading…</PanelState>
              ) : !shiftMetrics || !baseline ? (
                <PanelState kind="empty">No data available</PanelState>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricTile
                    label="Sales"
                    value={formatCurrency(shiftMetrics.sales)}
                    delta={
                      baseline.sample_days > 0 && baseline.median_sales
                        ? {
                            up: shiftMetrics.sales >= baseline.median_sales,
                            text: `${shiftMetrics.sales >= baseline.median_sales ? '+' : ''}${(((shiftMetrics.sales - baseline.median_sales) / baseline.median_sales) * 100).toFixed(0)}%`,
                            against: formatCurrency(baseline.median_sales),
                          }
                        : undefined
                    }
                  />
                  <MetricTile
                    label="Covers"
                    value={String(shiftMetrics.covers)}
                    delta={
                      baseline.sample_days > 0
                        ? {
                            up: shiftMetrics.covers >= baseline.median_covers,
                            text: `${shiftMetrics.covers >= baseline.median_covers ? '+' : ''}${shiftMetrics.covers - baseline.median_covers}`,
                            against: String(baseline.median_covers),
                          }
                        : undefined
                    }
                  />
                  <MetricTile label="Avg per Cover" value={formatCurrency(shiftMetrics.avg_per_cover)} />
                  <MetricTile
                    label="Avg Ticket Time"
                    value={shiftMetrics.avg_ticket_minutes !== null ? `${shiftMetrics.avg_ticket_minutes} min` : '—'}
                  />
                </div>
              )}
            </Panel>

            <Panel title="Running Low">
              {runningLowError ? (
                <PanelState kind="error">Failed to load</PanelState>
              ) : runningLowLoading ? (
                <PanelState kind="loading">Loading…</PanelState>
              ) : runningLow.length === 0 ? (
                <PanelState kind="empty">No items selling fast enough to forecast yet.</PanelState>
              ) : (
                <div className="space-y-3.5">
                  {runningLow.map((item, idx) => {
                    const pct = Math.min((item.remaining / (item.remaining + item.qty_sold_today)) * 100, 100);
                    const critical = item.eta_minutes !== null && item.eta_minutes <= 60;
                    return (
                      <div key={idx}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{item.item_name}</span>
                          <span
                            className={cn(
                              'inline-flex h-[19px] shrink-0 items-center rounded-[5px] px-[7px] font-mono text-[11px] font-semibold tabular-nums',
                              critical
                                ? 'bg-destructive-tint text-destructive'
                                : 'bg-warning-50 text-warning-700'
                            )}
                          >
                            {formatETA(item.eta_minutes)}
                          </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-[3px] bg-hair">
                          <div
                            className={cn('h-full rounded-[3px]', critical ? 'bg-destructive' : 'bg-warning-400')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {item.data_quality_issue && (
                          <p className="mt-1 text-xs text-text-tertiary">(stock data needs review)</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Right rail */}
          <div className="space-y-5">
            <Panel title="Floor Load">
              {floorLoadError ? (
                <PanelState kind="error">Failed to load</PanelState>
              ) : floorLoadLoading ? (
                <PanelState kind="loading">Loading…</PanelState>
              ) : floorLoad.length === 0 ? (
                <PanelState kind="empty">No tables currently assigned.</PanelState>
              ) : (
                <div className="space-y-3">
                  {floorLoad.map((waiter, idx) => (
                    <div key={idx}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-muted-foreground">{waiter.waiter}</span>
                        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-text-tertiary">
                          {waiter.table_count}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-[3px] bg-hair">
                        <div
                          className="h-full rounded-[3px] bg-primary"
                          style={{ width: `${(waiter.table_count / maxTableCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Open Sessions"
              meta={openEntries.length > 0 ? `${openEntries.length} open` : undefined}
            >
              {openEntriesError ? (
                <PanelState kind="error">Failed to load</PanelState>
              ) : openEntriesLoading ? (
                <PanelState kind="loading">Loading…</PanelState>
              ) : openEntries.length === 0 ? (
                <PanelState kind="empty">No sessions left open.</PanelState>
              ) : (
                <div>
                  <div className="space-y-1.5">
                    {openEntries.slice(0, 5).map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-2"
                      >
                        <span className="truncate text-xs font-medium text-foreground">{entry.user}</span>
                        <span className="shrink-0 text-xs text-text-tertiary">
                          {formatOpenSessionDate(entry.period_start_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {openEntries.length > 5 && (
                    <p className="py-2 text-center text-xs text-text-tertiary">+{openEntries.length - 5} more</p>
                  )}
                  <a
                    href="/pos/open-entries"
                    className="mt-3 flex items-center justify-center gap-1 border-t border-border pt-2.5 text-xs font-semibold text-primary hover:text-primary-600"
                  >
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </Panel>

            <Panel
              title="Shift Brief"
              meta={
                <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary ring-1 ring-primary-200">
                  HUF
                </span>
              }
            >
              <p className="text-sm text-text-tertiary">
                AI-written shift summaries are not yet connected. This panel will show HUF's shift
                observations once integrated.
              </p>
            </Panel>

            <Panel title="Recent Notifications">
              {notificationsError ? (
                <PanelState kind="error">Failed to load</PanelState>
              ) : notificationsLoading ? (
                <PanelState kind="loading">Loading…</PanelState>
              ) : notifications.length === 0 ? (
                <PanelState kind="empty">No recent notifications.</PanelState>
              ) : (
                <div className="divide-y divide-hair">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                      <p className="text-xs leading-relaxed text-muted-foreground">{notification.message}</p>
                      <span className="shrink-0 whitespace-nowrap text-xs text-text-tertiary">
                        {notification.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { up: boolean; text: string; against: string };
}) {
  return (
    <div className="rounded-[9px] border border-hair bg-muted p-3">
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {delta ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-1 text-xs">
          <span
            className={cn(
              'font-mono font-semibold tabular-nums',
              delta.up ? 'text-success-600' : 'text-destructive'
            )}
          >
            {delta.up ? '▲' : '▼'} {delta.text}
          </span>
          <span className="text-text-tertiary">vs {delta.against}</span>
        </p>
      ) : null}
    </div>
  );
}
