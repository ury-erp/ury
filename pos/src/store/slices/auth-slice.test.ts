import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createAuthSlice, type AuthSlice } from './auth-slice';
import { getLoggedUser, getUserRoles } from '../../lib/auth-api';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../lib/auth-api', () => ({
  getLoggedUser: vi.fn(),
  getUserRoles: vi.fn(),
}));

vi.mock('../../lib/error-utils', () => ({
  getErrorMessage: (e: unknown) => String(e),
}));

const useAuthStore = create<AuthSlice>()(createAuthSlice);

describe('auth slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isLoading: false,
      error: null,
    });
    // Reset location.href mock
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  it('initial state has user null, isLoading false, error null', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('checkAuth sets isLoading true then false on success', async () => {
    (getLoggedUser as any).mockResolvedValue('user@example.com');
    (getUserRoles as any).mockResolvedValue({ roles: ['Cashier'], full_name: 'Test User' });

    const promise = useAuthStore.getState().checkAuth();
    // isLoading should be set to true synchronously
    expect(useAuthStore.getState().isLoading).toBe(true);

    await promise;
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('checkAuth calls getLoggedUser', async () => {
    (getLoggedUser as any).mockResolvedValue('user@example.com');
    (getUserRoles as any).mockResolvedValue({ roles: ['Cashier'], full_name: 'Test User' });

    await useAuthStore.getState().checkAuth();
    expect(getLoggedUser).toHaveBeenCalledOnce();
  });

  it('checkAuth sets user with name, full_name, and roles on success', async () => {
    (getLoggedUser as any).mockResolvedValue('user@example.com');
    (getUserRoles as any).mockResolvedValue({ roles: ['Cashier', 'Waiter'], full_name: 'John Doe' });

    await useAuthStore.getState().checkAuth();
    const { user } = useAuthStore.getState();
    expect(user).not.toBeNull();
    expect(user!.name).toBe('user@example.com');
    expect(user!.full_name).toBe('John Doe');
    expect(user!.roles).toEqual(['Cashier', 'Waiter']);
  });

  it('checkAuth redirects to login when no user returned', async () => {
    (getLoggedUser as any).mockResolvedValue(null);

    await useAuthStore.getState().checkAuth();
    expect(window.location.href).toBe('/login?redirect-to=%2Fpos');
  });

  it('checkAuth sets error on API failure', async () => {
    (getLoggedUser as any).mockRejectedValue(new Error('Network error'));

    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().error).toBeTruthy();
  });

  it('checkAuth redirects to login on API failure', async () => {
    (getLoggedUser as any).mockRejectedValue(new Error('Network error'));

    await useAuthStore.getState().checkAuth();
    expect(window.location.href).toBe('/login?redirect-to=%2Fpos');
  });

  it('checkAuth clears error before starting', async () => {
    useAuthStore.setState({ error: 'previous error' });
    (getLoggedUser as any).mockResolvedValue('user@example.com');
    (getUserRoles as any).mockResolvedValue({ roles: ['Cashier'], full_name: 'Test' });

    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('setUser updates the user', () => {
    const newUser = { name: 'admin', roles: ['Admin'], full_name: 'Admin User' };
    useAuthStore.getState().setUser(newUser);
    expect(useAuthStore.getState().user).toEqual(newUser);
  });

  it('setUser can set user to null', () => {
    useAuthStore.setState({ user: { name: 'admin', roles: ['Admin'] } });
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('clearAuth resets to initial state', () => {
    useAuthStore.setState({
      user: { name: 'admin', roles: ['Admin'], full_name: 'Admin' },
      isLoading: true,
      error: 'some error',
    });
    useAuthStore.getState().clearAuth();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });
});
