import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SalesReportView from './SalesReportView';

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

// Mock recharts
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-length={data?.length}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, name }: any) => (
    <div data-testid="chart-bar" data-key={dataKey} data-name={name} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Legend: () => <div data-testid="legend" />,
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
const createSalesReport = (overrides = {}) => ({
  period: 'daily',
  from_date: '2025-01-01',
  to_date: '2025-01-31',
  branch: null,
  summary: {
    total_orders: 150,
    total_revenue: 15000,
    net_revenue: 13500,
    total_tax: 1500,
    avg_order_value: 100,
    unique_customers: 80,
  },
  item_sales: [
    {
      item_code: 'ITEM001',
      item_name: 'Espresso',
      total_qty: 50,
      total_amount: 2500,
      avg_rate: 50,
    },
    {
      item_code: 'ITEM002',
      item_name: 'Cappuccino',
      total_qty: 30,
      total_amount: 1800,
      avg_rate: 60,
    },
  ],
  order_type_sales: [
    { order_type: 'Dine In', order_count: 80, revenue: 8000 },
    { order_type: 'Takeaway', order_count: 70, revenue: 7000 },
  ],
  hourly_sales: [
    { hour: 8, order_count: 15, revenue: 1500 },
    { hour: 12, order_count: 40, revenue: 4000 },
    { hour: 18, order_count: 35, revenue: 3500 },
  ],
  cancelled_orders: { count: 2, amount: 200 },
  payment_summary: [],
  top_customers: [
    {
      customer: 'C001',
      customer_name: 'Alice Smith',
      order_count: 12,
      total_spent: 1200,
    },
    {
      customer: 'C002',
      customer_name: 'Bob Jones',
      order_count: 8,
      total_spent: 800,
    },
  ],
  ...overrides,
});

describe('SalesReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      salesReport: null,
      previousSalesReport: null,
    };
  });

  // ─── Empty / No Data State ────────────────────────────────────────

  it('shows no data message when salesReport is null', () => {
    render(<SalesReportView />);
    expect(
      screen.getByText('reports.sales.noData')
    ).toBeInTheDocument();
  });

  it('does not render summary cards when salesReport is null', () => {
    render(<SalesReportView />);
    expect(screen.queryByText('reports.sales.totalRevenue')).not.toBeInTheDocument();
  });

  // ─── Summary Cards ────────────────────────────────────────────────

  it('renders total revenue summary card', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.totalRevenue')).toBeInTheDocument();
    expect(screen.getByText('€ 15000')).toBeInTheDocument();
  });

  it('renders total orders summary card', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.totalOrders')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('renders average order value summary card', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.avgOrderValue')).toBeInTheDocument();
    expect(screen.getByText('€ 100')).toBeInTheDocument();
  });

  it('renders net revenue summary card', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.netRevenue')).toBeInTheDocument();
    expect(screen.getByText('€ 13500')).toBeInTheDocument();
  });

  it('renders total tax summary card', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.totalTax')).toBeInTheDocument();
    expect(screen.getByText('€ 1500')).toBeInTheDocument();
  });

  it('renders unique customers summary card', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.uniqueCustomers')).toBeInTheDocument();
    // '80' appears in both unique customers card and Dine In orders row
    const eightyValues = screen.getAllByText('80');
    expect(eightyValues.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Cancelled Orders Alert ───────────────────────────────────────

  it('renders cancelled orders alert when count > 0', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    // Text is "2 reports.sales.cancelledOrders" because t() returns the key
    expect(screen.getByText(/reports\.sales\.cancelledOrders/)).toBeInTheDocument();
  });

  it('renders cancelled amount in alert', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    // Text is broken across elements: "reports.sales.cancelledAmount: € 200"
    expect(screen.getByText(/reports\.sales\.cancelledAmount/)).toBeInTheDocument();
  });

  it('does not render cancelled orders alert when count is 0', () => {
    mockStoreState.salesReport = createSalesReport({
      cancelled_orders: { count: 0, amount: 0 },
    });
    render(<SalesReportView />);
    expect(screen.queryByText('reports.sales.cancelledOrders')).not.toBeInTheDocument();
  });

  // ─── Hourly Sales Chart ───────────────────────────────────────────

  it('renders hourly sales chart when hourly data exists', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.hourlyDistribution')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders chart components (grid, axes, tooltip, legend)', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    // Two YAxis components (left and right)
    const yAxes = screen.getAllByTestId('y-axis');
    expect(yAxes.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('renders revenue and orders bars in chart', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    const bars = screen.getAllByTestId('chart-bar');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it('does not render hourly chart when hourly_sales is empty', () => {
    mockStoreState.salesReport = createSalesReport({ hourly_sales: [] });
    render(<SalesReportView />);
    expect(screen.queryByText('reports.sales.hourlyDistribution')).not.toBeInTheDocument();
  });

  // ─── Order Type Breakdown ─────────────────────────────────────────

  it('renders order type breakdown section', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.orderTypeBreakdown')).toBeInTheDocument();
  });

  it('renders order type table headers', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.type')).toBeInTheDocument();
    expect(screen.getByText('reports.sales.orders')).toBeInTheDocument();
    expect(screen.getByText('reports.sales.revenue')).toBeInTheDocument();
  });

  it('renders order type rows with data', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('Dine In')).toBeInTheDocument();
    expect(screen.getByText('Takeaway')).toBeInTheDocument();
  });

  it('does not render order type section when empty', () => {
    mockStoreState.salesReport = createSalesReport({ order_type_sales: [] });
    render(<SalesReportView />);
    expect(screen.queryByText('reports.sales.orderTypeBreakdown')).not.toBeInTheDocument();
  });

  // ─── Item Sales Table ─────────────────────────────────────────────

  it('renders item-wise sales section', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.itemWiseSales')).toBeInTheDocument();
  });

  it('renders item sales table headers', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.item')).toBeInTheDocument();
    expect(screen.getByText('reports.sales.qty')).toBeInTheDocument();
    expect(screen.getByText('reports.sales.avgRate')).toBeInTheDocument();
    expect(screen.getByText('reports.sales.total')).toBeInTheDocument();
  });

  it('renders item names in the table', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText('Cappuccino')).toBeInTheDocument();
  });

  it('renders item quantities in the table', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    // '50' appears as Espresso qty; '30' appears as Cappuccino qty
    const fiftyValues = screen.getAllByText('50');
    expect(fiftyValues.length).toBeGreaterThanOrEqual(1);
    const thirtyValues = screen.getAllByText('30');
    expect(thirtyValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders formatted currency values for items', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('€ 2500')).toBeInTheDocument();
    expect(screen.getByText('€ 1800')).toBeInTheDocument();
  });

  it('does not render item sales section when empty', () => {
    mockStoreState.salesReport = createSalesReport({ item_sales: [] });
    render(<SalesReportView />);
    expect(screen.queryByText('reports.sales.itemWiseSales')).not.toBeInTheDocument();
  });

  // ─── Top Customers ────────────────────────────────────────────────

  it('renders top customers section', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('reports.sales.topCustomers')).toBeInTheDocument();
  });

  it('renders customer names', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('renders customer spent amounts', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('€ 1200')).toBeInTheDocument();
    expect(screen.getByText('€ 800')).toBeInTheDocument();
  });

  it('renders ranking numbers for customers', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not render top customers section when empty', () => {
    mockStoreState.salesReport = createSalesReport({ top_customers: [] });
    render(<SalesReportView />);
    expect(screen.queryByText('reports.sales.topCustomers')).not.toBeInTheDocument();
  });

  // ─── Change Indicators (with previousSalesReport) ─────────────────

  it('shows upward change indicator when current > previous', () => {
    mockStoreState.salesReport = createSalesReport();
    mockStoreState.previousSalesReport = createSalesReport({
      summary: {
        total_orders: 100,
        total_revenue: 10000,
        net_revenue: 9000,
        total_tax: 1000,
        avg_order_value: 80,
        unique_customers: 60,
      },
    });
    const { container } = render(<SalesReportView />);
    const upIndicator = container.querySelector('.text-emerald-600');
    expect(upIndicator).toBeInTheDocument();
  });

  it('shows downward change indicator when current < previous', () => {
    mockStoreState.previousSalesReport = createSalesReport();
    mockStoreState.salesReport = createSalesReport({
      summary: {
        total_orders: 100,
        total_revenue: 10000,
        net_revenue: 9000,
        total_tax: 1000,
        avg_order_value: 80,
        unique_customers: 60,
      },
    });
    const { container } = render(<SalesReportView />);
    const downIndicator = container.querySelector('.text-red-600');
    expect(downIndicator).toBeInTheDocument();
  });

  it('does not show change indicators when no previousSalesReport', () => {
    mockStoreState.salesReport = createSalesReport();
    const { container } = render(<SalesReportView />);
    // No "vs prev" text when no previous report
    expect(screen.queryByText('reports.sales.vsPrevious')).not.toBeInTheDocument();
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('handles zero revenue correctly', () => {
    mockStoreState.salesReport = createSalesReport({
      summary: {
        total_orders: 0,
        total_revenue: 0,
        net_revenue: 0,
        total_tax: 0,
        avg_order_value: 0,
        unique_customers: 0,
      },
      cancelled_orders: { count: 0, amount: 0 },
      item_sales: [],
      order_type_sales: [],
      hourly_sales: [],
      top_customers: [],
    });
    render(<SalesReportView />);
    // Multiple € 0 elements (revenue, avg, net, tax)
    const zeroValues = screen.getAllByText('€ 0');
    expect(zeroValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders responsive container wrapping the chart', () => {
    mockStoreState.salesReport = createSalesReport();
    render(<SalesReportView />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});
