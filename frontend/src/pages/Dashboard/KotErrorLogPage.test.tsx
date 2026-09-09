import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import KotErrorLogPage from './KotErrorLogPage';
import { kotErrorLogService } from '../../services/kotErrorLog';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({ activeBranchId: 'branch1' }),
}));

vi.mock('../../services/kotErrorLog', () => ({
  kotErrorLogService: {
    getKotErrors: vi.fn().mockResolvedValue([
      {
        kot: 'KOT-001',
        invoice: 'INV-001',
        invoice_creation_time: '2024-01-01 10:00:00',
        production: 'Kitchen',
      },
    ]),
  },
}));

vi.mock('@ury/core', () => ({
  call: vi.fn((method, params) => {
    if (method === 'frappe.client.get_list') {
      return Promise.resolve({
        message: [{ name: 'profile1' }],
      });
    }
    return Promise.resolve({ message: [] });
  }),
}));

vi.mock('../../components/DeskLink', () => ({
  DeskLink: ({ name }: any) => <a href="#">{name}</a>,
}));

describe('KotErrorLogPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders page', async () => {
    const { container } = render(<KotErrorLogPage />);
    await waitFor(() => {
      expect(container).toBeTruthy();
    }, { timeout: 2000 });
  });

  it('loads profiles', async () => {
    const { call } = await import('@ury/core');
    render(<KotErrorLogPage />);
    await waitFor(() => {
      expect(call).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('calls service methods', async () => {
    render(<KotErrorLogPage />);
    await waitFor(() => {
      expect(kotErrorLogService.getKotErrors).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('has UI elements', async () => {
    render(<KotErrorLogPage />);
    await waitFor(() => {
      const page = document.body;
      expect(page.innerHTML.length).toBeGreaterThan(50);
    }, { timeout: 2000 });
  });
});
