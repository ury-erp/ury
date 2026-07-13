import { describe, it, expect } from 'vitest';
import { generateUniqueId, calculateItemPrice } from './helpers';
import type { OrderItem } from './types';

describe('generateUniqueId', () => {
  it('returns correct format for item without variant or addons', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
    };
    const uniqueId = generateUniqueId(item);
    expect(uniqueId).toBe('item-1-default-no-addons');
  });

  it('uses variant id when selectedVariant is provided', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'variant-large', name: 'Large', price: 15 },
    };
    const uniqueId = generateUniqueId(item);
    expect(uniqueId).toBe('item-1-variant-large-no-addons');
  });

  it('sorts addon IDs and joins them', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
        { id: 'addon-bacon', name: 'Bacon', price: 3 },
      ],
    };
    const uniqueId = generateUniqueId(item);
    // addon IDs should be sorted: addon-bacon comes before addon-cheese alphabetically
    expect(uniqueId).toBe('item-1-default-addon-bacon-addon-cheese');
  });

  it('returns different IDs for different items', () => {
    const item1: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
    };
    const item2: OrderItem = {
      id: 'item-2',
      name: 'Pizza',
      image: null,
      price: 15,
      quantity: 1,
    };
    expect(generateUniqueId(item1)).not.toBe(generateUniqueId(item2));
  });

  it('returns same ID for same item configuration', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'variant-large', name: 'Large', price: 15 },
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
      ],
    };
    const item2: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 2, // different quantity, but same configuration
      selectedVariant: { id: 'variant-large', name: 'Large', price: 15 },
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
      ],
    };
    expect(generateUniqueId(item)).toBe(generateUniqueId(item2));
  });

  it('returns different IDs when variant differs', () => {
    const item1: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'variant-small', name: 'Small', price: 8 },
    };
    const item2: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'variant-large', name: 'Large', price: 15 },
    };
    expect(generateUniqueId(item1)).not.toBe(generateUniqueId(item2));
  });

  it('returns different IDs when addons differ', () => {
    const item1: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
      ],
    };
    const item2: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedAddons: [
        { id: 'addon-bacon', name: 'Bacon', price: 3 },
      ],
    };
    expect(generateUniqueId(item1)).not.toBe(generateUniqueId(item2));
  });
});

describe('calculateItemPrice', () => {
  it('returns item price when no variant or addons', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
    };
    expect(calculateItemPrice(item)).toBe(10);
  });

  it('returns variant price when selectedVariant is provided (overrides item price)', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'variant-large', name: 'Large', price: 15 },
    };
    expect(calculateItemPrice(item)).toBe(15);
  });

  it('adds addon prices to base price', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
        { id: 'addon-bacon', name: 'Bacon', price: 3 },
      ],
    };
    expect(calculateItemPrice(item)).toBe(15); // 10 + 2 + 3
  });

  it('returns variant price + addons total when both present', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedVariant: { id: 'variant-large', name: 'Large', price: 15 },
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
        { id: 'addon-bacon', name: 'Bacon', price: 3 },
      ],
    };
    expect(calculateItemPrice(item)).toBe(20); // 15 + 2 + 3
  });

  it('returns 0 when price is 0 and no variant/addons', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Free Sample',
      image: null,
      price: 0,
      quantity: 1,
    };
    expect(calculateItemPrice(item)).toBe(0);
  });

  it('returns addon prices only when base price is 0', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Free Item',
      image: null,
      price: 0,
      quantity: 1,
      selectedAddons: [
        { id: 'addon-gift-wrap', name: 'Gift Wrap', price: 5 },
      ],
    };
    expect(calculateItemPrice(item)).toBe(5);
  });

  it('handles single addon correctly', () => {
    const item: OrderItem = {
      id: 'item-1',
      name: 'Burger',
      image: null,
      price: 10,
      quantity: 1,
      selectedAddons: [
        { id: 'addon-cheese', name: 'Cheese', price: 2 },
      ],
    };
    expect(calculateItemPrice(item)).toBe(12);
  });
});
