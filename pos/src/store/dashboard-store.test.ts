import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDashboardStore, getPreviousPeriod } from '../store/dashboard-store';
import type { DashboardPeriod } from '../lib/dashboard-api';

// Mock the API functions
vi.mock('../lib/dashboard-api', () => ({
  getDashboardSummary: vi.fn().mockResolvedValue({
    period: 'today',
    from_date: '2026-07-01',
    to_date: '2026-07-01',
    total_revenue: 5000,
    total_orders: 50,
    net_total: 4500,
    total_tax: 500,
    average_order_value: 100,
    unique_customers: 30,
    top_selling_items: [],
    order_type_breakdown: [],
    hourly_breakdown: [],
  }),
  getRevenueChart: vi.fn().mockResolvedValue({
    period: 'today',
    granularity: 'daily',
    from_date: '2026-07-01',
    to_date: '2026-07-01',
    data: [],
  }),
  getOrdersChart: vi.fn().mockResolvedValue({
    period: 'today',
    from_date: '2026-07-01',
    to_date: '2026-07-01',
    data: [],
  }),
  getCategorySalesChart: vi.fn().mockResolvedValue({ data: [] }),
  getTableOccupancy: vi.fn().mockResolvedValue({
    total_tables: 20,
    occupied_tables: 8,
    available_tables: 12,
    occupancy_rate: 40,
    rooms: {},
  }),
  getLiveMetrics: vi.fn().mockResolvedValue({
    today_revenue: 3500,
    today_orders: 35,
    pending_kots: 2,
    recent_orders: [],
    timestamp: new Date().toISOString(),
  }),
}));

describe('getPreviousPeriod', () => {
  it('should map today to yesterday', () => {
    expect(getPreviousPeriod('today')).toBe('yesterday');
  });

  it('should map this_week to last_week', () => {
    expect(getPreviousPeriod('this_week')).toBe('last_week');
  });

  it('should map this_month to last_month', () => {
    expect(getPreviousPeriod('this_month')).toBe('last_month');
  });

  it('should map last_week to last_7_days', () => {
    expect(getPreviousPeriod('last_week')).toBe('last_7_days');
  });

  it('should map last_month to last_30_days', () => {
    expect(getPreviousPeriod('last_month')).toBe('last_30_days');
  });

  it('should handle rolling periods with fallback', () => {
    expect(getPreviousPeriod('last_7_days')).toBe('last_7_days');
    expect(getPreviousPeriod('last_30_days')).toBe('last_30_days');
    expect(getPreviousPeriod('last_90_days')).toBe('last_90_days');
  });

  it('should fallback to yesterday for unknown periods', () => {
    expect(getPreviousPeriod('yesterday' as DashboardPeriod)).toBe('today');
  });
});

describe('useDashboardStore', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      summary: null,
      previousSummary: null,
      revenueChart: null,
      ordersChart: null,
      categorySales: null,
      tableOccupancy: null,
      liveMetrics: null,
      selectedPeriod: 'today',
      selectedGranularity: 'daily',
      loading: false,
      liveLoading: false,
      error: null,
      autoRefresh: false,
      refreshInterval: 30,
    });
  });

  it('should have correct initial state', () => {
    const state = useDashboardStore.getState();
    expect(state.summary).toBeNull();
    expect(state.previousSummary).toBeNull();
    expect(state.selectedPeriod).toBe('today');
    expect(state.selectedGranularity).toBe('daily');
    expect(state.loading).toBe(false);
    expect(state.autoRefresh).toBe(false);
  });

  it('should set selected period', () => {
    useDashboardStore.getState().setSelectedPeriod('this_week');
    expect(useDashboardStore.getState().selectedPeriod).toBe('this_week');
  });

  it('should set selected granularity', () => {
    useDashboardStore.getState().setSelectedGranularity('hourly');
    expect(useDashboardStore.getState().selectedGranularity).toBe('hourly');
  });

  it('should toggle auto refresh', () => {
    useDashboardStore.getState().setAutoRefresh(true);
    expect(useDashboardStore.getState().autoRefresh).toBe(true);

    useDashboardStore.getState().setAutoRefresh(false);
    expect(useDashboardStore.getState().autoRefresh).toBe(false);
  });

  it('should set refresh interval', () => {
    useDashboardStore.getState().setRefreshInterval(60);
    expect(useDashboardStore.getState().refreshInterval).toBe(60);
  });

  it('should fetch all dashboard data', async () => {
    await useDashboardStore.getState().fetchAll('today');

    const state = useDashboardStore.getState();
    expect(state.summary).not.toBeNull();
    expect(state.summary?.total_revenue).toBe(5000);
    expect(state.tableOccupancy).not.toBeNull();
    expect(state.liveMetrics).not.toBeNull();
    expect(state.loading).toBe(false);
  });

  it('should fetch previous summary', async () => {
    await useDashboardStore.getState().fetchPreviousSummary('today');

    const state = useDashboardStore.getState();
    expect(state.previousSummary).not.toBeNull();
  });
});
