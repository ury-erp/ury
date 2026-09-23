import { call } from '@ury/core';

export interface LogYieldCheckParams {
  item: string;
  branch: string;
  input_qty: number;
  output_qty: number;
}

export const yieldCheckService = {
  /**
   * Submits a standalone Scheduled Yield Check via the whitelisted
   * `record_yield_check` endpoint.
   *
   * - company and stock_uom are resolved from Branch and Item.
   * - department and production_unit are resolved from the item's URY Item
   *   Production Configuration (IPC) record for this branch.
   * - checked_by and checked_on are set server-side to the session user and now().
   */
  async logStandaloneCheck(params: LogYieldCheckParams): Promise<string> {
    // Resolve company, stock_uom, and IPC fields in parallel.
    const [branchData, itemData, ipcData] = await Promise.all([
      call<any>('frappe.client.get_value', {
        doctype: 'Branch',
        fieldname: 'company',
        filters: { name: params.branch },
      }),
      call<any>('frappe.client.get_value', {
        doctype: 'Item',
        fieldname: 'stock_uom',
        filters: { name: params.item },
      }),
      call<any>('frappe.client.get_value', {
        doctype: 'URY Item Production Configuration',
        fieldname: ['department', 'production_unit'],
        filters: { item: params.item, branch: params.branch },
      }),
    ]);

    const company = (branchData as any)?.message?.company;
    const stock_uom = (itemData as any)?.message?.stock_uom;
    const ipc = (ipcData as any)?.message;
    const department = ipc?.department || null;
    const production_unit = ipc?.production_unit || null;

    if (!company) throw new Error(`Branch "${params.branch}" has no Company set.`);
    if (!stock_uom) throw new Error(`Item "${params.item}" has no Stock UOM set.`);

    // record_yield_check sets checked_by = frappe.session.user and checked_on = now()
    // server-side, so we don't need to pass them from the frontend.
    const res = await call<any>('ury.ury.api.ury_yield_variance.record_yield_check', {
      item: params.item,
      branch: params.branch,
      company,
      input_qty: params.input_qty,
      output_qty: params.output_qty,
      stock_uom,
      check_type: 'Scheduled',
      department,
      production_unit,
    });

    const doc = (res as any)?.message ?? res;
    return doc?.name as string;
  },
};
