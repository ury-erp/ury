import { call, repositories, apiRegistry, projectionBus, commandQueue, SplitBillCommand, type OrderEntity } from '@ury/core';
import { buildTableClusterMap, getMergedTablesCsv } from './table-utils';
import { isNetworkError, unwrapResponse } from './network-utils';
import { queryClient } from './query-client';


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
  no_of_pax?: number;
  custom_comments?: string | null;
  modified?: string;
}

export interface TableOrder {
  message: POSInvoice | null;
}

/**
 * Fetches the current active order/invoice for a table if any exists
 * Checks online API first, then falls back to local orders repository
 */
export async function getTableOrder(table_no: string): Promise<TableOrder> {
  if (!table_no) {
    return { message: null };
  }
  try {
    const res = await call.get<{ message: POSInvoice | null }>('ury.ury.doctype.ury_order.ury_order.get_order_invoice', { 
      table: table_no
    });
    const inv = res?.message;
    if (inv && inv.name) {
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
        items: (inv.items || []).map(i => ({
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
    return (res || { message: null }) as TableOrder;
  } catch (error) {
    console.warn('Network getTableOrder failed, checking local orders repository:', error);

    const cached = await repositories.orders.findByTable(table_no);
    if (cached) {
      const allTables = await repositories.tables.getAll();
      const clusterMap = buildTableClusterMap(allTables as any);
      const mergedTablesCsv = getMergedTablesCsv(cached.table || table_no, clusterMap);
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
          custom_merged_tables: mergedTablesCsv,
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
  /** Mode of payment used for the initial dummy payment row (e.g. aggregator orders). */
  mode_of_payment?: string;
  /**
   * Idempotency key for deduplication on retry.
   * The backend uses this to prevent duplicate POS Invoice creation.
   * Must be a stable UUID (not timestamp-based) so retries send the same key.
   */
  idempotency_key?: string;
  /** Optimistic-concurrency token echoed back by the backend on writes. */
  last_modified_time?: string;
}

/**
 * sync_order returns the synced POS Invoice on success, or `{ status: 'Failure' }`
 * when the backend rejects the write (e.g. stale last_modified_time, table already
 * occupied, or an already-billed invoice).
 */
export type SyncOrderResponse = POSInvoice | { status: 'Failure' };

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
 * Releases a table cluster locally after cancellation. Mirrors the backend
 * `release_merge_cluster_tables` behavior: all tables linked via `merged_with`
 * are marked available and their merge linkage is cleared.
 */
async function releaseTableClusterAfterCancel(table: string | null | undefined): Promise<void> {
  if (!table) return;
  try {
    const clusterTables = await repositories.tables.getClusterTables(table);
    await repositories.tables.releaseCluster(clusterTables);
  } catch (err) {
    console.warn('[releaseTableClusterAfterCancel] Failed to release table cluster:', err);
  }
}

/**
 * Resolves the queue command dependencies for a temporary invoice ID.
 *   - TEMP-ORD-* depends on the sync_order command that creates it.
 *   - TEMP-SPLIT-* depends on the split command recorded on its local order entity.
 *   - Real server IDs have no queue dependency.
 */
export async function resolveTempDependency(orderId: string): Promise<string[]> {
  if (!orderId.startsWith('TEMP-')) return [];

  if (orderId.startsWith('TEMP-ORD-')) {
    return [`SYNC-ORDER-${orderId}`];
  }

  if (orderId.startsWith('TEMP-SPLIT-')) {
    try {
      const local = await repositories.orders.getById(orderId);
      if (local?.pending_command_id) {
        return [local.pending_command_id];
      }
    } catch (err) {
      console.warn('[resolveTempDependency] Failed to read local order:', err);
    }
  }

  return [];
}

/**
 * Finds the pending create_customer command ID responsible for syncing a
 * temporary customer (TEMP-CUST-*). This lets order commands wait until the
 * customer exists on the server before attempting sync_order.
 */
async function findPendingCustomerCommandId(tempCustomerId: string): Promise<string | undefined> {
  try {
    const tempCustomer = await repositories.customers.getById(tempCustomerId);
    if (!tempCustomer) return undefined;

    const allCmds = await repositories.syncQueue.getAll();
    const match = allCmds.find((cmd: any) =>
      cmd.status === 'PENDING' &&
      (cmd.action === 'create_customer' || cmd.endpoint?.includes('create_customer')) &&
      ((cmd.payload as any)?.customer_name === tempCustomer.customer_name ||
       (cmd.payload as any)?.mobile_number === tempCustomer.mobile_number)
    );

    return match ? ((match.command_id || match.id) as string) : undefined;
  } catch (err) {
    console.warn('[findPendingCustomerCommandId] Failed to resolve temp customer command:', err);
    return undefined;
  }
}

/**
 * Cancels an order. On a successful online call the local order is marked Cancelled
 * and its table cluster is released so the UI matches the backend state immediately.
 * If the online call fails (offline or server error), the order is marked Cancelled
 * locally, its table cluster is released, and a cancel_order command is queued for
 * replay on reconnect. The queued payload is byte-equivalent to the online API
 * (invoice_id + reason only) and depends on SYNC-ORDER-${tempId} for un-synced orders.
 */
export async function cancelOrder(
  order: CancelOrderInput,
  reason: string
): Promise<CancelOrderResult> {
  try {
    await call.post(apiRegistry.getUrl('CANCEL_ORDER'), {
      invoice_id: order.name,
      reason,
    });

    // Keep local state in lock-step with the server cancellation.
    await repositories.orders.markCancelled(order.name);
    await releaseTableClusterAfterCancel(order.restaurant_table);

    projectionBus.emit('ORDERS_UPDATED');
    projectionBus.emit('TABLES_UPDATED');
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['roomCounts'] });

    return { success: true, queued: false };
  } catch (err) {
    console.warn('[cancelOrder] Online cancel failed, falling back to offline queue:', err);

    if (!isNetworkError(err)) {
      throw err;
    }

    try {
      await repositories.orders.markCancelled(order.name);
      await releaseTableClusterAfterCancel(order.restaurant_table);

      const dependencyIds: string[] = [];
      if (order.name.startsWith('TEMP-')) {
        dependencyIds.push(`SYNC-ORDER-${order.name}`);
      }

      await repositories.syncQueue.put({
        id: `CANCEL-ORDER-${order.name}`,
        action: 'cancel_order',
        operation_type: 'DELETE_ORDER',
        endpoint: apiRegistry.getUrl('CANCEL_ORDER'),
        payload: {
          invoice_id: order.name,
          reason,
        },
        timestamp: new Date().toISOString(),
        status: 'PENDING',
        attempts: 0,
        priority: 5,
        dependency_ids: dependencyIds,
        temporary_id: order.name.startsWith('TEMP-') ? order.name : null,
        entity_id: order.name,
        idempotency_key: `CANCEL-${order.name}-${reason}`,
      });

      projectionBus.emit('ORDERS_UPDATED');
      projectionBus.emit('TABLES_UPDATED');
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['roomCounts'] });

      return { success: true, queued: true };
    } catch (offlineErr) {
      const message = offlineErr instanceof Error ? offlineErr.message : String(offlineErr);
      return { success: false, queued: false, error: message };
    }
  }
}

/**
 * Releases a table cluster after a successful payment (online or offline). Keeps
 * the table projection in sync so the Table UI shows Available immediately.
 */
export async function releaseTableAfterPayment(table: string | null | undefined): Promise<void> {
  if (!table) return;
  try {
    const clusterTables = await repositories.tables.getClusterTables(table);
    await repositories.tables.releaseCluster(clusterTables);
    projectionBus.emit('TABLES_UPDATED');
    queryClient.invalidateQueries({ queryKey: ['tables'] });
    queryClient.invalidateQueries({ queryKey: ['roomCounts'] });
  } catch (err) {
    console.warn('[releaseTableAfterPayment] Failed to release table cluster:', err);
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
 * Returns true if every other member of the invoice's split group has reached a
 * terminal state (Paid or Cancelled). Used to decide whether the shared table
 * can be released after one split is paid offline.
 */
async function isSplitGroupFullySettled(invoiceId: string): Promise<boolean> {
  const order = await repositories.orders.getById(invoiceId);
  if (!order?.custom_split_group) return true;

  const all = await repositories.orders.getAll();
  const siblings = all.filter(
    o => o.id !== invoiceId && o.custom_split_group === order.custom_split_group
  );

  if (siblings.length === 0) return true;
  return siblings.every(o => o.status === 'Paid' || o.status === 'Cancelled');
}

/**
 * Clears the bidirectional merge linkage for a merged bill after one side is
 * paid offline. The partner invoice is marked Paid (mirroring the backend
 * `sync_merged_invoice` hook) and both records lose their merge metadata so
 * the Merged Bill panel and badge disappear immediately.
 */
async function clearLocalMergeAfterPayment(invoiceId: string): Promise<void> {
  const order = await repositories.orders.getById(invoiceId);
  if (!order?.custom_merged_pos_invoice) return;

  const partnerId = order.custom_merged_pos_invoice;
  const partner = await repositories.orders.getById(partnerId);
  const now = new Date().toISOString();

  // Mirror backend behavior: when one merged invoice is paid, the linked
  // invoice is also submitted/paid.
  if (partner) {
    await repositories.orders.put({
      ...partner,
      status: 'Paid',
      is_locked: 1,
      custom_merged_pos_invoice: null,
      custom_merged_total: null,
      custom_merged_pos_invoice_details: null,
      updatedAt: now,
    } as any);
  }

  await repositories.orders.put({
    ...order,
    custom_merged_pos_invoice: null,
    custom_merged_total: null,
    custom_merged_pos_invoice_details: null,
    updatedAt: now,
  } as any);

  // Release the merge cluster table(s) so the Table UI shows Available.
  const tablesToRelease = new Set<string>();
  if (order.table) tablesToRelease.add(order.table);
  if (partner?.table) tablesToRelease.add(partner.table);

  for (const table of tablesToRelease) {
    try {
      const clusterTables = await repositories.tables.getClusterTables(table);
      await repositories.tables.releaseCluster(clusterTables);
    } catch (err) {
      console.warn(`[clearLocalMergeAfterPayment] Failed to release table cluster for ${table}:`, err);
    }
  }
}

/**
 * Queues a make_invoice command for offline execution. The API payload is kept
 * byte-equivalent to the online payment request; sync metadata (idempotency_key,
 * temporary_id) lives on the envelope so the backend never sees extra keys.
 */
export async function queueOfflinePayment(input: QueueOfflinePaymentInput): Promise<void> {
  const endpoint = apiRegistry.getUrl('MAKE_INVOICE');
  const paymentIdempotencyKey = `PAY-${input.invoice}-${Date.now()}`;
  const paymentModes = input.payments.map(p => p.mode_of_payment).sort().join('-');
  const cmdId = `SYNC-PAYMENT-${input.invoice}-${paymentModes}`;

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

  // Use the generic temp dependency resolver so TEMP-SPLIT-* children wait on
  // their SplitBillCommand instead of a non-existent SYNC-ORDER-* record.
  const dependencies: string[] = await resolveTempDependency(input.invoice);

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

  const order = await repositories.orders.getById(input.invoice);

  // Merged bill: mark partner Paid, clear linkage, release cluster.
  if (order?.custom_merged_pos_invoice) {
    await clearLocalMergeAfterPayment(input.invoice);
    projectionBus.emit('ORDERS_UPDATED');
    projectionBus.emit('TABLES_UPDATED');
    return;
  }

  // Split bill: only release the shared table once every sibling is settled.
  let shouldReleaseTable = true;
  if (order?.custom_split_group) {
    shouldReleaseTable = await isSplitGroupFullySettled(input.invoice);
  }

  projectionBus.emit('ORDERS_UPDATED');

  if (shouldReleaseTable) {
    await releaseTableAfterPayment(input.table);
  }
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
      mode_of_payment: data.mode_of_payment ?? null,
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
    mode_of_payment: data.mode_of_payment ?? null,
  };

  if (data.table !== undefined && data.table !== null) payload.table = data.table;
  if (data.room !== undefined && data.room !== null) payload.room = data.room;
  if (data.customer !== undefined && data.customer !== null) payload.customer = data.customer;
  if (data.aggregator_id !== undefined && data.aggregator_id !== null) payload.aggregator_id = data.aggregator_id;
  if (data.comments !== undefined && data.comments !== null) payload.comments = data.comments;
  if (data.last_modified_time !== undefined && data.last_modified_time !== null) {
    payload.last_modified_time = data.last_modified_time;
  }

  return payload;
}

export const syncOrder = async (data: SyncOrderData) => {
  const endpoint = apiRegistry.getUrl('SYNC_ORDER');
  try {
    const response = await call.post(endpoint, { ...data, mode_of_payment: data.mode_of_payment ?? null });
    const result = unwrapResponse(response);

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

      if (data.table) {
        await repositories.tables.setOccupied(data.table, true);
        const currentTable = await repositories.tables.getById(data.table);
        if (currentTable) {
          await repositories.tables.put({
            ...currentTable,
            occupied: 1,
            latest_invoice_time: new Date().toISOString(),
          });
        }
        projectionBus.emit('TABLES_UPDATED');
        queryClient.invalidateQueries({ queryKey: ['tables'] });
        queryClient.invalidateQueries({ queryKey: ['roomCounts'] });
      }

      projectionBus.emit('ORDERS_UPDATED');
    }

    return result;
  } catch (error: any) {
    if (!isNetworkError(error)) {
      throw error;
    }

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
        queryClient.invalidateQueries({ queryKey: ['tables'] });
        queryClient.invalidateQueries({ queryKey: ['roomCounts'] });
      } catch (tableErr) {
        console.warn('[syncOrder] Failed to update local table occupancy:', tableErr);
      }
    }


    // 3. Enqueue command into sync_queue. Stable command IDs ensure repeated
    //    offline edits overwrite the same queue entry instead of creating duplicates.
    const orderDependencies: string[] = [];
    if (data.customer && data.customer.startsWith('TEMP-CUST-')) {
      const customerCmdId = await findPendingCustomerCommandId(data.customer);
      if (customerCmdId) {
        orderDependencies.push(customerCmdId);
      }
    }

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
      dependencies: orderDependencies,
      dependency_ids: orderDependencies,
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

/**
 * Performs an offline bill split by mutating local order state and queueing a
 * SplitBillCommand. The source invoice has the moved items decremented, a new
 * temporary child invoice is created, and both are linked with split metadata so
 * the UI can render the group offline. The queued command mirrors the online
 * payload and depends on the command that created the source when the source is
 * itself a temporary invoice (TEMP-ORD-* or TEMP-SPLIT-*).
 */
async function queueOfflineSplit(
  sourceInvoice: string,
  itemsToMove: SplitBillItemMove[],
  customer?: string | null
): Promise<SplitBillResponse> {
  const source = await repositories.orders.getById(sourceInvoice);
  if (!source) {
    throw new Error(`Cannot split: source invoice ${sourceInvoice} not found locally`);
  }

  const childId = `TEMP-SPLIT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  // The backend matches items by POS Invoice Item row `name`. Local orders created
  // offline may not have a server row name, in which case `name` falls back to the
  // item code, so lookup by `name ?? item` preserves parity in both cases.
  const moveMap = new Map(itemsToMove.map(m => [m.name, m.qty]));

  const remainingItems = source.items
    .map(item => {
      const moveQty = moveMap.get(item.name ?? item.item) || 0;
      const nextQty = item.qty - moveQty;
      if (nextQty <= 0) return null;
      return {
        ...item,
        qty: nextQty,
        amount: item.rate * nextQty,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const movedItems = source.items
    .map(item => {
      const moveQty = moveMap.get(item.name ?? item.item) || 0;
      if (moveQty <= 0) return null;
      return {
        ...item,
        qty: moveQty,
        amount: item.rate * moveQty,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (movedItems.length === 0) {
    throw new Error('Cannot split: no matching items found to move');
  }

  const groupId = source.custom_split_group || `SG-${Date.now()}`;

  // If the source is already part of a split group, gather the existing siblings
  // so the new child can be appended and every member's index/total recomputed.
  const existingSiblingIds = Array.from(
    new Set(
      (source.split_siblings || []).filter(id => id !== sourceInvoice && id !== childId)
    )
  );
  const siblingOrders: OrderEntity[] = [];
  for (const siblingId of existingSiblingIds) {
    try {
      const sibling = await repositories.orders.getById(siblingId);
      if (sibling) siblingOrders.push(sibling);
    } catch (err) {
      console.warn(`[queueOfflineSplit] Could not load sibling ${siblingId}:`, err);
    }
  }

  // Order members the same way the backend does: by creation timestamp ascending.
  // The source is always first (it is the original), existing siblings follow in
  // creation order, and the new child is last.
  const allMemberIds = [
    sourceInvoice,
    ...siblingOrders
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      .map(s => s.id),
    childId,
  ];
  const splitTotal = allMemberIds.length;

  const makeSplitMeta = (id: string) => ({
    custom_split_group: groupId,
    split_index: allMemberIds.indexOf(id) + 1,
    split_total: splitTotal,
    split_siblings: allMemberIds.filter(m => m !== id),
  });

  const updatedSource: OrderEntity = {
    ...source,
    items: remainingItems,
    grand_total: remainingItems.reduce((sum, i) => sum + i.amount, 0),
    ...makeSplitMeta(sourceInvoice),
    updatedAt: now,
  };

  const splitPayload: {
    source_invoice: string;
    items_to_move: SplitBillItemMove[];
    customer?: string | null;
  } = {
    source_invoice: sourceInvoice,
    items_to_move: itemsToMove,
  };
  if (customer !== undefined && customer !== null) {
    splitPayload.customer = customer;
  }

  const dependencies = await resolveTempDependency(sourceInvoice);

  const commandId = await commandQueue.enqueue(
    new SplitBillCommand(splitPayload, {
      id: `SYNC-SPLIT-${childId}`,
      priority: 3,
      dependencies,
      temporaryId: childId,
    })
  );

  // Mirror the backend: a freshly split child is always unprinted. Table orders
  // therefore render in the Unbilled tab; counter orders remain Draft.
  const childStatus: OrderEntity['status'] = source.table ? 'Unbilled' : 'Draft';

  const childOrder: OrderEntity = {
    ...source,
    id: childId,
    customer: customer ?? source.customer,
    items: movedItems,
    grand_total: movedItems.reduce((sum, i) => sum + i.amount, 0),
    invoice_printed: 0,
    status: childStatus,
    ...makeSplitMeta(childId),
    custom_split_from: sourceInvoice,
    pending_command_id: commandId,
    sync_status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await repositories.orders.put(updatedSource);
  await repositories.orders.put(childOrder);

  // Keep any existing siblings' metadata consistent with the new member.
  for (const sibling of siblingOrders) {
    const siblingMeta = makeSplitMeta(sibling.id);
    await repositories.orders.put({
      ...sibling,
      custom_split_group: siblingMeta.custom_split_group,
      split_index: siblingMeta.split_index,
      split_total: siblingMeta.split_total,
      split_siblings: siblingMeta.split_siblings,
      updatedAt: now,
    });
  }

  projectionBus.emit('ORDERS_UPDATED');
  projectionBus.emit('TABLES_UPDATED');

  return {
    source_invoice: sourceInvoice,
    new_invoice: childId,
  };
}

export async function splitBill(
  sourceInvoice: string,
  itemsToMove: SplitBillItemMove[],
  customer?: string | null
): Promise<SplitBillResponse> {
  const endpoint = apiRegistry.getUrl('SPLIT_BILL');

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueOfflineSplit(sourceInvoice, itemsToMove, customer);
  }

  try {
    const res = await call.post(endpoint, {
      source_invoice: sourceInvoice,
      items_to_move: itemsToMove,
      customer: customer || undefined,
    });
    return unwrapResponse(res) as SplitBillResponse;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    console.warn('Network splitBill failed, queueing command in sync_queue repository:', error);
    return queueOfflineSplit(sourceInvoice, itemsToMove, customer);
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
    if (!isNetworkError(error)) {
      throw error;
    }
    console.warn('Network tableTransfer failed, applying local state and queueing command:', error);

    const now = new Date().toISOString();

    // Load entities required for the local transfer.
    const [sourceEntity, destinationEntity, orderEntity] = await Promise.all([
      repositories.tables.getById(table),
      repositories.tables.getById(newTable),
      repositories.orders.getById(invoice),
    ]);

    if (!sourceEntity) {
      throw new Error(`Source table ${table} not found locally`);
    }
    if (!destinationEntity) {
      throw new Error(`Destination table ${newTable} not found locally`);
    }
    if (!orderEntity) {
      throw new Error(`Invoice ${invoice} not found locally`);
    }

    // Compute the timestamp shown as "Started at" on the destination table card.
    const startedAt = orderEntity.createdAt || now;

    // Find every active order still linked to the source table so the transfer
    // is complete: source becomes available and destination shows the order(s).
    const activeOrdersOnSource = (await repositories.orders.getAll()).filter(
      (o) =>
        o.table === table && o.status !== 'Paid' && o.status !== 'Cancelled'
    );

    // Atomically persist order and table updates so the UI never observes a
    // half-transferred state (e.g. order moved but source still occupied).
    const idb = repositories.tables.dbInstance;
    await idb.transaction(
      'rw',
      idb.orders,
      idb.restaurantTables,
      idb.sync_queue,
      async () => {
        // 1. Move all active orders from source table to destination table/room.
        for (const order of activeOrdersOnSource) {
          await repositories.orders.put({
            ...order,
            table: newTable,
            room: destinationEntity.restaurant_room,
            updatedAt: now,
          });
        }

        // 2. Release source table and clear any stale merge linkage.
        await repositories.tables.put({
          ...sourceEntity,
          occupied: 0,
          latest_invoice_time: null,
          merged_with: null,
        });

        // 3. Occupy destination table and clear any stale merge linkage.
        await repositories.tables.put({
          ...destinationEntity,
          occupied: 1,
          latest_invoice_time: startedAt,
          merged_with: null,
        });

        // 4. Queue the table_transfer command for replay. The payload is kept
        //    byte-equivalent to the online API call (table, newTable, invoice).
        const dependencyIds: string[] = [];
        if (invoice.startsWith('TEMP-')) {
          dependencyIds.push(`SYNC-ORDER-${invoice}`);
        }

        await repositories.syncQueue.put({
          id: `SYNC-TRANSFER-${table}-${newTable}`,
          action: 'table_transfer',
          endpoint: endpoint,
          payload: { table, newTable, invoice },
          timestamp: now,
          status: 'PENDING',
          attempts: 0,
          priority: 1,
          dependency_ids: dependencyIds,
          dependencies: dependencyIds,
          temporary_id: invoice.startsWith('TEMP-') ? invoice : null,
          entity_id: invoice,
        });
      }
    );

    projectionBus.emit('ORDERS_UPDATED');
    projectionBus.emit('TABLES_UPDATED');
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
    projectionBus.emit('ORDERS_UPDATED');
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    console.warn('Network captainTransfer failed, queueing command in sync_queue repository:', error);
    await repositories.syncQueue.put({
      id: `SYNC-CAPTAIN-${invoice}-${newCaptain}`,
      action: 'captain_transfer',
      endpoint: endpoint,
      payload: { currentCaptain, newCaptain, invoice },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 2,
    });

    projectionBus.emit('ORDERS_UPDATED');
  }
}

/**
 * Reprints the KOT for an invoice via the hardened `reprint_kot` endpoint
 * (`ury/ury/api/ury_kot_reprint.py`), which already enforces branch and
 * Captain-ownership/elevated-access authorization server-side — this is a
 * thin wrapper only, no reprint logic lives on the frontend.
 */
export async function reprintKot(invoiceNumber: string): Promise<void> {
  await call.post('ury.ury.api.ury_kot_reprint.reprint_kot', {
    invoice_number: invoiceNumber,
  });

}