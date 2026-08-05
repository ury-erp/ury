import { call, repositories } from '@ury/core';

export interface POSInvoiceItem {
  name: string;
  item_code: string;
  item_name: string;
  description: string;
  item_group: string;
  image: string;
  qty: number;
  comment: string;
  rate: number;
  amount: number;
  discount_percentage: number;
  discount_amount: number;
}

export interface POSInvoice {
  name: string;
  title: string;
  customer: string;
  customer_name: string;
  mobile_number: string;
  customer_group: string;
  territory: string;
  posting_date: string;
  posting_time: string;
  order_type: string;
  restaurant_table: string;
  custom_merged_tables?: string | null;
  custom_restaurant_room: string;
  status: string;
  total: number;
  grand_total: number;
  rounded_total: number;
  items: POSInvoiceItem[];
  custom_merged_pos_invoice?: string | null;
  custom_merged_total?: number | null;
  waiter?: string;
  invoice_printed?: number;
  docstatus?: number;
}

export interface TableOrder {
  message: POSInvoice | null;
}

/**
 * Fetches the current active order/invoice for a table if any exists
 * Checks online API first, then falls back to local orders repository
 */
export async function getTableOrder(table_no: string): Promise<TableOrder> {
  try {
    const res = await call.get<{ message: POSInvoice | null }>('ury.ury.doctype.ury_order.ury_order.get_order_invoice', { 
      table: table_no
    });
    const inv = res.message;
    if (inv) {
      // Store in local order repository cache
      await repositories.orders.put({
        id: inv.name,
        table: inv.restaurant_table,
        room: inv.custom_restaurant_room,
        order_type: inv.order_type,
        status: inv.status as any,
        no_of_pax: 1,
        customer: inv.customer,
        waiter: inv.waiter,
        items: inv.items.map(i => ({
          item: i.item_code,
          item_name: i.item_name,
          rate: i.rate,
          qty: i.qty,
          amount: i.amount,
          comment: i.comment,
        })),
        grand_total: inv.grand_total,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sync_status: 'synced',
      });
    }
    return res as TableOrder;
  } catch (error) {
    console.warn('Network getTableOrder failed, checking local orders repository:', error);
    const cached = await repositories.orders.findByTable(table_no);
    if (cached) {
      return {
        message: {
          name: cached.id,
          title: cached.id,
          customer: cached.customer || '',
          customer_name: cached.customer || '',
          mobile_number: '',
          customer_group: '',
          territory: '',
          posting_date: new Date().toISOString().split('T')[0],
          posting_time: new Date().toISOString().split('T')[1].substring(0, 8),
          order_type: cached.order_type,
          restaurant_table: cached.table || table_no,
          custom_restaurant_room: cached.room || '',
          status: cached.status,
          total: cached.grand_total,
          grand_total: cached.grand_total,
          rounded_total: cached.grand_total,
          items: cached.items.map((i, idx) => ({
            name: `ROW-${idx}`,
            item_code: i.item,
            item_name: i.item_name,
            description: '',
            item_group: '',
            image: '',
            qty: i.qty,
            comment: i.comment || '',
            rate: i.rate,
            amount: i.amount,
            discount_percentage: 0,
            discount_amount: 0,
          })),
        }
      };
    }
    return { message: null };
  }
} 

export interface SyncOrderRequest {
  table?: string;
  customer?: string;
  items: Array<{
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    comment?: string;
  }>;
  no_of_pax: number;
  mode_of_payment?: string;
  cashier?: string;
  owner?: string;
  waiter?: string;
  pos_profile: string;
  invoice: string | null;
  aggregator_id?: string | null;
  order_type: string;
  last_invoice: string | null;
  comments?: string | null;
  room?: string;
}

