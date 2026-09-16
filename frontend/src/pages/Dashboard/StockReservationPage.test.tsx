import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import StockReservationPage from './StockReservationPage';
import { getLoggedUser, getUserRoles } from '@ury/core';

vi.mock('@ury/core', () => ({
  getLoggedUser: vi.fn(),
  getUserRoles: vi.fn(),
  showToast: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  call: vi.fn(),
}));

vi.mock('../../context/BranchContext', () => ({
  useBranchContext: () => ({
    activeBranchId: 'Kozhikode',
  }),
}));

vi.mock('../../services/stockReservation', () => ({
  stockReservationService: {
    listReservations: vi.fn().mockResolvedValue([]),
    releaseReservation: vi.fn(),
    fulfillReservation: vi.fn(),
  },
}));

describe('StockReservationPage', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows loading state while checking role', async () => {
    let resolveRoles: any;
    vi.mocked(getLoggedUser).mockResolvedValue('user@test.com');
    vi.mocked(getUserRoles).mockReturnValue(
      new Promise((resolve) => {
        resolveRoles = resolve;
      }),
    );

    render(<StockReservationPage />);

    expect(screen.getByTestId('stock-reservation-role-loading')).toBeInTheDocument();

    resolveRoles({ roles: ['Production Manager'], full_name: 'Test User' });

    await waitFor(() => {
      expect(screen.queryByTestId('stock-reservation-role-loading')).not.toBeInTheDocument();
    });
  });

  it('denies access for non-allowed roles', async () => {
    vi.mocked(getLoggedUser).mockResolvedValue('user@test.com');
    vi.mocked(getUserRoles).mockResolvedValue({
      roles: ['URY Cashier'],
      full_name: 'Test User',
    });

    render(<StockReservationPage />);

    expect(await screen.findByTestId('stock-reservation-access-denied')).toBeInTheDocument();
  });

  it('allows access for Production Manager role', async () => {
    vi.mocked(getLoggedUser).mockResolvedValue('user@test.com');
    vi.mocked(getUserRoles).mockResolvedValue({
      roles: ['Production Manager'],
      full_name: 'Test User',
    });

    render(<StockReservationPage />);

    await waitFor(() => {
      expect(screen.queryByTestId('stock-reservation-role-loading')).not.toBeInTheDocument();
    });
  });

  it('allows access for Stock Manager role', async () => {
    vi.mocked(getLoggedUser).mockResolvedValue('user@test.com');
    vi.mocked(getUserRoles).mockResolvedValue({
      roles: ['Stock Manager'],
      full_name: 'Test User',
    });

    render(<StockReservationPage />);

    await waitFor(() => {
      expect(screen.queryByTestId('stock-reservation-access-denied')).not.toBeInTheDocument();
    });
  });

  it('denies access when not logged in', async () => {
    vi.mocked(getLoggedUser).mockResolvedValue(null);

    render(<StockReservationPage />);

    expect(await screen.findByTestId('stock-reservation-access-denied')).toBeInTheDocument();
  });
});
