import { describe, expect, it } from 'vitest';
import {
  isUserRestrictedFromTableOrders,
  canCaptainTransfer,
  derivePOSCapabilities,
} from './roles';
import type { User, PosProfileCombined } from '../types';

// Minimal fixtures — only the fields roles.ts reads are populated.
const rolePermission = (role: string) =>
  ({
    name: role,
    owner: '',
    creation: '',
    modified: '',
    modified_by: '',
    docstatus: 0,
    idx: 0,
    role,
    parent: '',
    parentfield: '',
    parenttype: '',
    doctype: 'Has Role',
  }) as PosProfileCombined['role_allowed_for_billing'][number];

const baseProfile: PosProfileCombined = {
  name: 'Test Profile',
  owner: '',
  creation: '',
  modified: '',
  modified_by: '',
  docstatus: 0,
  idx: 0,
  company: '',
  customer: null,
  country: '',
  disabled: 0,
  warehouse: '',
  campaign: null,
  company_address: null,
  restaurant: '',
  branch: '',
  currency: '',
  role_allowed_for_billing: [rolePermission('URY Cashier'), rolePermission('URY Manager')],
  role_restricted_for_table_order: [],
  transfer_role_permissions: [],
  waiter: '',
  cashier: '',
  print_format: null,
  qz_print: 0,
  qz_host: null,
  printer: null,
  print_type: '',
  tableAttention: 0,
  disable_rounded_total: 0,
  enable_discount: 0,
  multiple_cashier: 0,
  remove_items: 1,
  show_image: 1,
  custom_enable_kot_reprint: 1,
};

const captainUser: User = { name: 'captain@ury.test', roles: ['URY Captain'] };
const cashierUser: User = { name: 'cashier@ury.test', roles: ['URY Cashier'] };
const managerUser: User = { name: 'manager@ury.test', roles: ['URY Manager'] };
const noRolesUser: User = { name: 'norole@ury.test', roles: [] };

describe('isUserRestrictedFromTableOrders', () => {
  it('returns false when user is null', () => {
    expect(isUserRestrictedFromTableOrders(null, baseProfile)).toBe(false);
  });

  it('returns false when posProfile is null', () => {
    expect(isUserRestrictedFromTableOrders(captainUser, null)).toBe(false);
  });

  it('returns false when user.roles is missing', () => {
    const userNoRoles = { name: 'x' } as unknown as User;
    expect(isUserRestrictedFromTableOrders(userNoRoles, baseProfile)).toBe(false);
  });

  it('returns false when role_restricted_for_table_order is missing', () => {
    const profileNoField = { ...baseProfile, role_restricted_for_table_order: undefined } as unknown as PosProfileCombined;
    expect(isUserRestrictedFromTableOrders(captainUser, profileNoField)).toBe(false);
  });

  it('returns false when role_restricted_for_table_order is empty', () => {
    expect(isUserRestrictedFromTableOrders(captainUser, baseProfile)).toBe(false);
  });

  it('returns true when user holds a restricted role', () => {
    const restrictedProfile: PosProfileCombined = {
      ...baseProfile,
      role_restricted_for_table_order: [rolePermission('URY Captain')],
    };
    expect(isUserRestrictedFromTableOrders(captainUser, restrictedProfile)).toBe(true);
  });

  it('returns false when user holds none of the restricted roles', () => {
    const restrictedProfile: PosProfileCombined = {
      ...baseProfile,
      role_restricted_for_table_order: [rolePermission('URY Captain')],
    };
    expect(isUserRestrictedFromTableOrders(cashierUser, restrictedProfile)).toBe(false);
  });

  it('returns true when user holds at least one of several restricted roles', () => {
    const restrictedProfile: PosProfileCombined = {
      ...baseProfile,
      role_restricted_for_table_order: [rolePermission('URY Waiter'), rolePermission('URY Cashier')],
    };
    expect(isUserRestrictedFromTableOrders(cashierUser, restrictedProfile)).toBe(true);
  });
});

describe('canCaptainTransfer', () => {
  it('returns false when user is null', () => {
    expect(canCaptainTransfer(null, baseProfile)).toBe(false);
  });

  it('returns false when posProfile is null', () => {
    expect(canCaptainTransfer(captainUser, null)).toBe(false);
  });

  it('returns false when user.roles is missing', () => {
    const userNoRoles = { name: 'x' } as unknown as User;
    expect(canCaptainTransfer(userNoRoles, baseProfile)).toBe(false);
  });

  it('returns false when transfer_role_permissions is empty', () => {
    expect(canCaptainTransfer(captainUser, baseProfile)).toBe(false);
  });

  it('returns false when transfer_role_permissions is missing entirely', () => {
    const profileNoField = { ...baseProfile, transfer_role_permissions: undefined } as unknown as PosProfileCombined;
    expect(canCaptainTransfer(captainUser, profileNoField)).toBe(false);
  });

  it('returns true when user holds a transfer role', () => {
    const transferProfile: PosProfileCombined = {
      ...baseProfile,
      transfer_role_permissions: [rolePermission('URY Captain')],
    };
    expect(canCaptainTransfer(captainUser, transferProfile)).toBe(true);
  });

  it('returns false when user holds none of the transfer roles', () => {
    const transferProfile: PosProfileCombined = {
      ...baseProfile,
      transfer_role_permissions: [rolePermission('URY Manager')],
    };
    expect(canCaptainTransfer(captainUser, transferProfile)).toBe(false);
  });
});

