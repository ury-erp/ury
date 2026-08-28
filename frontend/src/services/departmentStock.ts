import { call } from '@ury/core';

/**
 * Read-only client for the V3-31 Issue Authorization and V3-32 Stock
 * Movement backends. This module never calls a mutating (create/authorize/
 * transfer/receive/return) endpoint — it only lists existing records for
 * display. Endpoint paths below are the dotted Python paths of the
 * whitelisted list/report functions this task expects V3-31/V3-32 to
 * expose; see the final report for whether they are actually
 * `@frappe.whitelist()`-decorated today.
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

export const departmentStockService = {
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
};
