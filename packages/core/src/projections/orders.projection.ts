/**
 * @file orders.projection.ts
 * @description Orders Projection Engine. Computes UI-ready order read models from repositories.
 */

import { repositories, type OrderEntity } from '../storage';
import { projectionBus } from './projection.bus';

export interface OrderProjectionItem {
  id: string;
  table: string | null;
  room: string | null;
  orderType: string;
  status: 'Draft' | 'Unbilled' | 'Recently Paid' | 'Paid' | 'Cancelled';
  pax: number;
  customer: string | null;
  waiter: string | null;
  cashier: string | null;
  itemsCount: number;
  totalAmount: number;
  createdAt: string;
  isPendingSync: boolean;
}

export interface OrdersProjectionData {
  orders: OrderProjectionItem[];
  draftCount: number;
  unbilledCount: number;
  paidCount: number;
  pendingSyncCount: number;
  totalRevenue: number;
}

/**
 * Computes and returns the Orders Projection read model from repositories.
 */
export async function getOrdersProjection(statusFilter?: OrderEntity['status'] | 'all', repos = repositories): Promise<OrdersProjectionData> {
  const rawOrders: OrderEntity[] = await repos.orders.getAll();

  const orders: OrderProjectionItem[] = rawOrders.map((ord: OrderEntity) => ({
    id: ord.id,
    table: ord.table || null,
    room: ord.room || null,
    orderType: ord.order_type,
    status: ord.status,
    pax: ord.no_of_pax || 1,
    customer: ord.customer || null,
    waiter: ord.waiter || null,
    cashier: ord.cashier || null,
    itemsCount: ord.items ? ord.items.reduce((sum: number, i: any) => sum + (i.qty || 1), 0) : 0,
    totalAmount: ord.grand_total || 0,
    createdAt: ord.createdAt,
    isPendingSync: ord.sync_status === 'pending',
  }));

  const draftCount = orders.filter(o => o.status === 'Draft').length;
  const unbilledCount = orders.filter(o => o.status === 'Unbilled').length;
  const paidCount = orders.filter(o => o.status === 'Paid' || o.status === 'Recently Paid').length;
  const pendingSyncCount = orders.filter(o => o.isPendingSync).length;
  const totalRevenue = orders
    .filter(o => o.status === 'Paid' || o.status === 'Recently Paid')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const filteredOrders = statusFilter && statusFilter !== 'all'
    ? orders.filter(o => o.status.toLowerCase() === statusFilter.toLowerCase())
    : orders;

  return {
    orders: filteredOrders,
    draftCount,
    unbilledCount,
    paidCount,
    pendingSyncCount,
    totalRevenue,
  };
}

/**
 * Emits orders projection update event.
 */
export function notifyOrdersProjectionUpdated(): void {
  projectionBus.emit('ORDERS_UPDATED');
}
