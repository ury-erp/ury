import { describe, expect, it, vi } from 'vitest';
import { buildDashboardStatsKpiItems, summaryToDashboardStats } from './dashboardStatsKpis';

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    formatCurrency: (amount: number) => `Rs. ${amount}`,
  };
});

describe('buildDashboardStatsKpiItems', () => {
  it('maps live dashboard stats into the shared KPI strip', () => {
    const items = buildDashboardStatsKpiItems({
      todays_sales: 1200,
      orders_today: 8,
      avg_order_value: 150,
      active_tables: 2,
      total_tables: 10,
    });

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ label: "Today's Sales", tone: 'success' });
    expect(items[1]).toMatchObject({ label: 'Orders Today', value: '8' });
    expect(items[2].label).toBe('Avg. Order Value');
    expect(items[3]).toMatchObject({ label: 'Active Tables', value: '2 / 10' });
  });

  it('flags near-full floors with a warning tone', () => {
    const items = buildDashboardStatsKpiItems({
      todays_sales: 0,
      orders_today: 0,
      avg_order_value: 0,
      active_tables: 9,
      total_tables: 10,
    });
    expect(items[3].tone).toBe('warning');
    expect(items[3].hint).toBe('Floor nearly full');
  });

  it('returns placeholders while loading', () => {
    const items = buildDashboardStatsKpiItems(null, { loading: true });
    expect(items.every((item) => item.value === '—')).toBe(true);
  });
});

describe('summaryToDashboardStats', () => {
  it('maps management summary fields onto the shared stats shape', () => {
    expect(
      summaryToDashboardStats({
        today_sales: 5000,
        today_orders: 25,
        occupied_tables: 8,
        total_tables: 12,
        avg_order_value: 200,
        active_cashiers: 3,
        pending_kitchen_orders: 5,
        total_menu_items: 150,
      }),
    ).toEqual({
      todays_sales: 5000,
      orders_today: 25,
      avg_order_value: 200,
      active_tables: 8,
      total_tables: 12,
    });
  });
});
