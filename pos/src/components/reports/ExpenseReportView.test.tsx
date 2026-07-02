import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExpenseReportView from './ExpenseReportView';

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
  expenseReport: null,
};

vi.mock('../../store/reports-store', () => ({
  useReportsStore: () => mockStoreState,
}));

// Sample data factory
const createExpenseReport = (overrides = {}) => ({
  from_date: '2025-01-01',
  to_date: '2025-01-31',
  fixed_expenses: [
    {
      name: 'EXP001',
      expense_type: 'Rent',
      description: 'Monthly shop rent',
      amount: 5000,
    },
    {
      name: 'EXP002',
      expense_type: 'Insurance',
      description: 'Business insurance',
      amount: 1500,
    },
  ],
  variable_expenses: [
    {
      name: 'EXP003',
      expense_type: 'Utilities',
      description: 'Electricity and water',
      amount: 800,
      date: '2025-01-15',
    },
    {
      name: 'EXP004',
      expense_type: 'Supplies',
      description: 'Cleaning supplies',
      amount: 300,
      date: '2025-01-20',
    },
  ],
  total_fixed: 6500,
  total_variable: 1100,
  total_expenses: 7600,
  ...overrides,
});

describe('ExpenseReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      expenseReport: null,
    };
  });

  // ─── Empty / No Data State ────────────────────────────────────────

  it('shows no data message when expenseReport is null', () => {
    render(<ExpenseReportView />);
    expect(
      screen.getByText('Select a period to generate an expense report')
    ).toBeInTheDocument();
  });

  it('does not render summary cards when expenseReport is null', () => {
    render(<ExpenseReportView />);
    expect(screen.queryByText('Fixed Expenses')).not.toBeInTheDocument();
    expect(screen.queryByText('Variable Expenses')).not.toBeInTheDocument();
  });

  // ─── Summary Cards ────────────────────────────────────────────────

  it('renders fixed expenses summary card', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    // 'Fixed Expenses' appears twice: in summary card and table heading
    const headings = screen.getAllByText('Fixed Expenses');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('€ 6500')).toBeInTheDocument();
  });

  it('renders variable expenses summary card', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    // 'Variable Expenses' appears twice: in summary card and table heading
    const headings = screen.getAllByText('Variable Expenses');
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('€ 1100')).toBeInTheDocument();
  });

  it('renders total expenses summary card', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('Total Expenses')).toBeInTheDocument();
    expect(screen.getByText('€ 7600')).toBeInTheDocument();
  });

  it('renders summary in a 3-column grid', () => {
    mockStoreState.expenseReport = createExpenseReport();
    const { container } = render(<ExpenseReportView />);
    const grid = container.querySelector('.grid.grid-cols-3');
    expect(grid).toBeInTheDocument();
  });

  // ─── Fixed Expenses Table ─────────────────────────────────────────

  it('renders fixed expenses section heading', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    // There are two headings "Fixed Expenses" — one in summary, one in table section
    const headings = screen.getAllByText('Fixed Expenses');
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it('renders fixed expenses table headers', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    // Table headers appear in both fixed and variable tables
    const typeHeaders = screen.getAllByText('Type');
    expect(typeHeaders.length).toBeGreaterThanOrEqual(1);
    const descHeaders = screen.getAllByText('Description');
    expect(descHeaders.length).toBeGreaterThanOrEqual(1);
    const amountHeaders = screen.getAllByText('Amount');
    expect(amountHeaders.length).toBeGreaterThanOrEqual(1);
  });

  it('renders fixed expense types', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
  });

  it('renders fixed expense descriptions', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('Monthly shop rent')).toBeInTheDocument();
    expect(screen.getByText('Business insurance')).toBeInTheDocument();
  });

  it('renders fixed expense amounts as currency', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('€ 5000')).toBeInTheDocument();
    expect(screen.getByText('€ 1500')).toBeInTheDocument();
  });

  it('shows empty message when no fixed expenses', () => {
    mockStoreState.expenseReport = createExpenseReport({ fixed_expenses: [] });
    render(<ExpenseReportView />);
    expect(
      screen.getByText('No fixed expenses recorded')
    ).toBeInTheDocument();
  });

  // ─── Variable Expenses Table ──────────────────────────────────────

  it('renders variable expenses section heading', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    const headings = screen.getAllByText('Variable Expenses');
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it('renders variable expense table headers including Date', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('renders variable expense types', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('Utilities')).toBeInTheDocument();
    expect(screen.getByText('Supplies')).toBeInTheDocument();
  });

  it('renders variable expense dates', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('2025-01-15')).toBeInTheDocument();
    expect(screen.getByText('2025-01-20')).toBeInTheDocument();
  });

  it('renders variable expense amounts as currency', () => {
    mockStoreState.expenseReport = createExpenseReport();
    render(<ExpenseReportView />);
    expect(screen.getByText('€ 800')).toBeInTheDocument();
    expect(screen.getByText('€ 300')).toBeInTheDocument();
  });

  it('shows empty message when no variable expenses', () => {
    mockStoreState.expenseReport = createExpenseReport({
      variable_expenses: [],
    });
    render(<ExpenseReportView />);
    expect(
      screen.getByText('No variable expenses recorded for this period')
    ).toBeInTheDocument();
  });

  // ─── Description Fallback ─────────────────────────────────────────

  it('renders dash for missing description in fixed expenses', () => {
    mockStoreState.expenseReport = createExpenseReport({
      fixed_expenses: [
        { name: 'EXP010', expense_type: 'Rent', description: '', amount: 5000 },
      ],
    });
    render(<ExpenseReportView />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders dash for missing date in variable expenses', () => {
    mockStoreState.expenseReport = createExpenseReport({
      variable_expenses: [
        {
          name: 'EXP011',
          expense_type: 'Repairs',
          description: 'Fix equipment',
          amount: 200,
          date: '',
        },
      ],
    });
    render(<ExpenseReportView />);
    // The empty date should render as —
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  it('handles zero expense amounts', () => {
    mockStoreState.expenseReport = createExpenseReport({
      fixed_expenses: [
        { name: 'EXP020', expense_type: 'Misc', description: 'No cost item', amount: 0 },
      ],
      variable_expenses: [],
      total_fixed: 0,
      total_variable: 0,
      total_expenses: 0,
    });
    render(<ExpenseReportView />);
    const zeroValues = screen.getAllByText('€ 0');
    expect(zeroValues.length).toBeGreaterThanOrEqual(1);
  });

  it('handles both fixed and variable expenses empty', () => {
    mockStoreState.expenseReport = createExpenseReport({
      fixed_expenses: [],
      variable_expenses: [],
      total_fixed: 0,
      total_variable: 0,
      total_expenses: 0,
    });
    render(<ExpenseReportView />);
    expect(screen.getByText('No fixed expenses recorded')).toBeInTheDocument();
    expect(
      screen.getByText('No variable expenses recorded for this period')
    ).toBeInTheDocument();
  });
});
