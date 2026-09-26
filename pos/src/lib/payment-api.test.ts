import { beforeEach, describe, expect, it, vi } from 'vitest';

const callGetMock = vi.fn();

vi.mock('@ury/core', () => ({
  call: {
    get: (...args: any[]) => callGetMock(...args),
  },
}));

import { getPaymentModes } from './payment-api';

describe('payment-api', () => {
  beforeEach(() => {
    callGetMock.mockReset();
    sessionStorage.clear();
  });

  it('calls the correct method path with no payload and maps response to a string array', async () => {
    callGetMock.mockResolvedValueOnce({
      message: [
        { mode_of_payment: 'Cash', opening_amount: 100 },
        { mode_of_payment: 'Card', opening_amount: 0 },
      ],
    });

    const result = await getPaymentModes();

    expect(callGetMock).toHaveBeenCalledWith('ury.ury_pos.api.getModeOfPayment');
    expect(result).toEqual(['Cash', 'Card']);
  });

  it('caches the result in sessionStorage and serves subsequent calls from cache', async () => {
    callGetMock.mockResolvedValueOnce({
      message: [{ mode_of_payment: 'Cash', opening_amount: 100 }],
    });

    const first = await getPaymentModes();
    const second = await getPaymentModes();

    expect(callGetMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(['Cash']);
    expect(second).toEqual(['Cash']);
    expect(JSON.parse(sessionStorage.getItem('payment_modes')!)).toEqual(['Cash']);
  });

  it('propagates a server exception without swallowing it', async () => {
    const error = new Error('Internal Server Error');
    callGetMock.mockRejectedValueOnce(error);

    await expect(getPaymentModes()).rejects.toThrow('Internal Server Error');
  });

  it('propagates a 403 permission error', async () => {
    const error = Object.assign(new Error('Forbidden'), { httpStatus: 403 });
    callGetMock.mockRejectedValueOnce(error);

    await expect(getPaymentModes()).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('propagates a network failure', async () => {
    callGetMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(getPaymentModes()).rejects.toThrow('Failed to fetch');
  });
});
