import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DayClosePage from './DayClosePage';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
    selectedBranch: 'Kozhikode',
    activeBranch: { id: 'Kozhikode', name: 'Kozhikode' },
  }),
}));

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn().mockImplementation(async (method: string, params: any) => {
      if (method === 'frappe.client.get_value') {
        return { message: { company: 'TestCompany' }, company: 'TestCompany' };
      }
      return { message: [] };
    }),
    getLoggedUser: vi.fn().mockResolvedValue('test@example.com'),
    getUserRoles: vi.fn().mockResolvedValue({ roles: ['System Manager'], full_name: 'Test User' }),
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
      info: vi.fn(),
    },
  };
});

vi.mock('../../services/dashboard', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    uryDashboardService: {
      getDailyPnlSummary: vi.fn().mockResolvedValue(null),
      getPlanStatus: vi.fn().mockResolvedValue(null),
      getCloseDayChecklist: vi.fn().mockResolvedValue(null),
    },
  };
});

vi.mock('../../services/departmentProfitability', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    departmentProfitabilityService: {
      getPlanVsActual: vi.fn().mockResolvedValue({ rows: [] }),
    },
  };
});

describe('DayClosePage', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders without crashing', async () => {
    render(<DayClosePage />);
    await waitFor(() => {
      expect(screen.getByTestId('day-close-page')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('renders main content area', async () => {
    render(<DayClosePage />);
    await waitFor(() => {
      expect(screen.getByTestId('day-close-page')).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
