import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '@ury/core';

/** One panel's async state. */
export interface Section<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

export interface StatsData {
  todays_sales: number;
  orders_today: number;
  avg_order_value: number;
  active_tables: number;
  total_tables: number;
}

export interface ServiceLineRow {
  table: string;
  stage: 'open' | 'seated' | 'fired' | 'served' | 'over';
  minutes: number | null;
}

export interface ShiftMetrics {
  sales: number;
  covers: number;
  avg_per_cover: number;
  avg_ticket_minutes: number | null;
}

export interface Baseline {
  sample_days: number;
  median_sales: number;
  median_covers: number;
}

export interface FloorLoadRow {
  waiter: string;
  table_count: number;
}

export interface RunningLowRow {
  item_name: string;
  remaining: number;
  qty_sold_today: number;
  eta_minutes: number | null;
  data_quality_issue?: boolean;
}

export interface AttentionRow {
  message: string;
  severity: 'high' | 'low' | string;
}

export interface NotificationRow {
  name: string;
  subject: string;
  creation: string;
}

export interface DashboardData {
  stats: Section<StatsData | null>;
  serviceLine: Section<ServiceLineRow[]>;
  metrics: Section<{ shift: ShiftMetrics | null; baseline: Baseline | null }>;
  floorLoad: Section<FloorLoadRow[]>;
  runningLow: Section<RunningLowRow[]>;
  attention: Section<AttentionRow[]>;
  notifications: Section<NotificationRow[]>;
  /** Timestamp of the last completed refresh, for the "updated" stamp. */
  lastUpdated: Date | null;
  refreshing: boolean;
  refresh: () => void;
}

const REFRESH_INTERVAL_MS = 60_000;

const idle = <T,>(data: T): Section<T> => ({ data, loading: true, error: null });

/**
 * Loads every dashboard panel for a branch.
 *
 * Two things this fixes over the previous inline version:
 *
 * 1. **The seven requests run in parallel.** They used to be sequential
 *    `await`s in one function, so the page took the *sum* of all seven
 *    round-trips to finish and each panel appeared one at a time. With
 *    `Promise.allSettled` the wait is the slowest single request, and one slow
 *    or failing endpoint no longer holds up the other six.
 *
 * 2. **Each panel owns its own error.** A rejected request fills in that
 *    panel's `error` and leaves the rest intact, instead of aborting the whole
 *    sequence at the first failure.
 *
 * Refreshes itself every minute: this is a live service board, and a cashier
 * should not have to reload to see the floor change. The in-flight guard stops
 * a slow cycle from overlapping the next one.
 */
