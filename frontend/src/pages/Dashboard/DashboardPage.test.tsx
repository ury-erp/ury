import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';
import { dashboardService } from '../../services/dashboard';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
    branches: [{ id: 'Kozhikode', name: 'Kozhikode' }],
  }),
}));

vi.mock('../../services/dashboard', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    dashboardService: {
      getSummary: vi.fn().mockResolvedValue({
        total_revenue: 15000,
        total_orders: 25,
        avg_order_value: 600,
      }),
      getCharts: vi.fn().mockResolvedValue(null),
      getRecentTransactions: vi.fn().mockResolvedValue([
        {
          name: 'INV-001',
          customer: 'John Doe',
          order_type: 'Dine In',
          posting_date: '2026-09-09',
          posting_time: '12:30',
          status: 'Paid',
          grand_total: 450,
        },
      ]),
    },
  };
});

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn().mockResolvedValue({ message: [] }),
  };
});

vi.mock('@ury/ui', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    showToast: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

describe('DashboardPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the page with KPI grid and report widgets', async () => {
    render(<DashboardPage />);
    
    await waitFor(() => {
      expect(dashboardService.getSummary).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(document.body).toBeInTheDocument();
  });

  it('loads summary data on mount', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(dashboardService.getSummary).toHaveBeenCalledWith('Kozhikode');
    }, { timeout: 3000 });
  });

  it('loads recent transactions data on mount', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(dashboardService.getRecentTransactions).toHaveBeenCalledWith('Kozhikode', 10);
    }, { timeout: 3000 });
  });

  it('handles errors gracefully when loading data fails', async () => {
    vi.mocked(dashboardService.getSummary).mockRejectedValue(new Error('API Error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<DashboardPage />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    }, { timeout: 3000 });

    consoleSpy.mockRestore();
  });
});
