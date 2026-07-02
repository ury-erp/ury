import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Reports from './Reports';

// ---- Mocks ----

const mockFetchCurrentReport = vi.fn().mockResolvedValue(undefined);
const mockExportToPdf = vi.fn().mockResolvedValue(undefined);
const mockExportToCsv = vi.fn();
const mockSetSelectedReportType = vi.fn();
const mockSetSelectedPeriod = vi.fn();
const mockSetCustomDateRange = vi.fn();
const mockSetComparePeriods = vi.fn();

const defaultStoreState = {
  selectedReportType: 'sales' as const,
  selectedPeriod: 'daily' as const,
  loading: false,
  exporting: false,
  comparePeriods: false,
  fetchCurrentReport: mockFetchCurrentReport,
  exportToPdf: mockExportToPdf,
  exportToCsv: mockExportToCsv,
  setSelectedReportType: mockSetSelectedReportType,
  setSelectedPeriod: mockSetSelectedPeriod,
  setCustomDateRange: mockSetCustomDateRange,
  setComparePeriods: mockSetComparePeriods,
};

const mockUseReportsStore = vi.fn();

vi.mock('../../store/reports-store', () => ({
  useReportsStore: () => mockUseReportsStore(),
}));

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

vi.mock('../../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('./SalesReportView', () => ({
  default: () => <div data-testid="sales-report-view">SalesReportView</div>,
}));

vi.mock('./ExpenseReportView', () => ({
  default: () => <div data-testid="expense-report-view">ExpenseReportView</div>,
}));

vi.mock('./ProfitLossView', () => ({
  default: () => <div data-testid="profit-loss-view">ProfitLossView</div>,
}));

vi.mock('./InventoryReportView', () => ({
  default: () => <div data-testid="inventory-report-view">InventoryReportView</div>,
}));

vi.mock('./PeriodComparisonView', () => ({
  default: () => <div data-testid="period-comparison-view">PeriodComparisonView</div>,
}));

