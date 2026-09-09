import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ReportSettingsPage from './ReportSettingsPage';

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
    activeBranch: { name: 'Kozhikode' },
  }),
}));

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    call: vi.fn().mockResolvedValue({ message: {
      name: 'REPORT-SET-001',
      branch: 'Kozhikode',
      extended_hours: false,
      hours: 4,
      buying_price_list: 'Standard Buying',
      depreciation: 5.0,
      electricity_charges: 1200,
      direct_fixed_expenses: [],
      indirect_fixed_expenses: [],
      percentage_expenses: [],
      employee_costs: [],
      monthly_fixed_expenses: [],
      consumables: [],
    }}),
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

describe('ReportSettingsPage', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the page', async () => {
    render(<ReportSettingsPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders business hours section', async () => {
    render(<ReportSettingsPage />);
    expect(await screen.findByText(/Business Hours/i)).toBeInTheDocument();
  });

  it('renders cost configuration section', async () => {
    render(<ReportSettingsPage />);
    expect(await screen.findByText(/Cost Configuration/i)).toBeInTheDocument();
  });

  it('displays page structure', async () => {
    render(<ReportSettingsPage />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
  });
});
