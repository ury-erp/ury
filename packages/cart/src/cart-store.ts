import { create } from 'zustand';
import { 
  CartItem, 
  CartTotals, 
  CartStore, 
  CartConfig, 
  DEFAULT_CART_CONFIG 
} from './types';
import { 
  generateUniqueId, 
  calculateCartTotals, 
  validateQuantity,
  CartError 
} from './utils';

// Create the cart store with Zustand
export const useCartStore = create<CartStore>((set, get) => ({
  // State
  items: [],
  isLoading: false,
  error: null,

  // Actions
  addItem: (item) => {
    const uniqueId = generateUniqueId(item);
    const existingItemIndex = get().items.findIndex(i => i.uniqueId === uniqueId);

    if (existingItemIndex !== -1) {
      // Item exists, update quantity
      const existingItem = get().items[existingItemIndex];
      const newQuantity = existingItem.quantity + item.quantity;

      if (!validateQuantity(newQuantity)) {
        throw new CartError(`Cannot add item. Total quantity would exceed ${DEFAULT_CART_CONFIG.maxQuantity}`);
      }

      const newItems = [...get().items];
      newItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        comment: item.comment !== undefined ? item.comment : existingItem.comment
      };
      
      set({ items: newItems, error: null });
    } else {
      // New item
      set({ 
        items: [...get().items, { ...item, uniqueId }],
        error: null 
      });
    }
  },

  removeItem: (uniqueId) => {
    set({ 
      items: get().items.filter(item => item.uniqueId !== uniqueId),
      error: null 
    });
  },

  updateQuantity: (uniqueId, quantity) => {
    if (!validateQuantity(quantity)) {
      throw new CartError(`Quantity must be between ${DEFAULT_CART_CONFIG.minQuantity} and ${DEFAULT_CART_CONFIG.maxQuantity}`);
    }

    set({
      items: get().items.map(item =>
        item.uniqueId === uniqueId ? { ...item, quantity } : item
      ),
      error: null
    });
  },

  updateComment: (uniqueId, comment) => {
    set({
      items: get().items.map(item =>
        item.uniqueId === uniqueId ? { ...item, comment } : item
      ),
      error: null
    });
  },

  clearCart: () => {
    set({ items: [], error: null });
  },

  getTotals: () => {
    return calculateCartTotals(get().items);
  },

  getItemQuantity: (itemId, variantId, addonIds) => {
    const uniqueId = generateUniqueId({
      id: itemId,
      name: '',
      price: 0,
      quantity: 0,
      selectedVariant: variantId ? { id: variantId, name: '', price: 0 } : undefined,
      selectedAddons: addonIds?.map(id => ({ id, name: '', price: 0 }))
    });
    const item = get().items.find(i => i.uniqueId === uniqueId);
    return item?.quantity || 0;
  },

  itemExists: (uniqueId) => {
    return get().items.some(item => item.uniqueId === uniqueId);
  }
}));

// Hook for accessing cart state and actions
export function useCart() {
  const store = useCartStore();
  return {
    items: store.items,
    isLoading: store.isLoading,
    error: store.error,
    addItem: store.addItem,
    removeItem: store.removeItem,
    updateQuantity: store.updateQuantity,
    updateComment: store.updateComment,
    clearCart: store.clearCart,
    getTotals: store.getTotals,
    getItemQuantity: store.getItemQuantity,
    itemExists: store.itemExists,
  };
}

// Hook for cart totals (re-calculates on every render)
export function useCartTotals(): CartTotals {
  const { getTotals } = useCartStore();
  return getTotals();
}

// Hook for checking if cart is empty
export function useIsCartEmpty(): boolean {
  const { items } = useCartStore();
  return items.length === 0;
}

// Hook for getting cart item count
export function useCartItemCount(): number {
  const { items } = useCartStore();
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
