import { describe, it, expect } from 'vitest';
import { MAX_QUANTITY, MIN_QUANTITY, CartError } from './types';
import type { MenuItem, Customer, OrderItem, PaymentMode, Category, CartTotals, Aggregator } from './types';

describe('types constants', () => {
  it('MAX_QUANTITY should be 99', () => {
    expect(MAX_QUANTITY).toBe(99);
  });

  it('MIN_QUANTITY should be 0', () => {
    expect(MIN_QUANTITY).toBe(0);
  });
});

describe('CartError', () => {
  it('should extend Error', () => {
    const err = new CartError('test error');
    expect(err).toBeInstanceOf(Error);
  });

  it('should have name "CartError"', () => {
    const err = new CartError('test error');
    expect(err.name).toBe('CartError');
  });

  it('should store message correctly', () => {
    const err = new CartError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('should be distinguishable from generic Error', () => {
    const cartErr = new CartError('cart');
    const genericErr = new Error('generic');
    expect(cartErr.name).toBe('CartError');
    expect(genericErr.name).toBe('Error');
    expect(cartErr).toBeInstanceOf(CartError);
    expect(genericErr).not.toBeInstanceOf(CartError);
  });

  it('should support instanceof CartError check', () => {
    const err = new CartError('test');
    expect(err instanceof CartError).toBe(true);
  });
});

describe('type exports', () => {
  it('MenuItem should be importable as a type', () => {
    const item: MenuItem = {
      id: 'item-1',
      name: 'Test Item',
      image: null,
      price: 10,
    };
    expect(item.id).toBe('item-1');
    expect(item.price).toBe(10);
  });

  it('Customer should be importable as a type', () => {
    const customer: Customer = {
      id: 'cust-1',
      name: 'John Doe',
      phone: '1234567890',
    };
    expect(customer.id).toBe('cust-1');
    expect(customer.phone).toBe('1234567890');
  });

  it('OrderItem should be importable as a type with required quantity', () => {
    const orderItem: OrderItem = {
      id: 'item-1',
      name: 'Test Item',
      image: null,
      price: 15,
      quantity: 2,
    };
    expect(orderItem.quantity).toBe(2);
  });

  it('PaymentMode should be importable as a type', () => {
    const mode: PaymentMode = {
      id: 'pm-1',
      name: 'Cash',
      enabled: true,
    };
    expect(mode.enabled).toBe(true);
  });

  it('Category should be importable as a type', () => {
    const category: Category = {
      name: 'starters',
      label: 'Starters',
    };
    expect(category.label).toBe('Starters');
  });

  it('CartTotals should be importable as a type', () => {
    const totals: CartTotals = {
      subtotal: 100,
      tax: 10,
      total: 110,
      itemCount: 3,
    };
    expect(totals.total).toBe(110);
    expect(totals.itemCount).toBe(3);
  });

  it('Aggregator should be importable as a type', () => {
    const agg: Aggregator = {
      customer: 'swiggy',
    };
    expect(agg.customer).toBe('swiggy');
  });
});
