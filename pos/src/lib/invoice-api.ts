import { call } from './frappe-sdk';
import { OrderType } from '../data/order-types';

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
  status: 'Draft' | 'Unbilled' | 'Recently Paid' | 'Paid' | 'Consolidated' | 'Return';
  mobile_number: string;
  posting_date: string;
  rounded_total: number;
  order_type: OrderType;
  /** Set when several table orders were combined into this bill. */
  custom_is_merged?: number;
  /** Comma separated tables the merged orders came from, e.g. "T1, T2, T3". */
  custom_merged_tables?: string | null;
}

export interface POSInvoiceItem {
  item_name: string;
  qty: number;
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
  const res = await call.post<{ message?: string }>('ury.ury.api.ury_print.network_printing', {
    doctype: 'POS Invoice',
    name: orderId,
    printer_setting: printer,
    print_format: printFormat,
  });
  // Backend reports failures as a string ("Failed to print: ..."), not an
  // HTTP error — surface them instead of faking success.
  if (res?.message !== 'Success') {
    throw new Error(res?.message || 'Print failed');
  }
}

export async function selectNetworkPrinter(orderId: string, posProfile: string, printFormat?: string | null) {
  const res = await call.post<{ message?: string }>('ury.ury.api.ury_print.select_network_printer', {
    invoice_id: orderId,
    pos_profile: posProfile,
    print_format: printFormat,
  });
  if (res?.message !== 'Success') {
    throw new Error(res?.message || 'No bill printer configured for this room/profile');
  }
}

/** frappe-js-sdk rejects with a plain object, not an Error — pull the
 *  human-readable server message out so catch blocks can toast it. */
function toPrintError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object') {
    const e = err as { _server_messages?: string; message?: string };
    if (typeof e._server_messages === 'string') {
      try {
        const parsed = JSON.parse(JSON.parse(e._server_messages)[0]);
        if (parsed?.message) return new Error(parsed.message);
      } catch {
        // fall through
      }
    }
    if (e.message) return new Error(e.message);
  }
  return new Error(fallback);
}

/** Print the full current order KOT-style (codes + qty, no prices) on the
 *  POS Profile's table/parcel order printer — the billing-area printer. */
export async function reprintKot(invoiceId: string) {
  let res: { message?: string } | undefined;
  try {
    res = await call.post<{ message?: string }>('ury.ury.api.ury_kot_reprint.reprint_kot', {
      invoice_number: invoiceId,
    });
  } catch (err) {
    throw toPrintError(err, 'KOT print failed');
  }
  if (res?.message !== 'Success') {
    throw new Error(res?.message || 'KOT print failed');
  }
}


export async function updatePrintStatus(orderId: string) {
  await call.post('ury.ury.api.ury_print.qz_print_update', { invoice: orderId });
}

export interface Waiter {
  /** Employee id (e.g. HR-EMP-00001) */
  name: string;
  /** Display name — what gets stored on POS Invoice.waiter and printed */
  employee_name: string;
  /** Avatar path: Employee image, falling back to the linked User's image */
  image?: string | null;
}

/** Active employees, offered as waiters when tagging an order. */
export async function getWaiters(): Promise<Waiter[]> {
  const response = await call.get<{ message: Waiter[] }>('ury.ury_pos.api.get_waiters');
  return response.message || [];
}
