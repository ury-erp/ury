import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSalesPlanDraft,
  buildSalesPlanDraftKey,
  getSalesPlanDraftQuantities,
  normalizeHistoryResponse,
  saveSalesPlanDraftQuantities,
} from './salesPlan';

describe('salesPlan service helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normalizes the accepted V3-21 history response shape', () => {
    const history = normalizeHistoryResponse({
      message: {
        plan_date: '2026-08-29',
        branch: 'Kozhikode',
        sample_dates: ['2026-08-08'],
        items: [
          {
            item_code: 'ITEM-001',
            item_name: 'Chicken Biryani',
            stock_uom: 'Nos',
            department: 'Indian',
            production_unit: 'Hot Kitchen',
            avg_qty: '72.5',
            sample_days: '3',
            history: [{ posting_date: '2026-08-08', net_qty: '70', invoices: '12' }],
          },
        ],
      },
    });

    expect(history.items[0]).toMatchObject({
      item_code: 'ITEM-001',
      average_qty: 72.5,
      sample_days: 3,
      history: [{ date: '2026-08-08', qty: 70, invoices: 12 }],
    });
  });

  it('uses saved draft quantities before rounded comparable averages', () => {
    const draft = buildSalesPlanDraft(
      normalizeHistoryResponse({
        plan_date: '2026-08-29',
        items: [
          { item_code: 'ITEM-001', average_qty: 72.5, history: [] },
          { item_code: 'ITEM-002', average_qty: 41.2, history: [] },
        ],
      }),
      { 'ITEM-001': 68 },
    );

    expect(draft.items.map((item) => item.planned_qty)).toEqual([68, 41]);
  });

  it('stores numeric draft quantities under branch and date scope', () => {
    const key = buildSalesPlanDraftKey({ branch: 'Kozhikode', company: 'URY', plan_date: '2026-08-29' });

    saveSalesPlanDraftQuantities(key, [
      { item_code: 'ITEM-001', planned_qty: 70 },
      { item_code: 'ITEM-002', planned_qty: 45.5 },
    ]);

    expect(window.localStorage.getItem(key)).toBe(JSON.stringify({ 'ITEM-001': 70, 'ITEM-002': 45.5 }));
    expect(getSalesPlanDraftQuantities(key)).toEqual({ 'ITEM-001': 70, 'ITEM-002': 45.5 });
  });

  it('requires branch, company, and date before building a draft key', () => {
    expect(buildSalesPlanDraftKey({ branch: 'Kozhikode', company: undefined, plan_date: '2026-08-29' })).toBeNull();
    expect(buildSalesPlanDraftKey({ branch: 'all', company: 'URY', plan_date: '2026-08-29' })).toBeNull();
    expect(buildSalesPlanDraftKey({ branch: 'Kozhikode', company: 'URY', plan_date: '' })).toBeNull();
  });
});
