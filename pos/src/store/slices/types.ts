import type { MenuItem as APIMenuItem } from '../../lib/menu-api';
import type { PosProfileCombined } from '../../lib/pos-profile-api';
import type { TableOrder } from '../../lib/order-api';
import type { OrderType } from '../../data/order-types';

// Constants
export const MAX_QUANTITY = 99;
export const MIN_QUANTITY = 0;

// Custom error class for cart operations
export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartError';
  }
}

// Extend the API MenuItem to include UI-specific properties
export interface MenuItem extends Omit<APIMenuItem, 'rate' | 'item_image'> {
  id: string;
  name: string;
  image: string | null;
  price: number;
  quantity?: number;
  description?: string;
  special_dish?: 1 | 0;
  variants?: Array<{ id: string; name: string; price: number }>;
  addons?: Array<{ id: string; name: string; price: number; category: 'sides' | 'drinks' | 'desserts' }>;
  selectedVariant?: { id: string; name: string; price: number };
  selectedAddons?: Array<{ id: string; name: string; price: number }>;
  uniqueId?: string;
  tax_rate?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
}

export interface OrderItem extends MenuItem {
  quantity: number;
  selectedVariant?: { id: string; name: string; price: number };
  selectedAddons?: { id: string; name: string; price: number }[];
  uniqueId?: string;
  comment?: string;
}

export interface PaymentMode {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Category {
  name: string;
  label: string;
}

export interface CartTotals {
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface Aggregator {
  customer: string;
}

// Re-export types needed by slices from external modules
export type { PosProfileCombined, TableOrder, OrderType };