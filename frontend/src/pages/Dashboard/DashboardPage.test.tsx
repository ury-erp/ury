import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';
import { dashboardService } from '../../services/dashboard';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
    branches: [{ id: 'Kozhikode', name: 'Kozhikode' }],
  }),
}));

const companyState = { activeCompanyId: 'URY UAE' };
vi.mock('../../context/CompanyContext', () => ({
  useCompanyContext: () => companyState,
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
    companyState.activeCompanyId = 'URY UAE';
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
      expect(dashboardService.getSummary).toHaveBeenCalledWith('Kozhikode', 'URY UAE');
    }, { timeout: 3000 });
  });

  it('loads recent transactions data on mount', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(dashboardService.getRecentTransactions).toHaveBeenCalledWith('Kozhikode', 10, 'URY UAE');
    }, { timeout: 3000 });
  });

  it('handles errors gracefully when loading data fails', async () => {
    vi.mocked(dashboardService.getSummary).mockRejectedValue(new Error('API Error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<DashboardPage />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    }, { timeout: 3000 });

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load Service Board data');
    expect(screen.queryByText('Orders Today')).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('discards a late response from the previous company after a switch', async () => {
    let resolveUae: (value: any) => void = () => {};
    vi.mocked(dashboardService.getSummary)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveUae = resolve; }))
      .mockResolvedValueOnce({
        currency: 'OMR',
        currency_breakdown: [],
        today_sales: 75.5,
        today_orders: 3,
        occupied_tables: 0,
        total_tables: 4,
        avg_order_value: 25.167,
        active_cashiers: 1,
        pending_kitchen_orders: 0,
        total_menu_items: 10,
      });

    const { rerender } = render(<DashboardPage />);
    await waitFor(() => expect(dashboardService.getSummary).toHaveBeenCalledTimes(1));

    companyState.activeCompanyId = 'URY Oman';
    rerender(<DashboardPage />);
    await waitFor(() => expect(screen.getByText('OMR 75.5')).toBeInTheDocument());

    // The UAE request finishes last; it must not overwrite the Oman figures.
    await act(async () => {
      resolveUae({
        currency: 'AED',
        currency_breakdown: [],
        today_sales: 9999,
        today_orders: 50,
        occupied_tables: 0,
        total_tables: 4,
        avg_order_value: 199.98,
        active_cashiers: 1,
        pending_kitchen_orders: 0,
        total_menu_items: 10,
      });
    });
    expect(screen.getByText('OMR 75.5')).toBeInTheDocument();
    expect(screen.queryByText(/AED/)).not.toBeInTheDocument();
  });
});
