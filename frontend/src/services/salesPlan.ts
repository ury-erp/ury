import { call } from '@ury/core';

export interface ComparableHistoryDay {
  date: string;
  label?: string;
  qty: number;
  invoices?: number;
}

export interface ComparableHistoryItem {
  item_code: string;
  item_name?: string;
  stock_uom?: string;
  department?: string;
  production_unit?: string;
  production_policy?: string;
  bom?: string;
  average_qty: number;
  sample_days: number;
  total_qty?: number;
  history: ComparableHistoryDay[];
}

export interface ComparableHistoryResponse {
  plan_date: string;
  branch?: string;
  company?: string;
  sample_dates: string[];
  items: ComparableHistoryItem[];
}

export interface SalesPlanItem extends ComparableHistoryItem {
  planned_qty: number;
  /**
   * Stable client-side row identity, distinct from `item_code`: two Sales
   * Plan Item rows can legitimately share the same item_code, so `item_code`
   * alone is not a safe React/table key -- this is generated once when the
   * item is first added to the draft (from history or manual add) and never
   * recomputed, so edits/bulk-set/CSV always target exactly one row.
   */
  _rowKey: string;
}

const generateRowKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export interface SalesPlanDraft {
  plan_date: string;
  branch?: string;
  company?: string;
  items: SalesPlanItem[];
}

export interface LoadSalesPlanParams {
  branch?: string;
  company?: string;
  plan_date: string;
  item_codes?: string[];
}

const STORAGE_KEY_PREFIX = 'ury_v3_sales_plan_draft';

export const addManualItemToDraft = (
  items: SalesPlanItem[],
  searchResult: BranchItemSearchResult,
): SalesPlanItem[] => {
  // Check for duplicates by item_code
  if (items.some((item) => item.item_code === searchResult.item_code)) {
    return items;
  }

  const newItem: SalesPlanItem = {
    item_code: searchResult.item_code,
    item_name: searchResult.item_name || searchResult.item_code,
    stock_uom: searchResult.stock_uom || 'Nos',
    department: searchResult.department || 'Ungrouped',
    production_unit: searchResult.production_unit || 'Unassigned',
    production_policy: searchResult.production_policy,
    bom: searchResult.bom,
    average_qty: 0,
    sample_days: 0,
    history: [],
    planned_qty: 0,
    _rowKey: generateRowKey(),
  };

  return [...items, newItem];
};

export const buildSalesPlanDraftKey = (params: Pick<LoadSalesPlanParams, 'branch' | 'company' | 'plan_date'>) => {
  if (!params.branch || params.branch === 'all' || !params.company || !params.plan_date) {
    return null;
  }

  return [
    STORAGE_KEY_PREFIX,
    params.company,
    params.branch,
    params.plan_date,
  ].join(':');
};

export const normalizeHistoryResponse = (payload: unknown): ComparableHistoryResponse => {
  const response = ((payload as any)?.message ?? payload ?? {}) as Partial<ComparableHistoryResponse>;
  const items = Array.isArray(response.items) ? response.items : [];

  return {
    plan_date: String(response.plan_date || ''),
    branch: response.branch,
    company: response.company,
    sample_dates: Array.isArray(response.sample_dates) ? response.sample_dates.map(String) : [],
    items: items.map((item: any) => ({
      item_code: String(item.item_code || ''),
      item_name: item.item_name || item.item_code || '',
      stock_uom: item.stock_uom || 'Nos',
      department: item.department || 'Ungrouped',
      production_unit: item.production_unit || 'Unassigned',
      production_policy: item.production_policy,
      bom: item.bom,
      average_qty: Number(item.average_qty ?? item.avg_qty ?? 0),
      sample_days: Number(item.sample_days ?? item.history?.length ?? 0),
      total_qty: Number(item.total_qty ?? 0),
      history: Array.isArray(item.history)
        ? item.history.map((day: any) => ({
            date: String(day.date || day.posting_date || ''),
            label: day.label,
            qty: Number(day.qty ?? day.net_qty ?? day.quantity ?? 0),
            invoices: day.invoices === undefined ? undefined : Number(day.invoices),
          }))
        : [],
    })),
  };
};

export const buildSalesPlanDraft = (
  history: ComparableHistoryResponse,
  savedQuantities: Record<string, number> = {},
): SalesPlanDraft => {
  return {
    plan_date: history.plan_date,
    branch: history.branch,
    company: history.company,
    items: history.items.map((item) => {
      const savedQty = savedQuantities[item.item_code];
      return {
        ...item,
        planned_qty: Number.isFinite(savedQty) ? savedQty : Math.round(item.average_qty),
        _rowKey: generateRowKey(),
      };
    }),
  };
};

