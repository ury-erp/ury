import type { PosProfileCombined } from './pos-profile-api';
import type { User } from '../store/slices/auth-slice';

export const isUserRestrictedFromTableOrders = (
  user: User | null,
  posProfile: PosProfileCombined | null
): boolean => {
  if (!user || !posProfile || !user.roles || !posProfile.role_restricted_for_table_order) {
    return false;
  }

  // Get the restricted roles from the POS profile
  const restrictedRoles = posProfile.role_restricted_for_table_order.map(role => role.role);
  
  // Check if the user has any of the restricted roles
  const hasRestrictedRole = user.roles.some(role => restrictedRoles.includes(role));

  return hasRestrictedRole;
};

const WAITER_ROLE = 'URY Waiter';

/**
 * Waiters use the POS (take/update orders, print bills, shift tables) but must
 * not settle bills. A user carrying the URY Waiter role can only bill when they
 * also hold one of the profile's explicit billing roles ("All" doesn't count —
 * every user has it, so it would defeat the restriction).
 */
export const canUserBill = (
  user: User | null,
  posProfile: PosProfileCombined | null
): boolean => {
  if (!user?.roles) return true;
  // Administrator / System Manager hold every role (including URY Waiter),
  // so the waiter restriction never applies to them.
  if (user.name === 'Administrator' || user.roles.includes('System Manager')) return true;
  if (!user.roles.includes(WAITER_ROLE)) return true;

  const billingRoles = (posProfile?.role_allowed_for_billing || [])
    .map(role => role.role)
    .filter(role => role !== 'All');

  return user.roles.some(role => billingRoles.includes(role));
}; 