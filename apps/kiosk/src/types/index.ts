/**
 * Kiosk-specific types
 */

import { MenuItem, RestaurantInfo } from '@ury/menu';
import { CartItem } from '@ury/cart';

export type KioskView = 'attract' | 'menu' | 'item-detail' | 'checkout' | 'confirmation';

export interface KioskConfig {
  deviceToken: string;
  restaurant: string;
  restaurantName: string;
  branch?: string;
  logo?: string;
  theme?: {
    primaryColor?: string;
    accentColor?: string;
  };
}

export interface KioskState {
  currentView: KioskView;
  selectedItem: MenuItem | null;
  selectedCategory: string | null;
  orderType: 'Dine In' | 'Take Away' | null;
  customerPhone: string;
  lastOrderToken: string | null;
  inactivityWarning: boolean;
}

export interface KioskContextType {
  config: KioskConfig | null;
  state: KioskState;
  setView: (view: KioskView) => void;
  selectItem: (item: MenuItem | null) => void;
  selectCategory: (category: string | null) => void;
  setOrderType: (type: 'Dine In' | 'Take Away') => void;
  setCustomerPhone: (phone: string) => void;
  setLastOrderToken: (token: string) => void;
  resetToAttract: () => void;
  isConfigured: boolean;
}

// Device authentication
export interface DeviceAuth {
  token: string;
  restaurant: string;
  validatedAt: string;
}

// Receipt printing
export interface ReceiptData {
  orderToken: string;
  invoiceId: string;
  items: CartItem[];
  total: number;
  orderType: string;
  customerPhone?: string;
  timestamp: string;
}

// Category with items
export interface CategoryGroup {
  name: string;
  items: MenuItem[];
}
