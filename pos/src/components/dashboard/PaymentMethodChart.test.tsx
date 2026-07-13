import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PaymentMethodChart from './PaymentMethodChart';

// ---- Mocks ----

const mockGetPaymentMethodChart = vi.fn();

vi.mock('../../lib/dashboard-api', () => ({
  getPaymentMethodChart: (...args: any[]) => mockGetPaymentMethodChart(...args),
}));

const mockUseDashboardStore = vi.fn();

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockUseDashboardStore(),
}));

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

vi.mock('../../lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  formatCurrency: (amount: number) => `€${amount}`,
}));

vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, data }: any) => (
    <div data-testid="pie" data-length={data?.length}>{children}</div>
  ),
  Cell: ({ fill }: any) => <div data-testid="chart-cell" data-fill={fill} />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Legend: () => <div data-testid="legend" />,
}));

describe('PaymentMethodChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardStore.mockReturnValue({ selectedPeriod: 'today' });
  });

  it('renders the chart title', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({ data: [] });
    render(<PaymentMethodChart />);
    expect(screen.getByText('dashboard.payment_methods')).toBeInTheDocument();
    // Flush the async useEffect to avoid act() warnings
    await waitFor(() => {
      expect(mockGetPaymentMethodChart).toHaveBeenCalled();
    });
  });

  it('shows loading spinner while fetching data', async () => {
    mockGetPaymentMethodChart.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<PaymentMethodChart />);
    // The spinner div with animate-spin class
    await waitFor(() => {
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  it('shows no data message when API returns empty array', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({ data: [] });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
    });
  });

  it('shows no data message when API returns null', async () => {
    mockGetPaymentMethodChart.mockResolvedValue(null);
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
    });
  });

  it('renders pie chart with data when API returns results', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({
      data: [
        { method: 'Cash', amount: 500, count: 10 },
        { method: 'Card', amount: 300, count: 5 },
      ],
    });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('pie')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('renders correct number of Cell components for data items', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({
      data: [
        { method: 'Cash', amount: 500, count: 10 },
        { method: 'Card', amount: 300, count: 5 },
        { method: 'Mobile', amount: 200, count: 3 },
      ],
    });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByTestId('pie')).toBeInTheDocument();
    });
    const cells = screen.getAllByTestId('chart-cell');
    expect(cells).toHaveLength(3);
  });

  it('handles items with mode_of_payment instead of method field', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({
      data: [
        { mode_of_payment: 'Cash', amount: 500, count: 10 },
      ],
    });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  it('handles items with missing method/mode_of_payment (uses Unknown)', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({
      data: [
        { amount: 500, count: 10 },
      ],
    });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByTestId('pie')).toBeInTheDocument();
    });
  });

  it('handles items with non-numeric amounts (defaults to 0)', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({
      data: [
        { method: 'Cash', amount: null, count: null },
      ],
    });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  it('calls API with selectedPeriod from store', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({ data: [] });
    mockUseDashboardStore.mockReturnValue({ selectedPeriod: 'this_week' });
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(mockGetPaymentMethodChart).toHaveBeenCalledWith('this_week');
    });
  });

  it('shows no data message when API call fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetPaymentMethodChart.mockRejectedValue(new Error('API Error'));
    render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
    });
    consoleErrorSpy.mockRestore();
  });

  it('re-fetches data when selectedPeriod changes', async () => {
    mockGetPaymentMethodChart.mockResolvedValue({ data: [] });
    mockUseDashboardStore.mockReturnValue({ selectedPeriod: 'today' });
    const { rerender } = render(<PaymentMethodChart />);
    await waitFor(() => {
      expect(mockGetPaymentMethodChart).toHaveBeenCalledWith('today');
    });

    mockUseDashboardStore.mockReturnValue({ selectedPeriod: 'this_month' });
    rerender(<PaymentMethodChart />);
    await waitFor(() => {
      expect(mockGetPaymentMethodChart).toHaveBeenCalledWith('this_month');
    });
  });

  it('renders within a container with proper styling', () => {
    mockGetPaymentMethodChart.mockReturnValue(new Promise(() => {}));
    render(<PaymentMethodChart />);
    const container = screen.getByText('dashboard.payment_methods').closest('.bg-white');
    expect(container).toBeInTheDocument();
  });
});
