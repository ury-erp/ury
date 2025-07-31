import { StateCreator } from 'zustand';
import { getLoggedUser, getUserRoles } from '../../lib/auth-api';

export interface User {
  name: string; // This stores the user ID
  roles: string[];
  full_name?: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
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
};

export const createAuthSlice: StateCreator<AuthSlice> = (set, get) => ({
  ...initialState,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const response = await getLoggedUser();
      
      if (!response) {
        // If no user is logged in, redirect to login
        window.location.href = '/login?redirect-to=%2Fpos';
        return;
      }

      // Get user roles
      const roles = await getUserRoles(response);

      set({
        user: {
          name: response, // Store the user ID in name field
          full_name: roles.full_name,
          roles: roles.roles,
        },
        isLoading: false,
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