export const getSalesPlanDraftQuantities = (key: string | null): Record<string, number> => {
  if (!key) return {};

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.entries(parsed).reduce<Record<string, number>>((acc, [itemCode, value]) => {
      const qty = Number(value);
      if (Number.isFinite(qty)) acc[itemCode] = qty;
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export const saveSalesPlanDraftQuantities = (
  key: string | null,
  items: Pick<SalesPlanItem, 'item_code' | 'planned_qty'>[],
) => {
  if (!key) return;

  const quantities = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.item_code] = item.planned_qty;
    return acc;
  }, {});
  window.localStorage.setItem(key, JSON.stringify(quantities));
};

export interface SaveSalesPlanDraftItem {
  item_code: string;
  qty: number;
}

export interface SaveSalesPlanDraftParams {
  plan_date: string;
  branch: string;
  company?: string;
  service_period?: string;
  items: SaveSalesPlanDraftItem[];
  enforcement_mode?: string;
}

export interface SaveSalesPlanDraftResponse {
  name: string;
  status: string;
}

export interface TransitionSalesPlanParams {
  name: string;
  target_state: string;
  reason?: string;
}

export interface GetPlanStatusParams {
  branch: string;
  plan_date: string;
}

export interface GetPlanStatusResponse {
  name: string | null;
  status: string | null;
  enforcement_mode: string | null;
  /** Name of the most recently Superseded/Cancelled plan for this
   * branch+date, when that's the reason no active plan was found (a
   * cancelled plan is a dead end -- see ury_sales_plan.py's
   * get_plan_status() -- so it's excluded from name/status, but the
   * frontend still needs to know one existed to explain why a fresh Draft
   * is starting instead of silently pretending nothing was ever there). */
  superseded_plan?: string | null;
}

export interface BranchItemSearchResult {
  item_code: string;
  item_name?: string;
  stock_uom?: string;
  department?: string;
  production_unit?: string;
  production_policy?: string;
  bom?: string;
}

export interface SearchBranchItemsParams {
  branch: string;
  company?: string;
  query?: string;
  limit?: number;
}

/**
 * Readiness blocker shape returned by the target compiler / readiness
 * engine (ury_production_target_compiler.py, ury_production_readiness.py)
 * and echoed back verbatim by ury_prepare_production.get_sales_plan_production_states.
 * Kept loose -- the backend emits several blocker "types" (store_shortage,
 * compiler blockers, cross-department config errors, etc.) that don't share
 * a fixed field set beyond `message`.
 */
export type ProductionBlocker = {
  type?: string;
  item_code?: string;
  department?: string;
  message?: string;
  [key: string]: unknown;
};

/**
 * D12 -- the two state axes for one department's Production Plan, kept
 * strictly separate. Never collapse these into one `state` field:
 *
 * - `link_state` answers "does a current plan exist for this department?"
 *   (carries forward the old singular `ProductionPlanState.state` semantics,
 *   including the `custom_ury_snapshot_hash` staleness comparison).
 * - `execution_state` answers "how far has this department's production
 *   got?" and is independent -- a department can be `link_state: 'stale'`
 *   while `execution_state: 'completed'` (the Sales Plan changed after that
 *   department finished producing against the old snapshot).
 *
 * See ongoing/production-plan-automation/PLAN.md, decision D12.
 */
export interface DepartmentProductionPlanState {
  department: string;
  production_plan?: string;
  docstatus?: number;

  /** Axis 1 -- does a usable plan exist for this department? */
  link_state: 'none' | 'live' | 'stale' | 'ineligible';

  /**
   * Axis 2 -- how far has execution got? Absent while `link_state` is
   * `'none'` or `'ineligible'` (there is nothing to execute yet).
   */
  execution_state?: 'awaiting_materials' | 'ready' | 'processing' | 'completed' | 'failed';

  can_create?: boolean;
  can_open?: boolean;

  /** Pre-flight creation blockers (no BOM, no plannable items, ...). */
  issues?: string[];
  /** Readiness-engine blockers (stock shortages, misconfiguration, ...). */
  blockers?: ProductionBlocker[];
}

export interface SalesPlanProductionStatesResponse {
  sales_plan: string;
  status: string | null;
  /** Whether Production Plans can exist at all for this Sales Plan's current status. */
  eligible: boolean;
  /** Current user's create permission on Production Plan. */
  can_create: boolean;
  production_plans: DepartmentProductionPlanState[];
}

