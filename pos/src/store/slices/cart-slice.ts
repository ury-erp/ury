import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { OrderItem, MenuItem, CartTotals } from './types';
import { CartError, MAX_QUANTITY, MIN_QUANTITY } from './types';
import { generateUniqueId, calculateItemPrice } from './helpers';
import type { POSSliceAll } from './combined';

// --- Types ---

export interface CartState {
  activeOrders: OrderItem[];
  cartId: string | null;
}

export interface CartActions {
  addToOrder: (item: OrderItem) => Promise<void>;
  removeFromOrder: (uniqueId: string) => Promise<void>;
  updateQuantity: (uniqueId: string, quantity: number) => Promise<void>;
  clearOrder: () => Promise<void>;
  initializeCart: () => Promise<void>;
  getCartTotals: () => CartTotals;
  itemExistsInCart: (uniqueId: string) => boolean;
  validateQuantity: (quantity: number) => boolean;
  getItemPrice: (item: OrderItem) => number;
  getItemQuantityFromCart: (item: MenuItem) => number;
}

export type CartSlice = CartState & CartActions;

// --- Slice ---

export const createCartSlice: StateCreator<POSSliceAll, [], [], CartSlice> = (set, get) => ({
  activeOrders: [],
  cartId: null,

  initializeCart: async () => {
    set({ cartId: uuidv4() });
  },

  addToOrder: async (item: OrderItem) => {
    try {
      if (!get().validateQuantity(item.quantity)) {
        throw new CartError(`Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}`);
      }

      const uniqueId = generateUniqueId(item);
      const existingItemIndex = get().activeOrders.findIndex(orderItem => orderItem.uniqueId === uniqueId);

      if (existingItemIndex !== -1) {
        const existingItem = get().activeOrders[existingItemIndex];
        const newQuantity = existingItem.quantity + item.quantity;
        const newComment = item.comment !== undefined ? item.comment : existingItem?.comment || '';

        if (!get().validateQuantity(newQuantity)) {
          throw new CartError(`Cannot add item. Total quantity would exceed ${MAX_QUANTITY}`);
        }

        const newOrders = [...get().activeOrders];
        newOrders[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
          comment: newComment,
        };

        set({ activeOrders: newOrders });
      } else {
        const newOrders = [...get().activeOrders, { ...item, uniqueId }];
        set({ activeOrders: newOrders });
      }
    } catch (error) {
      if (error instanceof CartError) {
        set({ error: error.message });
      } else {
        set({ error: 'Failed to add item to cart' });
      }
    }
  },

  removeFromOrder: async (uniqueId: string) => {
    try {
      const newOrders = get().activeOrders.filter(item => item.uniqueId !== uniqueId);
      set({ activeOrders: newOrders });
    } catch {
      set({ error: 'Failed to remove item from cart' });
    }
  },

  updateQuantity: async (uniqueId: string, quantity: number) => {
    try {
      if (!get().validateQuantity(quantity)) {
        throw new CartError(`Quantity must be between ${MIN_QUANTITY} and ${MAX_QUANTITY}`);
      }

      const newOrders = get().activeOrders.map(item =>
        item.uniqueId === uniqueId ? { ...item, quantity } : item
      );
      set({ activeOrders: newOrders });
    } catch (error) {
      if (error instanceof CartError) {
        set({ error: error.message });
      } else {
        set({ error: 'Failed to update quantity' });
      }
    }
  },

  clearOrder: async () => {
    try {
      set({ activeOrders: [] });
    } catch {
      set({ error: 'Failed to clear cart' });
    }
  },

  getCartTotals: (): CartTotals => {
    const items = get().activeOrders;
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    const subtotal = items.reduce((sum, item) => {
      const itemPrice = calculateItemPrice(item);
      return sum + (itemPrice * item.quantity);
    }, 0);

    const tax = items.reduce((sum, item) => {
      const itemPrice = calculateItemPrice(item);
      const taxRate = item.tax_rate || 0;
      return sum + (itemPrice * item.quantity * (taxRate / 100));
    }, 0);

    return { subtotal, tax, total: subtotal + tax, itemCount };
  },

  itemExistsInCart: (uniqueId: string): boolean => {
    return get().activeOrders.some(item => item.uniqueId === uniqueId);
  },

  validateQuantity: (quantity: number): boolean => {
    return !isNaN(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY;
  },

  getItemPrice: (item: OrderItem): number => {
    return calculateItemPrice(item);
  },

  getItemQuantityFromCart: (item: MenuItem): number => {
    const uniqueId = generateUniqueId(item as OrderItem);
    const cartItem = get().activeOrders.find(orderItem => orderItem.uniqueId === uniqueId);
    return cartItem?.quantity || 0;
  },
});