export const syncOrder = async (data: SyncOrderRequest) => {
  try {
    const res = await call.post('ury.ury.doctype.ury_order.ury_order.sync_order', data);

    // Save synced order into local repository
    const totalAmount = data.items.reduce((acc, i) => acc + i.rate * i.qty, 0);
    const orderId = data.invoice || (res as any)?.name || `ORD-${Date.now()}`;
    await repositories.orders.put({
      id: orderId,
      table: data.table,
      room: data.room,
      order_type: data.order_type,
      status: 'Draft',
      no_of_pax: data.no_of_pax,
      customer: data.customer,
      waiter: data.waiter,
      cashier: data.cashier,
      pos_profile: data.pos_profile,
      items: data.items.map(i => ({
        item: i.item,
        item_name: i.item_name,
        rate: i.rate,
        qty: i.qty,
        amount: i.rate * i.qty,
        comment: i.comment,
      })),
      grand_total: totalAmount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync_status: 'synced',
    });

    return res;
  } catch (error) {
    console.warn('Network syncOrder failed, queueing command & saving locally in orders repository:', error);

    const tempId = data.invoice || `TEMP-ORD-${Date.now()}`;
    const totalAmount = data.items.reduce((acc, i) => acc + i.rate * i.qty, 0);

    // 1. Store order locally in IndexedDB orders repository
    await repositories.orders.put({
      id: tempId,
      table: data.table,
      room: data.room,
      order_type: data.order_type,
      status: 'Draft',
      no_of_pax: data.no_of_pax,
      customer: data.customer,
      waiter: data.waiter,
      cashier: data.cashier,
      pos_profile: data.pos_profile,
      items: data.items.map(i => ({
        item: i.item,
        item_name: i.item_name,
        rate: i.rate,
        qty: i.qty,
        amount: i.rate * i.qty,
        comment: i.comment,
      })),
      grand_total: totalAmount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync_status: 'pending',
    });

    // 2. Enqueue command into sync_queue repository
    await repositories.syncQueue.put({
      id: `SYNC-ORDER-${Date.now()}`,
      action: 'sync_order',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
      payload: data as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
    });

    return {
      status: 'Queued Offline',
      name: tempId,
    };
  }
};

export interface SplitBillItemMove {
  name: string;
  qty: number;
}

export interface SplitBillResponse {
  source_invoice: string;
  new_invoice: string;
}

export async function splitBill(
  sourceInvoice: string,
  itemsToMove: SplitBillItemMove[],
  customer?: string | null
): Promise<SplitBillResponse> {
  try {
    const res = await call.post('ury.ury.doctype.ury_order.ury_order.split_bill', {
      source_invoice: sourceInvoice,
      items_to_move: itemsToMove,
      customer: customer || undefined,
    });
    return res.message as SplitBillResponse;
  } catch (error) {
    console.warn('Network splitBill failed, queueing command in sync_queue repository:', error);
    await repositories.syncQueue.put({
      id: `SYNC-SPLIT-${Date.now()}`,
      action: 'split_bill',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.split_bill',
      payload: { source_invoice: sourceInvoice, items_to_move: itemsToMove, customer },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
    });
    return {
      source_invoice: sourceInvoice,
      new_invoice: `TEMP-SPLIT-${Date.now()}`,
    };
  }
}

export async function tableTransfer(
  table: string,
  newTable: string,
  invoice: string
): Promise<void> {
  try {
    await call.post('ury.ury.doctype.ury_order.ury_order.table_transfer', {
      table,
      newTable,
      invoice,
    });
  } catch (error) {
    console.warn('Network tableTransfer failed, queueing command in sync_queue repository:', error);
    await repositories.syncQueue.put({
      id: `SYNC-TRANSFER-${Date.now()}`,
      action: 'table_transfer',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.table_transfer',
      payload: { table, newTable, invoice },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
    });
  }
}

export async function captainTransfer(
  currentCaptain: string,
  newCaptain: string,
  invoice: string
): Promise<void> {
  try {
    await call.post('ury.ury.doctype.ury_order.ury_order.captain_transfer', {
      currentCaptain,
      newCaptain,
      invoice,
    });
  } catch (error) {
    console.warn('Network captainTransfer failed, queueing command in sync_queue repository:', error);
    await repositories.syncQueue.put({
      id: `SYNC-CAPTAIN-${Date.now()}`,
      action: 'captain_transfer',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.captain_transfer',
      payload: { currentCaptain, newCaptain, invoice },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 2,
    });
  }
}