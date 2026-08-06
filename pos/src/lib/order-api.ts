import { call, repositories, apiRegistry, projectionBus, type OrderEntity } from '@ury/core';

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
          custom_merged_tables: null,
          custom_restaurant_room: cached.room || '',
          status: cached.status,
          total: cached.grand_total,
          grand_total: cached.grand_total,
          rounded_total: cached.grand_total,
          items: cached.items.map(i => ({
            name: i.item,
            item_code: i.item,
            item_name: i.item_name,
            description: '',
            item_group: '',
            image: '',
            qty: i.qty,
            comment: i.comment || '',
            rate: i.rate,
            amount: i.amount || i.rate * i.qty,
            discount_percentage: 0,
            discount_amount: 0,
          })),
        }
      };
    }
    return { message: null };
  }
}

export interface SyncOrderData {
  table?: string;
  order_type: string;
  no_of_pax: number;
  invoice?: string;
  last_invoice?: string;
  /** For Aggregator orders — the aggregator partner ID (Swiggy, Zomato, etc.) */
  aggregator_id?: string | null;
  room?: string;
  items: Array<{
    item: string;
    item_name: string;
    rate: number;
    qty: number;
    comment?: string;
  }>;
  waiter?: string;
  customer?: string;
  cashier?: string;
  owner?: string;
  pos_profile: string;
  comments?: string;
  /**
   * Idempotency key for deduplication on retry.
   * The backend uses this to prevent duplicate POS Invoice creation.
   * Must be a stable UUID (not timestamp-based) so retries send the same key.
   */
  idempotency_key?: string;
}

export interface CancelOrderInput {
  name: string;
  restaurant_table?: string | null;
}

export interface CancelOrderResult {
  success: boolean;
  queued: boolean;
  error?: string;
}

/**
 * Cancels an order. If the online call fails (offline or server error), the order
 * is marked Cancelled locally, its table is released, and a cancel_order command is
 * queued for replay on reconnect. This prevents the cancellation modal from crashing
 * with an unhandled network error and keeps the local state consistent.
 */
export async function cancelOrder(
  order: CancelOrderInput,
  reason: string
): Promise<CancelOrderResult> {
  try {
    await call.post('ury.ury.doctype.ury_order.ury_order.cancel_order', {
      invoice_id: order.name,
      reason,
    });
    return { success: true, queued: false };
  } catch (err) {
    console.warn('[cancelOrder] Online cancel failed, falling back to offline queue:', err);

    try {
      await repositories.orders.markCancelled(order.name);

      if (order.restaurant_table) {
        await repositories.tables.setOccupied(order.restaurant_table, false);
      }

      const dependencyIds: string[] = [];
      if (order.name.startsWith('TEMP-')) {
        dependencyIds.push(`SYNC-ORDER-${order.name}`);
      }

      await repositories.syncQueue.put({
        id: `CANCEL-ORDER-${order.name}`,
        action: 'cancel_order',
        endpoint: apiRegistry.getUrl('CANCEL_ORDER'),
        payload: {
          invoice_id: order.name,
          reason,
          table: order.restaurant_table || undefined,
        },
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        attempts: 0,
        priority: 5,
        dependency_ids: dependencyIds,
      });

      projectionBus.emit('ORDERS_UPDATED');
      projectionBus.emit('TABLES_UPDATED');

      return { success: true, queued: true };
    } catch (offlineErr) {
      const message = offlineErr instanceof Error ? offlineErr.message : String(offlineErr);
      return { success: false, queued: false, error: message };
    }
  }
}

/**
 * Releases a table after a successful payment (online or offline). Keeps the table
 * projection in sync so the Table UI shows Available immediately.
 */
export async function releaseTableAfterPayment(table: string | null | undefined): Promise<void> {
  if (!table) return;
  try {
    await repositories.tables.setOccupied(table, false);
    projectionBus.emit('TABLES_UPDATED');
  } catch (err) {
    console.warn('[releaseTableAfterPayment] Failed to release table:', err);
  }
}

export interface QueueOfflinePaymentInput {
  invoice: string;
  customer: string;
  cashier: string;
  owner: string;
  pos_profile: string;
  table: string | null;
  payments: Array<{ mode_of_payment: string; amount: number }>;
  additionalDiscount: number | null;
}

/**
 * Queues a make_invoice command for offline execution. The API payload is kept
 * byte-equivalent to the online payment request; sync metadata (idempotency_key,
 * temporary_id) lives on the envelope so the backend never sees extra keys.
 */
