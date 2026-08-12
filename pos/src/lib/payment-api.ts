import { call, apiRegistry } from '@ury/core';

interface PaymentMode {
  mode_of_payment: string;
  opening_amount: number;
}

interface PaymentModeResponse {
  message: PaymentMode[];
}

export const getPaymentModes = async (): Promise<string[]> => {
  const endpoint = apiRegistry.getUrl('GET_MODE_OF_PAYMENT');
  const response = await call.get<PaymentModeResponse>(endpoint);
  return response.message.map((mode: PaymentMode) => mode.mode_of_payment);
};
