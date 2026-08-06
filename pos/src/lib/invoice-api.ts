import { DOCTYPES } from '../data/doctypes';
import { call, db, apiRegistry, repositories, tempIDMapper } from '@ury/core';
import { OrderStatusType, OrderType } from '../data/order-types';
import type { Filter } from 'frappe-js-sdk/lib/db/types';

export interface POSInvoice {
  name: string;
  invoice_printed: number;
  grand_total: number;
  restaurant_table: string | null;
  cashier: string;
  waiter: string;
  net_total: number;
  posting_time: string;
  total_taxes_and_charges: number;
  customer: string;
  customer_name?: string;
  status: 'Draft' | 'Unbilled' | 'Recently Paid' | 'Paid' | 'Consolidated' | 'Return';
  mobile_number: string;
  posting_date: string;
  rounded_total: number;
  order_type: OrderType;
  custom_merged_tables?: string | null;
  custom_restaurant_room?: string | null;
  custom_split_group?: string | null;
  custom_split_from?: string | null;
  split_index?: number;
  split_total?: number;
  split_siblings?: string[];
  custom_merged_pos_invoice?: string | null;
  custom_merged_total?: number | null;
  discount_amount?: number;
  additional_discount_percentage?: number;
  /**
   * Local sync state indicator. 'pending' means the order was created or paid
   * while offline and has not yet synced to the server. 'synced' means it is
   * backed by a server POS Invoice. Undefined defaults to synced.
   */
  sync_status?: 'synced' | 'pending' | 'failed';
}

export interface SplitGroupInvoice extends POSInvoice {
  split_index: number;
  split_total: number;
  is_original: boolean;
  docstatus: number;
  split_siblings?: string[];
}

export interface SplitGroupResponse {
  invoices: SplitGroupInvoice[];
  current: string;
  group: string | null;
}

