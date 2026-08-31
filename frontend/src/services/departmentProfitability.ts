import { call } from '@ury/core';

/**
 * Read-only client for the V3-80 department profitability / plan-vs-actual
 * backend (`ury.ury.api.ury_department_profitability`). Mirrors the
 * V3-34 `departmentStock.ts` service convention: this module never calls a
 * mutating endpoint, only the two whitelisted read functions below.
 *
 * The backend omits cost/profit fields ENTIRELY from each row for a
 * quantity-only tier (Chef/Production) rather than sending zero/null, so
 * every cost/profit field here is typed optional and callers must check
 * for its presence, not falsiness, before rendering it.
 */

export interface DepartmentProfitabilityFilters {
  company: string;
  branch: string;
  service_date_or_period: string;
  department?: string;
}

export interface ProfitabilityRow {
  company: string;
  branch: string;
  service_date_or_period: string;
  department: string;
  item_or_component: string;
  production_policy?: string;
  source_document: string;
  net_revenue: number;
  // Present only for a tier authorized to see cost/profit. Absent (not
  // zero, not null) for a quantity-only caller.
  posted_cost?: number;
  theoretical_cost?: number;
  posted_gross_profit?: number;
  theoretical_gross_profit?: number;
  variance?: number;
  reason?: string;
  provisional?: boolean;
}

export interface UnattributedRevenueRow {
  item_or_component: string;
  source_document: string;
  net_revenue: number;
  reason: string;
}

export interface DepartmentProfitabilityResult {
  company: string;
  branch: string;
  service_date_or_period: string;
  department?: string;
  rows: ProfitabilityRow[];
  unattributed_revenue?: UnattributedRevenueRow[];
  reason?: string;
  provisional?: boolean;
  as_of?: string;
}

export interface PlanVsActualRow {
  company: string;
  branch: string;
  service_date_or_period: string;
  department: string;
  item_or_component: string;
  production_policy?: string;
  source_document?: string;
  planned_qty: number;
  actual_qty: number;
  qty_variance: number;
}

export interface PlanVsActualResult {
  company: string;
  branch: string;
  service_date_or_period: string;
  department?: string;
  rows: PlanVsActualRow[];
  reason?: string;
  provisional?: boolean;
  as_of?: string;
}

const unwrap = <T>(payload: unknown): T => {
  const message = (payload as any)?.message ?? payload;
  return message as T;
};

export const departmentProfitabilityService = {
  /**
   * Department-level posted/theoretical/variance profitability for one
   * company/branch/service_date_or_period[/department]. Read-only; the
   * server fails closed with a reason code (MISSING_APPROVED_PLAN,
   * DEPARTMENT_SCOPE_MISMATCH, ...) rather than silently aggregating.
   */
  async getDepartmentProfitability(
    filters: DepartmentProfitabilityFilters
  ): Promise<DepartmentProfitabilityResult> {
    const res = await call<any>(
      'ury.ury.api.ury_department_profitability.get_department_profitability',
      {
        company: filters.company,
        branch: filters.branch,
        service_date_or_period: filters.service_date_or_period,
        department: filters.department,
      }
    );
    return unwrap<DepartmentProfitabilityResult>(res);
  },

  /**
   * Approved Sales Plan quantity vs actual sold/produced quantity for the
   * same grain. Read-only.
   */
  async getPlanVsActual(filters: DepartmentProfitabilityFilters): Promise<PlanVsActualResult> {
    const res = await call<any>('ury.ury.api.ury_department_profitability.get_plan_vs_actual', {
      company: filters.company,
      branch: filters.branch,
      service_date_or_period: filters.service_date_or_period,
      department: filters.department,
    });
    return unwrap<PlanVsActualResult>(res);
  },
};
