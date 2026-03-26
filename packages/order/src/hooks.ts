/**
 * Order Hooks
 * 
 * React hooks for order management
 */

import { useState, useEffect, useCallback } from 'react';
import { createCustomerOrder, getOrderStatus } from './order-api';
import { CreateOrderRequest, CreateOrderResponse, OrderStatus } from './types';

/**
 * Hook for creating orders
 */
export function useCreateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<CreateOrderResponse | null>(null);

  const createOrder = useCallback(async (orderData: CreateOrderRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createCustomerOrder(orderData);
      setOrder(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createOrder, loading, error, order };
}

/**
 * Hook for tracking order status
 */
export function useOrderStatus(orderToken: string | null) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!orderToken) return;
    setLoading(true);
    try {
      const result = await getOrderStatus(orderToken);
      setStatus(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, [orderToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { status, loading, error, refresh: fetchStatus };
}

/**
 * Hook for realtime order status updates
 */
export function useRealtimeOrderStatus(orderToken: string | null) {
  const [status, setStatus] = useState<OrderStatus | null>(null);

  useEffect(() => {
    if (!orderToken || typeof window === 'undefined') return;

    // Check if frappe is available (it's set globally by Frappe)
    const frappe = (window as any).frappe;
    if (!frappe?.realtime) return;

    // Subscribe to status updates
    const eventName = `order_status_${orderToken}`;
    const handler = (data: any) => {
      setStatus(prev => prev ? { ...prev, ...data } : data);
    };

    frappe.realtime.on(eventName, handler);

    return () => {
      frappe.realtime.off(eventName, handler);
    };
  }, [orderToken]);

  return status;
}
