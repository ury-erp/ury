import { CartItem, CartTotals, CartConfig, DEFAULT_CART_CONFIG } from './types';

/**
 * Generate a unique ID for a cart item based on its properties
 * This ensures items with different variants/addons are treated as separate line items
 */
export function generateUniqueId(item: Omit<CartItem, 'uniqueId'>): string {
  const variantId = item.selectedVariant?.id || 'default';
  const addonIds = item.selectedAddons?.map(addon => addon.id).sort().join('-') || 'no-addons';
  return `${item.id}-${variantId}-${addonIds}`;
}

/**
 * Calculate the price for a single item including variants and addons
 */
export function calculateItemPrice(item: Omit<CartItem, 'uniqueId'>): number {
  const basePrice = item.selectedVariant?.price || item.price;
  const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
  return basePrice + addonsTotal;
}

/**
 * Calculate cart totals including subtotal, tax, and total
 */
export function calculateCartTotals(items: CartItem[]): CartTotals {
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

  return {
    subtotal,
    tax,
    total: subtotal + tax,
    itemCount
  };
}

/**
 * Validate quantity is within allowed range
 */
export function validateQuantity(
  quantity: number, 
  config: CartConfig = {}
): boolean {
  const { maxQuantity, minQuantity } = { ...DEFAULT_CART_CONFIG, ...config };
  return !isNaN(quantity) && quantity >= minQuantity && quantity <= maxQuantity;
}

/**
 * Format currency amount with symbol
 */
export function formatCurrency(amount: number, symbol: string = '$'): string {
  return `${symbol} ${amount.toFixed(2)}`;
}

/**
 * Cart error class for handling cart-related errors
 */
export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartError';
  }
}
