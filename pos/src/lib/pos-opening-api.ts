import { call } from '@ury/core';

export interface POSOpeningEntryRef {
  name: string;
  company: string;
  pos_profile: string;
  branch?: string;
  period_start_date?: string;
  status?: string;
}

export interface POSOpeningResponse {
  message: number | POSOpeningEntryRef[];
}

export interface POSCloseValidationResponse {
  message: string;
}

export interface POSOpeningAllowedProfile {
  name: string;
  label?: string;
}

export interface POSOpeningPaymentMode {
  mode_of_payment: string;
  opening_amount?: number;
}

export interface POSOpeningMultiCashierFlags {
  enabled: boolean;
  main_cashier_open: boolean;
  main_cashier_configured: boolean;
}

export interface POSOpeningPermissions {
  create: boolean;
  submit: boolean;
}

export interface POSOpeningContext {
  company: string;
  company_currency?: string;
  currency_symbol?: string;
  allowed_profiles: POSOpeningAllowedProfile[];
  selected_profile: string | null;
  payment_modes: POSOpeningPaymentMode[];
  user: string;
  user_full_name?: string;
  branch: string;
  restaurant: string;
  rooms?: string[];
  session_start?: string;
  daily_close_pending: boolean;
  multi_cashier: POSOpeningMultiCashierFlags;
  permissions: POSOpeningPermissions;
}

export interface POSOpeningContextResponse {
  message: POSOpeningContext;
}

export interface POSOpeningBalanceDetail {
  mode_of_payment: string;
  opening_amount: number;
}

export type POSOpeningPayment = POSOpeningBalanceDetail;

export interface POSOpeningPayload {
  pos_profile: string;
  company: string;
  balance_details: POSOpeningBalanceDetail[];
}

export interface POSOpeningEntry {
  name: string;
  docstatus: number;
  status?: string;
  company: string;
  pos_profile: string;
  user: string;
  branch?: string;
  restaurant?: string;
  period_start_date?: string;
  posting_date?: string;
  balance_details?: POSOpeningBalanceDetail[];
}

export interface POSOpeningCreateResponse {
  message: POSOpeningEntry;
}

/**
 * Extract the first human-readable message from a Frappe server error.
 * Frappe wraps server errors in `_server_messages` as a JSON string of an array,
 * where each element is itself a JSON-encoded object containing `message`.
 */
export const parseFrappeError = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;

  const serverMessages = (error as { _server_messages?: string })._server_messages;
  if (typeof serverMessages !== 'string') return null;

  try {
    const messages = JSON.parse(serverMessages) as string[];
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const firstMessage = JSON.parse(messages[0]) as { message?: string };
    return firstMessage.message || null;
  } catch {
    return null;
  }
};

/**
 * Check whether the current user already has an open POS Opening Entry.
 *
 * Uses ERPNext's user-wide `check_opening_entry` rather than the branch-wide
 * URY `posOpening()` method, so multi-cashier branches still require each
 * cashier to open their own session.
 */
export const checkPOSOpening = async (user?: string): Promise<POSOpeningResponse> => {
  try {
    const params = user ? { user } : undefined;
    const response = await call.get<POSOpeningResponse>(
      'erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry',
      params
    );

    return response;
  } catch (error) {
    console.error('Error checking POS opening status:', error);
    throw error;
  }
};

export const validatePOSClose = async (posProfile: string): Promise<POSCloseValidationResponse> => {
  try {
    const response = await call.get<POSCloseValidationResponse>(
      'ury.ury_pos.api.validate_pos_close',
      {
        pos_profile: posProfile
      }
    );

    return response;
  } catch (error) {
    console.error('Error validating POS close status:', error);
    throw error;
  }
};

/**
 * Fetch everything the POS Opening screen needs in one round-trip.
 * Optionally pass a POS Profile name to load payment modes for that profile.
 */
export const getPOSOpeningContext = async (posProfile?: string): Promise<POSOpeningContext> => {
  try {
    const params = posProfile ? { pos_profile: posProfile } : undefined;
    const response = await call.get<POSOpeningContextResponse>(
      'ury.ury_pos.api.get_pos_opening_screen_data',
      params
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching POS opening context:', error);
    throw error;
  }
};

/**
 * Create and submit a POS Opening Entry atomically via ERPNext's
 * `create_opening_voucher`. URY hooks (room assignment, multi-cashier checks,
 * last-invoice seeding) fire automatically through DocType events.
 */
export const createPOSOpening = async (data: POSOpeningPayload): Promise<POSOpeningEntry> => {
  try {
    const response = await call.post<POSOpeningCreateResponse>(
      'ury.ury_pos.api.create_pos_opening_entry',
      {
        pos_profile: data.pos_profile,
        company: data.company,
        balance_details: data.balance_details
      }
    );

    return response.message;
  } catch (error) {
    console.error('Error creating POS opening entry:', error);
    throw error;
  }
};