export const salesPlanService = {
  async getComparableHistory(params: LoadSalesPlanParams): Promise<ComparableHistoryResponse> {
    const res = await call.get<ComparableHistoryResponse>(
      'ury.ury.api.ury_dashboard.get_comparable_weekday_history',
      {
        branch: params.branch === 'all' ? undefined : params.branch,
        company: params.company,
        plan_date: params.plan_date,
        items: params.item_codes,
      },
    );
    return normalizeHistoryResponse(res);
  },

  async saveDraft(params: SaveSalesPlanDraftParams): Promise<SaveSalesPlanDraftResponse> {
    const res = await call.post<SaveSalesPlanDraftResponse>(
      'ury.ury.api.ury_sales_plan.save_draft',
      {
        plan_date: params.plan_date,
        branch: params.branch,
        company: params.company,
        service_period: params.service_period,
        items: params.items,
        enforcement_mode: params.enforcement_mode,
      },
    );
    return ((res as any)?.message ?? res) as SaveSalesPlanDraftResponse;
  },

  async transitionPlan(params: TransitionSalesPlanParams): Promise<SaveSalesPlanDraftResponse> {
    const body: any = {
      name: params.name,
      target_state: params.target_state,
    };
    if (params.reason !== undefined) {
      body.reason = params.reason;
    }
    const res = await call.post<SaveSalesPlanDraftResponse>(
      'ury.ury.api.ury_sales_plan.transition_plan',
      body,
    );
    return ((res as any)?.message ?? res) as SaveSalesPlanDraftResponse;
  },

  /**
   * Per-department Production Plan states for `salesPlan` (D12): both the
   * `link_state` and `execution_state` axes, plus the most recent readiness
   * blockers per department. Built on top of Agent 8's
   * `get_sales_plan_production_states`, which only ever lists departments
   * that already have a live (non-cancelled) Production Plan -- see that
   * function's docstring. A department present in the Sales Plan's own
   * `groupedItems` but absent from `production_plans` here has no plan yet:
   * the caller derives `link_state: 'none'` (or `'ineligible'` from the
   * top-level `eligible` flag) itself, rather than this method inventing
   * rows the backend didn't return.
   */
  async getProductionPlanStates(salesPlan: string): Promise<SalesPlanProductionStatesResponse> {
    const res = await call.get<SalesPlanProductionStatesResponse>(
      'ury.ury.api.ury_prepare_production.get_sales_plan_production_states',
      { sales_plan: salesPlan },
    );
    return ((res as any)?.message ?? res) as SalesPlanProductionStatesResponse;
  },

  /**
   * Manual "Create Production Plans" action -- creates one Production Plan
   * per non-empty department that doesn't already have a live, current one.
   * Only usable once the Sales Plan is Locked for Production (D14). Never
   * submits; a manually-created plan is left as a draft for review.
   */
  async createDepartmentProductionPlans(salesPlan: string): Promise<{
    sales_plan: string;
    production_plans: { department: string; production_plan: string; state: string; created: boolean }[];
    blockers?: ProductionBlocker[];
  }> {
    const res = await call.post<{
      sales_plan: string;
      production_plans: { department: string; production_plan: string; state: string; created: boolean }[];
      blockers?: ProductionBlocker[];
    }>(
      'ury.ury.api.ury_sales_plan_production_plan.create_department_production_plans',
      { sales_plan: salesPlan },
    );
    return ((res as any)?.message ?? res) as {
      sales_plan: string;
      production_plans: { department: string; production_plan: string; state: string; created: boolean }[];
      blockers?: ProductionBlocker[];
    };
  },

  /**
   * Look up the live Production Plan for one department, for the UI's
   * per-department "Open" link. Never creates -- call
   * `createDepartmentProductionPlans` first.
   */
  async openDepartmentProductionPlan(
    salesPlan: string,
    department: string,
  ): Promise<{ name: string; docstatus: number; department: string }> {
    const res = await call.get<{ name: string; docstatus: number; department: string }>(
      'ury.ury.api.ury_sales_plan_production_plan.open_department_production_plan',
      { sales_plan: salesPlan, department },
    );
    return ((res as any)?.message ?? res) as { name: string; docstatus: number; department: string };
  },

  async getPlan(name: string): Promise<Record<string, unknown>> {
    const res = await call.get<Record<string, unknown>>(
      'ury.ury.api.ury_sales_plan.get_plan',
      { name },
    );
    return ((res as any)?.message ?? res) as Record<string, unknown>;
  },

  async getPlanStatus(params: GetPlanStatusParams): Promise<GetPlanStatusResponse> {
    const res = await call.get<GetPlanStatusResponse>(
      'ury.ury.api.ury_sales_plan.get_plan_status',
      { branch: params.branch, plan_date: params.plan_date },
    );
    return ((res as any)?.message ?? res) as GetPlanStatusResponse;
  },

  async searchBranchItems(params: SearchBranchItemsParams): Promise<BranchItemSearchResult[]> {
    const res = await call.get<BranchItemSearchResult[]>(
      'ury.ury.api.ury_dashboard.search_branch_items',
      {
        branch: params.branch,
        company: params.company,
        query: params.query || '',
        limit: params.limit || 25,
      },
    );
    const items = ((res as any)?.message ?? res) as BranchItemSearchResult[];
    return Array.isArray(items) ? items : [];
  },
};
