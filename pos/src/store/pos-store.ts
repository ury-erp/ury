import { create } from 'zustand';
import { createMenuSlice, type MenuSlice } from './slices/menu-slice';
import { createCartSlice, type CartSlice } from './slices/cart-slice';
import { createSelectionSlice, type SelectionSlice } from './slices/selection-slice';
import { createAppSlice, type AppSlice } from './slices/app-slice';

// Re-export all types that consumers depend on
export type {
  MenuItem,
  Customer,
  OrderItem,
  PaymentMode,
  Category,
  CartTotals,
  Aggregator,
} from './slices/types';
export { CartError, MAX_QUANTITY, MIN_QUANTITY } from './slices/types';

// Combined store type — mirrors the old POSStore interface exactly
export type POSStore = MenuSlice & CartSlice & SelectionSlice & AppSlice;

export const usePOSStore = create<POSStore>()((...args) => ({
  ...createMenuSlice(...args),
  ...createCartSlice(...args),
  ...createSelectionSlice(...args),
  ...createAppSlice(...args),
}));