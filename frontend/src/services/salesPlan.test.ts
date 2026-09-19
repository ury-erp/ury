import { beforeEach, describe, expect, it } from 'vitest';
import {
  addManualItemToDraft,
  buildSalesPlanDraft,
  buildSalesPlanDraftKey,
  getSalesPlanDraftQuantities,
  normalizeHistoryResponse,
  saveSalesPlanDraftQuantities,
  type BranchItemSearchResult,
  type SalesPlanItem,
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

    expect(window.localStorage.getItem(key as string)).toBe(JSON.stringify({ 'ITEM-001': 70, 'ITEM-002': 45.5 }));
    expect(getSalesPlanDraftQuantities(key!)).toEqual({ 'ITEM-001': 70, 'ITEM-002': 45.5 });
  });

  it('requires branch, company, and date before building a draft key', () => {
    expect(buildSalesPlanDraftKey({ branch: 'Kozhikode', company: undefined, plan_date: '2026-08-29' })).toBeNull();
    expect(buildSalesPlanDraftKey({ branch: 'all', company: 'URY', plan_date: '2026-08-29' })).toBeNull();
    expect(buildSalesPlanDraftKey({ branch: 'Kozhikode', company: 'URY', plan_date: '' })).toBeNull();
  });
});

describe('addManualItemToDraft', () => {
  it('adds a new item from search result with proper defaults', () => {
    const items: SalesPlanItem[] = [];
    const searchResult: BranchItemSearchResult = {
      item_code: 'ITEM-NEW',
      item_name: 'New Product',
      stock_uom: 'kg',
      department: 'Bakery',
      production_unit: 'Oven 1',
    };

    const result = addManualItemToDraft(items, searchResult);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      item_code: 'ITEM-NEW',
      item_name: 'New Product',
      stock_uom: 'kg',
      department: 'Bakery',
      production_unit: 'Oven 1',
      planned_qty: 0,
      average_qty: 0,
      sample_days: 0,
      history: [],
    });
  });

  it('uses default values when search result has missing fields', () => {
    const items: SalesPlanItem[] = [];
    const searchResult: BranchItemSearchResult = {
      item_code: 'ITEM-SPARSE',
      item_name: 'Sparse Item',
    };

    const result = addManualItemToDraft(items, searchResult);

    expect(result[0]).toMatchObject({
      item_code: 'ITEM-SPARSE',
      item_name: 'Sparse Item',
      stock_uom: 'Nos',
      department: 'Ungrouped',
      production_unit: 'Unassigned',
      planned_qty: 0,
      average_qty: 0,
      sample_days: 0,
    });
  });

  it('uses item_code as item_name fallback when item_name is missing', () => {
    const items: SalesPlanItem[] = [];
    const searchResult: BranchItemSearchResult = {
      item_code: 'ITEM-CODE-ONLY',
    };

    const result = addManualItemToDraft(items, searchResult);

    expect(result[0].item_name).toBe('ITEM-CODE-ONLY');
  });

  it('prevents duplicate items by item_code', () => {
    const existingItem: SalesPlanItem = {
      _rowKey: 'row-existing',
      item_code: 'ITEM-EXISTING',
      item_name: 'Existing Product',
      stock_uom: 'Nos',
      department: 'Ungrouped',
      production_unit: 'Unassigned',
      average_qty: 10,
      sample_days: 5,
      history: [],
      planned_qty: 8,
    };

    const items: SalesPlanItem[] = [existingItem];
    const searchResult: BranchItemSearchResult = {
      item_code: 'ITEM-EXISTING',
      item_name: 'Different Name',
      stock_uom: 'kg',
    };

    const result = addManualItemToDraft(items, searchResult);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(existingItem); // Unchanged
  });

  it('appends new item without mutating original array', () => {
    const existingItem: SalesPlanItem = {
      _rowKey: 'row-001',
      item_code: 'ITEM-001',
      item_name: 'Product 1',
      stock_uom: 'Nos',
      department: 'Ungrouped',
      production_unit: 'Unassigned',
      average_qty: 5,
      sample_days: 3,
      history: [],
      planned_qty: 5,
    };

    const items: SalesPlanItem[] = [existingItem];
    const searchResult: BranchItemSearchResult = {
      item_code: 'ITEM-002',
      item_name: 'Product 2',
    };

    const result = addManualItemToDraft(items, searchResult);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(existingItem); // Original unchanged
    expect(result[1].item_code).toBe('ITEM-002');
    expect(items).toHaveLength(1); // Original array not mutated
  });
});
