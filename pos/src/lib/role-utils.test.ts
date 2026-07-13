import { describe, it, expect } from 'vitest';
import { isUserRestrictedFromTableOrders } from './role-utils';

describe('isUserRestrictedFromTableOrders', () => {
  it('returns false when user is null', () => {
    const result = isUserRestrictedFromTableOrders(null, { role_restricted_for_table_order: [{ role: 'Waiter' }] } as any);
    expect(result).toBe(false);
  });

  it('returns false when posProfile is null', () => {
    const result = isUserRestrictedFromTableOrders({ name: 'test', roles: ['Waiter'] } as any, null);
    expect(result).toBe(false);
  });

  it('returns false when user has no roles', () => {
    const result = isUserRestrictedFromTableOrders(
      { name: 'test', roles: [] } as any,
      { role_restricted_for_table_order: [{ role: 'Waiter' }] } as any
    );
    expect(result).toBe(false);
  });

  it('returns false when posProfile has no role_restricted_for_table_order', () => {
    const result = isUserRestrictedFromTableOrders(
      { name: 'test', roles: ['Waiter'] } as any,
      {} as any
    );
    expect(result).toBe(false);
  });

  it('returns true when user has a restricted role', () => {
    const result = isUserRestrictedFromTableOrders(
      { name: 'test', roles: ['Waiter', 'Cashier'] } as any,
      { role_restricted_for_table_order: [{ role: 'Waiter' }] } as any
    );
    expect(result).toBe(true);
  });

  it('returns false when user does not have any restricted role', () => {
    const result = isUserRestrictedFromTableOrders(
      { name: 'test', roles: ['Cashier', 'Manager'] } as any,
      { role_restricted_for_table_order: [{ role: 'Waiter' }] } as any
    );
    expect(result).toBe(false);
  });

  it('returns true when user has one of multiple restricted roles', () => {
    const result = isUserRestrictedFromTableOrders(
      { name: 'test', roles: ['Manager'] } as any,
      { role_restricted_for_table_order: [{ role: 'Waiter' }, { role: 'Manager' }] } as any
    );
    expect(result).toBe(true);
  });

  it('returns false when both user and posProfile are null', () => {
    const result = isUserRestrictedFromTableOrders(null, null);
    expect(result).toBe(false);
  });

  it('returns true even if restricted role is the only role', () => {
    const result = isUserRestrictedFromTableOrders(
      { name: 'test', roles: ['Delivery'] } as any,
      { role_restricted_for_table_order: [{ role: 'Delivery' }] } as any
    );
    expect(result).toBe(true);
  });
});
