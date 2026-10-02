import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, db } from '@ury/core';
import POSClosingDialog from '../src/components/POSClosingDialog';
import { initI18n } from '../src/i18n';

const state = vi.hoisted(() => ({
  profile: { name: 'POS-1', company: 'Test Co', multiple_cashier: 0, owner: 'main@example.com' },
  user: { name: 'cashier@example.com' },
}));

vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({ posProfile: state.profile }) }));
vi.mock('../src/store/root-store', () => ({ useRootStore: () => ({ user: state.user }) }));

let container: HTMLDivElement;
let root: Root;
let cashOpening: number | string;
let cashSales: number;
let changeAmount: number;
let includeMobileOpening: boolean;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await initI18n('en');
  state.profile.multiple_cashier = 0;
  cashOpening = 50000;
  cashSales = 20000;
  changeAmount = 0;
  includeMobileOpening = true;

  vi.spyOn(call, 'get').mockImplementation(async <T,>(method: string): Promise<T> => {
    if (method === 'ury.ury_pos.api.get_open_pos_opening_entries') {
      return { message: [{
        name: 'POS-OPE-1', pos_profile: 'POS-1', user: state.user.name,
        period_start_date: '2026-10-02 08:00:00',
      }] } as T;
    }
    if (method === 'ury.ury_pos.api.getPosProfile') {
      return { message: state.profile } as T;
    }
    if (method.endsWith('.get_pos_invoices')) {
      return { message: [{
        name: 'POS-INV-1', grand_total: cashSales + 5000 - changeAmount,
        net_total: cashSales + 5000 - changeAmount, total_qty: 1,
        change_amount: changeAmount, account_for_change_amount: 'Cash Account', taxes: [],
        payments: [
          ...(cashSales ? [{ mode_of_payment: 'Cash', amount: cashSales, account: 'Cash Account' }] : []),
          { mode_of_payment: 'Mobile Money', amount: 5000, account: 'Mobile Account' },
        ],
      }] } as T;
    }
    if (method === 'ury.ury_pos.api.get_checklist') {
      return { message: { items: [], log_name: null, log_status: 'Complete' } } as T;
    }
    throw new Error(`Unexpected closing API call: ${method}`);
  });
  vi.spyOn(db, 'getDoc').mockImplementation(async () => ({
    name: 'POS-OPE-1',
    balance_details: [
      { mode_of_payment: 'Cash', opening_amount: cashOpening },
      ...(includeMobileOpening ? [{ mode_of_payment: 'Mobile Money', opening_amount: 0 }] : []),
    ],
  }));
  vi.spyOn(db, 'createDoc').mockResolvedValue({ name: 'POS-CLO-1' });
  vi.spyOn(db, 'updateDoc').mockResolvedValue({ name: 'POS-CLO-1' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function closeShift(cashCount: number) {
  await act(async () => root.render(<POSClosingDialog open onOpenChange={() => {}} />));
  const rows = Array.from(container.querySelectorAll('tbody tr'));
  expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual(['Cash', 'Mobile Money']);
  for (const row of rows) {
    const input = row.querySelector<HTMLInputElement>('input[type="number"]')!;
    const count = row.querySelector('td')!.textContent === 'Cash' ? cashCount : 5000;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(count));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  const submit = Array.from(container.querySelectorAll('button'))
    .find((button) => button.textContent === 'Close POS')!;
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
  const confirm = Array.from(container.querySelectorAll('button'))
    .find((button) => button.textContent === 'Yes, Close POS')!;
  await act(async () => confirm.click());
}

describe('closing expected drawer includes opening float', () => {
  it.each([
    { cashCount: 70000, difference: 0 },
    { cashCount: 69000, difference: -1000 },
    { cashCount: 71000, difference: 1000 },
  ])('submits expected 70000 and difference $difference for a $cashCount count', async ({ cashCount, difference }) => {
    await closeShift(cashCount);
    expect(db.createDoc).toHaveBeenCalledExactlyOnceWith('POS Closing Entry', expect.objectContaining({
      docstatus: 0,
      payment_reconciliation: [
        { mode_of_payment: 'Cash', opening_amount: 50000, expected_amount: 70000, closing_amount: cashCount, difference },
        { mode_of_payment: 'Mobile Money', opening_amount: 0, expected_amount: 5000, closing_amount: 5000, difference: 0 },
      ],
    }));
    expect(db.updateDoc).toHaveBeenCalledExactlyOnceWith('POS Closing Entry', 'POS-CLO-1', { docstatus: 1 });
  });

  it.each([
    { opening: 50000, sales: 0, count: 50000, expected: 50000 },
    { opening: '50000', sales: 20000, count: 70000, expected: 70000 },
    { opening: 0, sales: 20000, count: 20000, expected: 20000 },
  ])('reconciles opening $opening and sales $sales without changing zero-opening Mobile Money', async ({ opening, sales, count, expected }) => {
    cashOpening = opening;
    cashSales = sales;
    await closeShift(count);
    expect(db.createDoc).toHaveBeenCalledWith('POS Closing Entry', expect.objectContaining({
      payment_reconciliation: [
        { mode_of_payment: 'Cash', opening_amount: Number(opening), expected_amount: expected, closing_amount: count, difference: 0 },
        { mode_of_payment: 'Mobile Money', opening_amount: 0, expected_amount: 5000, closing_amount: 5000, difference: 0 },
      ],
    }));
  });

  it('keeps sales-only modes absent from the opening entry at zero float', async () => {
    includeMobileOpening = false;
    await closeShift(70000);
    expect(db.createDoc).toHaveBeenCalledWith('POS Closing Entry', expect.objectContaining({
      payment_reconciliation: [
        { mode_of_payment: 'Cash', opening_amount: 50000, expected_amount: 70000, closing_amount: 70000, difference: 0 },
        { mode_of_payment: 'Mobile Money', opening_amount: 0, expected_amount: 5000, closing_amount: 5000, difference: 0 },
      ],
    }));
  });

  it('adds opening float to net cash tenders after returning change', async () => {
    cashSales = 22000;
    changeAmount = 2000;
    await closeShift(70000);
    expect(db.createDoc).toHaveBeenCalledWith('POS Closing Entry', expect.objectContaining({
      payment_reconciliation: expect.arrayContaining([
        { mode_of_payment: 'Cash', opening_amount: 50000, expected_amount: 70000, closing_amount: 70000, difference: 0 },
      ]),
    }));
  });

  it('uses the same opening-inclusive reconciliation for sub-cashiers', async () => {
    state.profile.multiple_cashier = 1;
    await closeShift(70000);
    expect(db.createDoc).toHaveBeenCalledExactlyOnceWith('Sub POS Closing', expect.objectContaining({
      docstatus: 0,
      payment_reconciliation: [
        { mode_of_payment: 'Cash', opening_amount: 50000, expected_amount: 70000, closing_amount: 70000, difference: 0 },
        { mode_of_payment: 'Mobile Money', opening_amount: 0, expected_amount: 5000, closing_amount: 5000, difference: 0 },
      ],
    }));
    expect(db.updateDoc).toHaveBeenCalledExactlyOnceWith('Sub POS Closing', 'POS-CLO-1', { docstatus: 1 });
  });
});
