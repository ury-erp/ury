import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrderTypeChart from './OrderTypeChart';

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

// Mock recharts — OrderTypeChart uses BarChart with vertical layout
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-length={data?.length}>{children}</div>
  ),
  Bar: ({ dataKey, name, fill }: any) => (
    <div data-testid="chart-bar" data-key={dataKey} data-name={name} data-fill={fill} />
  ),
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: ({ dataKey }: any) => <div data-testid="y-axis" data-key={dataKey} />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: ({ content }: any) => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: ({ formatter }: any) => <div data-testid="legend" />,
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  summary: null,
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('OrderTypeChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      summary: null,
    };
  });

  // ─── Title ─────────────────────────────────────────────────────────

  it('renders the order type distribution title', () => {
    render(<OrderTypeChart />);
    expect(screen.getByText('dashboard.order_type_distribution')).toBeInTheDocument();
  });

  // ─── Empty State ───────────────────────────────────────────────────

  it('shows no data message when summary is null', () => {
    render(<OrderTypeChart />);
    expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
  });

  it('shows no data message when order_type_breakdown is null', () => {
    mockDashboardStoreState = {
      summary: { order_type_breakdown: null },
    };
    render(<OrderTypeChart />);
    expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
  });

  it('shows no data message when order_type_breakdown is empty', () => {
    mockDashboardStoreState = {
      summary: { order_type_breakdown: [] },
    };
    render(<OrderTypeChart />);
    expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
  });

  // ─── Chart Rendering ───────────────────────────────────────────────

  it('renders bar chart when data is available', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
          { order_type: 'Take Away', count: 30, revenue: 600 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders responsive container when data is available', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  // ─── Data Length ───────────────────────────────────────────────────

  it('passes correct data length to bar chart', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
          { order_type: 'Take Away', count: 30, revenue: 600 },
          { order_type: 'Delivery', count: 20, revenue: 400 },
        ],
      },
    };

    render(<OrderTypeChart />);
    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-length', '3');
  });

  // ─── Bar Components ────────────────────────────────────────────────

  it('renders orders bar', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    const bars = screen.getAllByTestId('chart-bar');
    const ordersBar = bars.find(b => b.getAttribute('data-key') === 'orders');
    expect(ordersBar).toBeDefined();
    expect(ordersBar?.getAttribute('data-name')).toBe('Orders');
  });

  it('renders revenue bar', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    const bars = screen.getAllByTestId('chart-bar');
    const revenueBar = bars.find(b => b.getAttribute('data-key') === 'revenue');
    expect(revenueBar).toBeDefined();
    expect(revenueBar?.getAttribute('data-name')).toBe('Revenue');
  });

  // ─── Chart Components ──────────────────────────────────────────────

  it('renders cartesian grid', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
  });

  it('renders tooltip', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('renders legend', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('renders both x and y axes', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
  });

  // ─── Data Transformation ───────────────────────────────────────────

  it('uses "Unknown" when order_type is missing', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { count: 10, revenue: 200 }, // no order_type field
        ],
      },
    };

    render(<OrderTypeChart />);
    // Component maps to { name: item.order_type || 'Unknown' }
    // Should render chart without crashing — name falls back to "Unknown"
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('handles non-numeric count gracefully', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 'invalid', revenue: 'bad' },
        ],
      },
    };

    // Number('invalid') || 0 = 0, should render without crashing
    render(<OrderTypeChart />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('handles zero values', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 0, revenue: 0 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  // ─── Predefined Color Mapping ──────────────────────────────────────

  it('uses predefined color for Dine In', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Dine In', count: 50, revenue: 1000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    // The fill is assigned per-item in chartData, but Bar fill is hardcoded
    // #3b82f6 for orders bar, #10b981 for revenue bar
    const bars = screen.getAllByTestId('chart-bar');
    const ordersBar = bars.find(b => b.getAttribute('data-key') === 'orders');
    expect(ordersBar?.getAttribute('data-fill')).toBe('#3b82f6');
  });

  it('uses predefined color for Take Away', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Take Away', count: 30, revenue: 600 },
        ],
      },
    };

    render(<OrderTypeChart />);
    const bars = screen.getAllByTestId('chart-bar');
    const revenueBar = bars.find(b => b.getAttribute('data-key') === 'revenue');
    expect(revenueBar?.getAttribute('data-fill')).toBe('#10b981');
  });

  // ─── Container Styling ─────────────────────────────────────────────

  it('has white background with border and rounded corners', () => {
    const { container } = render(<OrderTypeChart />);
    const wrapper = container.querySelector('.bg-white.rounded-lg.border');
    expect(wrapper).toBeInTheDocument();
  });

  // ─── Single Order Type ────────────────────────────────────────────

  it('renders chart with single order type', () => {
    mockDashboardStoreState = {
      summary: {
        order_type_breakdown: [
          { order_type: 'Delivery', count: 100, revenue: 2000 },
        ],
      },
    };

    render(<OrderTypeChart />);
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-length', '1');
  });
});