export function useDashboardData(branch: string | undefined): DashboardData {
  const [stats, setStats] = useState<Section<StatsData | null>>(idle(null));
  const [serviceLine, setServiceLine] = useState<Section<ServiceLineRow[]>>(idle([]));
  const [metrics, setMetrics] = useState<Section<{ shift: ShiftMetrics | null; baseline: Baseline | null }>>(
    idle({ shift: null, baseline: null }),
  );
  const [floorLoad, setFloorLoad] = useState<Section<FloorLoadRow[]>>(idle([]));
  const [runningLow, setRunningLow] = useState<Section<RunningLowRow[]>>(idle([]));
  const [attention, setAttention] = useState<Section<AttentionRow[]>>(idle([]));
  const [notifications, setNotifications] = useState<Section<NotificationRow[]>>(idle([]));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const inFlight = useRef(false);
  // Guards against a response from a previous branch landing after a switch.
  const branchRef = useRef(branch);
  branchRef.current = branch;

  const load = useCallback(async () => {
    if (!branch || inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);

    const get = <T,>(method: string, params: Record<string, unknown> = {}) =>
      call.get<{ message: T }>(method, { branch, ...params }).then((r) => r.message);

    const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

    const settle = <T,>(
      result: PromiseSettledResult<T>,
      set: (s: Section<T>) => void,
      fallback: T,
      errorKey: string,
    ) => {
      // A stale branch's response must not overwrite the current one.
      if (branchRef.current !== branch) return;
      if (result.status === 'fulfilled') {
        set({ data: result.value, loading: false, error: null });
      } else {
        console.error(`dashboard: ${errorKey}`, result.reason);
        set({ data: fallback, loading: false, error: errorKey });
      }
    };

    const [
      statsR, serviceR, shiftR, baselineR, floorR, lowR, attentionR, notifR,
    ] = await Promise.allSettled([
      get<StatsData>('ury.ury.api.ury_dashboard.get_dashboard_stats'),
      get<ServiceLineRow[]>('ury.ury.api.ury_service_line.get_service_line'),
      get<ShiftMetrics>('ury.ury.api.ury_dashboard.get_shift_metrics'),
      get<Baseline>('ury.ury.api.ury_dashboard.get_baseline'),
      get<FloorLoadRow[]>('ury.ury.api.ury_dashboard.get_floor_load'),
      get<RunningLowRow[]>('ury.ury.api.ury_service_line.get_running_low'),
      get<AttentionRow[]>('ury.ury.api.ury_dashboard.get_needs_attention'),
      // Notifications are not branch-scoped, and this now goes through the
      // shared client rather than a bare `fetch`, so it picks up the CSRF
      // token and error handling every other call in the app uses.
      call
        .get<{ message: NotificationRow[] }>('frappe.client.get_list', {
          doctype: 'Notification Log',
          fields: JSON.stringify(['name', 'subject', 'creation']),
          order_by: 'creation desc',
          limit_page_length: 10,
        })
        .then((r) => r.message),
    ]);

    settle(statsR, setStats, null, 'dashboard.failed_stats');
    settle(
      serviceR.status === 'fulfilled'
        ? { status: 'fulfilled', value: asArray<ServiceLineRow>(serviceR.value) }
        : serviceR,
      setServiceLine, [], 'dashboard.failed_service_line',
    );

    // Shift and baseline share one panel, so either failing fails the pair.
    if (branchRef.current === branch) {
      if (shiftR.status === 'fulfilled' && baselineR.status === 'fulfilled') {
        setMetrics({
          data: { shift: shiftR.value, baseline: baselineR.value },
          loading: false, error: null,
        });
      } else {
        const reason = shiftR.status === 'rejected' ? shiftR.reason : (baselineR as PromiseRejectedResult).reason;
        console.error('dashboard: metrics', reason);
        setMetrics({ data: { shift: null, baseline: null }, loading: false, error: 'dashboard.failed_metrics' });
      }
    }

    settle(
      floorR.status === 'fulfilled'
        ? { status: 'fulfilled', value: asArray<FloorLoadRow>(floorR.value) }
        : floorR,
      setFloorLoad, [], 'dashboard.failed_load',
    );
    settle(
      lowR.status === 'fulfilled'
        ? { status: 'fulfilled', value: asArray<RunningLowRow>(lowR.value) }
        : lowR,
      setRunningLow, [], 'dashboard.failed_load',
    );
    settle(
      attentionR.status === 'fulfilled'
        ? { status: 'fulfilled', value: asArray<AttentionRow>(attentionR.value) }
        : attentionR,
      setAttention, [], 'dashboard.failed_load',
    );
    settle(
      notifR.status === 'fulfilled'
        ? { status: 'fulfilled', value: asArray<NotificationRow>(notifR.value) }
        : notifR,
      setNotifications, [], 'dashboard.failed_load',
    );

    if (branchRef.current === branch) setLastUpdated(new Date());
    inFlight.current = false;
    setRefreshing(false);
  }, [branch]);

  useEffect(() => {
    if (!branch) return;
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [branch, load]);

  return {
    stats, serviceLine, metrics, floorLoad, runningLow, attention,
    notifications, lastUpdated, refreshing, refresh: load,
  };
}