describe('derivePOSCapabilities', () => {
  describe('Captain profile (no billing/transfer role)', () => {
    it('canTakeTableOrders is true when not restricted', () => {
      expect(derivePOSCapabilities(captainUser, baseProfile).canTakeTableOrders).toBe(true);
    });

    it('canAccessOtherCaptainsTables is false', () => {
      expect(derivePOSCapabilities(captainUser, baseProfile).canAccessOtherCaptainsTables).toBe(false);
    });

    it('canSettlePayment/canApplyDiscount/canCancelOrder are false', () => {
      const caps = derivePOSCapabilities(captainUser, baseProfile);
      expect(caps.canSettlePayment).toBe(false);
      expect(caps.canApplyDiscount).toBe(false);
      expect(caps.canCancelOrder).toBe(false);
    });

    it('canOpenPOS/canClosePOS are always false', () => {
      const caps = derivePOSCapabilities(captainUser, baseProfile);
      expect(caps.canOpenPOS).toBe(false);
      expect(caps.canClosePOS).toBe(false);
    });

    it('canRemoveSentItems/showItemImages/canReprintKOT follow profile flags', () => {
      const caps = derivePOSCapabilities(captainUser, baseProfile);
      expect(caps.canRemoveSentItems).toBe(true);
      expect(caps.showItemImages).toBe(true);
      expect(caps.canReprintKOT).toBe(true);
    });

    it('canRemoveSentItems/showItemImages/canReprintKOT are false when profile flags are 0', () => {
      const offProfile: PosProfileCombined = {
        ...baseProfile,
        remove_items: 0,
        show_image: 0,
        custom_enable_kot_reprint: 0,
      };
      const caps = derivePOSCapabilities(captainUser, offProfile);
      expect(caps.canRemoveSentItems).toBe(false);
      expect(caps.showItemImages).toBe(false);
      expect(caps.canReprintKOT).toBe(false);
    });

    it('canPrintBill is true for a recognized POS user regardless of profile', () => {
      expect(derivePOSCapabilities(captainUser, baseProfile).canPrintBill).toBe(true);
    });

    it('canPrintBill is false when the user has no roles', () => {
      expect(derivePOSCapabilities(noRolesUser, baseProfile).canPrintBill).toBe(false);
    });
  });

  describe('Cashier profile (billing role)', () => {
    it('canAccessOtherCaptainsTables is true via billing role', () => {
      expect(derivePOSCapabilities(cashierUser, baseProfile).canAccessOtherCaptainsTables).toBe(true);
    });

    it('canSettlePayment/canApplyDiscount/canCancelOrder are true', () => {
      const caps = derivePOSCapabilities(cashierUser, baseProfile);
      expect(caps.canSettlePayment).toBe(true);
      expect(caps.canApplyDiscount).toBe(true);
      expect(caps.canCancelOrder).toBe(true);
    });

    it('canOpenPOS/canClosePOS are still always false', () => {
      const caps = derivePOSCapabilities(cashierUser, baseProfile);
      expect(caps.canOpenPOS).toBe(false);
      expect(caps.canClosePOS).toBe(false);
    });
  });

  describe('Manager profile (billing role)', () => {
    it('canSettlePayment is true', () => {
      expect(derivePOSCapabilities(managerUser, baseProfile).canSettlePayment).toBe(true);
    });
  });

  describe('role_restricted_for_table_order', () => {
    it('canTakeTableOrders is false when user holds a restricted role', () => {
      const restrictedProfile: PosProfileCombined = {
        ...baseProfile,
        role_restricted_for_table_order: [rolePermission('URY Captain')],
      };
      const caps = derivePOSCapabilities(captainUser, restrictedProfile);
      expect(caps.canTakeTableOrders).toBe(false);
      expect(isUserRestrictedFromTableOrders(captainUser, restrictedProfile)).toBe(true);
    });
  });

  describe('canTransferCaptain', () => {
    it('mirrors canCaptainTransfer exactly', () => {
      const transferProfile: PosProfileCombined = {
        ...baseProfile,
        transfer_role_permissions: [rolePermission('URY Captain')],
      };
      const caps = derivePOSCapabilities(captainUser, transferProfile);
      expect(caps.canTransferCaptain).toBe(canCaptainTransfer(captainUser, transferProfile));
      expect(caps.canTransferCaptain).toBe(true);
    });

    it('canAccessOtherCaptainsTables is true via transfer role alone (no billing role)', () => {
      const transferProfile: PosProfileCombined = {
        ...baseProfile,
        role_allowed_for_billing: [],
        transfer_role_permissions: [rolePermission('URY Captain')],
      };
      const caps = derivePOSCapabilities(captainUser, transferProfile);
      expect(caps.canAccessOtherCaptainsTables).toBe(true);
      expect(caps.canSettlePayment).toBe(false);
    });
  });

  describe('null inputs', () => {
    it('resolves without throwing, to safe defaults', () => {
      const caps = derivePOSCapabilities(null, null);
      expect(caps.canTakeTableOrders).toBe(true); // not restricted when there's no profile to restrict from
      expect(caps.canAccessOtherCaptainsTables).toBe(false);
      expect(caps.canSettlePayment).toBe(false);
      expect(caps.canApplyDiscount).toBe(false);
      expect(caps.canCancelOrder).toBe(false);
      expect(caps.canTransferCaptain).toBe(false);
      expect(caps.canOpenPOS).toBe(false);
      expect(caps.canClosePOS).toBe(false);
      expect(caps.canPrintBill).toBe(false);
      expect(caps.canRemoveSentItems).toBe(false);
      expect(caps.showItemImages).toBe(false);
      expect(caps.canReprintKOT).toBe(false);
    });

    it('resolves without throwing when user is null but posProfile is present', () => {
      const caps = derivePOSCapabilities(null, baseProfile);
      expect(caps.canTakeTableOrders).toBe(true);
      expect(caps.canPrintBill).toBe(false);
    });
  });
});
