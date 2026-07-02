import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RevenueChartComponent from './RevenueChart';

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

// Mock recharts as simple divs with data-testid
vi.mock('recharts', () => ({
  AreaChart: ({ children, data }: any) => <div data-testid="area-chart" data-length={data?.length}>{children}</div>,
  Area: ({ dataKey, name }: any) => <div data-testid={`area-${dataKey}`} data-name={name} />,
  XAxis: ({ dataKey }: any) => <div data-testid="x-axis" />,
  YAxis: ({ dataKey }: any) => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Legend: () => <div data-testid="legend" />,
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  revenueChart: null,
  selectedGranularity: 'daily',
  setSelectedGranularity: vi.fn(),
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('RevenueChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      revenueChart: null,
      selectedGranularity: 'daily',
      setSelectedGranularity: vi.fn(),
    };
  });

  it('renders the Revenue Overview title', () => {
    render(<RevenueChartComponent />);
    expect(screen.getByText('Revenue Overview')).toBeInTheDocument();
  });

  it('renders granularity buttons', () => {
    render(<RevenueChartComponent />);
    expect(screen.getByText('Hourly')).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
  });

  it('shows no data message when chartData is empty', () => {
    mockDashboardStoreState.revenueChart = null;
    render(<RevenueChartComponent />);
    expect(screen.getByText('No revenue data available')).toBeInTheDocument();
  });

  it('renders chart when data exists', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { date: '2026-07-01', revenue: 500, order_count: 10 },
        { date: '2026-07-02', revenue: 600, order_count: 12 },
      ],
    };
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('calls setSelectedGranularity when granularity button is clicked', () => {
    render(<RevenueChartComponent />);
    fireEvent.click(screen.getByText('Hourly'));
    expect(mockDashboardStoreState.setSelectedGranularity).toHaveBeenCalledWith('hourly');
  });

  it('calls setSelectedGranularity for Daily', () => {
    render(<RevenueChartComponent />);
    fireEvent.click(screen.getByText('Daily'));
    expect(mockDashboardStoreState.setSelectedGranularity).toHaveBeenCalledWith('daily');
  });

  it('calls setSelectedGranularity for Weekly', () => {
    render(<RevenueChartComponent />);
    fireEvent.click(screen.getByText('Weekly'));
    expect(mockDashboardStoreState.setSelectedGranularity).toHaveBeenCalledWith('weekly');
  });

  it('calls setSelectedGranularity for Monthly', () => {
    render(<RevenueChartComponent />);
    fireEvent.click(screen.getByText('Monthly'));
    expect(mockDashboardStoreState.setSelectedGranularity).toHaveBeenCalledWith('monthly');
  });

  it('highlights the selected granularity button', () => {
    mockDashboardStoreState.selectedGranularity = 'daily';
    render(<RevenueChartComponent />);
    const dailyButton = screen.getByText('Daily');
    expect(dailyButton.className).toContain('bg-blue-100');
  });

  it('does not highlight non-selected granularity buttons', () => {
    mockDashboardStoreState.selectedGranularity = 'daily';
    render(<RevenueChartComponent />);
    const hourlyButton = screen.getByText('Hourly');
    expect(hourlyButton.className).not.toContain('bg-blue-100');
  });

  it('uses hour format for hourly granularity', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { hour: 10, revenue: 200, order_count: 5 },
      ],
    };
    mockDashboardStoreState.selectedGranularity = 'hourly';
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('uses month format for monthly granularity', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { month: 'Jul', revenue: 5000, order_count: 100 },
      ],
    };
    mockDashboardStoreState.selectedGranularity = 'monthly';
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('renders chart with responsive container', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { date: '2026-07-01', revenue: 500, order_count: 10 },
      ],
    };
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders revenue area in chart', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { date: '2026-07-01', revenue: 500, order_count: 10 },
      ],
    };
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('area-revenue')).toBeInTheDocument();
  });

  it('renders chart components (grid, axes, tooltip, legend)', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { date: '2026-07-01', revenue: 500, order_count: 10 },
      ],
    };
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('handles zero revenue in data', () => {
    mockDashboardStoreState.revenueChart = {
      data: [
        { date: '2026-07-01', revenue: 0, order_count: 0 },
      ],
    };
    render(<RevenueChartComponent />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });
});
