import { StateCreator } from 'zustand'
import { getLoggedUser, getUserRoles, login, logout } from '@ury/core'

export interface User {
  name: string
  roles: string[]
  full_name?: string
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
}

export interface AuthActions {
  checkAuth: () => Promise<void>
  setUser: (user: User | null) => void
  clearAuth: () => void
  loginWithCredentials: (username: string, password: string) => Promise<void>
  logoutUser: () => Promise<void>
}

export type AuthSlice = AuthState & AuthActions

export const createAuthSlice: StateCreator<
  AuthSlice,
  [],
  [],
  AuthSlice
> = (set, get) => ({
  user: null,
  isLoading: false,
  error: null,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null })
      const response = await getLoggedUser()
      if (!response) {
        set({ user: null, isLoading: false })
        return
      }
      const roles = await getUserRoles(response)
      set({
        user: {
          name: response,
          full_name: roles.full_name,
          roles: roles.roles,
        },
        isLoading: false,
      })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false, user: null })
    }
  },

  loginWithCredentials: async (username: string, password: string) => {
    try {
      set({ isLoading: true, error: null })
      await login(username, password)
      await get().checkAuth()
    } catch (error) {
      const err = error as Error & { _server_messages?: string }
      let message = err.message || 'Login failed'
      if (err._server_messages) {
        try {
          const parsed = JSON.parse(err._server_messages)
          if (Array.isArray(parsed) && parsed.length > 0) {
            const inner = JSON.parse(parsed[0])
            message = inner.message || message
          }
        } catch {
          // ignore parsing error
        }
      }
      set({ error: message, isLoading: false, user: null })
      throw error
    }
  },

  logoutUser: async () => {
    try {
      await logout()
    } catch (e) {
      console.error('Error during logout:', e)
    } finally {
      sessionStorage.removeItem('posProfile')
      get().clearAuth()
    }
  },

  setUser: (user) => set({ user }),
  clearAuth: () => set({ user: null, isLoading: false, error: null }),
})

