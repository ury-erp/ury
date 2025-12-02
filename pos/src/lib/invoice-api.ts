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