import { call } from './frappe-sdk';
import { getErrorMessage } from './error-utils';

interface PaymentMode {
  mode_of_payment: string;
  opening_amount: number;
}

interface PaymentModeResponse {
  message: PaymentMode[];
}

export const getPaymentModes = async (): Promise<string[]> => {
  // Check session storage first
  const cached = sessionStorage.getItem('payment_modes');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      sessionStorage.removeItem('payment_modes');
    }
  }

  try {
    const response = await call.get<PaymentModeResponse>("ury.ury_pos.api.getModeOfPayment");

    const paymentModes = response.message.map((mode:PaymentMode) => mode.mode_of_payment);
    
    // Cache in session storage
    sessionStorage.setItem('payment_modes', JSON.stringify(paymentModes));
    
    return paymentModes;
  } catch (error) {
    throw new Error(`Failed to fetch payment modes: ${getErrorMessage(error)}`);
  }
}; 