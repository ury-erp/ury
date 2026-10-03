import { call } from '@ury/core';

const API = 'ury.ury.api.purchases';

export interface PurchaseSetup {
  company: string;
  currency: string;
  warehouses: { name: string; label: string }[];
  default_warehouse: string | null;
  modes_of_payment: { name: string; type: string }[];
  today: string;
  permissions: {
    create: boolean;
    submit: boolean;
    cancel: boolean;
    delete: boolean;
    create_supplier: boolean;
    pay: boolean;
  };
}

export interface SupplierOption {
  name: string;
  supplier_name: string;
  mobile_no?: string | null;
  supplier_group?: string | null;
}

export interface PurchaseItemOption {
  item_code: string;
  item_name: string;
  item_group?: string;
  stock_uom: string;
  default_uom: string;
  uoms: { uom: string; conversion_factor: number }[];
  is_stock_item: number;
  image?: string | null;
  /** Per stock unit. */
  last_rate: number;
  last_rate_from_supplier: boolean;
  actual_qty: number | null;
}

export interface PurchaseRow {
  name: string;
  supplier: string;
  supplier_name?: string;
  posting_date: string;
  bill_no?: string | null;
  set_warehouse?: string | null;
  grand_total: number;
  rounded_total?: number;
  outstanding_amount: number;
  status: string;
  docstatus: number;
  is_return?: number;
}

export interface PurchasePage {
  rows: PurchaseRow[];
  total: number;
  amount: number;
  outstanding: number;
  page: number;
  page_size: number;
}

export interface PurchaseFilters {
  branch?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
  supplier?: string;
  warehouse?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface PurchaseSummary {
  purchases_amount: number;
  purchases_count: number;
  outstanding_amount: number;
  outstanding_count: number;
  overdue_amount: number;
  overdue_count: number;
  draft_count: number;
  top_suppliers: { supplier: string; supplier_name?: string; amount: number; count: number }[];
}

export interface PurchaseDetail {
  name: string;
  status: string;
  docstatus: number;
  is_return: number;
  company: string;
  supplier: string;
  supplier_name?: string;
  posting_date: string;
  due_date?: string | null;
  bill_no?: string | null;
  bill_date?: string | null;
  warehouse?: string | null;
  update_stock: number;
  is_paid: number;
  mode_of_payment?: string | null;
  remarks?: string | null;
  currency: string;
  created_by?: string | null;
  creation: string;
  modified: string;
  items: {
    item_code: string;
    item_name: string;
    qty: number;
    uom: string;
    stock_uom: string;
    conversion_factor: number;
    rate: number;
    amount: number;
    warehouse?: string | null;
  }[];
  taxes: { description: string; amount: number }[];
  totals: {
    total: number;
    discount_amount: number;
    total_taxes: number;
    grand_total: number;
    rounding_adjustment: number;
    rounded_total: number;
    paid_amount: number;
    outstanding_amount: number;
  };
  payments: { name: string | null; posting_date: string; mode_of_payment?: string | null; reference_no?: string | null; amount: number }[];
  permissions: { write: boolean; submit: boolean; cancel: boolean; delete: boolean; pay: boolean; print: boolean };
}

export interface PurchasePayload {
  name?: string;
  modified?: string;
  branch?: string;
  supplier: string;
  posting_date: string;
  warehouse: string;
  bill_no?: string;
  bill_date?: string;
  due_date?: string;
  discount_amount?: number;
  remarks?: string;
  pay_now?: 0 | 1;
  mode_of_payment?: string;
  items: { item_code: string; qty: number; rate: number; uom: string }[];
}

const unwrap = <T,>(res: unknown): T => ((res as { message?: T })?.message ?? res) as T;

export const purchaseService = {
  async setup(branch?: string): Promise<PurchaseSetup> {
    return unwrap(await call(`${API}.get_purchase_setup`, { branch }));
  },
  async list(filters: PurchaseFilters): Promise<PurchasePage> {
    return unwrap(await call(`${API}.get_purchases`, filters as Record<string, unknown>));
  },
  async summary(branch?: string, from_date?: string, to_date?: string): Promise<PurchaseSummary> {
    return unwrap(await call(`${API}.get_purchase_summary`, { branch, from_date, to_date }));
  },
  async detail(name: string): Promise<PurchaseDetail> {
    return unwrap(await call(`${API}.get_purchase_detail`, { name }));
  },
  async searchSuppliers(term: string): Promise<SupplierOption[]> {
    return unwrap(await call(`${API}.search_suppliers`, { term }));
  },
  async createSupplier(supplier_name: string, mobile_no?: string): Promise<SupplierOption> {
    return unwrap(await call(`${API}.create_supplier`, { supplier_name, mobile_no }));
  },
  async searchItems(term: string, warehouse?: string, supplier?: string): Promise<PurchaseItemOption[]> {
    return unwrap(await call(`${API}.search_items`, { term, warehouse, supplier }));
  },
  async save(data: PurchasePayload, submit: boolean): Promise<{ name: string; docstatus: number; status: string }> {
    return unwrap(await call(`${API}.save_purchase`, { data: JSON.stringify(data), submit: submit ? 1 : 0 }));
  },
  async submit(name: string): Promise<void> {
    await call(`${API}.submit_purchase`, { name });
  },
  async cancel(name: string, reason?: string): Promise<void> {
    await call(`${API}.cancel_purchase`, { name, reason });
  },
  async remove(name: string): Promise<void> {
    await call(`${API}.delete_purchase`, { name });
  },
  async pay(name: string, mode_of_payment: string, amount: number, reference_no?: string): Promise<{ payment_entry: string; outstanding_amount: number }> {
    return unwrap(await call(`${API}.record_payment`, { name, mode_of_payment, amount, reference_no }));
  },
};

/** Frappe's own print view of the purchase, which opens the browser print dialog. */
export function purchasePrintUrl(name: string): string {
  const params = new URLSearchParams({ doctype: 'Purchase Invoice', name, trigger_print: '1' });
  return `/printview?${params.toString()}`;
}
