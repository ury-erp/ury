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

interface Case {
  label: string;
  run: () => boolean;
}

const cases: Case[] = [
  // Captain profile: not restricted, no billing role, no transfer role
  {
    label: 'Captain: canTakeTableOrders true when not restricted',
    run: () => derivePOSCapabilities(captainUser, baseProfile).canTakeTableOrders === true,
  },
  {
    label: 'Captain: canAccessOtherCaptainsTables false (no billing/transfer role)',
    run: () => derivePOSCapabilities(captainUser, baseProfile).canAccessOtherCaptainsTables === false,
  },
  {
    label: 'Captain: canSettlePayment/canApplyDiscount/canCancelOrder false',
    run: () => {
      const caps = derivePOSCapabilities(captainUser, baseProfile);
      return !caps.canSettlePayment && !caps.canApplyDiscount && !caps.canCancelOrder;
    },
  },
  {
    label: 'Captain: canOpenPOS/canClosePOS always false',
    run: () => {
      const caps = derivePOSCapabilities(captainUser, baseProfile);
      return caps.canOpenPOS === false && caps.canClosePOS === false;
    },
  },
  {
    label: 'Captain: canRemoveSentItems/showItemImages/canReprintKOT follow profile flags',
    run: () => {
      const caps = derivePOSCapabilities(captainUser, baseProfile);
      return caps.canRemoveSentItems && caps.showItemImages && caps.canReprintKOT;
    },
  },
  {
    label: 'Captain: canPrintBill true (recognized POS user)',
    run: () => derivePOSCapabilities(captainUser, baseProfile).canPrintBill === true,
  },

  // Cashier profile: has billing role
  {
    label: 'Cashier: canAccessOtherCaptainsTables true (billing role)',
    run: () => derivePOSCapabilities(cashierUser, baseProfile).canAccessOtherCaptainsTables === true,
  },
  {
    label: 'Cashier: canSettlePayment/canApplyDiscount/canCancelOrder true',
    run: () => {
      const caps = derivePOSCapabilities(cashierUser, baseProfile);
      return caps.canSettlePayment && caps.canApplyDiscount && caps.canCancelOrder;
    },
  },
  {
    label: 'Cashier: canOpenPOS/canClosePOS still always false',
    run: () => {
      const caps = derivePOSCapabilities(cashierUser, baseProfile);
      return caps.canOpenPOS === false && caps.canClosePOS === false;
    },
  },

  // Manager profile: has billing role too
  {
    label: 'Manager: canSettlePayment true (billing role)',
    run: () => derivePOSCapabilities(managerUser, baseProfile).canSettlePayment === true,
  },

  // role_restricted_for_table_order case
  {
    label: 'canTakeTableOrders false when user holds a restricted role',
    run: () => {
      const restrictedProfile: PosProfileCombined = {
        ...baseProfile,
        role_restricted_for_table_order: [rolePermission('URY Captain')],
      };
      const caps = derivePOSCapabilities(captainUser, restrictedProfile);
      return (
        caps.canTakeTableOrders === false &&
        isUserRestrictedFromTableOrders(captainUser, restrictedProfile) === true
      );
    },
  },

  // canTransferCaptain mirrors canCaptainTransfer exactly
  {
    label: 'canTransferCaptain mirrors canCaptainTransfer',
    run: () => {
      const transferProfile: PosProfileCombined = {
        ...baseProfile,
        transfer_role_permissions: [rolePermission('URY Captain')],
      };
      const caps = derivePOSCapabilities(captainUser, transferProfile);
      return caps.canTransferCaptain === canCaptainTransfer(captainUser, transferProfile);
    },
  },

  // null inputs: should not throw, should resolve to safe defaults
  {
    label: 'null user/profile resolves without throwing, all-false-ish defaults',
    run: () => {
      const caps = derivePOSCapabilities(null, null);
      return (
        caps.canTakeTableOrders === true && // not restricted when there's no profile to restrict from
        caps.canAccessOtherCaptainsTables === false &&
        caps.canSettlePayment === false &&
        caps.canPrintBill === false
      );
    },
  },
];

let failures = 0;
for (const { label, run } of cases) {
  const passed = run();
  if (!passed) {
    failures++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
