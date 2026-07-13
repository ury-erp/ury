import { create } from 'zustand';
import { logger } from '../lib/logger';
import {
  getDashboardSummary,
  getRevenueChart,
  getOrdersChart,
  getCategorySalesChart,
  getTableOccupancy,
  getLiveMetrics,
  DashboardSummary,
  RevenueChartData,
  CategorySalesData,
  OrdersChartData,
  TableOccupancy,
  LiveMetrics,
  DashboardPeriod,
  ChartGranularity,
} from '../lib/dashboard-api';

// ---- Previous Period Helper ----

export function getPreviousPeriod(period: DashboardPeriod): DashboardPeriod {
  const mapping: Record<DashboardPeriod, DashboardPeriod> = {
    today: 'yesterday',
    yesterday: 'today', // fallback - no "day before yesterday" period
    this_week: 'last_week',
    last_week: 'last_7_days', // approximate fallback
    this_month: 'last_month',
    last_month: 'last_30_days', // approximate fallback
    last_7_days: 'last_7_days', // will use custom date range in practice
    last_30_days: 'last_30_days',
    last_90_days: 'last_90_days',
  };
  return mapping[period] || 'yesterday';
}

interface DashboardState {
  summary: DashboardSummary | null;
  previousSummary: DashboardSummary | null;
  revenueChart: RevenueChartData | null;
  ordersChart: OrdersChartData | null;
  categorySales: CategorySalesData | null;
  tableOccupancy: TableOccupancy | null;
  liveMetrics: LiveMetrics | null;
  selectedPeriod: DashboardPeriod;
  selectedGranularity: ChartGranularity;
  loading: boolean;
  liveLoading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: number; // seconds
}

interface DashboardActions {
  fetchSummary: (period?: DashboardPeriod) => Promise<void>;
  fetchPreviousSummary: (period?: DashboardPeriod) => Promise<void>;
  fetchRevenueChart: (period?: DashboardPeriod, granularity?: ChartGranularity) => Promise<void>;
  fetchOrdersChart: (period?: DashboardPeriod) => Promise<void>;
  fetchCategorySales: (period?: DashboardPeriod) => Promise<void>;
  fetchTableOccupancy: () => Promise<void>;
  fetchLiveMetrics: () => Promise<void>;
  fetchAll: (period?: DashboardPeriod) => Promise<void>;
  setSelectedPeriod: (period: DashboardPeriod) => void;
  setSelectedGranularity: (granularity: ChartGranularity) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (seconds: number) => void;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

export const useDashboardStore = create<DashboardState & DashboardActions>(
  (set, get) => ({
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

    fetchSummary: async (period) => {
      const p = period || get().selectedPeriod;
      try {
        const summary = await getDashboardSummary(p);
        set({ summary });
      } catch (error) {
        logger.error('Failed to fetch dashboard summary:', error);
      }
    },

    fetchPreviousSummary: async (period) => {
      const currentPeriod = period || get().selectedPeriod;
      const previousPeriod = getPreviousPeriod(currentPeriod);
      try {
        const previousSummary = await getDashboardSummary(previousPeriod);
        set({ previousSummary });
      } catch (error) {
        logger.error('Failed to fetch previous period summary:', error);
        set({ previousSummary: null });
      }
    },

    fetchRevenueChart: async (period, granularity) => {
      const p = period || get().selectedPeriod;
      const g = granularity || get().selectedGranularity;
      try {
        const revenueChart = await getRevenueChart(p, g);
        set({ revenueChart });
      } catch (error) {
        logger.error('Failed to fetch revenue chart:', error);
      }
    },

    fetchOrdersChart: async (period) => {
      const p = period || get().selectedPeriod;
      try {
        const ordersChart = await getOrdersChart(p);
        set({ ordersChart });
      } catch (error) {
        logger.error('Failed to fetch orders chart:', error);
      }
    },

    fetchCategorySales: async (period) => {
      const p = period || get().selectedPeriod;
      try {
        const categorySales = await getCategorySalesChart(p);
        set({ categorySales });
      } catch (error) {
        logger.error('Failed to fetch category sales:', error);
      }
    },

    fetchTableOccupancy: async () => {
      try {
        const tableOccupancy = await getTableOccupancy();
        set({ tableOccupancy });
      } catch (error) {
        logger.error('Failed to fetch table occupancy:', error);
      }
    },

    fetchLiveMetrics: async () => {
      try {
        set({ liveLoading: true });
        const liveMetrics = await getLiveMetrics();
        set({ liveMetrics, liveLoading: false });
      } catch (error) {
        set({ liveLoading: false });
        logger.error('Failed to fetch live metrics:', error);
      }
    },

    fetchAll: async (period) => {
      const p = period || get().selectedPeriod;
      try {
        set({ loading: true, error: null });
        await Promise.allSettled([
          get().fetchSummary(p),
          get().fetchPreviousSummary(p),
          get().fetchRevenueChart(p),
          get().fetchOrdersChart(p),
          get().fetchCategorySales(p),
          get().fetchTableOccupancy(),
          get().fetchLiveMetrics(),
        ]);
        set({ loading: false });
      } catch {
        set({ error: 'Failed to load dashboard data', loading: false });
      }
    },

    setSelectedPeriod: (period) => {
      set({ selectedPeriod: period });
      get().fetchAll(period);
    },

    setSelectedGranularity: (granularity) => {
      set({ selectedGranularity: granularity });
      get().fetchRevenueChart(undefined, granularity);
    },

    setAutoRefresh: (enabled) => {
      set({ autoRefresh: enabled });
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (enabled) {
        refreshTimer = setInterval(() => {
          get().fetchLiveMetrics();
        }, get().refreshInterval * 1000);
      }
    },

    setRefreshInterval: (seconds) => {
      set({ refreshInterval: seconds });
      if (get().autoRefresh) {
        // Restart timer with new interval
        get().setAutoRefresh(false);
        get().setAutoRefresh(true);
      }
    },
  })
);
