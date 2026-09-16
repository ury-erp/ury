import { render, screen, cleanup } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './AuthGuard';

const mockUseAuth = vi.fn();

vi.mock('../store/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@ury/ui', () => ({
  Spinner: ({ message }: { message: string }) => <div data-testid="spinner">{message}</div>,
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, error: null, isManager: false });

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders Access Denied with the error message when the auth hook errors', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      error: '403 Forbidden',
      isManager: false,
    });

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('403 Forbidden')).toBeInTheDocument();
  });

  it('renders a generic login prompt when there is no user and no error', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, error: null, isManager: false });

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Please log in to access this section.')).toBeInTheDocument();
  });

  it('renders Permission Required when logged in but not a manager', () => {
    mockUseAuth.mockReturnValue({
      user: 'someone@example.com',
      isLoading: false,
      error: null,
      isManager: false,
    });

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByText('Permission Required')).toBeInTheDocument();
    expect(screen.getByText('This section is restricted to Managers.')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders children when the user is loaded, no error, and is a manager', () => {
    mockUseAuth.mockReturnValue({
      user: 'manager@example.com',
      isLoading: false,
      error: null,
      isManager: true,
    });

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>
    );

    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    expect(screen.queryByText('Permission Required')).not.toBeInTheDocument();
  });
});
