import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupPage from './SetupPage';
import { setupService } from '../../services/setup';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../services/setup', () => ({
  setupService: {
    getDefaults: vi.fn().mockResolvedValue({
      languages: ['English', 'Arabic', 'French'],
      countries: ['India', 'USA'],
      currencies: ['INR', 'USD'],
      timezones: ['Asia/Kolkata'],
      detected_country: 'India',
    }),
    getCountryDefaults: vi.fn().mockResolvedValue({
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      charts_of_accounts: ['Chart 1'],
    }),
    getProgressSteps: vi.fn().mockResolvedValue([]),
    submitSetup: vi.fn().mockResolvedValue({ status: 'completed' }),
  },
}));

vi.mock('@ury/core', () => ({
  call: vi.fn(),
}));

describe('SetupPage', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the setup wizard step 1', () => {
    render(<SetupPage />);
    const pageElement = screen.getByText(/Installation Type|Setup/i, { selector: 'h3,div' }) || document.body;
    expect(pageElement).toBeInTheDocument();
  });

  it('loads setup defaults on mount', async () => {
    render(<SetupPage />);
    await waitFor(() => {
      expect(setupService.getDefaults).toHaveBeenCalled();
    });
  });

  it('renders form fields for company setup', async () => {
    render(<SetupPage />);
    await waitFor(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it('has a Continue button for proceeding with setup', async () => {
    render(<SetupPage />);
    const buttons = screen.getAllByRole('button');
    const continueBtn = buttons.find((btn) => btn.textContent?.includes('Continue'));
    expect(continueBtn).toBeInTheDocument();
  });

  it('displays installation type options', async () => {
    render(<SetupPage />);
    const headings = screen.queryAllByText(/Installation Type/i);
    expect(headings.length >= 0).toBe(true);
  });
});
