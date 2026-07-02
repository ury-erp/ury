import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LiveMetricsPanel from './LiveMetricsPanel';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock storage for formatCurrency
vi.mock('../../lib/storage', () => ({
  storage: {
    getItem: (key: string) => key === 'currencySymbol' ? '€' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  liveMetrics: null,
  liveLoading: false,
  fetchLiveMetrics: vi.fn(),
  autoRefresh: false,
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('LiveMetricsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      liveMetrics: null,
      liveLoading: false,
      fetchLiveMetrics: vi.fn(),
      autoRefresh: false,
    };
  });

  it('calls fetchLiveMetrics on mount', () => {
    render(<LiveMetricsPanel />);
    expect(mockDashboardStoreState.fetchLiveMetrics).toHaveBeenCalledTimes(1);
  });

  it('renders the Live Metrics title', () => {
    render(<LiveMetricsPanel />);
    expect(screen.getByText('Live Metrics')).toBeInTheDocument();
  });

  it('shows loading spinner when liveLoading is true and no data', () => {
    mockDashboardStoreState.liveLoading = true;
    mockDashboardStoreState.liveMetrics = null;
    render(<LiveMetricsPanel />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('shows "Unable to load live data" when no data and not loading', () => {
    mockDashboardStoreState.liveLoading = false;
    mockDashboardStoreState.liveMetrics = null;
    render(<LiveMetricsPanel />);
    expect(screen.getByText('Unable to load live data')).toBeInTheDocument();
  });

  it('shows Today Revenue when data exists', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 2,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('Today Revenue')).toBeInTheDocument();
    expect(screen.getByText('€ 3500')).toBeInTheDocument();
  });

  it('shows Today Orders when data exists', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 2,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('Today Orders')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
  });

  it('shows Pending KOTs count', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 2,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('2 Pending KOTs')).toBeInTheDocument();
  });

  it('shows amber background when pending KOTs > 0', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 2,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    const pendingDiv = screen.getByText('2 Pending KOTs').closest('.rounded-lg')!;
    expect(pendingDiv.className).toContain('bg-amber-50');
  });

  it('shows gray background when no pending KOTs', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    const pendingDiv = screen.getByText('0 Pending KOTs').closest('.rounded-lg')!;
    expect(pendingDiv.className).toContain('bg-gray-50');
  });

  it('shows Recent Orders section', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('Recent Orders')).toBeInTheDocument();
  });

  it('shows "No recent orders" when list is empty', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('No recent orders')).toBeInTheDocument();
  });

  it('renders recent order details', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [
        {
          name: 'INV-001',
          customer: 'John Doe',
          order_type: 'Dine In',
          grand_total: 25,
          posting_time: '12:30:00',
        },
      ],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('INV-001 | Dine In')).toBeInTheDocument();
  });

  it('shows updated timestamp when data exists', () => {
    const timestamp = new Date().toISOString();
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [],
      timestamp,
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText(/Updated:/)).toBeInTheDocument();
  });

  it('does not show timestamp when no data', () => {
    mockDashboardStoreState.liveMetrics = null;
    render(<LiveMetricsPanel />);
    expect(screen.queryByText(/Updated:/)).not.toBeInTheDocument();
  });

  it('shows animate-pulse on Activity icon when autoRefresh is enabled', () => {
    mockDashboardStoreState.autoRefresh = true;
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 100,
      today_orders: 10,
      pending_kots: 0,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    const icon = document.querySelector('.animate-pulse');
    expect(icon).toBeInTheDocument();
  });

  it('does not show animate-pulse when autoRefresh is disabled', () => {
    mockDashboardStoreState.autoRefresh = false;
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 100,
      today_orders: 10,
      pending_kots: 0,
      recent_orders: [],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    const icon = document.querySelector('.animate-pulse');
    expect(icon).not.toBeInTheDocument();
  });

  it('formats recent order grand total with currency', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [
        {
          name: 'INV-001',
          customer: 'John',
          order_type: 'Take Away',
          grand_total: 42.5,
          posting_time: '10:00:00',
        },
      ],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('€ 42.5')).toBeInTheDocument();
  });

  it('renders multiple recent orders', () => {
    mockDashboardStoreState.liveMetrics = {
      today_revenue: 3500,
      today_orders: 35,
      pending_kots: 0,
      recent_orders: [
        { name: 'INV-001', customer: 'John', order_type: 'Dine In', grand_total: 25, posting_time: '12:00:00' },
        { name: 'INV-002', customer: 'Jane', order_type: 'Take Away', grand_total: 30, posting_time: '12:30:00' },
      ],
      timestamp: new Date().toISOString(),
    };
    render(<LiveMetricsPanel />);
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });
});
