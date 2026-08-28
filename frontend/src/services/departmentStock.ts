import { call } from '@ury/core';

/**
 * Read-only client for the V3-31 Issue Authorization and V3-32 Stock
 * Movement backends. This module never calls a mutating (create/authorize/
 * transfer/receive/return) endpoint — it only lists existing records for
 * display. Endpoint paths below are the dotted Python paths of the
 * whitelisted list/report functions this task expects V3-31/V3-32 to
 * expose; see the final report for whether they are actually
 * `@frappe.whitelist()`-decorated today.
 *
 * V3-33 (wastage) and issue authorization creation additions: these call
 * the real whitelisted mutating endpoints in `ury.ury.api.ury_wastage` and
 * `ury.ury.api.ury_issue_authorization.create_issue_authorization`.
 */

export interface IssueAuthorizationRow {
  name: string;
  plan: string;
  department: string;
  component_item: string;
  component_item_name?: string;
  branch?: string;
  company?: string;
  production_unit?: string;
  status: string;
  required_qty: number;
  authorized_qty: number;
  remaining_after_qty: number;
  stock_uom?: string;
  creation?: string;
}

export interface StockMovementRow {
  name: string;
  issue_authorization: string;
  movement_type: 'Transfer' | 'Receipt' | 'Return';
  department: string;
  component_item: string;
  branch?: string;
  company?: string;
  qty: number;
  stock_uom?: string;
  from_location?: string;
  to_location?: string;
  posting_datetime?: string;
}

export interface DepartmentStockFilters {
  branch?: string;
  company?: string;
  department: string;
  from_date: string;
  to_date: string;
}

const normalizeList = <T>(payload: unknown): T[] => {
  const message = (payload as any)?.message ?? payload;
  return Array.isArray(message) ? (message as T[]) : [];
};

const normalizeIssueAuthorization = (row: any): IssueAuthorizationRow => ({
  name: String(row.name || ''),
  plan: String(row.plan || ''),
  department: String(row.department || ''),
  component_item: String(row.component_item || ''),
  component_item_name: row.component_item_name,
  branch: row.branch,
  company: row.company,
  production_unit: row.production_unit,
  status: String(row.status || ''),
  required_qty: Number(row.required_qty ?? 0),
  authorized_qty: Number(row.authorized_qty ?? 0),
  remaining_after_qty: Number(row.remaining_after_qty ?? 0),
  stock_uom: row.stock_uom,
  creation: row.creation,
});

const normalizeStockMovement = (row: any): StockMovementRow => ({
  name: String(row.name || ''),
  issue_authorization: String(row.issue_authorization || ''),
  movement_type: row.movement_type,
  department: String(row.department || ''),
  component_item: String(row.component_item || ''),
  branch: row.branch,
  company: row.company,
  qty: Number(row.qty ?? 0),
  stock_uom: row.stock_uom,
  from_location: row.from_location,
  to_location: row.to_location,
  posting_datetime: row.posting_datetime,
});

export interface DepartmentOption {
  name: string;
  department_name: string;
}

export type WastageReasonCategory = 'Spoilage' | 'Preparation Error' | 'Dropped/Damaged' | 'Expired' | 'Other';

/** Mirrors `ury.ury.api.ury_wastage.REASON_CATEGORIES` exactly. */
export const WASTAGE_REASON_CATEGORIES: WastageReasonCategory[] = [
  'Spoilage',
  'Preparation Error',
  'Dropped/Damaged',
  'Expired',
  'Other',
];

export interface WastageRow {
  name: string;
  component_item: string;
  wasted_qty: number;
  status: string;
  department: string;
  branch?: string;
  company?: string;
  valuation_rate?: number;
  valuation_amount?: number;
}

export interface WastageFilters {
  branch?: string;
  company?: string;
  department: string;
  from_date: string;
  to_date: string;
}

export interface CaptureWastageParams {
  issue_authorization: string;
  wasted_qty: number;
  reason_category: WastageReasonCategory;
  reason_notes?: string;
  branch?: string;
  company?: string;
}

export interface CreateIssueAuthorizationParams {
  plan: string;
  department: string;
  component_item: string;
  requested_qty: number;
  branch?: string;
  company?: string;
  production_unit?: string;
}

const normalizeWastage = (row: any): WastageRow => ({
  name: String(row.name || ''),
  component_item: String(row.component_item || ''),
  wasted_qty: Number(row.wasted_qty ?? 0),
  status: String(row.status || ''),
  department: String(row.department || ''),
  branch: row.branch,
  company: row.company,
  valuation_rate: row.valuation_rate !== undefined ? Number(row.valuation_rate) : undefined,
  valuation_amount: row.valuation_amount !== undefined ? Number(row.valuation_amount) : undefined,
});

