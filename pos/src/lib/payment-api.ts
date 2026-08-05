import { call, repositories } from '@ury/core';

interface PaymentMode {
  mode_of_payment: string;
  opening_amount: number;
}

interface PaymentModeResponse {
  message: PaymentMode[];
}

export const getPaymentModes = async (): Promise<string[]> => {
  // Try online API call first
  try {
    const response = await call.get<PaymentModeResponse>("ury.ury_pos.api.getModeOfPayment");
    const paymentModes = response.message.map((mode: PaymentMode) => mode.mode_of_payment);

    // Cache in IndexedDB repository
    await repositories.paymentModes.putMany(
      paymentModes.map(name => ({
        id: name,
        name,
        enabled: true,
      }))
    );

    // Cache in session storage for legacy compatibility
    sessionStorage.setItem('payment_modes', JSON.stringify(paymentModes));

    return paymentModes;
  } catch (error) {
    console.warn('Network request failed, falling back to local PaymentModes repository:', error);

    // Repository offline fallback
    const cachedModes = await repositories.paymentModes.findEnabled();
    if (cachedModes && cachedModes.length > 0) {
      return cachedModes.map(m => m.name);
    }

    // Secondary fallback: check session storage
    const cachedSession = sessionStorage.getItem('payment_modes');
    if (cachedSession) {
      return JSON.parse(cachedSession);
    }

    throw error;
  }
};