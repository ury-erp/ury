/**
 * Cart Types
 * 
 * Core type definitions for the cart system
 */

export interface CartItemVariant {
  id: string;
  name: string;
  price: number;
}

export interface CartItemAddon {
  id: string;
  name: string;
  price: number;
  category?: 'sides' | 'drinks' | 'desserts';
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
  description?: string;
  selectedVariant?: CartItemVariant;
  selectedAddons?: CartItemAddon[];
  uniqueId: string;
  comment?: string;
  tax_rate?: number;
}

export interface CartTotals {
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface CartState {
  items: CartItem[];
  isLoading: boolean;
  error: string | null;
}

export interface CartActions {
  addItem: (item: Omit<CartItem, 'uniqueId'>) => void;
  removeItem: (uniqueId: string) => void;
  updateQuantity: (uniqueId: string, quantity: number) => void;
  updateComment: (uniqueId: string, comment: string) => void;
  clearCart: () => void;
  getTotals: () => CartTotals;
  getItemQuantity: (itemId: string, variantId?: string, addonIds?: string[]) => number;
  itemExists: (uniqueId: string) => boolean;
}

export type CartStore = CartState & CartActions;

// Cart configuration options
export interface CartConfig {
  maxQuantity?: number;
  minQuantity?: number;
  taxIncluded?: boolean;
  defaultTaxRate?: number;
}

// Default configuration
export const DEFAULT_CART_CONFIG: Required<CartConfig> = {
  maxQuantity: 99,
  minQuantity: 0,
  taxIncluded: false,
  defaultTaxRate: 0,
};
