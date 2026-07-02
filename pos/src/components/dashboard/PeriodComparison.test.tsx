import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PeriodComparison from './PeriodComparison';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'dashboard.period_comparison': 'Period Comparison',
      'dashboard.vs_previous_period': 'vs previous period',
      'dashboard.total_revenue': 'Total Revenue',
      'dashboard.total_orders': 'Total Orders',
      'dashboard.no_data_available': 'No data available',
    };
    return translations[key] || key;
  },
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

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  summary: null,
  previousSummary: null,
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('PeriodComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      summary: null,
      previousSummary: null,
    };
  });

  // ─── Title ─────────────────────────────────────────────────────────

  it('renders Period Comparison title', () => {
    render(<PeriodComparison />);
    expect(screen.getByText('Period Comparison')).toBeInTheDocument();
  });

  it('renders vs previous period subtitle', () => {
    render(<PeriodComparison />);
    expect(screen.getByText('vs previous period')).toBeInTheDocument();
  });

  // ─── Empty State ───────────────────────────────────────────────────

  it('shows no data message when summary is null', () => {
    render(<PeriodComparison />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  // ─── Metrics Display ───────────────────────────────────────────────

  it('displays Total Revenue metric', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('displays Total Orders metric', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
  });

  it('displays Avg Order Value metric', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.getByText('Avg Order Value')).toBeInTheDocument();
  });

  // ─── Currency Formatting ───────────────────────────────────────────

  it('formats revenue values as currency', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.getByText('€ 5000')).toBeInTheDocument();
  });

  it('formats average order value as currency', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.getByText('€ 100')).toBeInTheDocument();
  });

  it('formats order counts as numbers', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  // ─── Change Percentage ─────────────────────────────────────────────

  it('shows positive change indicator when current > previous', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 6000,
        total_orders: 60,
        average_order_value: 100,
      },
      previousSummary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
    };

    const { container } = render(<PeriodComparison />);
    // ArrowUpRight icon indicates positive change
    const upArrow = container.querySelector('.text-emerald-600');
    expect(upArrow).toBeInTheDocument();
    // 20% increase appears in multiple metrics, use getAllByText
    const percentEls = screen.getAllByText('20.0%');
    expect(percentEls.length).toBeGreaterThanOrEqual(1);
  });

  it('shows negative change indicator when current < previous', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 4000,
        total_orders: 40,
        average_order_value: 100,
      },
      previousSummary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
    };

    const { container } = render(<PeriodComparison />);
    const downArrow = container.querySelector('.text-red-600');
    expect(downArrow).toBeInTheDocument();
    // 20% decrease appears in multiple metrics, use getAllByText
    const percentEls = screen.getAllByText('20.0%');
    expect(percentEls.length).toBeGreaterThanOrEqual(1);
  });

  it('shows neutral indicator when current equals previous', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
    };

    const { container } = render(<PeriodComparison />);
    const neutralIndicator = container.querySelector('.text-gray-500');
    expect(neutralIndicator).toBeInTheDocument();
    // 0% change appears in all 3 metrics
    const percentEls = screen.getAllByText('0.0%');
    expect(percentEls.length).toBe(3);
  });

  // ─── Previous Values Display ───────────────────────────────────────

  it('shows previous values when previousSummary exists', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 6000,
        total_orders: 60,
        average_order_value: 100,
      },
      previousSummary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 80,
      },
    };

    render(<PeriodComparison />);
    expect(screen.getByText('Prev: € 5000')).toBeInTheDocument();
    expect(screen.getByText('Prev: 50')).toBeInTheDocument();
    expect(screen.getByText('Prev: € 80')).toBeInTheDocument();
  });

  it('does not show previous values when previousSummary is null', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    render(<PeriodComparison />);
    expect(screen.queryByText(/Prev:/)).not.toBeInTheDocument();
  });

  // ─── Edge Cases ────────────────────────────────────────────────────

  it('handles zero previous revenue with positive current as 100% increase', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: {
        total_revenue: 0,
        total_orders: 0,
        average_order_value: 0,
      },
    };

    render(<PeriodComparison />);
    // When previous is 0 and current > 0, change should be 100% for all 3 metrics
    const percentEls = screen.getAllByText('100.0%');
    expect(percentEls.length).toBe(3);
  });

  it('handles zero previous and zero current as no change', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 0,
        total_orders: 0,
        average_order_value: 0,
      },
      previousSummary: {
        total_revenue: 0,
        total_orders: 0,
        average_order_value: 0,
      },
    };

    const { container } = render(<PeriodComparison />);
    // All metrics should be neutral (0% change)
    const neutralIndicators = container.querySelectorAll('.text-gray-500');
    expect(neutralIndicators.length).toBeGreaterThan(0);
  });

  it('handles missing summary fields with defaults', () => {
    mockDashboardStoreState = {
      summary: {}, // all fields undefined
      previousSummary: null,
    };

    render(<PeriodComparison />);
    // Should render with default 0 values — multiple € 0 elements (revenue + avg order value)
    const zeroValues = screen.getAllByText('€ 0');
    expect(zeroValues.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Grid Layout ───────────────────────────────────────────────────

  it('renders metrics in a grid layout', () => {
    mockDashboardStoreState = {
      summary: {
        total_revenue: 5000,
        total_orders: 50,
        average_order_value: 100,
      },
      previousSummary: null,
    };

    const { container } = render(<PeriodComparison />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
  });

  // ─── Container Styling ─────────────────────────────────────────────

  it('has white background with border and rounded corners', () => {
    const { container } = render(<PeriodComparison />);
    const wrapper = container.querySelector('.bg-white.rounded-lg.border');
    expect(wrapper).toBeInTheDocument();
  });
});
