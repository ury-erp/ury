import { create } from 'zustand';
import { createAuthSlice, AuthSlice } from './slices/auth-slice';
import { createConfigSlice, ConfigSlice } from './slices/config-slice';
import { createOrdersSlice, OrdersSlice } from './slices/orders-slice';

export type RootState = AuthSlice & ConfigSlice & OrdersSlice;

export const useRootStore = create<RootState>()((...args) => ({
  ...createAuthSlice(...args),
  ...createConfigSlice(...args),
  ...createOrdersSlice(...args),
})); 