export const departmentStockService = {
  /**
   * Lists `URY Production Department` records for a branch, for populating
   * the department selector. Read-only. Previously the page tried to derive
   * this from a non-existent `department` field on the branch context
   * object, which meant the selector was always empty -- fixed to call a
   * real list endpoint instead.
   */
  async listDepartments(branch: string): Promise<DepartmentOption[]> {
    if (!branch || branch === 'all') return [];
    const res = await call<any>('frappe.client.get_list', {
      doctype: 'URY Production Department',
      filters: { branch, enabled: 1 },
      fields: ['name', 'department_name'],
      limit_page_length: 0,
    });
    return normalizeList<any>(res).map((row) => ({
      name: row.name,
      department_name: row.department_name || row.name,
    }));
  },

  /**
   * Lists `URY Issue Authorization` records for a branch/department/date
   * range. Read-only: no authorization is created, mutated, or approved.
   */
  async listIssueAuthorizations(filters: DepartmentStockFilters): Promise<IssueAuthorizationRow[]> {
    const res = await call<any>('ury.ury.api.ury_issue_authorization.list_issue_authorizations', {
      branch: filters.branch === 'all' ? undefined : filters.branch,
      company: filters.company,
      department: filters.department,
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    return normalizeList<any>(res).map(normalizeIssueAuthorization);
  },

  /**
   * Lists `URY Stock Movement` records (Transfer / Receipt / Return) for a
   * branch/department/date range. Read-only: no transfer, receipt, or
   * return is recorded by this call.
   */
  async listStockMovements(filters: DepartmentStockFilters): Promise<StockMovementRow[]> {
    const res = await call<any>('ury.ury.api.ury_stock_service.list_stock_movements', {
      branch: filters.branch === 'all' ? undefined : filters.branch,
      company: filters.company,
      department: filters.department,
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    return normalizeList<any>(res).map(normalizeStockMovement);
  },

  /**
   * Lists `URY Issue Wastage` records for a branch/department/date range.
   * Read-only: no wastage is captured, approved, or rejected by this call.
   */
  async listWastage(filters: WastageFilters): Promise<WastageRow[]> {
    const res = await call<any>('ury.ury.api.ury_wastage.list_wastage', {
      branch: filters.branch === 'all' ? undefined : filters.branch,
      company: filters.company,
      department: filters.department,
      from_date: filters.from_date,
      to_date: filters.to_date,
    });
    return normalizeList<any>(res).map(normalizeWastage);
  },

  /**
   * Captures (creates) a Draft `URY Issue Wastage` record against an
   * Authorized `URY Issue Authorization`. Draft rows never reduce
   * entitlement -- they only start counting once explicitly approved.
   */
  async captureWastage(params: CaptureWastageParams): Promise<WastageRow> {
    const res = await call<any>('ury.ury.api.ury_wastage.capture_wastage', {
      issue_authorization: params.issue_authorization,
      wasted_qty: params.wasted_qty,
      reason_category: params.reason_category,
      reason_notes: params.reason_notes,
      branch: params.branch,
      company: params.company,
    });
    return normalizeWastage((res as any)?.message ?? res);
  },

  /** Approves a Draft `URY Issue Wastage` record, flipping it to Authorized. */
  async approveWastage(wastageName: string): Promise<WastageRow> {
    const res = await call<any>('ury.ury.api.ury_wastage.approve_wastage', { wastage: wastageName });
    return normalizeWastage((res as any)?.message ?? res);
  },

  /** Rejects a Draft `URY Issue Wastage` record; it never counts toward wasted_qty. */
  async rejectWastage(wastageName: string): Promise<WastageRow> {
    const res = await call<any>('ury.ury.api.ury_wastage.reject_wastage', { wastage: wastageName });
    return normalizeWastage((res as any)?.message ?? res);
  },

  /**
   * Creates a new `URY Issue Authorization` against an approved Sales
   * Plan's frozen demand for one component/department.
   */
  async createIssueAuthorization(params: CreateIssueAuthorizationParams): Promise<IssueAuthorizationRow> {
    const res = await call<any>('ury.ury.api.ury_issue_authorization.create_issue_authorization', {
      plan: params.plan,
      department: params.department,
      component_item: params.component_item,
      requested_qty: params.requested_qty,
      branch: params.branch,
      company: params.company,
      production_unit: params.production_unit,
    });
    return normalizeIssueAuthorization((res as any)?.message ?? res);
  },
};
