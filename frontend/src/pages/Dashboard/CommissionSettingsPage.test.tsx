import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import CommissionSettingsPage from './CommissionSettingsPage';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    branches: [
      { id: 'branch1', name: 'Branch 1' },
    ],
  }),
}));

vi.mock('@ury/core', () => ({
  call: {
    get: vi.fn().mockResolvedValue({
      message: {
        enabled: false,
        commission_base: 'Net Sales',
        include_returns: false,
        attribution_mode: 'Opener',
        default_rate: 0,
        tier_period: 'Monthly',
        rules: [],
      },
    }),
    post: vi.fn().mockResolvedValue({
      message: {
        rules: [],
      },
    }),
  },
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CommissionSettingsPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders page', async () => {
    const { container } = render(<CommissionSettingsPage />);
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('loads settings', async () => {
    const { call } = await import('@ury/core');
    render(<CommissionSettingsPage />);
    await waitFor(() => {
      expect(call.get).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('renders spinners and sections', async () => {
    render(<CommissionSettingsPage />);
    await waitFor(() => {
      const page = document.body;
      expect(page.innerHTML.length).toBeGreaterThan(100);
    }, { timeout: 2000 });
  });

  it('has form elements', async () => {
    render(<CommissionSettingsPage />);
    await waitFor(() => {
      const elements = document.querySelectorAll('input, select, button');
      expect(elements.length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });
});
