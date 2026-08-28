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
}

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

export const salesPlanService = {
  async getComparableHistory(params: LoadSalesPlanParams): Promise<ComparableHistoryResponse> {
    const res = await call<ComparableHistoryResponse>(
      'ury.ury.api.ury_dashboard.get_comparable_weekday_history',
      {
        branch: params.branch === 'all' ? undefined : params.branch,
        company: params.company,
        plan_date: params.plan_date,
        item_codes: params.item_codes,
      },
    );
    return normalizeHistoryResponse(res);
  },
};
