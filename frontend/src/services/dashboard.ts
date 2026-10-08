import { call } from '@ury/core';

const unwrap = <T,>(res: unknown): T => ((res as any)?.message ?? res) as T;

/** One currency's slice of a scope that spans several (e.g. "All companies"). */
export interface CurrencyBreakdownRow {
  currency: string | null;
  sales: number;
  orders: number;
  avg_order_value: number;
}

export interface DashboardSummary {
  /** Currency the money fields are in; ``null`` when ``currency_breakdown`` applies. */
  currency?: string | null;
  currency_breakdown?: CurrencyBreakdownRow[];
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
  currency?: string | null;
  status: string;
  order_type?: string;
  restaurant_table?: string;
  cashier?: string;
}

export const dashboardService = {
  /**
   * Management summary for Service Board. Delegates to the backend summary
   * endpoint, which itself reuses ``get_dashboard_stats`` for live sales/table
   * numbers (same source as the POS dashboard).
   */
  async getSummary(branch?: string, company?: string): Promise<DashboardSummary> {
    const branchArg = !branch || branch === 'all' ? undefined : branch;
    const companyArg = !company || company === 'all' ? undefined : company;
    const res = await call.get<DashboardSummary>('ury.ury.api.dashboard.get_dashboard_summary', {
      branch: branchArg,
      company: companyArg,
    });
    const summary = unwrap<DashboardSummary>(res);
    return {
      currency: summary?.currency ?? null,
      currency_breakdown: summary?.currency_breakdown ?? [],
      today_sales: summary?.today_sales ?? 0,
      today_orders: summary?.today_orders ?? 0,
      occupied_tables: summary?.occupied_tables ?? 0,
      total_tables: summary?.total_tables ?? 0,
      avg_order_value: summary?.avg_order_value ?? 0,
      active_cashiers: summary?.active_cashiers ?? 0,
      pending_kitchen_orders: summary?.pending_kitchen_orders ?? 0,
      total_menu_items: summary?.total_menu_items ?? 0,
    };
  },

  async getCharts(branch?: string, company?: string): Promise<DashboardChartsData> {
    try {
      const branchArg = !branch || branch === 'all' ? undefined : branch;
      const companyArg = !company || company === 'all' ? undefined : company;
      let res = await call<DashboardChartsData>('ury.ury.api.dashboard.get_dashboard_charts', { branch: branchArg, company: companyArg });
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

  async getRecentTransactions(branch?: string, limit: number = 10, company?: string): Promise<TransactionRecord[]> {
    try {
      const branchArg = !branch || branch === 'all' ? undefined : branch;
      const companyArg = !company || company === 'all' ? undefined : company;
      const res = await call<TransactionRecord[]>('ury.ury.api.dashboard.get_recent_transactions', { branch: branchArg, limit, company: companyArg });
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
  todays_sales: number | null;
  orders_today: number;
  avg_order_value: number | null;
  active_tables: number;
  total_tables: number;
  currency?: string | null;
  currency_breakdown?: CurrencyBreakdownRow[];
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

export interface DepartmentActivityRow {
  department: string;
  tickets_fired: number;
  tickets_served: number;
  work_orders_completed: number;
  qty_produced: number;
}

export interface DepartmentActivity {
  branch: string | null;
  as_of: string;
  rows: DepartmentActivityRow[];
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

  async getDepartmentActivity(branch?: string, company?: string): Promise<DepartmentActivity> {
    const res = await call.get<DepartmentActivity>('ury.ury.api.ury_dashboard.get_department_activity', {
      branch,
      company,
    });
    return unwrap<DepartmentActivity>(res);
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
