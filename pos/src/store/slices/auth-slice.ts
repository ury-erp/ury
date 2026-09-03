import { StateCreator } from 'zustand';
import { getLoggedUser, getUserRoles } from '@ury/core';
import { getPinLoginStatus } from '../../lib/pin-auth-api';

export interface User {
  name: string; // This stores the user ID
  roles: string[];
  full_name?: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  pinLoginAvailable: boolean;
  requiresPinLogin: boolean;
  pinMinLength: number;
  pinMaxLength: number;
}

export interface AuthActions {
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  clearAuth: () => void;
}

export type AuthSlice = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null,
  pinLoginAvailable: false,
  requiresPinLogin: false,
  pinMinLength: 4,
  pinMaxLength: 6,
};

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  ...initialState,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      let pinStatus = null;
      try {
        pinStatus = await getPinLoginStatus();
      } catch (pinStatusError) {
        // Backward-compatible fallback during rolling deployments/migrations.
        console.error('Error checking POS PIN login status:', pinStatusError);
      }

      // The guest-safe status endpoint exposes only a boolean and avoids the
      // expected 403 from Frappe's authenticated-user endpoint on the keypad.
      if (pinStatus?.enabled && pinStatus.authenticated === false) {
        set({
          user: null,
          isLoading: false,
          pinLoginAvailable: true,
          requiresPinLogin: true,
          pinMinLength: pinStatus.min_length || 4,
          pinMaxLength: pinStatus.max_length || 6,
        });
        return;
      }

      const response = await getLoggedUser();
      
      if (!response || response === 'Guest') {
        // PIN login is an optional alternative. If no eligible account has it
        // enabled (or an older backend does not expose the endpoint), retain
        // the exact pre-feature redirect to Frappe's normal login page.
        if (pinStatus?.enabled) {
          set({
            user: null,
            isLoading: false,
            pinLoginAvailable: true,
            requiresPinLogin: true,
            pinMinLength: pinStatus.min_length || 4,
            pinMaxLength: pinStatus.max_length || 6,
          });
          return;
        }

        window.location.href = '/login?redirect-to=%2Fpos';
        return;
      }

      const pinLoginAvailable = Boolean(pinStatus?.enabled);

      // Get user roles
      const roles = await getUserRoles(response);

      set({
        user: {
          name: response, // Store the user ID in name field
          full_name: roles.full_name,
          roles: roles.roles,
        },
        isLoading: false,
        pinLoginAvailable,
        requiresPinLogin: false,
      });
    } catch (error) {
      set({ 
        error: (error as Error).message,
        isLoading: false,
        user: null,
      });
      // Redirect to login on error
      window.location.href = '/login?redirect-to=%2Fapp';
    }
  },

  setUser: (user) => {
    set({ user });
  },

  clearAuth: () => {
    set(initialState);
  },
});
