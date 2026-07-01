import { dedupedCall } from './api-dedup';
import { call } from './frappe-sdk-retry';

// ---- Types ----

export interface SalesReportSummary {
  total_orders: number;
  total_revenue: number;
  net_revenue: number;
  total_tax: number;
  avg_order_value: number;
  unique_customers: number;
}

export interface ItemSaleRecord {
  item_code: string;
  item_name: string;
  total_qty: number;
  total_amount: number;
  avg_rate: number;
}

export interface OrderTypeSaleRecord {
  order_type: string;
  order_count: number;
  revenue: number;
}

export interface HourlySaleRecord {
  hour: number;
  order_count: number;
  revenue: number;
}

export interface CancelledOrdersInfo {
  count: number;
  amount: number;
}

export interface PaymentSummaryRecord {
  payment_method: string;
  total_paid: number;
  transaction_count: number;
}

export interface TopCustomerRecord {
  customer: string;
  customer_name: string;
  order_count: number;
  total_spent: number;
}

export interface SalesReport {
  period: string;
  from_date: string;
  to_date: string;
  branch: string | null;
  summary: SalesReportSummary;
  item_sales: ItemSaleRecord[];
  order_type_sales: OrderTypeSaleRecord[];
  hourly_sales: HourlySaleRecord[];
  cancelled_orders: CancelledOrdersInfo;
  payment_summary: PaymentSummaryRecord[];
  top_customers: TopCustomerRecord[];
}

export interface ExpenseRecord {
  name: string;
  expense_type: string;
  description: string;
  amount: number;
  date?: string;
}

export interface ExpenseReport {
  from_date: string;
  to_date: string;
  fixed_expenses: ExpenseRecord[];
  variable_expenses: ExpenseRecord[];
  total_fixed: number;
  total_variable: number;
  total_expenses: number;
}

export interface ProfitLossReport {
  from_date: string;
  to_date: string;
  total_revenue: number;
  net_revenue: number;
  total_tax: number;
  cost_of_goods: number;
  gross_profit: number;
  total_expenses: number;
  fixed_expenses: number;
  variable_expenses: number;
  net_profit: number;
  profit_margin: number;
}

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'last_month';
export type ReportType = 'sales' | 'inventory' | 'expense' | 'profit_loss';

// ---- API Functions ----

export async function getSalesReport(
  period: ReportPeriod = 'daily',
  fromDate?: string,
  toDate?: string
): Promise<SalesReport> {
  const response = await dedupedCall.get<{ message: SalesReport }>(
    'ury.ury.api.ury_reports.get_sales_report',
    { period, from_date: fromDate, to_date: toDate },
    { cacheTtl: 120_000 } // 2 min cache for reports
  );
  return response.message;
}

export async function getExpenseReport(
  fromDate?: string,
  toDate?: string
): Promise<ExpenseReport> {
  const response = await dedupedCall.get<{ message: ExpenseReport }>(
    'ury.ury.api.ury_reports.get_expense_report',
    { from_date: fromDate, to_date: toDate },
    { cacheTtl: 120_000 }
  );
  return response.message;
}

export async function getProfitLossReport(
  fromDate?: string,
  toDate?: string
): Promise<ProfitLossReport> {
  const response = await dedupedCall.get<{ message: ProfitLossReport }>(
    'ury.ury.api.ury_reports.get_profit_loss_report',
    { from_date: fromDate, to_date: toDate },
    { cacheTtl: 120_000 }
  );
  return response.message;
}

export async function exportReportPdf(
  reportType: ReportType = 'sales',
  period: ReportPeriod = 'daily',
  fromDate?: string,
  toDate?: string
): Promise<string> {
  // No caching for PDF exports — always fresh
  const response = await call.get<{ message: string }>(
    'ury.ury.api.ury_reports.export_report_pdf',
    { report_type: reportType, period, from_date: fromDate, to_date: toDate }
  );
  return response.message;
}
