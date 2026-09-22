import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ServicePage from './ServicePage';
import { uryDashboardService } from '../../services/dashboard';
import { departmentProfitabilityService } from '../../services/departmentProfitability';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'branch1',
    selectedBranch: 'branch1',
    activeBranch: { id: 'branch1', name: 'Branch 1' },
  }),
}));

vi.mock('../../services/dashboard', () => ({
  uryDashboardService: {
    getShiftMetrics: vi.fn().mockResolvedValue({
      sales: 5000,
      covers: 10,
      avg_per_cover: 500,
      avg_ticket_minutes: 15,
    }),
    getNeedsAttention: vi.fn().mockResolvedValue([]),
    getDepartmentActivity: vi.fn().mockResolvedValue({
      branch: 'branch1',
      as_of: '2026-09-22 00:00:00',
      rows: [
        { department: 'Kitchen', tickets_fired: 10, tickets_served: 6, work_orders_completed: 12, qty_produced: 108 },
      ],
    }),
  },
}));

vi.mock('../../services/departmentProfitability', () => ({
  departmentProfitabilityService: {
    getDepartmentProfitability: vi.fn().mockResolvedValue({
      rows: [
        {
          department: 'Kitchen',
          net_revenue: 3000,
          posted_cost: 1000,
          posted_gross_profit: 2000,
        },
      ],
    }),
  },
}));

vi.mock('@ury/core', () => ({
  call: vi.fn().mockResolvedValue({
    message: { company: 'Test Company' },
  }),
}));

describe('ServicePage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the service page', async () => {
    render(<ServicePage />);
    await waitFor(() => {
      expect(screen.getByTestId('service-page')).toBeInTheDocument();
    });
  });

  it('loads shift metrics on mount', async () => {
    render(<ServicePage />);
    await waitFor(() => {
      expect(uryDashboardService.getShiftMetrics).toHaveBeenCalledWith('branch1');
    });
  });

  it('loads needs attention feed', async () => {
    render(<ServicePage />);
    await waitFor(() => {
      expect(uryDashboardService.getNeedsAttention).toHaveBeenCalledWith('branch1');
    });
  });

  it('displays shift metrics and renders departments table', async () => {
    render(<ServicePage />);
    await waitFor(() => {
      const page = screen.getByTestId('service-page');
      expect(page).toBeInTheDocument();
    });
  });

  describe('department tiles show both revenue and genuine activity', () => {
    it('loads department activity once the branch company is resolved', async () => {
      render(<ServicePage />);
      await waitFor(() => {
        expect(uryDashboardService.getDepartmentActivity).toHaveBeenCalledWith('branch1', 'Test Company');
      });
    });

    it('renders the revenue table and the activity table as separate tiles', async () => {
      render(<ServicePage />);
      await waitFor(() => {
        expect(screen.getByTestId('service-departments-table')).toBeInTheDocument();
      });
      expect(screen.getByText('Revenue by Department')).toBeInTheDocument();
      expect(screen.getByTestId('service-department-activity-table')).toBeInTheDocument();
      expect(screen.getByText('Activity by Department')).toBeInTheDocument();
    });

    it('renders KOT and production activity for a department with no revenue rows', async () => {
      vi.mocked(departmentProfitabilityService.getDepartmentProfitability).mockResolvedValueOnce({
        rows: [],
      } as any);

      render(<ServicePage />);

      await waitFor(() => {
        expect(screen.getByTestId('service-department-activity-table')).toHaveTextContent('Kitchen');
      });
      expect(screen.getByTestId('service-department-activity-table')).toHaveTextContent('12'); // work_orders_completed
      expect(screen.getByText('No revenue attributed to a department for today yet.')).toBeInTheDocument();
    });

    it('surfaces a revenue-table error instead of silently rendering it empty', async () => {
      vi.mocked(departmentProfitabilityService.getDepartmentProfitability).mockRejectedValueOnce(
        new Error('Department profitability failed'),
      );

      render(<ServicePage />);

      await waitFor(() => {
        expect(screen.getByTestId('service-departments-error')).toHaveTextContent('Department profitability failed');
      });
    });

    it('surfaces an activity-table error instead of silently rendering it empty', async () => {
      vi.mocked(uryDashboardService.getDepartmentActivity).mockRejectedValueOnce(
        new Error('Department activity failed'),
      );

      render(<ServicePage />);

      await waitFor(() => {
        expect(screen.getByTestId('service-department-activity-error')).toHaveTextContent(
          'Department activity failed',
        );
      });
    });
  });
});
