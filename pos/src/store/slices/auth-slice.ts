import { StateCreator } from 'zustand';
import { getLoggedUser, getUserRoles } from '@ury/core';

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

const USER_STORAGE_KEY = 'ury_auth_user';

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
      sessionStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {}
}

const initialState: AuthState = {
  user: getStoredUser(),
  isLoading: false,
  error: null,
};

export const createAuthSlice: StateCreator<AuthSlice> = (set, _get) => ({
  ...initialState,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null });
      const response = await getLoggedUser();
      
      if (!response) {
        // If offline and we have a stored user, use it rather than kicking to login
        const stored = getStoredUser();
        if (stored) {
          set({ user: stored, isLoading: false });
          return;
        }
        window.location.href = '/login?redirect-to=%2Fpos';
        return;
      }

      // Get user roles
      const roles = await getUserRoles(response);

      const authenticatedUser: User = {
        name: response,
        full_name: roles.full_name,
        roles: roles.roles || [],
      };

      persistUser(authenticatedUser);

      set({
        user: authenticatedUser,
        isLoading: false,
      });
    } catch (error) {
      // Offline fallback: if network fails, use the locally persisted user
      const stored = getStoredUser();
      if (stored) {
        set({
          user: stored,
          isLoading: false,
          error: null,
        });
        return;
      }

      set({ 
        error: (error as Error).message,
        isLoading: false,
        user: null,
      });
      // Redirect to login only if there is no offline session
      window.location.href = '/login?redirect-to=%2Fpos';
    }
  },

  setUser: (user) => {
    persistUser(user);
    set({ user });
  },

  clearAuth: () => {
    persistUser(null);
    set(initialState);
  },
});
 