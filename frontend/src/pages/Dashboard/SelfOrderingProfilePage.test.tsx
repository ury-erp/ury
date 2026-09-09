import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SelfOrderingProfilePage from './SelfOrderingProfilePage';
import { dashboardService } from '../../services/dashboard';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
  }),
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
    call: vi.fn(),
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

const profiles = [
  {
    name: 'SOP-0001',
    profile_name: 'Main Branch QR',
    restaurant: 'URY Main',
    branch: 'Kozhikode',
    pos_profile: 'POS-001',
    enabled: 1,
  },
];

describe('SelfOrderingProfilePage', () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(dashboardService.getModuleRecords).mockReset();
  });

  it('shows empty state when no profiles exist', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<SelfOrderingProfilePage />);
    expect(await screen.findByText('No profiles configured yet')).toBeInTheDocument();
  });

  it('renders a table of profiles', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === 'URY Self Ordering Profile') {
        return profiles;
      }
      return [];
    });

    render(<SelfOrderingProfilePage />);
    expect(await screen.findByText('Main Branch QR')).toBeInTheDocument();
  });

  it('displays profile branch information', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === 'URY Self Ordering Profile') {
        return profiles;
      }
      return [];
    });

    render(<SelfOrderingProfilePage />);
    expect(await screen.findByText('Kozhikode')).toBeInTheDocument();
  });

  it('shows profile status badge', async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === 'URY Self Ordering Profile') {
        return profiles;
      }
      return [];
    });

    render(<SelfOrderingProfilePage />);
    expect(await screen.findByText('Enabled')).toBeInTheDocument();
  });
});
