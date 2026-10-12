import { call } from '@ury/core';

const API = 'ury.ury.api.invoice_browser';

export interface InvoiceRow {
  name: string;
  customer?: string;
  customer_name?: string;
  posting_date: string;
  posting_time: string;
  grand_total: number;
  rounded_total?: number;
  status: string;
  docstatus: number;
  order_type?: string;
  restaurant_table?: string;
  branch?: string;
  invoice_printed?: number;
  owner?: string;
  custom_ury_order_number?: string;
}

export interface InvoicePage {
  rows: InvoiceRow[];
  total: number;
  amount: number;
  page: number;
  page_size: number;
}

export interface InvoiceFilters {
  branch?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  order_type?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface InvoiceActivity {
  kind: 'created' | 'activity' | 'note' | 'cancelled';
  text: string;
  by?: string | null;
  at: string;
}

export interface InvoiceDetail {
  name: string;
  status: string;
  docstatus: number;
  order_number?: string | null;
  order_type?: string | null;
  restaurant_table?: string | null;
  merged_tables?: string | null;
  branch?: string | null;
  pos_profile: string;
  customer: string;
  customer_name?: string | null;
  mobile_number?: string | null;
  no_of_pax?: number | null;
  waiter?: string | null;
  cashier?: string | null;
  created_by?: string | null;
  posting_date: string;
  posting_time: string;
  creation: string;
  comments?: string | null;
  cancel_reason?: string | null;
  currency?: string;
  invoice_printed: number;
  items: { item_code: string; item_name: string; qty: number; rate: number; amount: number; discount_amount?: number; comment?: string | null }[];
  taxes: { description: string; rate: number; amount: number }[];
  payments: { mode_of_payment: string; amount: number }[];
  totals: {
    net_total: number;
    total: number;
    discount_amount: number;
    additional_discount_percentage: number;
    total_taxes: number;
    grand_total: number;
    rounding_adjustment: number;
    rounded_total: number;
    paid_amount: number;
    change_amount: number;
  };
  kots: { name: string; production?: string; type?: string; order_status?: string; creation: string; order_no?: string }[];
  activity: InvoiceActivity[];
  print: { qz: boolean; format: string; network_printers: string[]; can_print: boolean };
}

const unwrap = <T,>(res: unknown): T => ((res as { message?: T })?.message ?? res) as T;

export const invoiceService = {
  async list(filters: InvoiceFilters): Promise<InvoicePage> {
    return unwrap<InvoicePage>(await call(`${API}.get_transactions`, filters as Record<string, unknown>));
  },
  async detail(invoice: string): Promise<InvoiceDetail> {
    return unwrap<InvoiceDetail>(await call(`${API}.get_invoice_detail`, { invoice }));
  },
  async recordPrint(invoice: string, channel: 'browser' | 'printer' | 'qz'): Promise<void> {
    await call(`${API}.print_invoice`, { invoice, channel });
  },
};

/** Frappe's own print view of the bill, which opens the browser print dialog. */
export function printViewUrl(invoice: string, format: string): string {
  const params = new URLSearchParams({
    doctype: 'POS Invoice',
    name: invoice,
    format,
    no_letterhead: '1',
    trigger_print: '1',
  });
  return `/printview?${params.toString()}`;
}
