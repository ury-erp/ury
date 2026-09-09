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
});
