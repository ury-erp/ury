import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { getBranchOperationalState } from '../lib/branch-operational-state-api';

const callGetMock = vi.fn();
const getOpenEntriesMock = vi.fn();

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: any[]) => callGetMock(...args),
  },
  formatCurrency: (value: number) => `₹${value}`,
}));

vi.mock('../store/pos-store', () => ({
  usePOSStore: () => ({
    posProfile: {
      name: 'POS-Kozhikode',
      branch: 'Kozhikode',
    },
  }),
}));

vi.mock('../lib/pos-closing-api', () => ({
  getOpenPosOpeningEntries: (...args: any[]) => getOpenEntriesMock(...args),
}));

vi.mock('../lib/branch-operational-state-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/branch-operational-state-api')>();
  return {
    ...actual,
    getBranchOperationalState: vi.fn(),
  };
});

const dashboardResponses: Record<string, unknown> = {
  'ury.ury.api.ury_dashboard.get_dashboard_stats': {
    todays_sales: 1200,
    orders_today: 8,
    avg_order_value: 150,
    active_tables: 2,
    total_tables: 10,
  },
  'ury.ury.api.ury_service_line.get_service_line': [],
  'ury.ury.api.ury_dashboard.get_shift_metrics': {
    sales: 1200,
    covers: 16,
    avg_per_cover: 75,
    avg_ticket_minutes: 21,
  },
  'ury.ury.api.ury_dashboard.get_baseline': {
    sample_days: 3,
    median_sales: 1000,
    median_covers: 12,
  },
  'ury.ury.api.ury_dashboard.get_floor_load': [],
  'ury.ury.api.ury_service_line.get_running_low': [],
  'ury.ury.api.ury_dashboard.get_needs_attention': [],
};

describe('POS Dashboard branch status', () => {
  beforeEach(() => {
    vi.mocked(getBranchOperationalState).mockResolvedValue({
      branch: 'Kozhikode',
      service_date: '2026-09-04',
      inside_business_hours: true,
      primary_phase: 'SERVICE_OPEN',
      health: 'WARNING',
      summary: 'Service is open with posting attention',
      active_services: ['Dinner'],
      progress: {
        plan: 'LOCKED_FOR_PRODUCTION',
        shift: 'OPEN',
        service: 'ACTIVE',
        close: 'NOT_STARTED',
      },
      blockers: [
        {
          code: 'FAILED_MTO_POSTING',
          severity: 'blocking',
          count: 2,
          action: 'Review production postings',
        },
      ],
      next_actions: [{ label: 'Review production postings' }],
    });
    callGetMock.mockImplementation((method: string) => Promise.resolve({ message: dashboardResponses[method] ?? [] }));
    getOpenEntriesMock.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: [] }),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the backend-derived branch phase, health, blockers, and progress', async () => {
    render(<Dashboard />);

    expect(await screen.findByTestId('branch-operational-state')).toBeInTheDocument();
    expect(screen.getByText('Service open')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Service is open with posting attention')).toBeInTheDocument();
    expect(screen.getByText('Locked For Production')).toBeInTheDocument();
    expect(screen.getByText('Review production postings (2)')).toBeInTheDocument();
    expect(vi.mocked(getBranchOperationalState)).toHaveBeenCalledWith('Kozhikode');
  });

  it('shows a clear unavailable state when branch status cannot load', async () => {
    vi.mocked(getBranchOperationalState).mockRejectedValueOnce(new Error('offline'));

    render(<Dashboard />);

    expect(await screen.findByText('Failed to load branch status')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('branch-operational-state')).not.toBeInTheDocument());
  });
});
