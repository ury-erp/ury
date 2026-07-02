import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PeriodComparisonView from './PeriodComparisonView';

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
    getItem: (key: string) => (key === 'currencySymbol' ? '€' : null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    savePosProfileFull: vi.fn(),
    getPosProfileFull: () => null,
  },
}));

// Module-level mutable store state
let mockStoreState: Record<string, unknown> = {
  salesReport: null,
  previousSalesReport: null,
};

vi.mock('../../store/reports-store', () => ({
  useReportsStore: () => mockStoreState,
}));

// Sample data factories
const createSalesSummary = (overrides = {}) => ({
  total_orders: 150,
  total_revenue: 15000,
  net_revenue: 13500,
  total_tax: 1500,
  avg_order_value: 100,
  unique_customers: 80,
  ...overrides,
});

const createSalesReport = (summaryOverrides = {}) => ({
  period: 'daily',
  from_date: '2025-01-15',
  to_date: '2025-01-31',
  branch: null,
  summary: createSalesSummary(summaryOverrides),
  item_sales: [],
  order_type_sales: [],
  hourly_sales: [],
  cancelled_orders: { count: 0, amount: 0 },
  payment_summary: [],
  top_customers: [],
});

describe('PeriodComparisonView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      salesReport: null,
      previousSalesReport: null,
    };
  });

  // ─── No Data State ────────────────────────────────────────────────

  it('shows no data message when salesReport is null', () => {
    render(<PeriodComparisonView />);
    expect(
      screen.getByText('reports.comparison.noData')
    ).toBeInTheDocument();
  });

  it('does not render comparison content when salesReport is null', () => {
    render(<PeriodComparisonView />);
    expect(screen.queryByText('reports.comparison.currentPeriod')).not.toBeInTheDocument();
  });

  // ─── Current Period Only (no previous data) ───────────────────────

  it('shows no previous data message when previousSalesReport is null', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(
      screen.getByText('reports.comparison.noPreviousData')
    ).toBeInTheDocument();
  });

  it('shows hint text when previousSalesReport is null', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.hint')).toBeInTheDocument();
  });

  it('renders current period summary when no previous data', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.currentPeriod')).toBeInTheDocument();
  });

  it('renders current period revenue value', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(screen.getByText('€ 15000')).toBeInTheDocument();
  });

  it('renders current period order count', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('renders current period avg order value', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(screen.getByText('€ 100')).toBeInTheDocument();
  });

  it('renders all 6 current-only cards', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.revenue')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.orders')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.avgOrder')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.customers')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.tax')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.netRevenue')).toBeInTheDocument();
  });

  // ─── Full Comparison (with previous data) ─────────────────────────

  it('renders period headers when both periods exist', () => {
    mockStoreState.salesReport = createSalesReport();
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.previousPeriod')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.currentPeriod')).toBeInTheDocument();
    expect(screen.getByText('reports.comparison.change')).toBeInTheDocument();
  });

  it('renders previous period date range', () => {
    mockStoreState.salesReport = createSalesReport();
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    expect(screen.getByText(/2025-01-01/)).toBeInTheDocument();
    expect(screen.getByText(/2025-01-14/)).toBeInTheDocument();
  });

  it('renders all 6 comparison metric rows', () => {
    mockStoreState.salesReport = createSalesReport();
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    // Each metric label appears twice (previous and current columns)
    const revenueLabels = screen.getAllByText('reports.comparison.revenue');
    expect(revenueLabels.length).toBe(2);
  });

  // ─── Change Indicators ────────────────────────────────────────────

  it('shows positive change when current > previous', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 15000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    const { container } = render(<PeriodComparisonView />);
    const improvement = container.querySelector('.text-emerald-600');
    expect(improvement).toBeInTheDocument();
  });

  it('shows negative change when current < previous', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 10000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 15000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    const { container } = render(<PeriodComparisonView />);
    const decline = container.querySelector('.text-red-600');
    expect(decline).toBeInTheDocument();
  });

  // ─── Overall Trend Summary ────────────────────────────────────────

  it('renders overall trend summary section', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 15000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.overallUp')).toBeInTheDocument();
  });

  it('renders overall down trend when more metrics decline', () => {
    mockStoreState.salesReport = createSalesReport({
      total_revenue: 10000,
      total_orders: 100,
      avg_order_value: 80,
      net_revenue: 9000,
      total_tax: 1000,
      unique_customers: 50,
    });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({
        total_revenue: 15000,
        total_orders: 200,
        avg_order_value: 120,
        net_revenue: 13500,
        total_tax: 1500,
        unique_customers: 80,
      }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.overallDown')).toBeInTheDocument();
  });

  it('renders neutral trend when metrics are equal', () => {
    const equalSummary = createSalesSummary();
    mockStoreState.salesReport = { ...createSalesReport(), summary: equalSummary };
    mockStoreState.previousSalesReport = {
      ...createSalesReport(),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
      summary: { ...equalSummary },
    };
    render(<PeriodComparisonView />);
    expect(screen.getByText('reports.comparison.overallNeutral')).toBeInTheDocument();
  });

  // ─── Currency Formatting in Comparison ────────────────────────────

  it('formats currency values in comparison rows', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 15000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    const currentRevenue = screen.getAllByText('€ 15000');
    expect(currentRevenue.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Percentage Change Display ────────────────────────────────────

  it('shows percentage change for each metric', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 15000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    // 25% increase in revenue: (15000 - 12000) / 12000 = 25%
    // Positive change shows with "+" prefix: "+25.0%"
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('handles zero previous values', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 15000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({
        total_revenue: 0,
        total_orders: 0,
        avg_order_value: 0,
        net_revenue: 0,
        total_tax: 0,
        unique_customers: 0,
      }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    render(<PeriodComparisonView />);
    // When previous is 0, changePercent = 0
    expect(screen.getByText('reports.comparison.overallUp')).toBeInTheDocument();
  });

  it('renders comparison rows in a grid layout', () => {
    mockStoreState.salesReport = createSalesReport({ total_revenue: 15000 });
    mockStoreState.previousSalesReport = {
      ...createSalesReport({ total_revenue: 12000 }),
      from_date: '2025-01-01',
      to_date: '2025-01-14',
    };
    const { container } = render(<PeriodComparisonView />);
    const grid = container.querySelector('.grid.grid-cols-3');
    expect(grid).toBeInTheDocument();
  });

  it('renders current-only cards in grid layout when no previous data', () => {
    mockStoreState.salesReport = createSalesReport();
    const { container } = render(<PeriodComparisonView />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
  });
});
