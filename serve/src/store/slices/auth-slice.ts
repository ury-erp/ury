import { StateCreator } from 'zustand'
import { getLoggedUser, getUserRoles } from '@ury/core'

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
}

export type AuthSlice = AuthState & AuthActions

const REDIRECT = '/login?redirect-to=%2Fury%2Fserve'

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
  user: null,
  isLoading: false,
  error: null,

  checkAuth: async () => {
    try {
      set({ isLoading: true, error: null })
      const response = await getLoggedUser()
      if (!response) {
        window.location.href = REDIRECT
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
      window.location.href = REDIRECT
    }
  },

  setUser: (user) => set({ user }),
  clearAuth: () => set({ user: null, isLoading: false, error: null }),
})
