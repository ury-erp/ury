import { describe, expect, it } from 'vitest';
import {
  getAvailabilityTier,
  sortMenuItemsByAvailability,
} from './use-menu-availability';
import { ItemAvailability } from './availability-api';

describe('use-menu-availability sorting', () => {
  const createAvailability = (overrides: Partial<ItemAvailability>): ItemAvailability => ({
    item_code: 'ITEM',
    sellable: true,
    available_qty: 10,
    production_policy: 'MADE_TO_ORDER',
    company: 'URY',
    branch: 'URY',
    department: null,
    production_unit: null,
    warehouse: null,
    plan_qty: null,
    plan_remaining: null,
    fg_available: null,
    max_producible: null,
    blocking_component: null,
    reason_code: 'AVAILABLE',
    as_of: new Date().toISOString(),
    ...overrides,
  });

  describe('getAvailabilityTier', () => {
    it('returns Tier 0 for in-stock items with available_qty > 0', () => {
      const avail = createAvailability({ available_qty: 5, sellable: true, reason_code: 'AVAILABLE' });
      expect(getAvailabilityTier(avail)).toBe(0);
    });

    it('returns Tier 0 for unconstrained items where available_qty is null', () => {
      const avail = createAvailability({ available_qty: null, sellable: true, reason_code: 'AVAILABLE' });
      expect(getAvailabilityTier(avail)).toBe(0);
    });

    it('returns Tier 0 (fail-open) for null or undefined availability', () => {
      expect(getAvailabilityTier(null)).toBe(0);
      expect(getAvailabilityTier(undefined)).toBe(0);
    });

    it('returns Tier 1 for sold-out items (PLAN_EXHAUSTED)', () => {
      const avail = createAvailability({ available_qty: 0, sellable: false, reason_code: 'PLAN_EXHAUSTED' });
      expect(getAvailabilityTier(avail)).toBe(1);
    });

    it('returns Tier 1 for sold-out items (FG_OUT_OF_STOCK)', () => {
      const avail = createAvailability({ available_qty: 0, sellable: false, reason_code: 'FG_OUT_OF_STOCK' });
      expect(getAvailabilityTier(avail)).toBe(1);
    });

    it('returns Tier 2 for temporarily unavailable items (BLOCKING_COMPONENT)', () => {
      const avail = createAvailability({ available_qty: 0, sellable: false, reason_code: 'BLOCKING_COMPONENT' });
      expect(getAvailabilityTier(avail)).toBe(2);
    });

    it('returns Tier 2 for temporarily unavailable items (MISSING_BOM)', () => {
      const avail = createAvailability({ available_qty: 0, sellable: false, reason_code: 'MISSING_BOM' });
      expect(getAvailabilityTier(avail)).toBe(2);
    });

    it('returns Tier 2 for items not produced today (NOT_PRODUCED)', () => {
      const avail = createAvailability({ available_qty: 0, sellable: false, reason_code: 'NOT_PRODUCED' });
      expect(getAvailabilityTier(avail)).toBe(2);
    });

    it('returns Tier 2 for items with CONFIGURATION_ERROR', () => {
      const avail = createAvailability({ available_qty: 0, sellable: false, reason_code: 'CONFIGURATION_ERROR' });
      expect(getAvailabilityTier(avail)).toBe(2);
    });
  });

  describe('sortMenuItemsByAvailability', () => {
    const items = [
      { item: 'BCS', name: 'Butter Cheese Salad' },       // In stock: 10 left (Tier 0)
      { item: 'BSS', name: 'Butter Scotch Scoop' },       // Sold out: 0 left (Tier 1)
      { item: 'MOJITO', name: 'CLASSIC MOJITO' },          // Temporarily unavailable (Tier 2)
      { item: 'CHEESE', name: 'Cheese' },                 // In stock: 1 left (Tier 0)
      { item: 'COCKTAIL', name: 'Cocktail 20 Ml' },        // Temporarily unavailable (Tier 2)
      { item: 'DREAM', name: 'Dream Cake' },              // In stock: 5 left (Tier 0)
      { item: 'BIRYANI', name: 'Chicken Biryani' },       // In stock: 5 left (Tier 0)
    ];

    const availabilityMap: Record<string, ItemAvailability> = {
      BCS: createAvailability({ item_code: 'BCS', available_qty: 10, sellable: true, reason_code: 'AVAILABLE' }),
      BSS: createAvailability({ item_code: 'BSS', available_qty: 0, sellable: false, reason_code: 'PLAN_EXHAUSTED' }),
      MOJITO: createAvailability({ item_code: 'MOJITO', available_qty: 0, sellable: false, reason_code: 'BLOCKING_COMPONENT' }),
      CHEESE: createAvailability({ item_code: 'CHEESE', available_qty: 1, sellable: true, reason_code: 'AVAILABLE' }),
      COCKTAIL: createAvailability({ item_code: 'COCKTAIL', available_qty: 0, sellable: false, reason_code: 'MISSING_BOM' }),
      DREAM: createAvailability({ item_code: 'DREAM', available_qty: 5, sellable: true, reason_code: 'AVAILABLE' }),
      BIRYANI: createAvailability({ item_code: 'BIRYANI', available_qty: 5, sellable: true, reason_code: 'AVAILABLE' }),
    };

    it('sorts in-stock items first, sold out second, temporarily unavailable last', () => {
      const sorted = sortMenuItemsByAvailability(items, availabilityMap);
      const names = sorted.map((i) => i.name);

      expect(names).toEqual([
        // Tier 0 (Available / in stock) - alphabetical
        'Butter Cheese Salad',
        'Cheese',
        'Chicken Biryani',
        'Dream Cake',
        // Tier 1 (Sold out)
        'Butter Scotch Scoop',
        // Tier 2 (Temporarily unavailable) - alphabetical
        'CLASSIC MOJITO',
        'Cocktail 20 Ml',
      ]);
    });

    it('preserves alphabetical ordering within each tier', () => {
      const inStockItems = [
        { item: 'Z', name: 'Zucchini Tart' },
        { item: 'A', name: 'Apple Pie' },
        { item: 'M', name: 'Mango Mousse' },
      ];
      const inStockMap: Record<string, ItemAvailability> = {
        Z: createAvailability({ item_code: 'Z', available_qty: 2 }),
        A: createAvailability({ item_code: 'A', available_qty: 4 }),
        M: createAvailability({ item_code: 'M', available_qty: 1 }),
      };

      const sorted = sortMenuItemsByAvailability(inStockItems, inStockMap);
      expect(sorted.map((i) => i.name)).toEqual(['Apple Pie', 'Mango Mousse', 'Zucchini Tart']);
    });

    it('treats items without availability data as Tier 0 fail-open', () => {
      const partialItems = [
        { item: 'SOLD', name: 'Sold Item' },
        { item: 'UNKNOWN', name: 'Unknown Item' },
        { item: 'IN_STOCK', name: 'In Stock Item' },
      ];
      const partialMap: Record<string, ItemAvailability> = {
        SOLD: createAvailability({ item_code: 'SOLD', available_qty: 0, sellable: false, reason_code: 'PLAN_EXHAUSTED' }),
        IN_STOCK: createAvailability({ item_code: 'IN_STOCK', available_qty: 10 }),
      };

      const sorted = sortMenuItemsByAvailability(partialItems, partialMap);
      expect(sorted.map((i) => i.name)).toEqual([
        'In Stock Item',
        'Unknown Item',
        'Sold Item',
      ]);
    });
  });
});