export async function queueOfflinePayment(input: QueueOfflinePaymentInput): Promise<void> {
  const endpoint = apiRegistry.getUrl('MAKE_INVOICE');
  const paymentIdempotencyKey = `PAY-${input.invoice}-${Date.now()}`;
  const cmdId = `SYNC-PAYMENT-${input.invoice}-${Date.now()}`;

  const paymentPayload: Record<string, unknown> = {
    additionalDiscount: input.additionalDiscount,
    cashier: input.cashier,
    customer: input.customer,
    invoice: input.invoice,
    owner: input.owner,
    payments: input.payments,
    pos_profile: input.pos_profile,
    table: input.table,
  };

  const dependencies: string[] = [];
  if (input.invoice.startsWith('TEMP-')) {
    dependencies.push(`SYNC-ORDER-${input.invoice}`);
  }

  await repositories.syncQueue.put({
    id: cmdId,
    action: 'make_invoice',
    endpoint: endpoint,
    payload: paymentPayload,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    attempts: 0,
    priority: 1,
    dependencies,
    dependency_ids: dependencies,
    temporary_id: input.invoice.startsWith('TEMP-') ? input.invoice : null,
    entity_id: input.invoice || null,
    idempotency_key: paymentIdempotencyKey,
  });

  // Mark order as Paid locally so the UI reflects payment status immediately.
  await repositories.orders.markPaid(input.invoice);
  projectionBus.emit('ORDERS_UPDATED');

  // Release the table locally so the Table UI shows Available for offline payments.
  await releaseTableAfterPayment(input.table);
}

/**
 * Builds the backend API payload for sync_order. For Aggregator orders the payload
 * is trimmed to the exact key set shown in the reference screenshots so the queued
 * offline request is byte-equivalent to the online request.
 */
function buildSyncOrderPayload(
  data: SyncOrderData,
  invoice: string | null,
  lastInvoice: string | null
): Record<string, unknown> {
  if (data.order_type === 'Aggregators') {
    return {
      aggregator_id: data.aggregator_id,
      cashier: data.cashier,
      customer: data.customer,
      invoice,
      items: data.items,
      last_invoice: lastInvoice,
      no_of_pax: data.no_of_pax,
      order_type: data.order_type,
      owner: data.owner,
      pos_profile: data.pos_profile,
      waiter: data.waiter,
    };
  }

  const payload: Record<string, unknown> = {
    items: data.items,
    no_of_pax: data.no_of_pax,
    pos_profile: data.pos_profile,
    order_type: data.order_type,
    cashier: data.cashier,
    owner: data.owner,
    waiter: data.waiter,
    invoice,
    last_invoice: lastInvoice,
  };

  if (data.table !== undefined && data.table !== null) payload.table = data.table;
  if (data.room !== undefined && data.room !== null) payload.room = data.room;
  if (data.customer !== undefined && data.customer !== null) payload.customer = data.customer;
  if (data.aggregator_id !== undefined && data.aggregator_id !== null) payload.aggregator_id = data.aggregator_id;
  if (data.comments !== undefined && data.comments !== null) payload.comments = data.comments;
  if (data.mode_of_payment !== undefined && data.mode_of_payment !== null) payload.mode_of_payment = data.mode_of_payment;

  return payload;
}

