import type { PosProfileCombined } from '../types';
import type { User } from '../types';

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

export const canCaptainTransfer = (
  user: User | null,
  posProfile: PosProfileCombined | null
): boolean => {
  if (!user || !posProfile || !user.roles || !posProfile.transfer_role_permissions?.length) {
    return false;
  }

  const transferRoles = posProfile.transfer_role_permissions.map((role) => role.role);
  return user.roles.some((role) => transferRoles.includes(role));
};
