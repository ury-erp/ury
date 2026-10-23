import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { posClosing } from './posClosing.js';

vi.mock('../router', () => ({ default: { push: vi.fn() } }));
vi.mock('./Alert.js', () => ({ useAlert: () => ({ createAlert: vi.fn() }) }));
vi.mock('./invoiceData.js', () => ({
  useInvoiceDataStore: () => ({ company: 'Test Co', posProfile: 'POS-1' }),
}));
vi.mock('./frappeSdk.js', () => ({
  default: { call: () => ({}), db: () => ({ createDoc: vi.fn().mockResolvedValue({ name: 'POS-CLO-1' }) }) },
}));

beforeEach(() => setActivePinia(createPinia()));

describe('legacy main closing includes opening float', () => {
  it.each([
    { opening: 50000, sales: 20000, count: 70000, expected: 70000, difference: 0 },
    { opening: 50000, sales: 20000, count: 69000, expected: 70000, difference: -1000 },
    { opening: 50000, sales: 20000, count: 71000, expected: 70000, difference: 1000 },
    { opening: 50000, sales: 20000, count: undefined, expected: 70000, difference: -70000 },
    { opening: 50000, sales: undefined, count: 50000, expected: 50000, difference: 0 },
    { opening: '50000', sales: 20000, count: 70000, expected: 70000, difference: 0 },
    { opening: 0, sales: 20000, count: 20000, expected: 20000, difference: 0 },
  ])('submits expected $expected and difference $difference for opening $opening, sales $sales, count $count', ({ opening, sales, count, expected, difference }) => {
    const store = posClosing();
    store.openingBalance = [
      { mode_of_payment: 'Cash', opening_amount: opening, ...(count === undefined ? {} : { closing_amount: count }) },
      { mode_of_payment: 'Mobile Money', opening_amount: 0, closing_amount: 5000 },
    ];
    store.payments = [
      ...(sales === undefined ? [] : [{ mode_of_payment: 'Cash', expected_amount: sales }]),
      { mode_of_payment: 'Mobile Money', expected_amount: 5000 },
    ];

    store.savePosClosing();

    expect(store.db.createDoc).toHaveBeenCalledExactlyOnceWith('POS Closing Entry', expect.objectContaining({
      docstatus: 0,
      payment_reconciliation: [
        {
          mode_of_payment: 'Cash', opening_amount: opening,
          ...(count === undefined ? {} : { closing_amount: count }),
          expected_amount: expected, difference,
        },
        { mode_of_payment: 'Mobile Money', opening_amount: 0, closing_amount: 5000, expected_amount: 5000, difference: 0 },
      ],
    }));
  });
});
