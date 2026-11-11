import { describe, expect, it } from 'vitest';
import { isUserRestrictedFromTableOrders, shouldMaskAmounts } from './roles';
import type { PosProfileCombined, User } from '../types';

const row = (role: string) => ({ role });
const profile = (masked: string[] = [], tableOrder: string[] = []) =>
  ({
    role_masked_for_amounts: masked.map(row),
    role_restricted_for_table_order: tableOrder.map(row),
  }) as unknown as PosProfileCombined;
const user = (...roles: string[]) => ({ name: 'u', roles }) as unknown as User;

describe('shouldMaskAmounts', () => {
  it('masks a user holding a configured role', () => {
    expect(shouldMaskAmounts(user('URY Cashier'), profile(['URY Cashier']))).toBe(true);
  });

  it('is driven by configuration, not by the role name', () => {
    expect(shouldMaskAmounts(user('Custom Role'), profile(['Custom Role']))).toBe(true);
    expect(shouldMaskAmounts(user('URY Cashier'), profile(['Custom Role']))).toBe(false);
  });

  it('shows amounts when nothing is configured or data is missing', () => {
    expect(shouldMaskAmounts(user('URY Cashier'), profile())).toBe(false);
    expect(shouldMaskAmounts(user('URY Cashier'), null)).toBe(false);
    expect(shouldMaskAmounts(null, profile(['URY Cashier']))).toBe(false);
  });

  it.each(['URY Manager', 'URY Admin', 'URY Owner', 'System Manager'])(
    'masks %s when that role is configured',
    (role) => {
      expect(shouldMaskAmounts(user(role), profile([role]))).toBe(true);
    }
  );

  it('masks a user with any one configured role among several', () => {
    expect(shouldMaskAmounts(user('URY Cashier', 'URY Manager'), profile(['URY Cashier']))).toBe(true);
    expect(shouldMaskAmounts(user('URY Cashier', 'URY Manager'), profile(['URY Admin']))).toBe(false);
  });

  it('keeps the table order restriction independent', () => {
    const p = profile([], ['URY Cashier']);
    expect(isUserRestrictedFromTableOrders(user('URY Cashier'), p)).toBe(true);
    expect(shouldMaskAmounts(user('URY Cashier'), p)).toBe(false);
  });
});
