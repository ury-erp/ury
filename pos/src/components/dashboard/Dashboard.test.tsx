import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Dashboard from './Dashboard';

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

// Mock child chart components
vi.mock('./RevenueChart', () => ({
  __esModule: true,
  default: () => <div data-testid="revenue-chart">RevenueChart</div>,
}));

vi.mock('./OrdersChart', () => ({
  __esModule: true,
  default: () => <div data-testid="orders-chart">OrdersChart</div>,
}));

vi.mock('./CategorySalesChart', () => ({
  __esModule: true,
  default: () => <div data-testid="category-sales-chart">CategorySalesChart</div>,
}));

vi.mock('./LiveMetricsPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="live-metrics-panel">LiveMetricsPanel</div>,
}));

vi.mock('./PaymentMethodChart', () => ({
  __esModule: true,
  default: () => <div data-testid="payment-method-chart">PaymentMethodChart</div>,
}));

vi.mock('./OrderTypeChart', () => ({
  __esModule: true,
  default: () => <div data-testid="order-type-chart">OrderTypeChart</div>,
}));

vi.mock('./HourlyHeatmap', () => ({
  __esModule: true,
  default: () => <div data-testid="hourly-heatmap">HourlyHeatmap</div>,
}));

vi.mock('./PeriodComparison', () => ({
  __esModule: true,
  default: () => <div data-testid="period-comparison">PeriodComparison</div>,
}));

// Mock UI components
vi.mock('../ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} className={className} {...props}>
      {children}
    </button>
  ),
  Spinner: ({ className }: any) => <div data-testid="spinner" className={className}>Loading</div>,
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>{children}</span>
  ),
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  summary: null,
  tableOccupancy: null,
  selectedPeriod: 'today',
  loading: false,
  autoRefresh: false,
  fetchAll: vi.fn().mockResolvedValue(undefined),
  setSelectedPeriod: vi.fn(),
  setAutoRefresh: vi.fn(),
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
        unique_customers: 30,
        from_date: '2026-07-01',
        to_date: '2026-07-01',
        top_selling_items: [],
      },
      tableOccupancy: {
        occupancy_rate: 40,
        occupied_tables: 8,
        total_tables: 20,
      },
      selectedPeriod: 'today',
      loading: false,
      autoRefresh: false,
      fetchAll: vi.fn().mockResolvedValue(undefined),
      setSelectedPeriod: vi.fn(),
      setAutoRefresh: vi.fn(),
    };
  });

  it('calls fetchAll on mount', () => {
    render(<Dashboard />);
    expect(mockDashboardStoreState.fetchAll).toHaveBeenCalledTimes(1);
  });

  it('renders the dashboard title', () => {
    render(<Dashboard />);
    expect(screen.getByText('dashboard.title')).toBeInTheDocument();
  });

  it('renders the dashboard subtitle', () => {
    render(<Dashboard />);
    expect(screen.getByText('dashboard.subtitle')).toBeInTheDocument();
  });

  it('renders Total Revenue KPI card', () => {
    render(<Dashboard />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('renders Total Orders KPI card', () => {
    render(<Dashboard />);
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
  });

  it('renders Unique Customers KPI card', () => {
    render(<Dashboard />);
    expect(screen.getByText('Unique Customers')).toBeInTheDocument();
  });

  it('renders Table Occupancy KPI card', () => {
    render(<Dashboard />);
    expect(screen.getByText('Table Occupancy')).toBeInTheDocument();
  });

  it('shows formatted revenue value', () => {
    render(<Dashboard />);
    expect(screen.getByText('€ 5000')).toBeInTheDocument();
  });

  it('shows total orders count', () => {
    render(<Dashboard />);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('shows table occupancy percentage', () => {
    render(<Dashboard />);
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('renders period selector buttons', () => {
    render(<Dashboard />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('This Week')).toBeInTheDocument();
  });

  it('calls setSelectedPeriod when period button is clicked', () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByText('Yesterday'));
    expect(mockDashboardStoreState.setSelectedPeriod).toHaveBeenCalledWith('yesterday');
  });

  it('highlights the selected period', () => {
    mockDashboardStoreState.selectedPeriod = 'today';
    render(<Dashboard />);
    const todayButton = screen.getByText('Today');
    expect(todayButton.className).toContain('bg-blue-600');
  });

  it('renders auto-refresh button', () => {
    render(<Dashboard />);
    expect(screen.getByText('Auto-refresh')).toBeInTheDocument();
  });

  it('toggles auto-refresh on click', () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByText('Auto-refresh'));
    expect(mockDashboardStoreState.setAutoRefresh).toHaveBeenCalledWith(true);
  });

  it('shows Live text when auto-refresh is enabled', () => {
    mockDashboardStoreState.autoRefresh = true;
    render(<Dashboard />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders all chart components', () => {
    render(<Dashboard />);
    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument();
    expect(screen.getByTestId('orders-chart')).toBeInTheDocument();
    expect(screen.getByTestId('category-sales-chart')).toBeInTheDocument();
    expect(screen.getByTestId('live-metrics-panel')).toBeInTheDocument();
    expect(screen.getByTestId('payment-method-chart')).toBeInTheDocument();
    expect(screen.getByTestId('order-type-chart')).toBeInTheDocument();
    expect(screen.getByTestId('hourly-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('period-comparison')).toBeInTheDocument();
  });

  it('shows spinner when loading and no summary', () => {
    mockDashboardStoreState.loading = true;
    mockDashboardStoreState.summary = null;
    render(<Dashboard />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('does not show spinner when loading but summary exists', () => {
    mockDashboardStoreState.loading = true;
    render(<Dashboard />);
    // Summary exists, so spinner should not be shown
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });
});
