import { call } from './frappe-sdk';
import { OrderStatusType, OrderType } from '../data/order-types';

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
  custom_split_group?: string | null;
  custom_split_from?: string | null;
  split_index?: number;
  split_total?: number;
  split_siblings?: string[];
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
        letterhead:"No Letterhead",
        settings:{}
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
  await call.post('ury.ury.api.ury_print.qz_print_update', { invoice: orderId });
} 