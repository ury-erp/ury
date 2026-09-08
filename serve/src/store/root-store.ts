import { create } from 'zustand'
import { createAuthSlice, type AuthSlice } from './slices/auth-slice'
import { createConfigSlice, type ConfigSlice } from './slices/config-slice'

export type RootState = AuthSlice & ConfigSlice

export const useRootStore = create<RootState>()((...args) => ({
  ...createAuthSlice(...args),
  ...createConfigSlice(...args),
}))
