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

/**
 * True if the user holds any role in the POS profile's `role_allowed_for_billing`
 * table (the "cashier" role check, mirrors `urypos/src/stores/Auth.js:121-126`'s
 * `billingRoles`/`this.cashier` derivation).
 */
const hasBillingRole = (user: User | null, posProfile: PosProfileCombined | null): boolean => {
  if (!user || !posProfile || !user.roles || !posProfile.role_allowed_for_billing?.length) {
    return false;
  }

  const billingRoles = posProfile.role_allowed_for_billing.map((role) => role.role);
  return user.roles.some((role) => billingRoles.includes(role));
};

/**
 * POS-Profile/role-derived capability flags for the current user.
 *
 * This is a **client-side UX hint**, not the security boundary — actual
 * enforcement lives server-side (DocType permissions, and Phase-2's
 * `get_table_order_context()` for per-invoice/per-table ownership and
 * billed-state checks, which cannot be derived from POS Profile + role
 * alone and are deliberately NOT modeled here).
 */
export interface POSCapabilities {
  /** NOT restricted by `role_restricted_for_table_order`. */
  canTakeTableOrders: boolean;
  /** Elevated access to tables/orders owned by other captains — via transfer role or billing role. */
  canAccessOtherCaptainsTables: boolean;
  /** Can remove/reduce already-sent order items, per `remove_items`. */
  canRemoveSentItems: boolean;
  /** Whether menu item images should be shown, per `show_image`. */
  showItemImages: boolean;
  /**
   * Reflects billing-role intent (`role_allowed_for_billing`) only. Captain
   * never has POS Invoice submit/cancel at the DocType level regardless of
   * this flag — actual enforcement is server-side and out of scope here.
   */
  canSettlePayment: boolean;
  canApplyDiscount: boolean;
  canCancelOrder: boolean;
  /** Per `custom_enable_kot_reprint`. Ownership/print-eligibility of a specific KOT is server-side (Phase 2). */
  canReprintKOT: boolean;
  /** Mirrors `canCaptainTransfer(user, posProfile)` — included by reference, not reimplemented. */
  canTransferCaptain: boolean;
  /** Always false: no DocType permission for POS Opening create/submit regardless of POS Profile (Captain). */
  canOpenPOS: boolean;
  /** Always false: no DocType permission for POS Closing Entry regardless of POS Profile (Captain). */
  canClosePOS: boolean;
  /**
   * Best-effort UX hint from role only — not a security boundary. All POS
   * roles (Captain, Cashier, Manager) currently hold POS Invoice `print`
   * permission at the DocType level (`ury/patches/v2_0/default_permissions.py`),
   * so this resolves `true` for any recognized POS user today; it is
   * modeled as its own field so it stops tracking `canSettlePayment` if
   * that permission mapping ever diverges.
   */
  canPrintBill: boolean;
}

/**
 * Derives a full {@link POSCapabilities} object from POS Profile fields and
 * the user's roles. Purely POS-Profile/role-derived — it does NOT know about
 * a specific invoice or table (ownership, billed-state); those belong in the
 * Phase-2 backend `get_table_order_context()` endpoint, not here.
 */
export const derivePOSCapabilities = (
  user: User | null,
  posProfile: PosProfileCombined | null
): POSCapabilities => {
  const canAccessOtherCaptainsTables =
    canCaptainTransfer(user, posProfile) || hasBillingRole(user, posProfile);
  const billingCapability = hasBillingRole(user, posProfile);

  return {
    canTakeTableOrders: !isUserRestrictedFromTableOrders(user, posProfile),
    canAccessOtherCaptainsTables,
    canRemoveSentItems: Boolean(posProfile?.remove_items),
    showItemImages: Boolean(posProfile?.show_image),
    canSettlePayment: billingCapability,
    canApplyDiscount: billingCapability,
    canCancelOrder: billingCapability,
    canReprintKOT: Boolean(posProfile?.custom_enable_kot_reprint),
    canTransferCaptain: canCaptainTransfer(user, posProfile),
    canOpenPOS: false,
    canClosePOS: false,
    canPrintBill: Boolean(user?.roles?.length),
  };
};

/**
 * Roles that may open the management dashboard.
 *
 * The policy was written twice and the two copies disagreed: the route guard
 * accepted only "URY Manager", while `useAuth.isManager` also accepted
 * Administrator and System Manager. An administrator was therefore told they
 * lacked permission for a screen the rest of the app considered theirs
 * (UX-15). Declared once here so the two cannot drift again.
 *
 * This decides what the interface offers, never what the server allows.
 * Every endpoint behind these screens does its own check; hiding a route is
 * not authorization.
 */
export const DASHBOARD_MANAGER_ROLES = [
  'URY Manager',
  'URY Admin',
  'Administrator',
  'System Manager',
] as const;

/** Whether a role list may open the management dashboard. */
export const isDashboardManager = (
  roles: Array<string | { name?: string }> | null | undefined
): boolean => {
  if (!roles) return false;
  return roles.some((role) => {
    const name = typeof role === 'string' ? role : role?.name;
    return !!name && (DASHBOARD_MANAGER_ROLES as readonly string[]).includes(name);
  });
};
