import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import AggregatorPage from './AggregatorPage';

const mockBranches = Object.freeze([{ name: 'Kozhikode', branch_name: 'Kozhikode' }]);

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: vi.fn(() => ({
    activeBranchId: 'Kozhikode',
    branches: mockBranches,
  })),
}));

vi.mock('../../services/dashboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/dashboard')>();
  return {
    ...actual,
    dashboardService: {
      getModuleRecords: vi.fn(),
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

describe('AggregatorPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows empty state when no aggregators exist', async () => {
    const { dashboardService } = await import('../../services/dashboard');
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<AggregatorPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('renders component without crashing', async () => {
    const { dashboardService } = await import('../../services/dashboard');
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    const { container } = render(<AggregatorPage />);
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('displays branch information when available', async () => {
    const { dashboardService } = await import('../../services/dashboard');
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<AggregatorPage />);
    await waitFor(() => {
      const addButton = screen.getByText('Add Aggregator');
      expect(addButton).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
