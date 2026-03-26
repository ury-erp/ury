/**
 * Order API
 * 
 * Functions for creating and managing orders
 */

import { call } from '@ury/api-client';
import { FrappeResponse } from '@ury/api-client';
import {
  CreateOrderRequest,
  CreateOrderResponse,
  OrderStatus,
  FulfillmentUpdate
} from './types';

/**
 * Create a customer order
 */
export async function createCustomerOrder(
  orderData: CreateOrderRequest
): Promise<CreateOrderResponse> {
  const response = await call.post<FrappeResponse<CreateOrderResponse>>(
    'ury.ury_customer.api.create_customer_order',
    orderData
  );
  return response.message;
}

/**
 * Get order status by token
 */
export async function getOrderStatus(orderToken: string): Promise<OrderStatus> {
  const response = await call.get<FrappeResponse<OrderStatus>>(
    'ury.ury_customer.api.get_order_status',
    { order_token: orderToken }
  );
  return response.message;
}

/**
 * Update fulfillment status (staff only)
 */
export async function updateFulfillmentStatus(
  orderToken: string,
  newStatus: string,
  notes?: string
): Promise<FulfillmentUpdate> {
  const response = await call.post<FrappeResponse<FulfillmentUpdate>>(
    'ury.ury_customer.api.update_fulfillment_status',
    {
      order_token: orderToken,
      new_status: newStatus,
      notes
    }
  );
  return response.message;
}
