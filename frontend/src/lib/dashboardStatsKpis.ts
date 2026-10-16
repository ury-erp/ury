import { formatCurrency, type CurrencyInfo } from '@ury/core';
import type { KpiItemProps } from '@ury/ui';
import type { DashboardStats } from '../services/dashboard';

export type BuildDashboardStatsKpiOptions = {
  /** When true, return em-dash placeholders instead of numbers. */
  loading?: boolean;
  /**
   * Maps a response currency code to a symbol-aware ``CurrencyInfo``. Money is
   * always formatted in the currency the stats came back in, so figures can
   * never pick up another company's symbol mid-switch.
   */
  currencyFor?: (code: string | null | undefined) => CurrencyInfo | string | null | undefined;
};

const LOADING_ITEMS: KpiItemProps[] = [
  { label: "Today's Sales", value: '—' },
  { label: 'Orders Today', value: '—' },
  { label: 'Avg. Order Value', value: '—' },
  { label: 'Active Tables', value: '—' },
];

/**
 * Shared KPI strip for Service Board and POS dashboard — both surfaces show
 * the same four live metrics from ``get_dashboard_stats``.
 */
export function buildDashboardStatsKpiItems(
  stats?: DashboardStats | null,
  options: BuildDashboardStatsKpiOptions = {},
): KpiItemProps[] {
  if (options.loading) return LOADING_ITEMS;

  const todaysSales = stats?.todays_sales ?? 0;
  const ordersToday = stats?.orders_today ?? 0;
  const avgOrderValue = stats?.avg_order_value ?? 0;
  const activeTables = stats?.active_tables ?? 0;
  const totalTables = stats?.total_tables ?? 0;
  const occupancy = totalTables ? activeTables / totalTables : 0;

  const toCurrency = (code: string | null | undefined) =>
    options.currencyFor ? options.currencyFor(code) : code || undefined;
  const money = (amount: number, code: string | null | undefined) => formatCurrency(amount, toCurrency(code));

  // Mixed-currency scope: one figure per currency instead of a meaningless sum.
  const breakdown = stats?.currency_breakdown ?? [];
  const isMixed = breakdown.length > 1;
  const salesValue = isMixed
    ? breakdown.map((row) => money(row.sales, row.currency)).join(' · ')
    : money(todaysSales, stats?.currency);
  const avgValue = isMixed
    ? breakdown.map((row) => money(row.avg_order_value, row.currency)).join(' · ')
    : money(avgOrderValue, stats?.currency);

  return [
    {
      label: "Today's Sales",
      value: salesValue,
      tone: 'success',
      hint: isMixed ? 'Multiple currencies — not summed' : undefined,
    },
    {
      label: 'Orders Today',
      value: String(ordersToday),
    },
    {
      label: 'Avg. Order Value',
      value: avgValue,
    },
    {
      label: 'Active Tables',
      value: `${activeTables} / ${totalTables}`,
      tone: occupancy >= 0.85 ? 'warning' : undefined,
      hint: occupancy >= 0.85 ? 'Floor nearly full' : undefined,
    },
  ];
}

/** Map live stats into the older management ``DashboardSummary`` field names. */
export function dashboardStatsToSummary(
  stats: DashboardStats,
  extras?: Partial<{
    active_cashiers: number;
    pending_kitchen_orders: number;
    total_menu_items: number;
  }>,
) {
  return {
    today_sales: stats.todays_sales ?? 0,
    today_orders: stats.orders_today ?? 0,
    occupied_tables: stats.active_tables ?? 0,
    total_tables: stats.total_tables ?? 0,
    avg_order_value: stats.avg_order_value ?? 0,
    active_cashiers: extras?.active_cashiers ?? 0,
    pending_kitchen_orders: extras?.pending_kitchen_orders ?? 0,
    total_menu_items: extras?.total_menu_items ?? 0,
  };
}

/** Map management summary fields into the shared ``DashboardStats`` shape. */
export function summaryToDashboardStats(summary?: DashboardSummary | null): DashboardStats | null {
  if (!summary) return null;
  return {
    todays_sales: summary.today_sales ?? 0,
    orders_today: summary.today_orders ?? 0,
    avg_order_value: summary.avg_order_value ?? 0,
    active_tables: summary.occupied_tables ?? 0,
    total_tables: summary.total_tables ?? 0,
    currency: summary.currency ?? null,
    currency_breakdown: summary.currency_breakdown ?? [],
  };
}
