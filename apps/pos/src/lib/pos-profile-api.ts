import { DOCTYPES } from '../data/doctypes';
import { call, db } from './frappe-sdk';

// Limited fields response
export interface PosProfileLimited {
  pos_profile: string;
  branch: string;
  company: string;
  waiter: string;
  warehouse: string;
  cashier: string;
  print_format: string | null;
  qz_print: number;
  qz_host: string | null;
  printer: string | null;
  print_type: string;
  tableAttention: number;
  paid_limit: number;
  disable_rounded_total: number;
  enable_discount: number;
  multiple_cashier: number;
  owner: string;
  edit_order_type?: number;
}

export interface PosProfileLimitedResponse {
  message: PosProfileLimited;
}

interface RolePermission {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: number;
  idx: number;
  role: string;
  parent: string;
  parentfield: string;
  parenttype: string;
  doctype: string;
}

// Full POS Profile response
export interface PosProfileFull {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: number;
  idx: number;
  company: string;
  customer: string | null;
  country: string;
  disabled: number;
  warehouse: string;
  campaign: string | null;
  company_address: string | null;
  restaurant: string;
  branch: string;
  currency: string;
  role_allowed_for_billing: RolePermission[];
  role_restricted_for_table_order?: RolePermission[];
  paid_limit?: number;
}

// Combined POS Profile with both limited and full fields
export interface PosProfileCombined extends PosProfileFull {
  // Add limited fields that don't exist in full profile
  waiter: string;
  cashier: string;
  print_format: string | null;
  qz_print: number;
  qz_host: string | null;
  printer: string | null;
  print_type: string;
  tableAttention: number;
  paid_limit: number;
  disable_rounded_total: number;
  enable_discount: number;
  multiple_cashier: number;
  edit_order_type?: number;
  view_all_status?: number;
  custom_daily_pos_close?: number;
}

export interface Currency {
  name: string;
  symbol: string;
  fraction: string;
  fraction_units: number;
  smallest_currency_fraction_value: number;
  number_format: string;
}

export interface PosProfileFullResponse {
  message: PosProfileFull;
}

export async function getPosProfileLimitedFields(): Promise<PosProfileLimited> {
  const res = await call.get('ury.ury_pos.api.getPosProfile');
  return res.message;
}

export async function getPosProfileFull(posProfileName: string): Promise<PosProfileFull> {
  const doc = await db.getDoc(DOCTYPES.POS_PROFILE, posProfileName);
  return doc;
}

export async function getCombinedPosProfile(): Promise<PosProfileCombined> {
  // Get limited fields first
  const limitedProfile = await getPosProfileLimitedFields();
  console.log('limitedProfile', limitedProfile);
  
  // Get full profile using the pos_profile name from limited profile
  const fullProfile = await getPosProfileFull(limitedProfile.pos_profile);
  
  // Merge both profiles
  const combinedProfile: PosProfileCombined = {
    ...fullProfile,
    waiter: limitedProfile.waiter,
    cashier: limitedProfile.cashier,
    print_format: limitedProfile.print_format,
    qz_print: limitedProfile.qz_print,
    qz_host: limitedProfile.qz_host,
    printer: limitedProfile.printer,
    print_type: limitedProfile.print_type,
    tableAttention: limitedProfile.tableAttention,
    paid_limit: limitedProfile.paid_limit,
    disable_rounded_total: limitedProfile.disable_rounded_total,
    enable_discount: limitedProfile.enable_discount,
    multiple_cashier: limitedProfile.multiple_cashier,
    edit_order_type: limitedProfile.edit_order_type,
  };

  return combinedProfile;
}

export async function getCurrencyInfo(currencyCode: string): Promise<Currency> {
  const doc = await db.getDoc(DOCTYPES.CURRENCY, currencyCode);
  return doc;
}