export const syncOrder = async (data: SyncOrderData) => {
  const endpoint = apiRegistry.getUrl('SYNC_ORDER');
  try {
    const response = await call.post(endpoint, data);
    const result = response.message;

    // Cache updated order in local repository
    if (result && result.name) {
      // Use the backend's actual lifecycle status when available. Preserve a local
      // Paid status for temp orders that were already paid offline so the cashier
      // does not see a downgraded Draft snapshot after sync.
      let localStatus: OrderEntity['status'] =
        (result.status as OrderEntity['status']) ?? 'Draft';
      if (data.invoice && data.invoice.startsWith('TEMP-')) {
        try {
          const localTemp = await repositories.orders.getById(data.invoice);
          if (localTemp && localTemp.status === 'Paid') {
            localStatus = 'Paid';
          }
          await repositories.orders.delete(data.invoice);
        } catch (delErr) {
          console.warn('[syncOrder] Failed to delete temporary offline order:', delErr);
        }
      }
      const totalAmount = data.items.reduce((sum, i) => sum + i.rate * i.qty, 0);
      await repositories.orders.put({
        id: result.name,
        table: data.table,
        room: data.room,
        order_type: data.order_type,
        custom_aggregator_id: data.aggregator_id || undefined,
        status: localStatus,
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
    }

    return result;
  } catch (error: any) {
    console.warn('Network syncOrder failed, storing locally in orders repository and queueing sync:', error);

    const totalAmount = data.items.reduce((sum, i) => sum + i.rate * i.qty, 0);

    // Determine offline mode:
    //   - real server ID  => UPDATE existing invoice (keep invoice/last_invoice)
    //   - TEMP-* ID       => update a pending offline order (reuse temp ID)
    //   - no invoice      => CREATE new offline order
    const isTempOrder = data.invoice && data.invoice.startsWith('TEMP-');
    const isServerUpdate = data.invoice && !isTempOrder;

    let localId: string;
    let cmdId: string;
    let apiPayload: Record<string, unknown>;
    let temporaryId: string | null;
    let envelopeIdempotencyKey: string;

    if (isServerUpdate) {
      localId = data.invoice;
      cmdId = `SYNC-ORDER-UPDATE-${data.invoice}`;
      apiPayload = buildSyncOrderPayload(data, data.invoice, data.last_invoice || data.invoice);
      temporaryId = null;
      envelopeIdempotencyKey = data.idempotency_key || `UPDATE-${data.invoice}`;
    } else {
      const tempId = data.invoice || `TEMP-ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      localId = tempId;
      cmdId = `SYNC-ORDER-${tempId}`;
      apiPayload = buildSyncOrderPayload(data, null, null);
      temporaryId = tempId;
      envelopeIdempotencyKey = data.idempotency_key || tempId;
    }

    // Preserve local lifecycle status. Paid orders stay Paid; existing non-terminal
    // orders keep their status (e.g. Unbilled preview edits); brand-new table orders
    // start as Unbilled so they appear in the correct Orders tab offline.
    let offlineStatus: OrderEntity['status'] = 'Draft';
    let invoicePrinted = 0;
    try {
      const existingLocal = await repositories.orders.getById(localId);
      if (existingLocal) {
        invoicePrinted = existingLocal.invoice_printed ?? 0;
        if (existingLocal.status === 'Paid') {
          offlineStatus = 'Paid';
        } else if (existingLocal.status) {
          offlineStatus = existingLocal.status;
        }
      } else if (data.table) {
        offlineStatus = 'Unbilled';
        invoicePrinted = 0;
      }
    } catch (lookupErr) {
      console.warn('[syncOrder] Could not read existing local order status:', lookupErr);
      if (data.table) {
        offlineStatus = 'Unbilled';
        invoicePrinted = 0;
      }
    }

    // 1. Store locally in orders repository
    await repositories.orders.put({
      id: localId,
      table: data.table,
      room: data.room,
      order_type: data.order_type,
      custom_aggregator_id: data.aggregator_id || undefined,
      status: offlineStatus,
      invoice_printed: invoicePrinted,
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

    // 2. Mark table occupied for active offline table orders and notify the table
    //    projection so the Table UI reflects Occupied immediately.
    if (data.table && offlineStatus !== 'Paid' && offlineStatus !== 'Cancelled') {
      try {
        await repositories.tables.setOccupied(data.table, true);
        projectionBus.emit('TABLES_UPDATED');
      } catch (tableErr) {
        console.warn('[syncOrder] Failed to update local table occupancy:', tableErr);
      }
    }

    // 3. Enqueue command into sync_queue. Stable command IDs ensure repeated
    //    offline edits overwrite the same queue entry instead of creating duplicates.
    await repositories.syncQueue.put({
      id: cmdId,
      action: 'sync_order',
      endpoint: endpoint,
      payload: apiPayload,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
      temporary_id: temporaryId,
      idempotency_key: envelopeIdempotencyKey,
    });

    projectionBus.emit('ORDERS_UPDATED');

    return {
      name: localId,
      status: offlineStatus,
      grand_total: totalAmount,
      items: data.items,
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
  const endpoint = apiRegistry.getUrl('SPLIT_BILL');
  try {
    const res = await call.post(endpoint, {
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
      endpoint: endpoint,
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
  const endpoint = apiRegistry.getUrl('TABLE_TRANSFER');
  try {
    await call.post(endpoint, {
      table,
      newTable,
      invoice,
    });
  } catch (error) {
    console.warn('Network tableTransfer failed, queueing command in sync_queue repository:', error);
    await repositories.syncQueue.put({
      id: `SYNC-TRANSFER-${Date.now()}`,
      action: 'table_transfer',
      endpoint: endpoint,
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
  const endpoint = apiRegistry.getUrl('CAPTAIN_TRANSFER');
  try {
    await call.post(endpoint, {
      currentCaptain,
      newCaptain,
      invoice,
    });
  } catch (error) {
    console.warn('Network captainTransfer failed, queueing command in sync_queue repository:', error);
    await repositories.syncQueue.put({
      id: `SYNC-CAPTAIN-${Date.now()}`,
      action: 'captain_transfer',
      endpoint: endpoint,
      payload: { currentCaptain, newCaptain, invoice },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 2,
    });
  }
}