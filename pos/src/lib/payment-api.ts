import { call } from './frappe-sdk';
import { handleApiError } from './error-handler';

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
    return JSON.parse(cached);
  }

  try {
    const response = await call.get<PaymentModeResponse>("ury.ury_pos.api.getModeOfPayment");

    const paymentModes = response.message.map((mode: PaymentMode) => mode.mode_of_payment);
    sessionStorage.setItem('payment_modes', JSON.stringify(paymentModes));

    return paymentModes;
  } catch (error) {
    console.error('Failed to fetch payment modes:', error);
    const errorMessage = handleApiError(error);
    throw new Error(errorMessage);
  }
}; 