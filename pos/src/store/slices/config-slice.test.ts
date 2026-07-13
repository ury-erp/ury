import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createConfigSlice, type ConfigSlice } from './config-slice';
import { createAuthSlice, type AuthSlice, type User } from './auth-slice';
import { getCombinedPosProfile } from '../../lib/pos-profile-api';

vi.mock('../../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('../../lib/pos-profile-api', () => ({
  getCombinedPosProfile: vi.fn(),
}));

vi.mock('../../lib/error-utils', () => ({
  getErrorMessage: (e: unknown) => String(e),
}));

type ConfigStore = ConfigSlice & AuthSlice;

const useConfigStore = create<ConfigStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createConfigSlice(...a),
}));

describe('config slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState({
      // AuthSlice initial state
      user: null,
      isLoading: false,
      error: null,
      // ConfigSlice initial state
      allowedRoles: [],
      hasAccess: false,
      posProfile: null,
    });
    sessionStorage.clear();
  });

  it('initial state has allowedRoles [], isLoading false, error null, hasAccess false, posProfile null', () => {
    const state = useConfigStore.getState();
    expect(state.allowedRoles).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.hasAccess).toBe(false);
    expect(state.posProfile).toBeNull();
  });

  it('checkAccess returns false when no user', () => {
    useConfigStore.setState({ allowedRoles: ['Cashier'] });
    useConfigStore.getState().checkAccess();
    expect(useConfigStore.getState().hasAccess).toBe(false);
  });

  it('checkAccess returns false when user has no matching role', () => {
    const user: User = { name: 'user1', roles: ['Waiter'], full_name: 'Test' };
    useConfigStore.setState({ user, allowedRoles: ['Cashier'] });
    useConfigStore.getState().checkAccess();
    expect(useConfigStore.getState().hasAccess).toBe(false);
  });

  it('checkAccess returns true when user has matching role', () => {
    const user: User = { name: 'user1', roles: ['Cashier', 'Waiter'], full_name: 'Test' };
    useConfigStore.setState({ user, allowedRoles: ['Cashier'] });
    useConfigStore.getState().checkAccess();
    expect(useConfigStore.getState().hasAccess).toBe(true);
  });

  it('checkAccess returns true for Administrator regardless of roles', () => {
    const user: User = { name: 'Administrator', roles: [], full_name: 'Admin' };
    useConfigStore.setState({ user, allowedRoles: ['Cashier'] });
    useConfigStore.getState().checkAccess();
    expect(useConfigStore.getState().hasAccess).toBe(true);
  });

  it('checkAccess returns false when allowedRoles is empty', () => {
    const user: User = { name: 'user1', roles: ['Cashier'], full_name: 'Test' };
    useConfigStore.setState({ user, allowedRoles: [] });
    useConfigStore.getState().checkAccess();
    expect(useConfigStore.getState().hasAccess).toBe(false);
  });

  it('setAllowedRoles sets roles and triggers checkAccess', () => {
    const user: User = { name: 'user1', roles: ['Cashier'], full_name: 'Test' };
    useConfigStore.setState({ user });
    useConfigStore.getState().setAllowedRoles(['Cashier', 'Waiter']);
    expect(useConfigStore.getState().allowedRoles).toEqual(['Cashier', 'Waiter']);
    expect(useConfigStore.getState().hasAccess).toBe(true);
  });

  it('fetchPosProfile sets isLoading true then false on success', async () => {
    const mockProfile = {
      name: 'pos-profile-1',
      role_allowed_for_billing: [],
    };
    (getCombinedPosProfile as any).mockResolvedValue(mockProfile);

    const promise = useConfigStore.getState().fetchPosProfile();
    expect(useConfigStore.getState().isLoading).toBe(true);

    await promise;
    expect(useConfigStore.getState().isLoading).toBe(false);
  });

  it('fetchPosProfile uses cached profile from sessionStorage', async () => {
    const cachedProfile = {
      name: 'cached-profile',
      role_allowed_for_billing: [{ role: 'Cashier' }],
    };
    sessionStorage.setItem('posProfile', JSON.stringify(cachedProfile));

    await useConfigStore.getState().fetchPosProfile();
    expect(getCombinedPosProfile).not.toHaveBeenCalled();
    expect(useConfigStore.getState().posProfile).toEqual(cachedProfile);
  });

  it('fetchPosProfile removes invalid cache and fetches fresh', async () => {
    sessionStorage.setItem('posProfile', 'invalid-json');
    const freshProfile = {
      name: 'fresh-profile',
      role_allowed_for_billing: [],
    };
    (getCombinedPosProfile as any).mockResolvedValue(freshProfile);

    await useConfigStore.getState().fetchPosProfile();
    expect(getCombinedPosProfile).toHaveBeenCalledOnce();
    expect(useConfigStore.getState().posProfile).toEqual(freshProfile);
  });

  it('fetchPosProfile forces refresh when forceRefresh is true', async () => {
    const cachedProfile = { name: 'cached-profile', role_allowed_for_billing: [] };
    sessionStorage.setItem('posProfile', JSON.stringify(cachedProfile));
    const freshProfile = {
      name: 'fresh-profile',
      role_allowed_for_billing: [],
    };
    (getCombinedPosProfile as any).mockResolvedValue(freshProfile);

    await useConfigStore.getState().fetchPosProfile(true);
    expect(getCombinedPosProfile).toHaveBeenCalledOnce();
    expect(useConfigStore.getState().posProfile).toEqual(freshProfile);
  });

  it('fetchPosProfile sets error on failure', async () => {
    (getCombinedPosProfile as any).mockRejectedValue(new Error('API Error'));

    await useConfigStore.getState().fetchPosProfile();
    expect(useConfigStore.getState().error).toBeTruthy();
  });

  it('fetchPosProfile extracts allowed roles from profile', async () => {
    const mockProfile = {
      name: 'pos-profile-1',
      role_allowed_for_billing: [
        { role: 'Cashier' },
        { role: 'Waiter' },
      ],
    };
    (getCombinedPosProfile as any).mockResolvedValue(mockProfile);

    await useConfigStore.getState().fetchPosProfile();
    expect(useConfigStore.getState().allowedRoles).toEqual(['Cashier', 'Waiter']);
  });
});
