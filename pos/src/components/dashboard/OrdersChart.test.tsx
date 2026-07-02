import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrdersChartComponent from './OrdersChart';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock recharts
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-length={data?.length}>{children}</div>
  ),
  Bar: ({ dataKey, name, fill }: any) => (
    <div data-testid="chart-bar" data-key={dataKey} data-name={name} data-fill={fill} />
  ),
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => <div data-testid="legend" />,
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  ordersChart: null,
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('OrdersChartComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      ordersChart: null,
    };
  });

  // ─── Title ─────────────────────────────────────────────────────────

  it('renders the Orders Overview title', () => {
    render(<OrdersChartComponent />);
    expect(screen.getByText('Orders Overview')).toBeInTheDocument();
  });

  // ─── Empty State ───────────────────────────────────────────────────

  it('shows no data message when ordersChart is null', () => {
    render(<OrdersChartComponent />);
    expect(screen.getByText('No order data available')).toBeInTheDocument();
  });

  it('shows no data message when ordersChart has empty data', () => {
    mockDashboardStoreState = {
      ordersChart: { data: [] },
    };
    render(<OrdersChartComponent />);
    expect(screen.getByText('No order data available')).toBeInTheDocument();
  });

  // ─── Chart Rendering ───────────────────────────────────────────────

  it('renders bar chart when data is available', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders bar chart with correct data length', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
          { date: '2024-06-02', total_orders: 30, paid_orders: 25, draft_orders: 3, cancelled_orders: 2 },
          { date: '2024-06-03', total_orders: 25, paid_orders: 20, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    const chart = screen.getByTestId('bar-chart');
    expect(chart).toHaveAttribute('data-length', '3');
  });

  // ─── Bar Data Keys ─────────────────────────────────────────────────

  it('renders paid bar with correct key and color', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    const bars = screen.getAllByTestId('chart-bar');
    const paidBar = bars.find(b => b.getAttribute('data-key') === 'paid');
    expect(paidBar).toBeTruthy();
    expect(paidBar!.getAttribute('data-name')).toBe('Paid');
    expect(paidBar!.getAttribute('data-fill')).toBe('#10b981');
  });

  it('renders draft bar with correct key and color', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    const bars = screen.getAllByTestId('chart-bar');
    const draftBar = bars.find(b => b.getAttribute('data-key') === 'draft');
    expect(draftBar).toBeTruthy();
    expect(draftBar!.getAttribute('data-name')).toBe('Draft');
    expect(draftBar!.getAttribute('data-fill')).toBe('#f59e0b');
  });

  it('renders cancelled bar with correct key and color', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    const bars = screen.getAllByTestId('chart-bar');
    const cancelledBar = bars.find(b => b.getAttribute('data-key') === 'cancelled');
    expect(cancelledBar).toBeTruthy();
    expect(cancelledBar!.getAttribute('data-name')).toBe('Cancelled');
    expect(cancelledBar!.getAttribute('data-fill')).toBe('#ef4444');
  });

  // ─── Chart Components ──────────────────────────────────────────────

  it('renders XAxis with name dataKey', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    const xAxis = screen.getByTestId('x-axis');
    expect(xAxis).toHaveAttribute('data-key', 'name');
  });

  it('renders cartesian grid', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
  });

  it('renders tooltip', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('renders legend', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 20, paid_orders: 15, draft_orders: 3, cancelled_orders: 2 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  // ─── Data Transformation ───────────────────────────────────────────

  it('handles non-numeric order counts gracefully', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 'bad', paid_orders: 'bad', draft_orders: 'bad', cancelled_orders: 'bad' },
        ],
      },
    };

    render(<OrdersChartComponent />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('handles zero order counts', () => {
    mockDashboardStoreState = {
      ordersChart: {
        data: [
          { date: '2024-06-01', total_orders: 0, paid_orders: 0, draft_orders: 0, cancelled_orders: 0 },
        ],
      },
    };

    render(<OrdersChartComponent />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  // ─── Container Styling ─────────────────────────────────────────────

  it('has white background with border and rounded corners', () => {
    const { container } = render(<OrdersChartComponent />);
    const wrapper = container.querySelector('.bg-white.rounded-lg.border');
    expect(wrapper).toBeInTheDocument();
  });
});
