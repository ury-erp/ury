import { call } from '@ury/core';

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
 * @param table_no The table number to fetch the order for
 * @returns The order details and customer information if an active order exists
 */
export async function getTableOrder(table_no: string): Promise<TableOrder> {
  try {
    const res = await call.get('ury.ury.doctype.ury_order.ury_order.get_order_invoice', { 
      table: table_no
    });
    return res as TableOrder;
  } catch (error) {
    console.error('Error fetching table order:', error);
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
  last_modified_time?: string;
  comments?: string | null;
  room?: string;
  /**
   * Minted once per submission attempt so the server can recognise a retry.
   * See ury/ury/doctype/ury_order/ury_order.py::sync_order — a replay of a
   * key it has already applied gets the original invoice back instead of a
   * second order in the kitchen.
   */
  request_id?: string;
}

/**
 * sync_order returns the synced POS Invoice on success, or `{ status: 'Failure' }`
 * when the backend rejects the write (e.g. stale last_modified_time, table already
 * occupied, or an already-billed invoice).
 */
export type SyncOrderResponse = POSInvoice | { status: 'Failure' };

export const syncOrder = async (data: SyncOrderRequest) => {
  return call.post('ury.ury.doctype.ury_order.ury_order.sync_order', data) as Promise<{ message: SyncOrderResponse }>;
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
  const res = await call.post('ury.ury.doctype.ury_order.ury_order.split_bill', {
    source_invoice: sourceInvoice,
    items_to_move: itemsToMove,
    customer: customer || undefined,
  });
  return res.message as SplitBillResponse;
}

export async function tableTransfer(
  table: string,
  newTable: string,
  invoice: string
): Promise<void> {
  await call.post('ury.ury.doctype.ury_order.ury_order.table_transfer', {
    table,
    newTable,
    invoice,
  });
}

export async function captainTransfer(
  currentCaptain: string,
  newCaptain: string,
  invoice: string
): Promise<void> {
  await call.post('ury.ury.doctype.ury_order.ury_order.captain_transfer', {
    currentCaptain,
    newCaptain,
    invoice,
  });
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
export interface TableCloseState {
  table: string | null;
  tables: string[];
  occupied: boolean;
  has_open_invoices: boolean;
  /** Table still held with nothing left to settle — safe to release. */
  can_close: boolean;
}

const NO_TABLE_TO_CLOSE: TableCloseState = {
  table: null,
  tables: [],
  occupied: false,
  has_open_invoices: false,
  can_close: false,
};

/**
 * Reports whether an order's table is still held although every bill on it has
 * been settled.
 *
 * The answer cannot be derived from the order on screen: a table is shared by a
 * whole merge cluster and by split siblings the order screen never lists, and
 * one of those still being open is the difference between releasing a stale
 * flag and stranding an open bill. The backend owns that rule.
 *
 * Failures resolve to "nothing to close" rather than throwing: this only
 * decides whether an optional button appears, and no button is a better
 * outcome than an error toast on a screen the cashier did not act on.
 */
export async function getTableCloseState(
  params: { invoice?: string; table?: string }
): Promise<TableCloseState> {
  if (!params.invoice && !params.table) return NO_TABLE_TO_CLOSE;
  try {
    const res = await call.get('ury.ury.doctype.ury_order.ury_order.get_table_close_state', {
      ...(params.invoice ? { invoice: params.invoice } : {}),
      ...(params.table ? { table: params.table } : {}),
    });
    return (res.message as TableCloseState) ?? NO_TABLE_TO_CLOSE;
  } catch (error) {
    console.error('Error fetching table close state:', error);
    return NO_TABLE_TO_CLOSE;
  }
}

export interface CloseTableResponse {
  status: string;
  invoice: string | null;
  released: boolean;
  had_items?: boolean;
}

/**
 * Releases a table without printing its bill. `reason` is required by the
 * backend whenever the invoice still has items on it, and recorded against the
 * invoice so a manager can ask about it later.
 */
export async function closeTable(params: {
  invoice?: string;
  table?: string;
  reason?: string;
}): Promise<CloseTableResponse> {
  const res = await call.post('ury.ury.doctype.ury_order.ury_order.close_table', {
    ...(params.invoice ? { invoice: params.invoice } : {}),
    ...(params.table ? { table: params.table } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
  });
  return res.message as CloseTableResponse;
}
