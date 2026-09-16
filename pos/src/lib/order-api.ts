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
  /**
   * Stable per-line identity persisted on the invoice row (custom field
   * `POS Invoice Item-reservation_line_key`). Echoed back unchanged in the
   * next `sync_order` payload so the server diffs previous-vs-current lines
   * by identity instead of by child-row name (which is regenerated on every
   * save) — see `ury_order.py::_previous_line_snapshot`.
   */
  reservation_line_key?: string | null;
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
    /**
     * Stable line identity (the cart's `uniqueId`). The server accepts it
     * under any of `ury_order_reservation_service.LINE_REF_FIELDS`; we send
     * the canonical name. Omitting it makes the server fall back to
     * context/occurrence matching, which cannot survive a comment edit.
     */
    reservation_line_key?: string;
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

export async function cancelOrder(
  invoice_id: string,
  reason: string
): Promise<void> {
  await call.post('ury.ury.doctype.ury_order.ury_order.cancel_order', {
    invoice_id,
    reason,
  });
}

export interface ReduceOrderItemQtyResponse {
  invoice: string;
  item_row_name: string;
  item_code: string;
  previous_qty: number;
  new_qty: number;
  delta: number;
  order_type: string;
  cancel_kot_names: string[];
  actor: string;
}

/**
 * Reduces (or fully removes, `newQty = 0`) one item's qty on an already
 * saved/printed POS Invoice via `ury.ury.api.ury_pos_invoice_qty_reduction
 * .reduce_order_item_qty` — generic across cashier (Register) and captain
 * callers by design (see that module's docstring). Only permitted when the
 * invoice's `order_type` is in the POS Profile's
 * `custom_qty_reduction_allowed_order_types` allow-list; the server raises
 * a distinct `ORDER_TYPE_NOT_ALLOWED` error (message text only — no
 * structured reason code in the response) otherwise, which callers should
 * detect from the message and surface as a clear per-order-type rejection
 * rather than a generic failure toast.
 *
 * `itemRowName` must be the actual POS Invoice Item child-table row `name`
 * (NOT `item_code`) — the server matches and removes exactly that row.
 * Matching by item_code alone was ambiguous whenever an item appeared on
 * more than one row.
 */
export async function reduceOrderItemQty(
  invoiceId: string,
  itemRowName: string,
  newQty: number,
  reason?: string
): Promise<ReduceOrderItemQtyResponse> {
  const res = await call.post<{ message: ReduceOrderItemQtyResponse }>(
    'ury.ury.api.ury_pos_invoice_qty_reduction.reduce_order_item_qty',
    {
      invoice_id: invoiceId,
      item_row_name: itemRowName,
      new_qty: newQty,
      reason,
    }
  );
  return res.message;
}

/**
 * True when a caught error from `reduceOrderItemQty` is the server's
 * `ORDER_TYPE_NOT_ALLOWED` rejection (detected from the message text — the
 * backend does not expose a structured reason code in the response body).
 */
export function isOrderTypeNotAllowedError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /not permitted for order type/i.test(message);
}

/**
 * True when a caught error from `reduceOrderItemQty` is the server's
 * `LAST_ITEM_CANNOT_BE_REMOVED` rejection (detected from the message text —
 * the backend does not expose a structured reason code in the response
 * body). Callers should surface this distinctly, telling the user to cancel
 * the whole invoice instead of removing its last item.
 */
export function isLastItemCannotBeRemovedError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /only item on invoice/i.test(message);
}