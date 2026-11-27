import { beforeEach, describe, expect, it } from 'vitest';
import {
  addManualItemToDraft,
  buildItemsFromSavedPlan,
  buildSalesPlanDraft,
  buildSalesPlanDraftKey,
  getLineAmount,
  getPlanAmount,
  getSalesPlanDraftQuantities,
  normalizeHistoryResponse,
  saveSalesPlanDraftQuantities,
  type BranchItemSearchResult,
  type ComparableHistoryItem,
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
      rate: 0,
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
      rate: 0,
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

describe('buildItemsFromSavedPlan', () => {
  const historyItem = (item_code: string): ComparableHistoryItem => ({
    rate: 20,
    item_code,
    item_name: `Name ${item_code}`,
    stock_uom: 'Nos',
    department: 'Hot Kitchen',
    production_unit: 'Unit A',
    average_qty: 5,
    sample_days: 3,
    total_qty: 15,
    history: [{ date: '2026-08-08', qty: 5 }],
  });

  it('excludes a history item absent from the plan so removals stay removed', () => {
    const items = buildItemsFromSavedPlan(
      [historyItem('ITEM-001'), historyItem('ITEM-002')],
      [{ item_code: 'ITEM-001', qty: 4 }],
    );
    expect(items.map((i) => i.item_code)).toEqual(['ITEM-001']);
  });

  it('keeps history figures and takes the plan qty and rate', () => {
    const [item] = buildItemsFromSavedPlan(
      [historyItem('ITEM-001')],
      [{ item_code: 'ITEM-001', qty: 12, rate: 25 }],
    );
    expect(item.planned_qty).toBe(12);
    expect(item.rate).toBe(25);
    expect(item.item_name).toBe('Name ITEM-001');
    expect(item.average_qty).toBe(5);
    expect(item.sample_days).toBe(3);
    expect(item.total_qty).toBe(15);
    expect(item.history).toHaveLength(1);
    expect(item.department).toBe('Hot Kitchen');
  });

  it('zeroes figures and uses item_code as name for an item without history', () => {
    const [item] = buildItemsFromSavedPlan([], [
      {
        item_code: 'BG',
        qty: 2,
        department: 'Demo Kitchen Department',
        production_unit: 'Demo Kitchen',
        production_policy: 'PRE_PRODUCED',
        bom: 'BOM-BG-001',
      },
    ]);
    expect(item.item_name).toBe('BG');
    expect(item.stock_uom).toBe('Nos');
    expect(item.planned_qty).toBe(2);
    expect(item.department).toBe('Demo Kitchen Department');
    expect(item.production_policy).toBe('PRE_PRODUCED');
    expect(item.bom).toBe('BOM-BG-001');
    expect(item.rate).toBe(0);
    expect(item.average_qty).toBe(0);
    expect(item.sample_days).toBe(0);
    expect(item.total_qty).toBe(0);
    expect(item.history).toEqual([]);
  });

  it('renders every plan row when the history window is empty', () => {
    const items = buildItemsFromSavedPlan([], [
      { item_code: 'BG', qty: 2 },
      { item_code: 'BR', qty: 2 },
    ]);
    expect(items.map((i) => i.item_code)).toEqual(['BG', 'BR']);
  });

  it('ignores a row without item_code and turns a non-finite qty into 0', () => {
    const items = buildItemsFromSavedPlan([], [
      { item_code: '' },
      { item_code: 'ITEM-001', qty: Number.NaN },
      { item_code: 'ITEM-002' },
    ]);
    expect(items.map((i) => i.item_code)).toEqual(['ITEM-001', 'ITEM-002']);
    expect(items.map((i) => i.planned_qty)).toEqual([0, 0]);
  });

  it('gives each row a unique _rowKey, including duplicate item codes', () => {
    const items = buildItemsFromSavedPlan([], [
      { item_code: 'DUP', qty: 1 },
      { item_code: 'DUP', qty: 2 },
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.planned_qty)).toEqual([1, 2]);
    expect(new Set(items.map((i) => i._rowKey)).size).toBe(2);
  });

  it('falls back to the history rate when the saved row has none', () => {
    const [item] = buildItemsFromSavedPlan([historyItem('ITEM-001')], [{ item_code: 'ITEM-001', qty: 1 }]);
    expect(item.rate).toBe(20);
  });
});

describe('salesPlan rate and amount helpers', () => {
  it('computes line and plan amounts as qty x rate', () => {
    const rows = [
      { planned_qty: 3, rate: 10.5 },
      { planned_qty: 0, rate: 99 },
      { planned_qty: 2, rate: 0 },
    ];
    expect(getLineAmount(rows[0])).toBe(31.5);
    expect(getPlanAmount(rows)).toBe(31.5);
    expect(getPlanAmount([])).toBe(0);
  });

  it('carries rate through history, manual add and saved rows, defaulting to 0', () => {
    const history = normalizeHistoryResponse({
      items: [
        { item_code: 'A', rate: 120, average_qty: 1, history: [] },
        { item_code: 'B', average_qty: 1, history: [] },
      ],
    });
    expect(history.items.map((i) => i.rate)).toEqual([120, 0]);

    const manual = addManualItemToDraft([], { item_code: 'C', rate: 45 });
    expect(manual[0].rate).toBe(45);
    expect(addManualItemToDraft([], { item_code: 'D' })[0].rate).toBe(0);

    const merged = buildItemsFromSavedPlan(history.items, [
      { item_code: 'A', qty: 2, rate: 130 },
      { item_code: 'E', qty: 1, rate: 70 },
    ]);
    expect(merged.find((i) => i.item_code === 'A')?.rate).toBe(130);
    expect(merged.find((i) => i.item_code === 'E')?.rate).toBe(70);
  });
});
