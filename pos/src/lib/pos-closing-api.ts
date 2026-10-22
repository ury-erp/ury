/**
 * Type definitions and API facade for the POS Closing flow.
 *
 * Wraps the whitelisted backend methods used by both the sub-cashier close
 * (Sub POS Closing) and the main-cashier / single-cashier close (POS Closing
 * Entry), plus create/submit helpers for both doctypes.
 *
 * Backend sources:
 * - ury/ury/ury/doctype/sub_pos_closing/sub_pos_closing.py
 *   (get_pos_profile, get_cashiers, get_pos_invoices)
 * - ury/ury/ury_pos/api.py (get_open_pos_opening_entries)
 * - erpnext/accounts/doctype/pos_closing_entry/pos_closing_entry.py
 *   (get_cashiers, get_pos_invoices)
 *
 * Note: ERPNext v16's `get_invoices(start, end, pos_profile, user)` on the
 * POS Closing Entry module returns a pre-aggregated
 * {invoices, payments, taxes} object: `payments` is already grouped by
 * mode_of_payment with change_amount already deducted server-side, and
 * payment/tax rows carry no `parent` field. Older/Sub POS Closing paths
 * return a plain list of full POS Invoice dicts (POSClosingInvoice[]).
 * getMainCashierPosInvoices therefore returns POSClosingData | POSClosingInvoice[].
 */

import { call, db } from '@ury/core';

/**
 * Represents a tax line from a POS Invoice
 */
export interface POSClosingTax {
  account_head: string;
  rate: number;
  tax_amount: number;
}

/**
 * Represents a payment record from a POS Invoice
 */
export interface POSClosingPayment {
  mode_of_payment: string;
  amount: number;
  account: string;
}

/**
 * Represents a complete POS Invoice as returned by the backend get_pos_invoices method
 * This matches the .as_dict() shape of a POS Invoice doctype with all relevant closing fields
 */
export interface POSClosingInvoice {
  name: string;
  grand_total: number;
  net_total: number;
  total_qty: number;
  change_amount: number;
  account_for_change_amount: string;
  taxes: POSClosingTax[];
  payments: POSClosingPayment[];
}

/**
 * Pre-aggregated response returned by ERPNext v16's
 * pos_closing_entry.get_invoices: invoice dicts plus payments already
 * grouped by mode_of_payment (change_amount already deducted server-side)
 * and aggregated taxes.
 */
export interface POSClosingData {
  invoices: POSClosingInvoice[];
  payments?: POSClosingPayment[];
  taxes?: POSClosingTax[];
}

/**
 * Represents an aggregated payment summary for a single payment mode
 * Used in the closing breakdown table to show totals by payment method
 */
export interface ClosingPaymentSummary {
  mode_of_payment: string;
  opening_amount: number;
  expected_amount: number;
  closing_amount: number;
  difference: number;
}

/**
 * A single cashier option as returned by the get_cashiers whitelisted
 * methods (both Sub POS Closing and POS Closing Entry expose an identical
 * `[user]` list-as-list row shape: frappe.get_all(..., as_list=1)).
 */
export type CashierOption = [user: string];

/**
 * Filters accepted by the get_cashiers link-query methods. These mirror the
 * standard Frappe query-report/search-field signature
 * (doctype, txt, searchfield, start, page_len, filters).
 */
export interface GetCashiersArgs {
  doctype: string;
  txt: string;
  searchfield: string;
  start: number;
  page_len: number;
  filters?: Record<string, unknown>;
}

/**
 * A single open POS Opening Entry as returned by
 * ury.ury_pos.api.get_open_pos_opening_entries(pos_profile).
 */
export interface OpenPosOpeningEntry {
  name: string;
  period_start_date: string;
  user: string;
  pos_profile: string;
}

/**
 * Data required to create a Sub POS Closing document. Mirrors the fields
 * consumed by SubPOSClosing.validate() (pos_profile, pos_opening_entry,
 * user, period_start_date) plus any other fields the caller wants to set;
 * docstatus is always forced to 0 on create.
 */
export interface SubPosClosingCreateData {
  pos_profile: string;
  pos_opening_entry: string;
  user: string;
  period_start_date: string;
  [key: string]: unknown;
}

/**
 * Data required to create a POS Closing Entry document. Mirrors the fields
 * on POSClosingEntry (pos_profile, pos_opening_entry, user, company,
 * period_start_date, period_end_date) plus any other fields the caller
 * wants to set; docstatus is always forced to 0 on create.
 */
export interface PosClosingEntryCreateData {
  pos_profile: string;
  pos_opening_entry: string;
  user: string;
  company: string;
  period_start_date: string;
  period_end_date: string;
  [key: string]: unknown;
}

