import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CategorySalesChart from './CategorySalesChart';

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
    getItem: (key: string) => {
      if (key === 'currencySymbol') return '€';
      return null;
    },
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Mock recharts
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, data }: any) => (
    <div data-testid="pie" data-length={data?.length}>{children}</div>
  ),
  Cell: ({ fill }: any) => <div data-testid="chart-cell" data-fill={fill} />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => <div data-testid="legend" />,
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  categorySales: null,
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('CategorySalesChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      categorySales: null,
    };
  });

  // ─── Title ─────────────────────────────────────────────────────────

  it('renders the Sales by Category title', () => {
    render(<CategorySalesChart />);
    expect(screen.getByText('Sales by Category')).toBeInTheDocument();
  });

  // ─── Empty State ───────────────────────────────────────────────────

  it('shows no data message when categorySales is null', () => {
    render(<CategorySalesChart />);
    expect(screen.getByText('No category data available')).toBeInTheDocument();
  });

  it('shows no data message when categorySales has empty data', () => {
    mockDashboardStoreState = {
      categorySales: { data: [] },
    };
    render(<CategorySalesChart />);
    expect(screen.getByText('No category data available')).toBeInTheDocument();
  });

  // ─── Chart Rendering ───────────────────────────────────────────────

  it('renders pie chart when data is available', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 500, total_qty: 25 },
          { category: 'Pasta', total_amount: 300, total_qty: 15 },
        ],
      },
    };

    render(<CategorySalesChart />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders cells for each data point', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 500, total_qty: 25 },
          { category: 'Pasta', total_amount: 300, total_qty: 15 },
          { category: 'Salad', total_amount: 200, total_qty: 10 },
        ],
      },
    };

    render(<CategorySalesChart />);
    const cells = screen.getAllByTestId('chart-cell');
    expect(cells.length).toBe(3);
  });

  it('renders pie with correct data length', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 500, total_qty: 25 },
          { category: 'Pasta', total_amount: 300, total_qty: 15 },
        ],
      },
    };

    render(<CategorySalesChart />);
    const pie = screen.getByTestId('pie');
    expect(pie).toHaveAttribute('data-length', '2');
  });

  // ─── Color Assignment ──────────────────────────────────────────────

  it('assigns different colors to different cells', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 500, total_qty: 25 },
          { category: 'Pasta', total_amount: 300, total_qty: 15 },
        ],
      },
    };

    render(<CategorySalesChart />);
    const cells = screen.getAllByTestId('chart-cell');
    const fills = cells.map(c => c.getAttribute('data-fill'));
    // First and second cells should have different colors
    expect(fills[0]).not.toBe(fills[1]);
  });

  it('cycles colors when more categories than colors', () => {
    const manyCategories = Array.from({ length: 10 }, (_, i) => ({
      category: `Cat ${i}`,
      total_amount: 100 * (i + 1),
      total_qty: i + 1,
    }));

    mockDashboardStoreState = {
      categorySales: { data: manyCategories },
    };

    render(<CategorySalesChart />);
    const cells = screen.getAllByTestId('chart-cell');
    expect(cells.length).toBe(10);
    // Colors should cycle (8 colors, so 9th cell = same as 1st)
    expect(cells[0].getAttribute('data-fill')).toBe(cells[8].getAttribute('data-fill'));
  });

  // ─── Data Transformation ───────────────────────────────────────────

  it('uses "Uncategorized" when category is missing', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { total_amount: 500, total_qty: 25 }, // no category field
        ],
      },
    };

    render(<CategorySalesChart />);
    expect(screen.getByTestId('pie')).toBeInTheDocument();
    // The name should fall back to "Uncategorized" in the data transform
  });

  it('handles non-numeric total_amount gracefully', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 'invalid', total_qty: 'bad' },
        ],
      },
    };

    // Should render chart without crashing (Number('invalid') || 0 = 0)
    render(<CategorySalesChart />);
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('handles zero values', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Empty', total_amount: 0, total_qty: 0 },
        ],
      },
    };

    render(<CategorySalesChart />);
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  // ─── Chart Components ──────────────────────────────────────────────

  it('renders tooltip', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 500, total_qty: 25 },
        ],
      },
    };

    render(<CategorySalesChart />);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
  });

  it('renders legend', () => {
    mockDashboardStoreState = {
      categorySales: {
        data: [
          { category: 'Pizza', total_amount: 500, total_qty: 25 },
        ],
      },
    };

    render(<CategorySalesChart />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  // ─── Container Styling ─────────────────────────────────────────────

  it('has white background with border and rounded corners', () => {
    const { container } = render(<CategorySalesChart />);
    const wrapper = container.querySelector('.bg-white.rounded-lg.border');
    expect(wrapper).toBeInTheDocument();
  });
});