vi.mock('../ui', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Spinner: () => <div data-testid="spinner" />,
}));

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReportsStore.mockReturnValue(defaultStoreState);
  });

  it('renders the Reports title and subtitle', () => {
    render(<Reports />);
    expect(screen.getByText('reports.title')).toBeInTheDocument();
    expect(screen.getByText('reports.subtitle')).toBeInTheDocument();
  });

  it('renders all four report type tabs', () => {
    render(<Reports />);
    expect(screen.getByText('reports.types.sales')).toBeInTheDocument();
    expect(screen.getByText('reports.types.expense')).toBeInTheDocument();
    expect(screen.getByText('reports.types.profitLoss')).toBeInTheDocument();
    expect(screen.getByText('reports.types.inventory')).toBeInTheDocument();
  });

  it('renders period selector buttons', () => {
    render(<Reports />);
    expect(screen.getByText('reports.periods.today')).toBeInTheDocument();
    expect(screen.getByText('reports.periods.yesterday')).toBeInTheDocument();
    expect(screen.getByText('reports.periods.thisWeek')).toBeInTheDocument();
    expect(screen.getByText('reports.periods.thisMonth')).toBeInTheDocument();
  });

  it('renders Export CSV and Export PDF buttons', () => {
    render(<Reports />);
    expect(screen.getByText('reports.exportCsv')).toBeInTheDocument();
    expect(screen.getByText('reports.exportPdf')).toBeInTheDocument();
  });

  it('renders SalesReportView by default (sales type, no comparison)', () => {
    render(<Reports />);
    expect(screen.getByTestId('sales-report-view')).toBeInTheDocument();
  });

  it('shows ExpenseReportView when expense report type is selected', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'expense',
    });
    render(<Reports />);
    expect(screen.getByTestId('expense-report-view')).toBeInTheDocument();
  });

  it('shows ProfitLossView when profit_loss report type is selected', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'profit_loss',
    });
    render(<Reports />);
    expect(screen.getByTestId('profit-loss-view')).toBeInTheDocument();
  });

  it('shows InventoryReportView when inventory report type is selected', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'inventory',
    });
    render(<Reports />);
    expect(screen.getByTestId('inventory-report-view')).toBeInTheDocument();
  });

  it('shows PeriodComparisonView when comparePeriods is true and type is sales', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      comparePeriods: true,
    });
    render(<Reports />);
    expect(screen.getByTestId('period-comparison-view')).toBeInTheDocument();
  });

  it('does not show PeriodComparisonView for non-sales types even if comparePeriods is true', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'expense',
      comparePeriods: true,
    });
    render(<Reports />);
    expect(screen.queryByTestId('period-comparison-view')).not.toBeInTheDocument();
  });

  it('shows Compare Periods toggle only for sales report type', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'sales',
    });
    render(<Reports />);
    expect(screen.getByText('reports.compare.show')).toBeInTheDocument();
  });

  it('does not show Compare Periods toggle for expense report type', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'expense',
    });
    render(<Reports />);
    expect(screen.queryByText('reports.compare.show')).not.toBeInTheDocument();
    expect(screen.queryByText('reports.compare.hide')).not.toBeInTheDocument();
  });

  it('calls setSelectedReportType when a report type tab is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.types.expense'));
    expect(mockSetSelectedReportType).toHaveBeenCalledWith('expense');
  });

  it('calls setSelectedPeriod when a period button is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.periods.yesterday'));
    expect(mockSetSelectedPeriod).toHaveBeenCalledWith('yesterday');
  });

  it('shows custom date range when Custom button is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.periods.custom'));
    expect(screen.getByText('reports.dateFrom')).toBeInTheDocument();
    expect(screen.getByText('reports.dateTo')).toBeInTheDocument();
    expect(screen.getByText('reports.apply')).toBeInTheDocument();
  });

  it('disables Apply button when custom dates are empty', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.periods.custom'));
    const applyBtn = screen.getByText('reports.apply');
    expect(applyBtn).toBeDisabled();
  });

  it('enables Apply button when both custom dates are filled', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.periods.custom'));
    // date inputs don't have textbox role in jsdom, use container query
    const container = screen.getByText('reports.dateFrom').parentElement!;
    const inputs = container.parentElement!.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2025-01-01' } });
    fireEvent.change(inputs[1], { target: { value: '2025-01-31' } });
    const applyBtn = screen.getByText('reports.apply');
    expect(applyBtn).not.toBeDisabled();
  });

  it('calls setCustomDateRange and hides custom date panel when Apply is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.periods.custom'));
    // date inputs don't have textbox role in jsdom, use container query
    const container = screen.getByText('reports.dateFrom').parentElement!;
    const inputs = container.parentElement!.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2025-01-01' } });
    fireEvent.change(inputs[1], { target: { value: '2025-01-31' } });
    fireEvent.click(screen.getByText('reports.apply'));
    expect(mockSetCustomDateRange).toHaveBeenCalledWith('2025-01-01', '2025-01-31');
    // Custom date panel should hide
    expect(screen.queryByText('reports.dateFrom')).not.toBeInTheDocument();
  });

  it('shows loading spinner when loading is true', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      loading: true,
    });
    render(<Reports />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('reports.loading')).toBeInTheDocument();
  });

  it('calls exportToPdf when PDF export button is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.exportPdf'));
    expect(mockExportToPdf).toHaveBeenCalled();
  });

  it('calls exportToCsv when CSV export button is clicked', () => {
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.exportCsv'));
    expect(mockExportToCsv).toHaveBeenCalled();
  });

  it('disables CSV export when loading', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      loading: true,
    });
    render(<Reports />);
    const csvBtn = screen.getByText('reports.exportCsv').closest('button');
    expect(csvBtn).toBeDisabled();
  });

  it('disables PDF export when exporting or loading', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      exporting: true,
    });
    render(<Reports />);
    const pdfBtn = screen.getByText('reports.generating').closest('button');
    expect(pdfBtn).toBeDisabled();
  });

  it('shows "Generating..." text when exporting', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      exporting: true,
    });
    render(<Reports />);
    expect(screen.getByText('reports.generating')).toBeInTheDocument();
  });

  it('toggles compare periods when compare button is clicked', () => {
    mockUseReportsStore.mockReturnValue({
      ...defaultStoreState,
      selectedReportType: 'sales',
    });
    render(<Reports />);
    fireEvent.click(screen.getByText('reports.compare.show'));
    expect(mockSetComparePeriods).toHaveBeenCalledWith(true);
  });

  it('calls fetchCurrentReport on mount', () => {
    render(<Reports />);
    expect(mockFetchCurrentReport).toHaveBeenCalledTimes(1);
  });
});