/**
 * Returns the POS Profile name for the current session's branch.
 * Wraps ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_profile (no args).
 */
export async function getSubPosClosingProfile(): Promise<string> {
  try {
    const response = await call.get<{ message: string }>(
      'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_profile'
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching POS profile for Sub POS Closing:', error);
    throw error;
  }
}

/**
 * Wraps ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_cashiers(...),
 * the sub-cashier close's cashier link-query method.
 */
export async function getSubPosClosingCashiers(
  args: GetCashiersArgs
): Promise<CashierOption[]> {
  try {
    const response = await call.get<{ message: CashierOption[] }>(
      'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_cashiers',
      args as unknown as Record<string, unknown>
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching cashiers for Sub POS Closing:', error);
    throw error;
  }
}

/**
 * Wraps erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_cashiers(...),
 * the main-cashier close's cashier link-query method.
 */
export async function getPosClosingEntryCashiers(
  args: GetCashiersArgs
): Promise<CashierOption[]> {
  try {
    const response = await call.get<{ message: CashierOption[] }>(
      'erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_cashiers',
      args as unknown as Record<string, unknown>
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching cashiers for POS Closing Entry:', error);
    throw error;
  }
}

/**
 * Returns the currently open POS Opening Entries for a POS Profile.
 * Wraps ury.ury_pos.api.get_open_pos_opening_entries(pos_profile)
 * (added by task C0).
 */
export async function getOpenPosOpeningEntries(
  posProfile: string
): Promise<OpenPosOpeningEntry[]> {
  try {
    const response = await call.get<{ message: OpenPosOpeningEntry[] }>(
      'ury.ury_pos.api.get_open_pos_opening_entries',
      { pos_profile: posProfile }
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching open POS Opening Entries:', error);
    throw error;
  }
}

/**
 * Sub-cashier path: returns the full POS Invoice dicts (with taxes and
 * payments) for a single cashier within a time window.
 * Wraps ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_invoices(start, end, pos_profile, user).
 */
export async function getSubCashierPosInvoices(
  start: string,
  end: string,
  posProfile: string,
  user: string
): Promise<POSClosingInvoice[]> {
  try {
    const response = await call.get<{ message: POSClosingInvoice[] }>(
      'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_invoices',
      { start, end, pos_profile: posProfile, user }
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching sub-cashier POS invoices:', error);
    throw error;
  }
}

/**
 * Main-cashier / single-cashier path.
 * Wraps erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_invoices(start, end, pos_profile, user).
 *
 * ERPNext v16 returns {invoices, payments, taxes} with payments pre-aggregated
 * by mode_of_payment (change_amount already deducted server-side). Legacy
 * responses that are a bare array of invoice dicts are returned as-is.
 */
export async function getMainCashierPosInvoices(
  start: string,
  end: string,
  posProfile: string,
  user: string
): Promise<POSClosingData | POSClosingInvoice[]> {
  try {
    const response = await call.get<{ message: POSClosingData | POSClosingInvoice[] }>(
      'erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry.get_invoices',
      { start, end, pos_profile: posProfile, user }
    );

    const msg = response.message;
    if (msg && !Array.isArray(msg) && Array.isArray((msg as POSClosingData).invoices)) {
      const data = msg as POSClosingData;
      return { invoices: data.invoices, payments: data.payments, taxes: data.taxes };
    }

    return msg as POSClosingInvoice[];
  } catch (error) {
    console.error('Error fetching main-cashier POS invoices:', error);
    throw error;
  }
}

/**
 * Creates a new Sub POS Closing document as a draft (docstatus: 0).
 */
export async function createSubPosClosing(
  data: SubPosClosingCreateData
): Promise<{ name: string }> {
  return db.createDoc('Sub POS Closing', { ...data, docstatus: 0 });
}

/**
 * Submits an existing Sub POS Closing document (docstatus: 1).
 */
export async function submitSubPosClosing(
  name: string
): Promise<{ name: string }> {
  return db.updateDoc('Sub POS Closing', name, { docstatus: 1 });
}

/**
 * Creates a new POS Closing Entry document as a draft (docstatus: 0).
 */
export async function createPosClosingEntry(
  data: PosClosingEntryCreateData
): Promise<{ name: string }> {
  return db.createDoc('POS Closing Entry', { ...data, docstatus: 0 });
}

/**
 * Submits an existing POS Closing Entry document (docstatus: 1).
 */
export async function submitPosClosingEntry(
  name: string
): Promise<{ name: string }> {
  return db.updateDoc('POS Closing Entry', name, { docstatus: 1 });
}
