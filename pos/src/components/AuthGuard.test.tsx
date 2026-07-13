import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthGuard from './AuthGuard';

// Mock i18n
vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getActiveLanguage: () => 'en',
  getActiveDirection: () => 'ltr',
  initI18n: vi.fn(),
}));

// Mock UI Button
vi.mock('./ui/button', () => ({
  Button: ({ children, onClick, variant, className, ...props }: any) => (
    <button onClick={onClick} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
}));

// Mock Spinner
vi.mock('./ui/spinner', () => ({
  Spinner: ({ className }: any) => <div data-testid="spinner" className={className}>Loading</div>,
}));

// Module-level mutable store state
let mockRootStoreState: Record<string, unknown> = {
  checkAuth: vi.fn(),
  user: null,
  isLoading: false,
  error: null,
  fetchPosProfile: vi.fn(),
  posProfile: null,
  hasAccess: false,
};

vi.mock('../store/root-store', () => ({
  useRootStore: () => mockRootStoreState,
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRootStoreState = {
      checkAuth: vi.fn(),
      user: null,
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: null,
      hasAccess: false,
    };
  });

  it('calls checkAuth on mount', () => {
    render(<AuthGuard>Content</AuthGuard>);
    expect(mockRootStoreState.checkAuth).toHaveBeenCalledTimes(1);
  });

  it('shows spinner when auth is loading', () => {
    mockRootStoreState.isLoading = true;
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows spinner when user exists but config is loading', () => {
    mockRootStoreState.user = { name: 'test', roles: [] };
    mockRootStoreState.isLoading = true;
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows error when authError exists', () => {
    mockRootStoreState.error = 'Auth failed';
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByText('auth_guard.access_denied')).toBeInTheDocument();
    expect(screen.getByText('Auth failed')).toBeInTheDocument();
  });

  it('returns null when user is null and not loading', () => {
    mockRootStoreState.user = null;
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    const { container } = render(<AuthGuard>Content</AuthGuard>);
    expect(container.innerHTML).toBe('');
  });

  it('shows configuration error when user exists but no posProfile', () => {
    mockRootStoreState.user = { name: 'test', roles: [] };
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    mockRootStoreState.posProfile = null;
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByText('auth_guard.configuration_error')).toBeInTheDocument();
    expect(screen.getByText('auth_guard.pos_profile_not_configured')).toBeInTheDocument();
  });

  it('shows permission required when hasAccess is false with posProfile', () => {
    mockRootStoreState.user = { name: 'test', roles: [] };
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    mockRootStoreState.posProfile = {
      role_allowed_for_billing: [{ role: 'Cashier' }],
    };
    mockRootStoreState.hasAccess = false;
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByText('auth_guard.permission_required')).toBeInTheDocument();
    expect(screen.getByText('auth_guard.no_permission')).toBeInTheDocument();
  });

  it('renders children when user has access', () => {
    mockRootStoreState.user = { name: 'test', roles: ['Cashier'] };
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    mockRootStoreState.posProfile = { role_allowed_for_billing: [{ role: 'Cashier' }] };
    mockRootStoreState.hasAccess = true;
    render(<AuthGuard>Protected Content</AuthGuard>);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('shows recheck permissions button when hasAccess is false', () => {
    mockRootStoreState.user = { name: 'test', roles: [] };
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    mockRootStoreState.posProfile = {
      role_allowed_for_billing: [{ role: 'Cashier' }],
    };
    mockRootStoreState.hasAccess = false;
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByText('auth_guard.recheck_permissions')).toBeInTheDocument();
  });

  it('calls fetchPosProfile when recheck button is clicked', async () => {
    mockRootStoreState.user = { name: 'test', roles: [] };
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    mockRootStoreState.posProfile = {
      role_allowed_for_billing: [{ role: 'Cashier' }],
    };
    mockRootStoreState.hasAccess = false;
    mockRootStoreState.fetchPosProfile = vi.fn().mockResolvedValue(undefined);
    render(<AuthGuard>Content</AuthGuard>);
    fireEvent.click(screen.getByText('auth_guard.recheck_permissions'));
    await waitFor(() => {
      expect(mockRootStoreState.fetchPosProfile).toHaveBeenCalledWith(true);
    });
  });

  it('shows required roles in no access message', () => {
    mockRootStoreState.user = { name: 'test', roles: [] };
    mockRootStoreState.isLoading = false;
    mockRootStoreState.error = null;
    mockRootStoreState.posProfile = {
      role_allowed_for_billing: [{ role: 'Cashier' }, { role: 'Manager' }],
    };
    mockRootStoreState.hasAccess = false;
    render(<AuthGuard>Content</AuthGuard>);
    expect(screen.getByText(/Cashier, Manager/)).toBeInTheDocument();
  });
});
