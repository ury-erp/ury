/**
 * Order Types
 * 
 * Type definitions for order management
 */

import { FulfillmentStatus, OrderSource, OrderType } from '@ury/config';

export interface OrderItem {
  item_code: string;
  item_name?: string;
  qty: number;
  rate?: number;
  comment?: string;
}

export interface CreateOrderRequest {
  restaurant: string;
  items: OrderItem[];
  customer_name?: string;
  customer_phone?: string;
  table?: string;
  table_token?: string;
  order_type: OrderType;
  order_source: OrderSource;
  comments?: string;
  scheduled_time?: string;
}

export interface CreateOrderResponse {
  order_token: string;
  invoice_id: string;
  status: 'success' | 'error';
  message: string;
  grand_total: number;
  customer_name?: string;
  table?: string;
  fulfillment_status: FulfillmentStatus;
}

export interface OrderStatus {
  order_token: string;
  invoice_id: string;
  status: string;
  fulfillment_status: FulfillmentStatus;
  order_source: OrderSource;
  restaurant: string;
  table?: string;
  customer_name?: string;
  contact_mobile?: string;
  grand_total: number;
  created_at: string;
  updated_at: string;
}

export interface FulfillmentUpdate {
  order_token: string;
  fulfillment_status: FulfillmentStatus;
  previous_status?: FulfillmentStatus;
  timestamp: string;
  notes?: string;
}

export interface OrderRealtimeEvent {
  order_token: string;
  restaurant: string;
  table?: string;
  order_source: OrderSource;
}
