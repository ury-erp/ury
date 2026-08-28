import { DOCTYPES } from '../data/doctypes';
import { call, db } from '@ury/core';
import { OrderStatusType, OrderType } from '../data/order-types';
import type { Filter } from 'frappe-js-sdk/lib/db/types';

export interface POSInvoice {
  name: string;
  invoice_printed: number;
  custom_printing_time?: string | null;
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
  custom_split_group?: string | null;
  custom_split_from?: string | null;
  split_index?: number;
  split_total?: number;
  split_siblings?: string[];
  custom_merged_pos_invoice?: string | null;
  custom_merged_total?: number | null;
  discount_amount?: number;
  additional_discount_percentage?: number;
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

export interface PrintJobSubmissionResult {
  status: 'Success' | 'Failure';
  cups_job_id?: number;
  print_job_id?: string;
  printer?: string;
  invoice?: string;
  message?: string;
  print_jobs?: PrintJobSubmissionResult[];
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

export async function getPOSInvoices({
  status,
  limit,
  limit_start,
  paid_limit
}: GetPOSInvoicesParams) {
  try {
    // Use paid_limit as the limit for Recently Paid status
    const actualLimit = status === 'Recently Paid' && paid_limit ? paid_limit : limit;

    const response = await call.get<GetPOSInvoicesResponse>(
      'ury.ury_pos.api.getPosInvoice',
      {
        status,
        limit: actualLimit,
        limit_start
      }
    );

    return {
      invoices: response.message.data,
      hasMore: response.message.next
    };
  } catch (error) {
    console.error('Error fetching POS invoices:', error);
    throw new Error('Failed to fetch POS invoices');
  }
}

export async function getPOSInvoiceItems(invoiceId: string) {
  try {
    const response = await call.get<GetPOSInvoiceItemsResponse>(
      'ury.ury_pos.api.getPosInvoiceItems',
      {
        invoice: invoiceId
      }
    );

    return {
      items: response.message[0],
      taxes: response.message[1]
    };
  } catch (error) {
    console.error('Error fetching POS invoice items:', error);
    throw new Error('Failed to fetch POS invoice items');
  }
}

export async function updateInvoiceStatus(
  invoice: string,
  status: POSInvoice['status']
) {
  try {
    await call.post('ury.ury_pos.api.updatePosInvoiceStatus', {
      invoice,
      status,
    });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    throw new Error('Failed to update invoice status');
  }
}

export async function searchPosInvoice(query: string, status: string) {
  try {
    const response = await call.get('ury.ury_pos.api.searchPosInvoice', {
      query,
      status,
    });
    return response.message;
  } catch (error) {
    console.error('Error searching POS invoices:', error);
    throw error;
  }
}

export async function getSplitGroup(invoiceId: string): Promise<SplitGroupResponse> {
  const response = await call.get<{ message: SplitGroupResponse }>(
    'ury.ury_pos.api.get_split_group',
    { invoice: invoiceId }
  );
  return response.message;
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

export async function networkPrint(
  orderId: string,
  printer: string,
  printFormat: string
): Promise<PrintJobSubmissionResult> {
  const response = await call.post<{ message: PrintJobSubmissionResult }>(
    'ury.ury.api.ury_print.network_printing',
    {
      doctype: 'POS Invoice',
      name: orderId,
      printer_setting: printer,
      print_format: printFormat,
    }
  );
  return response.message;
}

export async function selectNetworkPrinter(
  orderId: string,
  posProfile: string,
  printFormat?: string | null
): Promise<PrintJobSubmissionResult> {
  const response = await call.post<{ message: PrintJobSubmissionResult }>(
    'ury.ury.api.ury_print.select_network_printer',
    {
      invoice_id: orderId,
      pos_profile: posProfile,
      print_format: printFormat,
    }
  );
  return response.message;
}


export async function updatePrintStatus(orderId: string) {
  await call.post('ury.ury.api.ury_print.qz_print_update', { invoice: orderId });
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
}

export interface MergeBillsResponse {
  status: 'success' | 'error';
  message: string;
  name?: string;
}

// export function getCombinedOrderTotals(order: Pick<POSInvoice, 'grand_total' | 'rounded_total' | 'custom_merged_total'>) {
//   const mergedTotal = order.custom_merged_total ?? 0;
//   return {
//     grandTotal: order.grand_total + mergedTotal,
//     roundedTotal: order.rounded_total + mergedTotal,
//   };
// }
export function getCombinedOrderTotals(
  order: Pick<POSInvoice, 'rounded_total' | 'custom_merged_total'>
) {
  const roundedTotal =
    (order.rounded_total ?? 0) + Math.round(order.custom_merged_total ?? 0);

  return {
    grandTotal: roundedTotal,
    roundedTotal,
  };
}

export function isMergedBill(order: Pick<POSInvoice, 'custom_merged_pos_invoice'>) {
  return !!order.custom_merged_pos_invoice;
}

export function resolvePrintFormat(
  order: Pick<POSInvoice, 'custom_merged_pos_invoice'>,
  defaultFormat: string | null | undefined
) {
  return defaultFormat as string;
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

function getBranchFromSession(): string {
  const raw = sessionStorage.getItem('posProfile');
  if (!raw) {
    throw new Error('POS profile not loaded');
  }
  const profile = JSON.parse(raw) as { branch?: string };
  if (!profile.branch) {
    throw new Error('Branch not found in POS profile');
  }
  return profile.branch;
}

export async function getLinkedMergeSecondaries(): Promise<string[]> {
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
}

export async function mergeBills(
  primaryInvoice: string,
  secondaryInvoice: string
): Promise<MergeBillsResponse> {
  const response = await call.post<{ message: MergeBillsResponse }>(
    'ury.ury_pos.api.merge_bills',
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
} 