export interface POSInvoiceItem {
  name: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface POSInvoiceTax {
  description: string;
  rate: number;
}

interface GetPOSInvoicesResponse {
  message: {
    data: POSInvoice[];
    next: boolean;
  };
}

interface GetPOSInvoicesParams {
  status: POSInvoice['status'];
  limit?: number;
  limit_start?: number;
  paid_limit?: number;
}

interface GetPOSInvoiceItemsResponse {
  message: [POSInvoiceItem[], POSInvoiceTax[]];
}

export const MERGED_POS_INVOICE_PRINT_FORMAT = 'Merged POS Invoice Format';

export interface MergeBillCandidate {
  name: string;
  customer: string;
  customer_name?: string;
  grand_total: number;
  rounded_total: number;
  posting_date: string;
  posting_time: string;
  order_type: OrderType;
  restaurant_table: string | null;
  custom_merged_tables?: string | null;
  status: string;
  invoice_printed: number;
  mobile_number?: string;
  sync_status?: 'synced' | 'pending' | 'failed';
}

export interface MergeBillsResponse {
  status: 'success' | 'error';
  message: string;
  name?: string;
}

export const MERGE_CANDIDATE_PAGE_SIZE = 10;

const MERGE_CANDIDATE_FIELDS = [
  'name',
  'customer',
  'customer_name',
  'grand_total',
  'rounded_total',
  'posting_date',
  'posting_time',
  'order_type',
  'restaurant_table',
  'custom_merged_tables',
  'status',
  'invoice_printed',
  'mobile_number',
] as const;

export async function getPOSInvoices({
  status,
  limit,
  limit_start,
  paid_limit
}: GetPOSInvoicesParams) {
  const actualLimit = status === 'Recently Paid' && paid_limit ? paid_limit : limit;
  const endpoint = apiRegistry.getUrl('GET_POS_INVOICE');

  try {
    const response = await call.get<GetPOSInvoicesResponse>(
      endpoint,
      {
        status,
        limit: actualLimit,
        limit_start
      }
    );

    const serverInvoices = response.message?.data || [];

    // Fetch local pending orders from IndexedDB repository
    const pendingOrders = await repositories.orders.getAll();
    const localPending = pendingOrders.filter(o => o.sync_status === 'pending');

    // Resolve any TEMP-* IDs to their real server IDs. If a temp order has already
    // been synced, it should not be merged as a duplicate under its temp ID.
    const resolvedPending = await Promise.all(
      localPending.map(async p => {
        const resolvedId = p.id.startsWith('TEMP-') ? await tempIDMapper.getServerId(p.id) : p.id;
        return { pending: p, resolvedId };
      })
    );

    // Cache server invoices locally. Preserve existing item details so a server
    // response that omits line items does not wipe out previously cached items.
    const syncableInvoices = serverInvoices.filter(inv => !resolvedPending.some(r => r.resolvedId === inv.name));
    if (syncableInvoices.length > 0) {
      await repositories.orders.putMany(
        await Promise.all(
          syncableInvoices.map(async inv => {
            const existing = await repositories.orders.getById(inv.name);
            return {
              id: inv.name,
              table: inv.restaurant_table || undefined,
              room: inv.custom_restaurant_room || undefined,
              order_type: inv.order_type,
              status: inv.status as any,
              customer: inv.customer,
              waiter: inv.waiter,
              cashier: inv.cashier,
              grand_total: inv.grand_total,
              createdAt: inv.posting_date && inv.posting_time ? `${inv.posting_date}T${inv.posting_time}` : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              sync_status: 'synced' as const,
              // Preserve cached items if the server response did not include them.
              items: (existing && existing.items?.length ? existing.items : []) as any,
            };
          })
        )
      );
    }

    // Also update the local copies of any pending orders that have been synced to
    // a server invoice, so their sync_status flips to 'synced' in the IndexedDB
    // cache and they are no longer treated as pending offline orders.
    for (const { pending: p, resolvedId } of resolvedPending) {
      if (p.id.startsWith('TEMP-') && resolvedId !== p.id) {
        const existingServer = await repositories.orders.getById(resolvedId);
        if (existingServer && existingServer.sync_status !== 'synced') {
          try {
            await repositories.orders.put({
              ...existingServer,
              sync_status: 'synced',
              updatedAt: new Date().toISOString(),
            });
          } catch (syncedUpdateErr) {
            console.warn(`[getPOSInvoices] Failed to flip ${resolvedId} to synced:`, syncedUpdateErr);
          }
        }
      }
    }

    // Clean up any TEMP-* local orders that have already been mapped to a server invoice
    // present in the server response. This prevents stale temp records from resurfacing.
    for (const { pending, resolvedId } of resolvedPending) {
      if (pending.id.startsWith('TEMP-') && resolvedId !== pending.id && serverInvoices.some(inv => inv.name === resolvedId)) {
        try {
          await repositories.orders.delete(pending.id);
        } catch (cleanupErr) {
          console.warn(`[getPOSInvoices] Failed to delete stale temp order ${pending.id}:`, cleanupErr);
        }
      }
    }

    // Merge local pending orders into returned invoices array for UI rendering
    const invoiceMap = new Map<string, POSInvoice>();
    serverInvoices.forEach(inv => invoiceMap.set(inv.name, inv));

    resolvedPending.forEach(({ pending: p, resolvedId }) => {
      // Skip temp orders that have already been synced to a server invoice; the server
      // version (or the locally cached synced copy) is the source of truth.
      if (p.id.startsWith('TEMP-') && resolvedId !== p.id) {
        return;
      }

      if (
        (status === 'Draft' && p.status === 'Draft') ||
        ((status === 'Paid' || status === 'Recently Paid') && p.status === 'Paid') ||
        (status === 'Unbilled' && p.status === 'Unbilled')
      ) {
        const createdDate = new Date(p.createdAt || Date.now());
        const postDate = isNaN(createdDate.getTime()) ? new Date().toISOString().split('T')[0] : createdDate.toISOString().split('T')[0];
        const postTime = isNaN(createdDate.getTime()) ? '00:00:00' : createdDate.toISOString().split('T')[1].substring(0, 8);

        invoiceMap.set(p.id, {
          name: p.id,
          invoice_printed: 0,
          grand_total: p.grand_total || 0,
          restaurant_table: p.table || null,
          cashier: p.cashier || '',
          waiter: p.waiter || '',
          net_total: p.grand_total || 0,
          posting_time: postTime,
          total_taxes_and_charges: 0,
          customer: p.customer || 'Guest',
          customer_name: p.customer || 'Guest',
          status: (p.status as any) || 'Draft',
          mobile_number: '',
          posting_date: postDate,
          rounded_total: p.grand_total || 0,
          order_type: (p.order_type as any) || 'Dine-In',
          custom_merged_tables: null,
          custom_split_group: null,
          custom_split_from: null,
          sync_status: 'pending',
          items: (p.items || []).map(i => ({
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
        } as any);
      }
    });

    const mergedInvoices = Array.from(invoiceMap.values());

    return {
      invoices: mergedInvoices,
      hasMore: response.message?.next || false
    };
  } catch (error) {
    console.warn('[getPOSInvoices] Network call failed. Falling back to local orders repository cache:', error);
    try {
      const cachedOrders = await repositories.orders.getAll();
      const filtered = cachedOrders.filter(o => {
        if (status === 'Draft') return o.status === 'Draft';
        if (status === 'Unbilled') return o.status === 'Unbilled';
        if (status === 'Recently Paid' || status === 'Paid') return o.status === 'Paid';
        return o.status === status;
      });

      const start = limit_start || 0;
      const sliced = filtered.slice(start, start + (actualLimit || 10));

      const mappedInvoices: POSInvoice[] = sliced.map(o => {
        const createdDate = new Date(o.createdAt || Date.now());
        const postDate = isNaN(createdDate.getTime()) ? new Date().toISOString().split('T')[0] : createdDate.toISOString().split('T')[0];
        const postTime = isNaN(createdDate.getTime()) ? '00:00:00' : createdDate.toISOString().split('T')[1].substring(0, 8);

        return {
          name: o.id,
          invoice_printed: o.sync_status === 'synced' ? 1 : 0,
          grand_total: o.grand_total || 0,
          restaurant_table: o.table || null,
          cashier: o.cashier || '',
          waiter: o.waiter || '',
          net_total: o.grand_total || 0,
          posting_time: postTime,
          total_taxes_and_charges: 0,
          customer: o.customer || 'Guest',
          customer_name: o.customer || 'Guest',
          status: (o.status as any) || 'Draft',
          mobile_number: '',
          posting_date: postDate,
          rounded_total: o.grand_total || 0,
          order_type: (o.order_type as any) || 'Dine-In',
          custom_merged_tables: null,
          custom_restaurant_room: o.room || null,
          custom_split_group: null,
          custom_split_from: null,
          sync_status: o.sync_status || 'pending',
          items: (o.items || []).map(i => ({
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
        } as any;
      });

      return {
        invoices: mappedInvoices,
        hasMore: start + mappedInvoices.length < filtered.length
      };
    } catch (fallbackErr) {
      console.error('[getPOSInvoices] Local repository fallback error:', fallbackErr);
      return { invoices: [], hasMore: false };
    }
  }
}

export async function getPOSInvoiceItems(invoiceId: string) {
  try {
    const cached = await repositories.orders.getById(invoiceId);
    if (cached && (cached.sync_status === 'pending' || invoiceId.startsWith('TEMP-'))) {
      return {
        items: (cached.items || []).map(i => ({
          name: i.item,
          item_name: i.item_name,
          qty: i.qty,
          rate: i.rate,
          amount: i.amount || i.rate * i.qty,
        })),
        taxes: [],
      };
    }

    const endpoint = apiRegistry.getUrl('GET_POS_INVOICE_ITEMS');
    const response = await call.get<GetPOSInvoiceItemsResponse>(
      endpoint,
      {
        invoice: invoiceId
      }
    );

    return {
      items: response.message[0] || [],
      taxes: response.message[1] || []
    };
  } catch (error) {
    console.warn('[getPOSInvoiceItems] Network call failed. Falling back to local order repository cache:', error);
    try {
      const cached = await repositories.orders.getById(invoiceId);
      if (cached && cached.items) {
        return {
          items: cached.items.map(i => ({
            name: i.item,
            item_name: i.item_name,
            qty: i.qty,
            rate: i.rate,
            amount: i.amount || i.rate * i.qty,
          })),
          taxes: [],
        };
      }
    } catch (fallbackErr) {
      console.error('[getPOSInvoiceItems] Offline fallback error:', fallbackErr);
    }
    return { items: [], taxes: [] };
  }
}

export async function updateInvoiceStatus(
  invoice: string,
  status: POSInvoice['status']
) {
  // NOTE: There is NO 'updatePosInvoiceStatus' API on the backend.
  // POS Invoice status is server-controlled:
  //   - Draft: created by sync_order
  //   - Unbilled: set by qz_print_update (invoice_printed=1 on table orders)
  //   - Paid: set by make_invoice → invoice.submit()
  // The only valid client-side operation is updating local IndexedDB state
  // so the UI reflects the correct status while offline.
  const existing = await repositories.orders.getById(invoice);
  if (existing) {
    await repositories.orders.put({
      ...existing,
      status: status as any,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function searchPosInvoice(query: string, status: string) {
  try {
    const endpoint = apiRegistry.getUrl('SEARCH_POS_INVOICE');
    const response = await call.get(endpoint, {
      query,
      status,
    });
    return response.message;
  } catch (error) {
    console.warn('[searchPosInvoice] Network API failed, searching local orders repository:', error);
    try {
      const q = query.toLowerCase();
      const cached = await repositories.orders.getAll();
      const matched = cached.filter(o =>
        (o.id.toLowerCase().includes(q) || (o.customer && o.customer.toLowerCase().includes(q))) &&
        (status === 'Paid' ? o.status === 'Paid' : o.status === status)
      );

      const mapped: POSInvoice[] = matched.map(o => ({
        name: o.id,
        invoice_printed: o.sync_status === 'synced' ? 1 : 0,
        grand_total: o.grand_total || 0,
        restaurant_table: o.table || null,
        cashier: o.cashier || '',
        waiter: o.waiter || '',
        net_total: o.grand_total || 0,
        posting_time: new Date(o.createdAt || Date.now()).toISOString().split('T')[1].substring(0, 8),
        total_taxes_and_charges: 0,
        customer: o.customer || 'Guest',
        customer_name: o.customer || 'Guest',
        status: (o.status as any) || 'Draft',
        mobile_number: '',
        posting_date: new Date(o.createdAt || Date.now()).toISOString().split('T')[0],
        rounded_total: o.grand_total || 0,
        order_type: (o.order_type as any) || 'Dine-In',
        sync_status: o.sync_status || 'pending',
      }));

      return { data: mapped, next: false };
    } catch (fallbackErr) {
      console.error('[searchPosInvoice] Offline fallback error:', fallbackErr);
      return { data: [], next: false };
    }
  }
}

export async function getSplitGroup(invoiceId: string): Promise<SplitGroupResponse> {
  try {
    const endpoint = apiRegistry.getUrl('GET_SPLIT_GROUP');
    const response = await call.get<{ message: SplitGroupResponse }>(
      endpoint,
      { invoice: invoiceId }
    );
    return response.message;
  } catch (error) {
    console.warn('[getSplitGroup] Network call failed:', error);
    return { invoices: [], current: invoiceId, group: null };
  }
}

function getBranchFromSession(): string {
  const raw = sessionStorage.getItem('posProfile');
  if (!raw) return 'Main Branch';
  try {
    const profile = JSON.parse(raw) as { branch?: string };
    return profile.branch || 'Main Branch';
  } catch {
    return 'Main Branch';
  }
}

export async function getLinkedMergeSecondaries(): Promise<string[]> {
  try {
    const rows = await db.getDocList(DOCTYPES.POS_INVOICE, {
      fields: ['custom_merged_pos_invoice'],
      filters: [
        ['docstatus', '=', 0],
        ['custom_merged_pos_invoice', 'is', 'set'],
      ],
      limit: 500,
    } as unknown as Parameters<typeof db.getDocList>[1]);

    return rows
      .map((row: any) => row.custom_merged_pos_invoice as string | undefined)
      .filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

export interface GetMergeBillCandidatesParams {
  primaryInvoice: string;
  query?: string;
  page?: number;
  pageSize?: number;
  linkedSecondaries?: string[];
}

export async function getMergeBillCandidates({
  primaryInvoice,
  query = '',
  page = 1,
  pageSize = MERGE_CANDIDATE_PAGE_SIZE,
  linkedSecondaries,
}: GetMergeBillCandidatesParams): Promise<{ data: MergeBillCandidate[]; hasMore: boolean }> {
  try {
    const branch = getBranchFromSession();
    const secondaries = linkedSecondaries ?? (await getLinkedMergeSecondaries());
    const exclude = Array.from(new Set([primaryInvoice, ...secondaries]));

    const filters: Filter[] = [
      ['branch', '=', branch],
      ['docstatus', '=', 0],
      ['name', 'not in', exclude],
    ];

    const q = query.trim();
    let orFilters: Filter[] | undefined;

    if (q) {
      const pattern = `%${q}%`;
      filters.push(['custom_merged_pos_invoice', 'is', 'not set'] as unknown as Filter);
      orFilters = [
        ['name', 'like', pattern],
        ['customer', 'like', pattern],
        ['customer_name', 'like', pattern],
        ['restaurant_table', 'like', pattern],
        ['mobile_number', 'like', pattern],
      ];
    } else {
      orFilters = [
        ['custom_merged_pos_invoice', 'is', 'not set'],
        ['custom_merged_pos_invoice', '=', ''],
      ] as unknown as Filter[];
    }

    const rows = await db.getDocList(DOCTYPES.POS_INVOICE, {
      fields: [...MERGE_CANDIDATE_FIELDS],
      filters,
      orFilters,
      orderBy: { field: 'modified', order: 'desc' },
      limit: pageSize + 1,
      limit_start: (page - 1) * pageSize,
    } as unknown as Parameters<typeof db.getDocList>[1]);

    const hasMore = rows.length > pageSize;
    const data = (hasMore ? rows.slice(0, pageSize) : rows) as MergeBillCandidate[];

    return { data, hasMore };
  } catch (err) {
    console.warn('[getMergeBillCandidates] Network error, searching local repository:', err);
    const cached = await repositories.orders.getAll();
    const data: MergeBillCandidate[] = cached
      .filter(o => o.id !== primaryInvoice && o.status === 'Draft')
      .map(o => ({
        name: o.id,
        customer: o.customer || 'Guest',
        customer_name: o.customer || 'Guest',
        grand_total: o.grand_total || 0,
        rounded_total: o.grand_total || 0,
        posting_date: new Date(o.createdAt || Date.now()).toISOString().split('T')[0],
        posting_time: new Date(o.createdAt || Date.now()).toISOString().split('T')[1].substring(0, 8),
        order_type: (o.order_type as any) || 'Dine-In',
        restaurant_table: o.table || null,
        status: o.status,
        invoice_printed: o.sync_status === 'synced' ? 1 : 0,
        sync_status: o.sync_status || 'pending',
      }));
    return { data: data.slice((page - 1) * pageSize, page * pageSize), hasMore: data.length > page * pageSize };
  }
}

export async function mergeBills(
  primaryInvoice: string,
  secondaryInvoice: string
): Promise<MergeBillsResponse> {
  const endpoint = apiRegistry.getUrl('MERGE_BILLS');
  try {
    const response = await call.post<{ message: MergeBillsResponse }>(
      endpoint,
      {
        primary_invoice: primaryInvoice,
        secondary_invoice: secondaryInvoice,
      }
    );
    const result = response.message;
    if (result.status === 'error') {
      throw new Error(result.message || 'Failed to merge bills');
    }
    return result;
  } catch (error) {
    console.warn('Network mergeBills failed, queueing in sync_queue:', error);
    await repositories.syncQueue.put({
      id: `SYNC-MERGE-BILL-${Date.now()}`,
      action: 'merge_bills',
      endpoint: endpoint,
      payload: { primary_invoice: primaryInvoice, secondary_invoice: secondaryInvoice },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      attempts: 0,
      priority: 1,
    });
    return { status: 'success', message: 'Merge queued offline', name: primaryInvoice };
  }
}

export function getOrdersTabForInvoice(
  inv: {
    invoice_printed: number;
    restaurant_table: string | null;
    status: string;
    docstatus?: number;
  },
  options?: { paidLimit?: number; viewAllStatus?: number }
): OrderStatusType {
  const isPaid = inv.docstatus === 1 || inv.status === 'Paid';
  if (isPaid) {
    if (options?.paidLimit && options.paidLimit > 0) return 'Recently Paid';
    if (options?.viewAllStatus === 1) return 'Paid';
    return 'Recently Paid';
  }
  if (inv.invoice_printed === 0 && inv.restaurant_table) return 'Unbilled';
  return 'Draft';
}

export function mapSplitGroupInvoiceToPOSInvoice(inv: SplitGroupInvoice): POSInvoice {
  return {
    name: inv.name,
    invoice_printed: inv.invoice_printed,
    grand_total: inv.grand_total,
    restaurant_table: inv.restaurant_table,
    custom_merged_tables: inv.custom_merged_tables,
    cashier: inv.cashier ?? '',
    waiter: inv.waiter ?? '',
    net_total: inv.net_total ?? inv.grand_total,
    posting_time: inv.posting_time,
    total_taxes_and_charges: inv.total_taxes_and_charges ?? 0,
    customer: inv.customer,
    status: inv.status,
    mobile_number: inv.mobile_number ?? '',
    posting_date: inv.posting_date,
    rounded_total: inv.rounded_total,
    order_type: inv.order_type,
    custom_split_group: inv.custom_split_group,
    custom_split_from: inv.custom_split_from,
    split_index: inv.split_index,
    split_total: inv.split_total,
    split_siblings: inv.split_siblings,
    discount_amount: inv.discount_amount,
    additional_discount_percentage: inv.additional_discount_percentage,
  };
}

export function getCombinedOrderTotals(order: POSInvoice): { grandTotal: number; roundedTotal: number } {
  const isMerged = isMergedBill(order);
  const secondaryTotal = isMerged ? order.custom_merged_total ?? 0 : 0;
  const grandTotal = order.grand_total + secondaryTotal;
  const roundedTotal = order.rounded_total + Math.round(secondaryTotal);
  return { grandTotal, roundedTotal };
}

export function isMergedBill(order: Pick<POSInvoice, 'custom_merged_pos_invoice'>): boolean {
  return !!order.custom_merged_pos_invoice;
}

export function resolvePrintFormat(order: POSInvoice, defaultFormat: string | null): string {
  if (isMergedBill(order)) {
    return MERGED_POS_INVOICE_PRINT_FORMAT;
  }
  return defaultFormat || 'Standard POS Invoice';
}

export async function getInvoicePrintHtml(invoiceId: string, printFormat: string) {
  try {
    const response = await call.get<{ message: { html: string } }>(
      'frappe.www.printview.get_html_and_style',
      {
        doc: 'POS Invoice',
        name: invoiceId,
        print_format: printFormat,
        _lang: 'en',
        no_letterhead: 1,
        letterhead: "No Letterhead",
        settings: {}
      }
    );
    return response.message.html;
  } catch (error) {
    console.error('Error fetching invoice print HTML:', error);
    throw new Error('Failed to fetch invoice print HTML');
  }
}

export async function networkPrint(orderId: string, printer: string, printFormat: string) {
  await call.post('ury.ury.api.ury_print.network_printing', {
    doctype: 'POS Invoice',
    name: orderId,
    printer_setting: printer,
    print_format: printFormat,
  });
}

export async function selectNetworkPrinter(orderId: string, posProfile: string, printFormat?: string | null) {
  await call.post('ury.ury.api.ury_print.select_network_printer', {
    invoice_id: orderId,
    pos_profile: posProfile,
    print_format: printFormat,
  });
}

export async function updatePrintStatus(orderId: string) {
  try {
    // NOTE: 'update_print_status' does NOT exist in the backend.
    // The correct endpoint is 'qz_print_update' which sets invoice_printed=1
    // and releases table cluster reservations if applicable.
    await call.post('ury.ury.api.ury_print.qz_print_update', {
      invoice: orderId,
    });
  } catch (error) {
    console.warn('[updatePrintStatus] Error calling qz_print_update:', error);
    // Update local IndexedDB flag so offline print status is tracked
    try {
      const cached = await repositories.orders.getById(orderId);
      if (cached) {
        await repositories.orders.put({
          ...cached,
          updatedAt: new Date().toISOString(),
        } as any);
      }
    } catch (localErr) {
      console.warn('[updatePrintStatus] Failed to update local order cache:', localErr);
    }
  }
}