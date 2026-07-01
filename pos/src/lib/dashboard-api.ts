import { call } from './frappe-sdk-retry';

// ---- Types ----

export interface DashboardSummary {
  period: string;
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_orders: number;
  net_total: number;
  total_tax: number;
  average_order_value: number;
  unique_customers: number;
  top_selling_items: TopSellingItem[];
  order_type_breakdown: OrderTypeBreakdown[];
  hourly_breakdown: HourlyBreakdown[];
}

export interface TopSellingItem {
  item_name: string;
  item_code: string;
  total_qty: number;
  total_amount: number;
}

export interface OrderTypeBreakdown {
  order_type: string;
  count: number;
  revenue: number;
}

export interface HourlyBreakdown {
  hour: number;
  order_count: number;
  revenue: number;
}

export interface RevenueChartData {
  period: string;
  granularity: string;
  from_date: string;
  to_date: string;
  data: RevenueDataPoint[];
}

export interface RevenueDataPoint {
  date?: string;
  hour?: number;
  week?: number;
  week_start?: string;
  week_end?: string;
  month?: string;
  order_count: number;
  revenue: number;
  net_revenue?: number;
  tax?: number;
}

export interface CategorySalesItem {
  category: string;
  total_qty: number;
  total_amount: number;
}

export interface CategorySalesData {
  data: CategorySalesItem[];
}

export interface OrdersChartDataPoint {
  date: string;
  total_orders: number;
  paid_orders: number;
  draft_orders: number;
  cancelled_orders: number;
}

export interface OrdersChartData {
  period: string;
  from_date: string;
  to_date: string;
  data: OrdersChartDataPoint[];
}

export interface PaymentMethodDataPoint {
  payment_method: string;
  total_paid: number;
  transaction_count: number;
}

export interface PaymentMethodChartData {
  data: PaymentMethodDataPoint[];
}

export interface TableOccupancy {
  total_tables: number;
  occupied_tables: number;
  available_tables: number;
  occupancy_rate: number;
  rooms: Record<string, { total: number; occupied: number; available: number }>;
}

export interface LiveMetrics {
  today_revenue: number;
  today_orders: number;
  pending_kots: number;
  recent_orders: RecentOrder[];
  timestamp: string;
}

export interface RecentOrder {
  name: string;
  customer: string;
  grand_total: number;
  posting_time: string;
  order_type: string;
}

export type DashboardPeriod =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days';

export type ChartGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

// ---- API Functions ----

export async function getDashboardSummary(
  period: DashboardPeriod = 'today'
): Promise<DashboardSummary> {
  const response = await call.get<{ message: DashboardSummary }>(
    'ury.ury.api.ury_dashboard.get_dashboard_summary',
    { period }
  );
  return response.message;
}

export async function getRevenueChart(
  period: DashboardPeriod = 'this_month',
  granularity: ChartGranularity = 'daily'
): Promise<RevenueChartData> {
  const response = await call.get<{ message: RevenueChartData }>(
    'ury.ury.api.ury_dashboard.get_revenue_chart',
    { period, granularity }
  );
  return response.message;
}

export async function getOrdersChart(
  period: DashboardPeriod = 'this_month'
): Promise<OrdersChartData> {
  const response = await call.get<{ message: OrdersChartData }>(
    'ury.ury.api.ury_dashboard.get_orders_chart', { period }
  );
  return response.message;
}

export async function getCategorySalesChart(
  period: DashboardPeriod = 'this_month'
): Promise<CategorySalesData> {
  const response = await call.get<{ message: CategorySalesData }>(
    'ury.ury.api.ury_dashboard.get_category_sales_chart',
    { period }
  );
  return response.message;
}

export async function getPaymentMethodChart(
  period: DashboardPeriod = 'this_month'
): Promise<PaymentMethodChartData> {
  const response = await call.get<{ message: PaymentMethodChartData }>(
    'ury.ury.api.ury_dashboard.get_payment_method_chart',
    { period }
  );
  return response.message;
}

export async function getTableOccupancy(): Promise<TableOccupancy> {
  const response = await call.get<{ message: TableOccupancy }>(
    'ury.ury.api.ury_dashboard.get_table_occupancy'
  );
  return response.message;
}

export async function getLiveMetrics(): Promise<LiveMetrics> {
  const response = await call.get<{ message: LiveMetrics }>(
    'ury.ury.api.ury_dashboard.get_live_metrics'
  );
  return response.message;
}
