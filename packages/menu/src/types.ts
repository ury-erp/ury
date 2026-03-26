/**
 * Menu Types
 */

export interface MenuItem {
  item: string;
  item_name: string;
  rate: number;
  item_image?: string | null;
  course?: string;
  special_dish?: number;
  description?: string;
}

export interface RestaurantInfo {
  name: string;
  restaurant_name: string;
  branch?: string;
  company?: string;
  active_menu?: string;
  default_tax_template?: string;
  slug?: string;
  logo?: string;
  opening_hours?: Record<string, { open: string; close: string }>;
  accepts_online_orders?: boolean;
}

export interface TableContext {
  restaurant: string;
  restaurant_name: string;
  table: string;
  table_name: string;
  room: string;
  menu: string;
  valid: boolean;
}
