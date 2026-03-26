/**
 * Menu API
 */

import { call, FrappeResponse } from '@ury/api-client';
import { MenuItem, RestaurantInfo, TableContext } from './types';

/**
 * Get public menu for a restaurant (guest access)
 */
export async function getPublicMenu(
  restaurant: string,
  orderType?: string
): Promise<MenuItem[]> {
  const response = await call.get<FrappeResponse<MenuItem[]>>(
    'ury.ury_customer.api.get_public_menu',
    { restaurant, order_type: orderType }
  );
  return response.message;
}

/**
 * Get restaurant info by slug
 */
export async function getRestaurantInfo(slug: string): Promise<RestaurantInfo> {
  const response = await call.get<FrappeResponse<RestaurantInfo>>(
    'ury.ury_customer.api.get_restaurant_info',
    { slug }
  );
  return response.message;
}

/**
 * Validate QR table token
 */
export async function validateTableToken(token: string): Promise<TableContext> {
  const response = await call.get<FrappeResponse<TableContext>>(
    'ury.ury_customer.api.validate_table_token',
    { token }
  );
  return response.message;
}
