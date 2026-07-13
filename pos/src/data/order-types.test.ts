import { describe, it, expect } from 'vitest';
import {
  ORDER_TYPES,
  DINE_IN,
  DEFAULT_ORDER_TYPE,
  DEFAULT_PAYMENT_MODE,
  BASE_ORDER_STATUS_TYPES,
  RECENTLY_PAID_STATUS_TYPE,
  EXTENDED_ORDER_STATUS_TYPES,
  getOrderStatusTypes,
  type OrderType,
  type OrderStatusType,
} from '../data/order-types';

describe('Order Type Constants', () => {
  it('ORDER_TYPES should contain 5 order types', () => {
    expect(ORDER_TYPES).toHaveLength(5);
  });

  it('ORDER_TYPES should contain Dine In', () => {
    expect(ORDER_TYPES[0].value).toBe('Dine In');
    expect(ORDER_TYPES[0].label).toBe('Dine In');
  });

  it('ORDER_TYPES should contain Take Away', () => {
    expect(ORDER_TYPES[1].value).toBe('Take Away');
  });

  it('ORDER_TYPES should contain Delivery', () => {
    expect(ORDER_TYPES[2].value).toBe('Delivery');
  });

  it('ORDER_TYPES should contain Phone In', () => {
    expect(ORDER_TYPES[3].value).toBe('Phone In');
  });

  it('ORDER_TYPES should contain Aggregators', () => {
    expect(ORDER_TYPES[4].value).toBe('Aggregators');
  });

  it('DINE_IN should be "Dine In"', () => {
    expect(DINE_IN).toBe('Dine In');
  });

  it('DEFAULT_ORDER_TYPE should be "Take Away"', () => {
    expect(DEFAULT_ORDER_TYPE).toBe('Take Away');
  });

  it('DEFAULT_PAYMENT_MODE should be "Cash"', () => {
    expect(DEFAULT_PAYMENT_MODE).toBe('Cash');
  });
});

describe('Order Status Types', () => {
  it('BASE_ORDER_STATUS_TYPES should contain Draft and Unbilled', () => {
    expect(BASE_ORDER_STATUS_TYPES).toHaveLength(2);
    expect(BASE_ORDER_STATUS_TYPES[0].value).toBe('Draft');
    expect(BASE_ORDER_STATUS_TYPES[1].value).toBe('Unbilled');
  });

  it('RECENTLY_PAID_STATUS_TYPE should contain Recently Paid', () => {
    expect(RECENTLY_PAID_STATUS_TYPE).toHaveLength(1);
    expect(RECENTLY_PAID_STATUS_TYPE[0].value).toBe('Recently Paid');
  });

  it('EXTENDED_ORDER_STATUS_TYPES should contain Paid, Consolidated, Return', () => {
    expect(EXTENDED_ORDER_STATUS_TYPES).toHaveLength(3);
    expect(EXTENDED_ORDER_STATUS_TYPES[0].value).toBe('Paid');
    expect(EXTENDED_ORDER_STATUS_TYPES[1].value).toBe('Consolidated');
    expect(EXTENDED_ORDER_STATUS_TYPES[2].value).toBe('Return');
  });
});

describe('getOrderStatusTypes', () => {
  it('returns base statuses by default', () => {
    const result = getOrderStatusTypes();
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('Draft');
    expect(result[1].value).toBe('Unbilled');
  });

  it('includes Recently Paid when paidLimit > 0', () => {
    const result = getOrderStatusTypes(undefined, 10);
    expect(result).toHaveLength(3);
    expect(result[2].value).toBe('Recently Paid');
  });

  it('does not include Recently Paid when paidLimit is 0', () => {
    const result = getOrderStatusTypes(undefined, 0);
    expect(result).toHaveLength(2);
  });

  it('includes extended statuses when viewAllStatus is 1', () => {
    const result = getOrderStatusTypes(1);
    expect(result).toHaveLength(5);
    expect(result[2].value).toBe('Paid');
    expect(result[3].value).toBe('Consolidated');
    expect(result[4].value).toBe('Return');
  });

  it('does not include extended statuses when viewAllStatus is 0', () => {
    const result = getOrderStatusTypes(0);
    expect(result).toHaveLength(2);
  });

  it('includes both Recently Paid and extended statuses when both conditions are met', () => {
    const result = getOrderStatusTypes(1, 10);
    expect(result).toHaveLength(6);
    expect(result[0].value).toBe('Draft');
    expect(result[1].value).toBe('Unbilled');
    expect(result[2].value).toBe('Recently Paid');
    expect(result[3].value).toBe('Paid');
    expect(result[4].value).toBe('Consolidated');
    expect(result[5].value).toBe('Return');
  });
});
