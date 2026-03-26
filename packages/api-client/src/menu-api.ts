import { call } from './client';
import { FrappeResponse, MenuItemAPI } from './types';

/**
 * Menu API
 * 
 * Functions for fetching menu data from the backend
 */

// Customer-facing public menu (no auth required)
export async function getPublicMenu(
  restaurant: string, 
  orderType?: string
): Promise<MenuItemAPI[]> {
  const response = await call.get<FrappeResponse<MenuItemAPI[]>>(
    'ury.ury_customer.api.get_public_menu',
    { restaurant, order_type: orderType }
  );
  return response.message;
}

// Staff menu (requires POS Profile)
export async function getRestaurantMenu(
  posProfile: string,
  room?: string | null,
  orderType?: string
): Promise<MenuItemAPI[]> {
  const response = await call.get<FrappeResponse<MenuItemAPI[]>>(
    'ury.ury_pos.api.getRestaurantMenu',
    { pos_profile: posProfile, room, order_type: orderType }
  );
  return response.message;
}

// Aggregator menu (Swiggy/Zomato)
export async function getAggregatorMenu(aggregator: string): Promise<MenuItemAPI[]> {
  const response = await call.get<FrappeResponse<MenuItemAPI[]>>(
    'ury.ury_pos.api.getAggregatorItem',
    { aggregator }
  );
  return response.message;
}

// Menu courses/categories
export interface MenuCourse {
  name: string;
  course_name?: string;
}

export async function getMenuCourses(): Promise<MenuCourse[]> {
  const response = await call.get<FrappeResponse<MenuCourse[]>>(
    'ury.ury_pos.api.getMenuCourses'
  );
  return response.message;
}
