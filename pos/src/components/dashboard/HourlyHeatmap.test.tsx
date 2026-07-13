import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HourlyHeatmap from './HourlyHeatmap';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Module-level mutable store state
let mockDashboardStoreState: Record<string, unknown> = {
  summary: null,
};

vi.mock('../../store/dashboard-store', () => ({
  useDashboardStore: () => mockDashboardStoreState,
}));

describe('HourlyHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardStoreState = {
      summary: null,
    };
  });

  it('renders the heatmap title', () => {
    render(<HourlyHeatmap />);
    expect(screen.getByText('dashboard.hourly_heatmap')).toBeInTheDocument();
  });

  it('shows no data message when no hourly_breakdown', () => {
    mockDashboardStoreState.summary = null;
    render(<HourlyHeatmap />);
    expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
  });

  it('shows no data message when summary has no hourly_breakdown', () => {
    mockDashboardStoreState.summary = {};
    render(<HourlyHeatmap />);
    expect(screen.getByText('dashboard.no_data_available')).toBeInTheDocument();
  });

  it('renders day labels when data exists', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  it('renders all 7 day labels', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('renders hour labels for even hours', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 0, order_count: 1, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows order count in cells with data', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows tooltip on cell hover', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    // Find the cell with count 5 and hover
    const cell = screen.getByText('5');
    fireEvent.mouseEnter(cell);
    // Tooltip should show the day and hour info
    expect(screen.getByText('Mon 10:00 - 11:00')).toBeInTheDocument();
    expect(screen.getByText('5 orders')).toBeInTheDocument();
  });

  it('hides tooltip on cell mouse leave', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    const cell = screen.getByText('5');
    fireEvent.mouseEnter(cell);
    expect(screen.getByText('5 orders')).toBeInTheDocument();
    fireEvent.mouseLeave(cell);
    expect(screen.queryByText('5 orders')).not.toBeInTheDocument();
  });

  it('renders legend with color steps', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('distributes data across all days when no day info', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 3 },
      ],
    };
    render(<HourlyHeatmap />);
    // Without day info, it should distribute across all 7 days
    const cells = screen.getAllByText('3');
    expect(cells.length).toBe(7);
  });

  it('applies correct color based on intensity', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 10, day: 0 },
        { hour: 11, order_count: 1, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    // The cell with count 10 (max) should have higher intensity color
    // '10' could appear in hour labels too, so search in heatmap cells
    const allCells = document.querySelectorAll('.aspect-square');
    const highCell = Array.from(allCells).find(el => el.textContent === '10');
    expect(highCell).toBeTruthy();
    expect(highCell?.className).toContain('bg-blue-700');
  });

  it('shows abbreviated count for values >= 100', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 150, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('renders the legend steps', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 5, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    const legendItems = document.querySelectorAll('.w-3.h-3.rounded-sm');
    expect(legendItems.length).toBe(5);
  });

  it('uses blue-50 for zero count cells', () => {
    mockDashboardStoreState.summary = {
      hourly_breakdown: [
        { hour: 10, order_count: 10, day: 0 },
      ],
    };
    render(<HourlyHeatmap />);
    // Cells with 0 count should have bg-blue-50
    const allCells = document.querySelectorAll('.aspect-square');
    const zeroCells = Array.from(allCells).filter(el => el.textContent === '');
    if (zeroCells.length > 0) {
      expect(zeroCells[0].className).toContain('bg-blue-50');
    }
  });
});
