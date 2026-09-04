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
 * The app's fixed POS role vocabulary, defined by `ury/fixtures/role.json`
 * (not per-installation POS Profile config) — the same way `Administrator`/
 * `System Manager` are already treated as fixed platform concepts elsewhere
 * in this file. These are always allowed to enter the app; POS Profile's
 * role-permission child tables (below) are opt-in CAPABILITY grants layered
 * on top (billing, transfer, table-order restriction-exemption), not a
 * registry of "who is a POS user" — verified against a real restored POS
 * Profile, where `role_allowed_for_billing` / `transfer_role_permissions` /
 * `role_restricted_for_table_order` do NOT reference "URY Captain" at all,
 * which would leave Captain locked out if this set were config-only.
 */
const URY_POS_ROLES = ['URY Captain', 'URY Cashier', 'URY Manager'];

/**
 * Allowed-to-enter-the-app role set: the fixed URY POS role vocabulary
 * (above) unioned with every role the POS Profile additionally references
 * across its role-permission child tables — not just `role_allowed_for_billing`
 * (billing/cashier capability, which remains the separate, actual billing
 * check used elsewhere, e.g. in `@ury/core`'s `derivePOSCapabilities`).
 *
 * Fixes a real bug: `AuthGuard` previously derived `allowedRoles` solely
 * from `role_allowed_for_billing`, and the shipped default POS Profile
 * setup (`ury/ury/api/minimal/business_setup.py`) only puts "URY Cashier"
 * there — so a pure Captain role was locked out of the entire app, not
 * just billing actions, out of the box. This is a strict superset of the
 * previous role set, so no existing Cashier/Manager access changes.
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
  const configuredRoles = roleSets.flatMap((rows) => rows?.map((row: RolePermission) => row.role) || []);
  return Array.from(new Set([...URY_POS_ROLES, ...configuredRoles]));
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
        // Allowed to enter the app: any role this POS Profile references
        // anywhere (billing, transfer, table-order-restricted) — see
        // deriveAllowedRoles for why this isn't billing-role-only.
        const allowedRoles = deriveAllowedRoles(profile);
        get().setAllowedRoles(allowedRoles);
        set({ isLoading: false });
        return;
      }

      // If not in cache or forcing refresh, fetch from API
      const profile = await getCombinedPosProfile();

      // Cache the profile
      sessionStorage.setItem('posProfile', JSON.stringify(profile));
      set({ posProfile: profile });

      // Allowed to enter the app: see deriveAllowedRoles.
      const allowedRoles = deriveAllowedRoles(profile);
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