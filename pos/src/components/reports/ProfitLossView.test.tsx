import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProfitLossView from './ProfitLossView';

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
  profitLossReport: null,
};

vi.mock('../../store/reports-store', () => ({
  useReportsStore: () => mockStoreState,
}));

// Sample data factories
const createProfitableReport = (overrides = {}) => ({
  from_date: '2025-01-01',
  to_date: '2025-01-31',
  total_revenue: 20000,
  net_revenue: 18000,
  total_tax: 2000,
  cost_of_goods: 8000,
  gross_profit: 12000,
  total_expenses: 6000,
  fixed_expenses: 4000,
  variable_expenses: 2000,
  net_profit: 6000,
  profit_margin: 30,
  ...overrides,
});

const createLossReport = (overrides = {}) => ({
  from_date: '2025-01-01',
  to_date: '2025-01-31',
  total_revenue: 10000,
  net_revenue: 9000,
  total_tax: 1000,
  cost_of_goods: 7000,
  gross_profit: 3000,
  total_expenses: 5000,
  fixed_expenses: 3000,
  variable_expenses: 2000,
  net_profit: -2000,
  profit_margin: -20,
  ...overrides,
});

describe('ProfitLossView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      profitLossReport: null,
    };
  });

  // ─── Empty / No Data State ────────────────────────────────────────

  it('shows no data message when profitLossReport is null', () => {
    render(<ProfitLossView />);
    expect(
      screen.getByText('Select a period to generate a profit & loss report')
    ).toBeInTheDocument();
  });

  it('does not render summary card when profitLossReport is null', () => {
    render(<ProfitLossView />);
    expect(screen.queryByText('Net Profit')).not.toBeInTheDocument();
  });

  // ─── Net Profit Summary ───────────────────────────────────────────

  it('renders net profit heading', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    // 'Net Profit' appears in the heading h3 and in the PLRow label
    const headings = screen.getAllByText('Net Profit');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it('renders net profit value when profitable', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    // '€ 6000' appears in both the summary card and the PLRow
    const profitValues = screen.getAllByText('€ 6000');
    expect(profitValues.length).toBeGreaterThanOrEqual(1);
  });

  it('renders profit margin percentage', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Profit Margin: 30%')).toBeInTheDocument();
  });

  it('renders net profit value when at a loss', () => {
    mockStoreState.profitLossReport = createLossReport();
    render(<ProfitLossView />);
    // Loss: -2000 appears in both the summary card and the PLRow
    const lossValues = screen.getAllByText('-€ 2000');
    expect(lossValues.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Profitable vs Loss Styling ───────────────────────────────────

  it('applies emerald styling when profitable', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    const { container } = render(<ProfitLossView />);
    const gradientEl = container.querySelector('.from-emerald-50');
    expect(gradientEl).toBeInTheDocument();
  });

  it('applies red styling when at a loss', () => {
    mockStoreState.profitLossReport = createLossReport();
    const { container } = render(<ProfitLossView />);
    const gradientEl = container.querySelector('.from-red-50');
    expect(gradientEl).toBeInTheDocument();
  });

  // ─── P&L Breakdown Sections ───────────────────────────────────────

  it('renders Revenue section', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('renders Total Revenue row', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('renders Cost of Goods section', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Cost of Goods')).toBeInTheDocument();
  });

  it('renders COGS row', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('COGS')).toBeInTheDocument();
  });

  it('renders Gross Profit row', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Gross Profit')).toBeInTheDocument();
  });

  it('renders Operating Expenses section', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Operating Expenses')).toBeInTheDocument();
  });

  it('renders Fixed Expenses row', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Fixed Expenses')).toBeInTheDocument();
  });

  it('renders Variable Expenses row', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Variable Expenses')).toBeInTheDocument();
  });

  it('renders Total Expenses row', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('Total Expenses')).toBeInTheDocument();
  });

  // ─── Negative Value Formatting ────────────────────────────────────

  it('renders negative sign for COGS value', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    // COGS is -8000, displayed as "-€ 8000"
    expect(screen.getByText('-€ 8000')).toBeInTheDocument();
  });

  it('renders negative sign for fixed expenses value', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    // Fixed expenses is -4000, displayed as "-€ 4000"
    expect(screen.getByText('-€ 4000')).toBeInTheDocument();
  });

  it('renders negative sign for variable expenses value', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    // Variable expenses is -2000, displayed as "-€ 2000"
    expect(screen.getByText('-€ 2000')).toBeInTheDocument();
  });

  it('renders negative sign for total expenses value', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    // Total expenses is -6000, displayed as "-€ 6000"
    expect(screen.getByText('-€ 6000')).toBeInTheDocument();
  });

  // ─── Profit Margin Bar ────────────────────────────────────────────

  it('renders profit margin bar', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    const { container } = render(<ProfitLossView />);
    const bar = container.querySelector('.bg-gray-200.rounded-full');
    expect(bar).toBeInTheDocument();
  });

  it('renders profit margin percentage text', () => {
    mockStoreState.profitLossReport = createProfitableReport();
    render(<ProfitLossView />);
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('handles zero net profit (break-even)', () => {
    mockStoreState.profitLossReport = createProfitableReport({
      net_profit: 0,
      profit_margin: 0,
    });
    const { container } = render(<ProfitLossView />);
    // Zero profit should be treated as profitable (>=0)
    const gradientEl = container.querySelector('.from-emerald-50');
    expect(gradientEl).toBeInTheDocument();
  });

  it('handles all zero values', () => {
    mockStoreState.profitLossReport = {
      from_date: '2025-01-01',
      to_date: '2025-01-31',
      total_revenue: 0,
      net_revenue: 0,
      total_tax: 0,
      cost_of_goods: 0,
      gross_profit: 0,
      total_expenses: 0,
      fixed_expenses: 0,
      variable_expenses: 0,
      net_profit: 0,
      profit_margin: 0,
    };
    render(<ProfitLossView />);
    const zeroValues = screen.getAllByText('€ 0');
    expect(zeroValues.length).toBeGreaterThanOrEqual(1);
  });
});
