import { describe, it, expect } from 'vitest';
import { resolveDefaultCustomer, profileLacksDefaultCustomerConfig } from './defaultCustomer';

const walkIn = { customer: 'CUST-WALK', customer_name: 'Walk-In Customer', mobile_number: '000' };
const regular = { customer: 'CUST-REG', customer_name: 'Regular', mobile_number: null };

describe('resolveDefaultCustomer', () => {
  it('returns the order-type entry first', () => {
    const cfg = { order_type_customer_map: { 'Take Away': walkIn }, default_customer: regular };
    expect(resolveDefaultCustomer('Take Away', cfg)).toEqual({
      id: 'CUST-WALK',
      name: 'Walk-In Customer',
      phone: '000',
    });
  });

  it('falls back to the profile default when the type has no entry', () => {
    const cfg = { order_type_customer_map: { 'Take Away': walkIn }, default_customer: regular };
    expect(resolveDefaultCustomer('Delivery', cfg)).toEqual({ id: 'CUST-REG', name: 'Regular', phone: '' });
  });

  it('returns null when nothing is configured', () => {
    expect(resolveDefaultCustomer('Take Away', { order_type_customer_map: {}, default_customer: null })).toBeNull();
    expect(resolveDefaultCustomer('Take Away', {})).toBeNull();
    expect(resolveDefaultCustomer('Take Away', null)).toBeNull();
    expect(resolveDefaultCustomer('Take Away', undefined)).toBeNull();
  });

  it('never resolves Aggregators', () => {
    const cfg = { order_type_customer_map: { Aggregators: walkIn }, default_customer: regular };
    expect(resolveDefaultCustomer('Aggregators', cfg)).toBeNull();
  });

  it('ignores a missing or unknown order type', () => {
    const cfg = { default_customer: regular };
    expect(resolveDefaultCustomer(undefined, cfg)).toBeNull();
    expect(resolveDefaultCustomer(null, cfg)).toBeNull();
    expect(resolveDefaultCustomer('Unknown', cfg)).toEqual({ id: 'CUST-REG', name: 'Regular', phone: '' });
  });

  it('falls back to the customer id when no display name is provided', () => {
    expect(resolveDefaultCustomer('Dine In', { default_customer: { customer: 'CUST-X' } })).toEqual({
      id: 'CUST-X',
      name: 'CUST-X',
      phone: '',
    });
  });
});

describe('profileLacksDefaultCustomerConfig', () => {
  it('flags a cached profile without the new keys', () => {
    expect(profileLacksDefaultCustomerConfig({ name: 'P' })).toBe(true);
    expect(profileLacksDefaultCustomerConfig(null)).toBe(true);
  });

  it('accepts a profile with the keys even when empty', () => {
    expect(profileLacksDefaultCustomerConfig({ order_type_customer_map: {}, default_customer: null })).toBe(false);
  });
});
