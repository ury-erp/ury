import { call } from '@ury/core';
import type { ExecutionState, LinkState, ProductionBlockerLike } from '../components/production/productionStatus';

// Chef UI API (ury.ury.api.ury_chef_ui). Every quantity and every flag is
// computed on the server from the department Production Plans; this module
// only types and transports them.

const API = 'ury.ury.api.ury_chef_ui';

export type ProductionPolicy = 'PRE_PRODUCED' | 'MADE_TO_ORDER' | 'DIRECT_RETAIL' | 'BUNDLE';

export interface ChefQueueItem {
  /** Production Plan Item row; `null` for a sub-assembly that stock already covers (no plan row). */
  row_name: string | null;
  /** Stable React key: the row name, or `item:<code>` when there is no row. */
  row_key: string;
  item_code: string;
  item_name: string;
  stock_uom: string | null;
  /** Item Production Configuration policy of the item in this branch. */
  production_policy: ProductionPolicy | null;
  planned_qty: number;
  production_qty: number;
  is_sub_assembly: boolean;
  /** Sub-assembly: Production Qty starts as the parents' demand minus stock (it may be 0) and is re-derived when a parent changes. */
  derived_qty: boolean;
  last_weekday_qty: number | null;
  last_weekday_date: string | null;
  produced_qty: number | null;
}

export interface ChefDepartment {
  department: string;
  department_warehouse: string | null;
  production_plan: string | null;
  docstatus: number | null;
  erpnext_status: string | null;
  production_state: string | null;
  link_state: LinkState;
  execution_state: ExecutionState | null;
  can_edit: boolean;
  can_submit: boolean;
  can_prepare: boolean;
  blockers: ProductionBlockerLike[];
  totals: { items: number; planned_qty: number; production_qty: number };
  items: ChefQueueItem[];
}

export interface ChefQueueResponse {
  branch: string | null;
  branches: string[];
  plan_date: string;
  sales_plan: string | null;
  sales_plan_status: string | null;
  departments: ChefDepartment[];
  totals: {
    /** Items with a production quantity above 0. */
    items_to_prepare: number;
    /** Those items in departments whose Prepare Production has completed. */
    items_prepared: number;
    production_qty: number;
    /** Distinct raw materials short in the department or the Store, for departments still to prepare. */
    material_shortages: number;
  };
}

export interface RawMaterialRow {
  item_code: string;
  item_name: string;
  stock_uom: string | null;
  required_qty: number;
  department_available: number;
  department_shortage: number;
  store_available: number;
  store_shortage: number;
}

export interface RawMaterialsResponse {
  production_plan: string;
  department: string;
  department_warehouse: string | null;
  store_warehouse: string | null;
  rows: RawMaterialRow[];
  blockers: ProductionBlockerLike[];
  totals: { items: number; short_items: number };
}

export interface PrepareResult {
  status: 'blocked' | 'processing' | 'already_processing';
  production_plan: string;
  state?: string;
  blockers?: ProductionBlockerLike[];
}

const unwrap = <T,>(res: unknown): T => ((res as { message?: T })?.message ?? res) as T;

export const chefProductionService = {
  async getProductionQueue(params: { planDate?: string; branch?: string | null }): Promise<ChefQueueResponse> {
    const res = await call.get<ChefQueueResponse>(`${API}.get_production_queue`, {
      plan_date: params.planDate,
      ...(params.branch ? { branch: params.branch } : {}),
    });
    return unwrap<ChefQueueResponse>(res);
  },

  async getDepartmentRawMaterials(productionPlan: string): Promise<RawMaterialsResponse> {
    const res = await call.get<RawMaterialsResponse>(`${API}.get_department_raw_materials`, {
      production_plan: productionPlan,
    });
    return unwrap<RawMaterialsResponse>(res);
  },

  async updateProductionQuantities(
    productionPlan: string,
    rows: Array<{ row_name: string | null; item_code: string; production_qty: number }>,
  ): Promise<{ production_plan: string; changed: number }> {
    const res = await call.post<{ production_plan: string; changed: number }>(
      `${API}.update_production_quantities`,
      { production_plan: productionPlan, rows: JSON.stringify(rows) },
    );
    return unwrap(res);
  },

  async submitProductionPlan(productionPlan: string): Promise<{ production_plan: string; docstatus: number }> {
    const res = await call.post<{ production_plan: string; docstatus: number }>(`${API}.submit_production_plan`, {
      production_plan: productionPlan,
    });
    return unwrap(res);
  },

  async prepareDepartmentProduction(productionPlan: string): Promise<PrepareResult> {
    const res = await call.post<PrepareResult>(`${API}.prepare_department_production`, {
      production_plan: productionPlan,
    });
    return unwrap<PrepareResult>(res);
  },
};
