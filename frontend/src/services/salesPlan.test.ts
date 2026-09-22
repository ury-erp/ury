import { beforeEach, describe, expect, it } from 'vitest';
import {
  addManualItemToDraft,
  buildSalesPlanDraft,
  buildSalesPlanDraftKey,
  getSalesPlanDraftQuantities,
  mergeSavedPlanRows,
  normalizeHistoryResponse,
  saveSalesPlanDraftQuantities,
  type BranchItemSearchResult,
  type SalesPlanDocRow,
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

describe('mergeSavedPlanRows', () => {
  const historyItem = (item_code: string, planned_qty: number): SalesPlanItem => ({
    item_code,
    item_name: `Name ${item_code}`,
    stock_uom: 'Nos',
    department: 'Hot Kitchen',
    production_unit: 'Unit A',
    average_qty: 5,
    sample_days: 3,
    history: [],
    planned_qty,
    _rowKey: `key-${item_code}`,
  });

  it('returns the original list untouched when the plan has no rows', () => {
    const items = [historyItem('ITEM-001', 5)];
    expect(mergeSavedPlanRows(items, [])).toBe(items);
  });

  it("takes the plan's quantity for an item history already knows", () => {
    const items = [historyItem('ITEM-001', 5)];
    const rows: SalesPlanDocRow[] = [{ item_code: 'ITEM-001', qty: 12 }];

    const merged = mergeSavedPlanRows(items, rows);

    expect(merged).toHaveLength(1);
    expect(merged[0].planned_qty).toBe(12);
    // History figures are the item's own and must survive the overlay.
    expect(merged[0].average_qty).toBe(5);
    expect(merged[0].sample_days).toBe(3);
    expect(items[0].planned_qty).toBe(5); // original not mutated
  });

  it('appends a planned item that has no comparable history at all', () => {
    const rows: SalesPlanDocRow[] = [
      {
        item_code: 'BG',
        qty: 2,
        stock_uom: 'Nos',
        department: 'Demo Kitchen Department',
        production_unit: 'Demo Kitchen',
        production_policy: 'PRE_PRODUCED',
        bom: 'BOM-BG-001',
      },
    ];

    const merged = mergeSavedPlanRows([], rows);

    expect(merged).toHaveLength(1);
    expect(merged[0].item_code).toBe('BG');
    expect(merged[0].planned_qty).toBe(2);
    expect(merged[0].department).toBe('Demo Kitchen Department');
    expect(merged[0].production_policy).toBe('PRE_PRODUCED');
    // Zeroed rather than invented: this item genuinely has no history.
    expect(merged[0].average_qty).toBe(0);
    expect(merged[0].sample_days).toBe(0);
    expect(merged[0]._rowKey).toBeTruthy();
  });

  it('renders a whole plan whose branch has an empty history window', () => {
    // The case that hid every department section, and with it each
    // department's Production Plan panel.
    const rows: SalesPlanDocRow[] = [
      { item_code: 'BG', qty: 2, department: 'Demo Kitchen Department' },
      { item_code: 'BR', qty: 2, department: 'Demo Kitchen Department' },
    ];

    const merged = mergeSavedPlanRows([], rows);

    expect(merged.map((item) => item.item_code)).toEqual(['BG', 'BR']);
    expect(new Set(merged.map((item) => item._rowKey)).size).toBe(2);
  });

  it('ignores a row with no item_code', () => {
    const merged = mergeSavedPlanRows([], [{ item_code: '' }]);
    expect(merged).toHaveLength(0);
  });

  it('keeps the existing quantity when the plan row carries no usable qty', () => {
    const items = [historyItem('ITEM-001', 7)];
    const merged = mergeSavedPlanRows(items, [{ item_code: 'ITEM-001' }]);
    expect(merged[0].planned_qty).toBe(7);
  });
});
