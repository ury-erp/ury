import { call } from '@ury/core';

export interface DashboardSummary {
  today_sales: number;
  today_orders: number;
  occupied_tables: number;
  total_tables: number;
  avg_order_value: number;
  active_cashiers: number;
  pending_kitchen_orders: number;
  total_menu_items: number;
}

export interface ChartSalesTrend {
  date: string;
  sales: number;
}

export interface ChartHourlySales {
  hour: string;
  sales: number;
}

export interface ChartPaymentMethod {
  method: string;
  total: number;
}

export interface ChartOrderType {
  order_type: string;
  count: number;
  total: number;
}

export interface ChartTopItem {
  item_name: string;
  total_qty: number;
  total_amount: number;
}

export interface ChartRevenueByBranch {
  branch: string;
  total: number;
}

export interface ChartSalesByCourse {
  course: string;
  total: number;
}

export interface DashboardChartsData {
  sales_trend: ChartSalesTrend[];
  hourly_sales: ChartHourlySales[];
  payment_methods: ChartPaymentMethod[];
  order_types: ChartOrderType[];
  top_items: ChartTopItem[];
  revenue_by_branch: ChartRevenueByBranch[];
  sales_by_course: ChartSalesByCourse[];
}

export interface TransactionRecord {
  name: string;
  customer?: string;
  posting_date: string;
  posting_time: string;
  grand_total: number;
  status: string;
  order_type?: string;
  restaurant_table?: string;
  cashier?: string;
}

export const dashboardService = {
  async getSummary(branch?: string): Promise<DashboardSummary> {
    try {
      let res = await call<DashboardSummary>('ury.ury.api.dashboard.get_dashboard_summary', { branch });
      res = (res as any)?.message || res;
      return res || {
        today_sales: 0,
        today_orders: 0,
        occupied_tables: 0,
        total_tables: 0,
        avg_order_value: 0,
        active_cashiers: 0,
        pending_kitchen_orders: 0,
        total_menu_items: 0,
      };
    } catch {
      return {
        today_sales: 0,
        today_orders: 0,
        occupied_tables: 0,
        total_tables: 0,
        avg_order_value: 0,
        active_cashiers: 0,
        pending_kitchen_orders: 0,
        total_menu_items: 0,
      };
    }
  },

  async getCharts(branch?: string): Promise<DashboardChartsData> {
    try {
      let res = await call<DashboardChartsData>('ury.ury.api.dashboard.get_dashboard_charts', { branch });
      res = (res as any)?.message || res;
      return res || {
        sales_trend: [],
        hourly_sales: [],
        payment_methods: [],
        order_types: [],
        top_items: [],
        revenue_by_branch: [],
        sales_by_course: [],
      };
    } catch {
      return {
        sales_trend: [],
        hourly_sales: [],
        payment_methods: [],
        order_types: [],
        top_items: [],
        revenue_by_branch: [],
        sales_by_course: [],
      };
    }
  },

  async getRecentTransactions(branch?: string, limit: number = 10): Promise<TransactionRecord[]> {
    try {
      const res = await call<TransactionRecord[]>('ury.ury.api.dashboard.get_recent_transactions', { branch, limit });
      return Array.isArray(res) ? res : ((res as any)?.message || []);
    } catch {
      return [];
    }
  },

  async getModuleRecords<T = any>(doctype: string, branch?: string): Promise<T[]> {
    try {
      const res = await call<T[]>('ury.ury.api.dashboard.get_module_records', { doctype, branch });
      return Array.isArray(res) ? res : ((res as any)?.message || []);
    } catch {
      return [];
    }
  },
};

export interface DashboardStats {
  todays_sales: number;
  orders_today: number;
  avg_order_value: number;
  active_tables: number;
  total_tables: number;
}

export interface NeedsAttentionReference {
  doctype: string;
  names: string[];
}

export interface NeedsAttentionItem {
  type: string;
  message: string;
  severity: string;
  reference?: NeedsAttentionReference | null;
}

export interface BaselineStats {
  sample_days: number;
  median_sales: number;
  median_covers: number;
}

export interface ShiftMetrics {
  sales: number;
  covers: number;
  avg_per_cover: number;
  avg_ticket_minutes: number;
}

export interface DailyPnlSummaryField {
  key: string;
  label: string;
  amount: number;
  percent: number;
}

export interface DailyPnlSummary {
  exists: boolean;
  branch?: string;
  date?: string;
  summary?: DailyPnlSummaryField[];
}

export interface PlanStatus {
  name: string | null;
  status: string | null;
}

const unwrap = <T,>(res: unknown): T => ((res as any)?.message ?? res) as T;

export interface CloseDayChecklistItem {
  key: string;
  label: string;
  count: number;
  blocking: boolean;
  scope_note?: string;
}

export interface CloseDayChecklist {
  branch: string;
  service_date: string;
  items: CloseDayChecklistItem[];
  has_pos_profile: boolean;
  unposted_production_is_company_wide: boolean;
}

export const uryDashboardService = {
  async getCancelledInvoicesCount(branch?: string): Promise<number> {
    const res = await call.get<number>('ury.ury.api.ury_dashboard.get_cancelled_invoices_count', { branch });
    return unwrap<number>(res) ?? 0;
  },

  async getDailyPnlSummary(branch: string, date: string): Promise<DailyPnlSummary> {
    const res = await call.get<DailyPnlSummary>('ury.ury.report_api.financial.get_daily_pnl', {
      branch,
      date,
    });
    return unwrap<DailyPnlSummary>(res);
  },


  async getDashboardStats(branch?: string): Promise<DashboardStats> {
    const res = await call.get<DashboardStats>('ury.ury.api.ury_dashboard.get_dashboard_stats', { branch });
    return unwrap<DashboardStats>(res);
  },

  async getNeedsAttention(branch?: string): Promise<NeedsAttentionItem[]> {
    const res = await call.get<NeedsAttentionItem[]>('ury.ury.api.ury_dashboard.get_needs_attention', { branch });
    const unwrapped = unwrap<NeedsAttentionItem[]>(res);
    return Array.isArray(unwrapped) ? unwrapped : [];
  },

  async getBaseline(branch?: string): Promise<BaselineStats> {
    const res = await call.get<BaselineStats>('ury.ury.api.ury_dashboard.get_baseline', { branch });
    return unwrap<BaselineStats>(res);
  },

  async getShiftMetrics(branch?: string): Promise<ShiftMetrics> {
    const res = await call.get<ShiftMetrics>('ury.ury.api.ury_dashboard.get_shift_metrics', { branch });
    return unwrap<ShiftMetrics>(res);
  },

  async getPlanStatus(branch: string, planDate: string): Promise<PlanStatus> {
    const res = await call.get<PlanStatus>('ury.ury.api.ury_sales_plan.get_plan_status', {
      branch,
      plan_date: planDate,
    });
    return unwrap<PlanStatus>(res);
  },

  async getCloseDayChecklist(branch: string, serviceDate: string): Promise<CloseDayChecklist> {
    const res = await call.get<CloseDayChecklist>('ury.ury.report_api.day_close.get_close_day_checklist', {
      branch,
      service_date: serviceDate,
    });
    return unwrap<CloseDayChecklist>(res);
  },
};
