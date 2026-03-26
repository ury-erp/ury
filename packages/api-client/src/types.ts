/**
 * Common API Types
 * 
 * Shared type definitions for API responses and requests
 */

// Frappe API Response wrapper
export interface FrappeResponse<T = unknown> {
  message: T;
}

// Pagination params
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// Sorting params
export interface SortParams {
  field: string;
  order: 'asc' | 'desc';
}

// Filter params
export interface FilterParams {
  [key: string]: string | number | boolean | null | undefined;
}

// Common API error
export interface APIError {
  message: string;
  exception?: string;
  httpStatus?: number;
}

// User session
export interface UserSession {
  user: string;
  full_name: string;
  email?: string;
  roles: string[];
}

// Restaurant/Branch info
export interface RestaurantInfo {
  name: string;
  restaurant_name: string;
  branch?: string;
  company?: string;
  active_menu?: string;
  default_tax_template?: string;
  accepts_online_orders?: boolean;
  slug?: string;
  logo?: string;
  opening_hours?: Record<string, { open: string; close: string }>;
}

// Menu item from API
export interface MenuItemAPI {
  item: string;
  item_name: string;
  rate: number | string;
  item_image?: string | null;
  course?: string;
  description?: string;
  special_dish?: 0 | 1;
}

// Table info
export interface TableInfo {
  name: string;
  table_name?: string;
  room: string;
  branch?: string;
  occupied?: 0 | 1;
  seats?: number;
  shape?: string;
}

// Room info
export interface RoomInfo {
  name: string;
  room_name?: string;
  branch?: string;
  room_type?: string;
}
