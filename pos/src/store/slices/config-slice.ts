import { StateCreator } from 'zustand';
import { AuthSlice } from './auth-slice';
import { getCombinedPosProfile, PosProfileCombined } from '../../lib/pos-profile-api';
import type { RolePermission } from '../../lib/pos-profile-api';
import { getErrorMessage } from '../../lib/error-utils';

export interface ConfigState {
  allowedRoles: string[];
  isLoading: boolean;
  error: string | null;
  hasAccess: boolean;
  posProfile: PosProfileCombined | null;
}

export interface ConfigActions {
  checkAccess: () => void;
  setAllowedRoles: (roles: string[]) => void;
  fetchPosProfile: (forceRefresh?: boolean) => Promise<void>;
}

export type ConfigSlice = ConfigState & ConfigActions;

const initialState: ConfigState = {
  allowedRoles: [],
  isLoading: false,
  error: null,
  hasAccess: false,
  posProfile: null,
};

export const createConfigSlice: StateCreator<
  ConfigSlice & AuthSlice,
  [],
  [],
  ConfigSlice
> = (set, get) => ({
  ...initialState,

  fetchPosProfile: async (forceRefresh = false) => {
    try {
      set({ isLoading: true, error: null });

      // Check session storage first if not forcing refresh
      const cached = sessionStorage.getItem('posProfile');
      if (cached && !forceRefresh) {
        try {
          const profile = JSON.parse(cached);
          set({ posProfile: profile });
          // Extract and set allowed roles from the profile
          const allowedRoles = profile.role_allowed_for_billing?.map((role: RolePermission) => role.role) || [];
          get().setAllowedRoles(allowedRoles);
          set({ isLoading: false });
          return;
        } catch {
          sessionStorage.removeItem('posProfile');
        }
      }

      // If not in cache or forcing refresh, fetch from API
      const profile = await getCombinedPosProfile();
      
      // Cache the profile
      sessionStorage.setItem('posProfile', JSON.stringify(profile));
      set({ posProfile: profile });

      // Extract and set allowed roles from the profile
      const allowedRoles = profile.role_allowed_for_billing?.map((role: RolePermission) => role.role) || [];
      get().setAllowedRoles(allowedRoles);
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: getErrorMessage(error),
        isLoading: false,
      });
    }
  },

  checkAccess: () => {
    const { user } = get();
    const { allowedRoles } = get();

    if (!user || !user.roles || !allowedRoles.length) {
      set({ hasAccess: false });
      return;
    }

    // Check if user has any of the allowed roles
    const hasAccess = user.name === 'Administrator' || user.roles.some(role => allowedRoles.includes(role));
    set({ hasAccess });

    // Note: AuthGuard handles the no-access UI via !hasAccess check with proper i18n
  },

  setAllowedRoles: (roles) => {
    set({ allowedRoles: roles });
    // After setting new roles, recheck access
    get().checkAccess();
  },
}); 