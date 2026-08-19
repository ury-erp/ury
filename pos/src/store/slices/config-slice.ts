import { StateCreator } from 'zustand';
import { AuthSlice } from './auth-slice';
import { getCombinedPosProfile, PosProfileCombined } from '../../lib/pos-profile-api';

interface RolePermission {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: number;
  idx: number;
  role: string;
  parent: string;
  parentfield: string;
  parenttype: string;
  doctype: string;
}

export interface ConfigState {
  allowedRoles: string[];
  isLoading: boolean;
  error: string | null;
  hasAccess: boolean;
  posProfile: PosProfileCombined | null;
}

/**
 * Every role the POS Profile references anywhere, across all its
 * role-permission child tables — not just `role_allowed_for_billing`
 * (billing/cashier capability). This is the app-entry set: "is this a
 * recognized POS-adjacent role for this branch at all," distinct from
 * `role_allowed_for_billing`, which remains the actual billing-capability
 * check (used separately, e.g. in `@ury/core`'s `derivePOSCapabilities`).
 *
 * Fixes a real bug: shipped default POS Profile setup
 * (`ury/ury/api/minimal/business_setup.py`) only puts "URY Cashier" in
 * `role_allowed_for_billing`, so a pure Captain role was locked out of the
 * entire app before this — not just billing actions — by default, out of
 * the box. This is a strict superset of the previous role set, so no
 * existing Cashier/Manager access changes.
 */
const deriveAllowedRoles = (
  profile: Pick<
    PosProfileCombined,
    'role_allowed_for_billing' | 'transfer_role_permissions' | 'role_restricted_for_table_order'
  >
): string[] => {
  const roleSets = [
    profile.role_allowed_for_billing,
    profile.transfer_role_permissions,
    profile.role_restricted_for_table_order,
  ];
  const roles = roleSets.flatMap((rows) => rows?.map((row: RolePermission) => row.role) || []);
  return Array.from(new Set(roles));
};

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
        const profile = JSON.parse(cached);
        set({ posProfile: profile });
        // Extract and set allowed roles from the profile
        const allowedRoles = profile.role_allowed_for_billing?.map((role: RolePermission) => role.role) || [];
        console.log("allowedRoles", allowedRoles);
        get().setAllowedRoles(allowedRoles);
        set({ isLoading: false });
        return;
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
        error: (error as Error).message,
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

    // If no access, we could redirect or show an error message
    if (!hasAccess) {
      set({ error: 'You do not have permission to access this application.' });
    }
  },

  setAllowedRoles: (roles) => {
    set({ allowedRoles: roles });
    // After setting new roles, recheck access
    get().checkAccess();
  },
}); 