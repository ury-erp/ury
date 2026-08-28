import { call, db } from '@ury/core';

export interface POSOpeningResponse {
  message: number;
}

export interface POSCloseValidationResponse {
  message: string;
}

export const checkPOSOpening = async (): Promise<POSOpeningResponse> => {
  try {
    const response = await call.get<POSOpeningResponse>(
      'ury.ury_pos.api.posOpening'
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
 * Represents a mode of payment with opening amount.
 */
export interface ModeOfPaymentOption {
  mode_of_payment: string;
  opening_amount: number;
}

/**
 * Returns the list of available payment modes for the current session's POS Profile.
 * Wraps ury.ury_pos.api.getModeOfPayment (no args).
 */
export async function getModeOfPayment(): Promise<ModeOfPaymentOption[]> {
  try {
    const response = await call.get<{ message: ModeOfPaymentOption[] }>(
      'ury.ury_pos.api.getModeOfPayment'
    );

    return response.message;
  } catch (error) {
    console.error('Error fetching mode of payment:', error);
    throw error;
  }
}

/**
 * Data required to create a POS Opening Entry document.
 */
export interface PosOpeningEntryCreateData {
  period_start_date: string;
  posting_date: string;
  company: string;
  pos_profile: string;
  user: string;
  balance_details: Array<{
    mode_of_payment: string;
    opening_amount: number;
  }>;
  [key: string]: unknown;
}

/**
 * Creates a new POS Opening Entry document as a draft (docstatus: 0).
 */
export async function createPosOpeningEntry(
  data: PosOpeningEntryCreateData
): Promise<{ name: string }> {
  return db.createDoc('POS Opening Entry', { ...data, docstatus: 0 });
}

/**
 * Submits an existing POS Opening Entry document (docstatus: 1).
 */
export async function submitPosOpeningEntry(
  name: string
): Promise<{ name: string }> {
  return db.updateDoc('POS Opening Entry', name, { docstatus: 1 });
}
