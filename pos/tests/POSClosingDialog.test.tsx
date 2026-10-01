import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call, db } from '@ury/core';
import { initI18n } from '../src/i18n';
import { getMainCashierPosInvoices, getOpenPosOpeningEntries } from '../src/lib/pos-closing-api';
import POSClosingDialog from '../src/components/POSClosingDialog';

const state = vi.hoisted(() => ({
  profile: { name: 'POS-1', company: 'Test Co', multiple_cashier: 0, custom_blind_cash_count: 1 as number | undefined },
  paymentModes: ['Cash'],
  user: { name: 'cashier@example.com' },
}));

vi.mock('../src/store/pos-store', () => ({
  usePOSStore: () => ({ posProfile: state.profile, paymentModes: state.paymentModes }),
}));
vi.mock('../src/store/root-store', () => ({ useRootStore: () => ({ user: state.user }) }));
vi.mock('../src/lib/pos-closing-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/pos-closing-api')>(),
  getOpenPosOpeningEntries: vi.fn(),
  getMainCashierPosInvoices: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await initI18n('en');
  state.profile.custom_blind_cash_count = 1;
  state.paymentModes = ['Cash'];
  vi.mocked(getOpenPosOpeningEntries).mockResolvedValue([{
    name: 'POS-OPE-1', pos_profile: 'POS-1', user: 'cashier@example.com',
    period_start_date: '2026-10-01 08:10:00',
  }]);
  vi.mocked(getMainCashierPosInvoices).mockResolvedValue([{
    name: 'POS-INV-1', grand_total: 654.32, net_total: 600.11, total_qty: 7,
    change_amount: 0, account_for_change_amount: 'Cash', taxes: [],
    payments: [{ mode_of_payment: 'Cash', amount: 654.32, account: 'Cash' }],
  }]);
  vi.spyOn(db, 'getDoc').mockResolvedValue({
    name: 'POS-OPE-1', balance_details: [{ mode_of_payment: 'Cash', opening_amount: 10 }],
  });
  vi.spyOn(call, 'get').mockImplementation(async <T,>(method: string): Promise<T> => {
    if (method === 'ury.ury.api.ury_server_time.get_server_time') {
      return { message: '2026-10-01T10:12:13.123456' } as T;
    }
    if (method === 'ury.ury_pos.api.get_checklist') {
      return { message: { items: [], log_name: null, log_status: 'Complete' } } as T;
    }
    throw new Error(`Unexpected closing API call: ${method}`);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderClosing(key?: string) {
  await act(async () => root.render(<POSClosingDialog key={key} open onOpenChange={() => {}} />));
  expect(container.querySelector('input[type="number"]')).not.toBeNull();
  return container.textContent || '';
}

async function renderPaymentModes(withCardSales: boolean) {
  vi.mocked(getMainCashierPosInvoices).mockResolvedValue([{
    name: 'POS-INV-1', grand_total: withCardSales ? 150 : 100,
    net_total: withCardSales ? 150 : 100, total_qty: 1,
    change_amount: 0, account_for_change_amount: 'Cash', taxes: [],
    payments: [
      { mode_of_payment: 'Cash', amount: 100, account: 'Cash' },
      ...(withCardSales ? [{ mode_of_payment: 'Card', amount: 50, account: 'Card' }] : []),
    ],
  }]);
  await renderClosing(String(withCardSales));
  return Array.from(container.querySelectorAll('tbody tr'));
}

describe('blind cash count payment modes', () => {
  it.each([
    { profileModes: ['Cash', 'Card', 'Cash'], expectedModes: ['Cash', 'Card'] },
    { profileModes: [], expectedModes: ['Cash'] },
  ])('keeps rows independent of Card sales with cached modes $profileModes', async ({ profileModes, expectedModes }) => {
    state.paymentModes = profileModes;
    const rowsWithoutSales = await renderPaymentModes(false);
    const modesWithoutSales = rowsWithoutSales.map((row) => row.querySelector('td')?.textContent);
    const visibleRowsWithoutSales = rowsWithoutSales.map((row) => row.outerHTML);

    const rowsWithSales = await renderPaymentModes(true);
    const modesWithSales = rowsWithSales.map((row) => row.querySelector('td')?.textContent);
    const visibleRowsWithSales = rowsWithSales.map((row) => row.outerHTML);

    expect(modesWithSales).toEqual(modesWithoutSales);
    expect(modesWithoutSales).toEqual(expectedModes);
    expect(visibleRowsWithSales).toEqual(visibleRowsWithoutSales);
  });

  it.each([0, undefined])('keeps sales-derived rows when blind count is %s', async (flag) => {
    state.profile.custom_blind_cash_count = flag;
    state.paymentModes = ['Cash', 'Card'];

    const rowsWithoutSales = await renderPaymentModes(false);
    expect(rowsWithoutSales.map((row) => row.querySelector('td')?.textContent)).toEqual(['Cash']);

    const rowsWithSales = await renderPaymentModes(true);
    expect(rowsWithSales.map((row) => row.querySelector('td')?.textContent)).toEqual(['Cash', 'Card']);
    expect(rowsWithSales[1].querySelectorAll('td')[2].textContent).toBe('₹ 50');
  });
});

describe('blind cash count reconciliation', () => {
  it('submits sales-only tenders with a zero count without changing the rendered dialog', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // The browser clock precedes opening; both blind-close payloads must still use server time.
    vi.setSystemTime(new Date('2026-10-01T06:31:00'));
    const createDoc = vi.spyOn(db, 'createDoc').mockResolvedValue({ name: 'POS-CLO-1' });
    const updateDoc = vi.spyOn(db, 'updateDoc').mockResolvedValue({ name: 'POS-CLO-1' });

    const dialogMarkup = () => {
      // Remounting changes React's generated title ID, not the cashier-visible UI.
      const titleId = container.querySelector('[role="dialog"]')!.getAttribute('aria-labelledby')!;
      return container.innerHTML.replaceAll(titleId, 'closing-dialog-title');
    };
    const renderedDialogs: string[][] = [];

    for (const withCardSales of [false, true]) {
      const paymentRows = await renderPaymentModes(withCardSales);
      expect(paymentRows.map((row) => row.querySelector('td')?.textContent)).toEqual(['Cash']);
      const beforeCount = dialogMarkup();
      const cashInput = paymentRows[0].querySelector<HTMLInputElement>('input[type="number"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cashInput, '100');
        cashInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const afterCount = dialogMarkup();
      expect(container.querySelectorAll('p.text-amber-700')).toHaveLength(0);

      const submit = Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Close POS')!;
      expect(submit.disabled).toBe(false);
      await act(async () => submit.click());
      renderedDialogs.push([beforeCount, afterCount, dialogMarkup()]);

      const confirm = Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Yes, Close POS')!;
      await act(async () => confirm.click());
    }

    expect(renderedDialogs[1]).toEqual(renderedDialogs[0]);
    expect(getMainCashierPosInvoices).toHaveBeenLastCalledWith(
      '2026-10-01 08:10:00', '2026-10-01 10:12:13', 'POS-1', 'cashier@example.com'
    );
    expect(createDoc).toHaveBeenCalledTimes(2);
    expect(updateDoc).toHaveBeenCalledTimes(2);
    expect(updateDoc).toHaveBeenLastCalledWith('POS Closing Entry', 'POS-CLO-1', { docstatus: 1 });
    expect(createDoc.mock.calls[0]).toEqual(['POS Closing Entry', expect.objectContaining({
      docstatus: 0,
      period_end_date: '2026-10-01 10:12:13',
      posting_date: '2026-10-01',
      posting_time: '10:12:13',
      payment_reconciliation: [{
        mode_of_payment: 'Cash', opening_amount: 10, expected_amount: 100,
        closing_amount: 100, difference: 0,
      }],
    })]);
    expect(createDoc.mock.calls[1]).toEqual(['POS Closing Entry', expect.objectContaining({
      docstatus: 0,
      period_end_date: '2026-10-01 10:12:13',
      posting_date: '2026-10-01',
      posting_time: '10:12:13',
      payment_reconciliation: [
        {
          mode_of_payment: 'Cash', opening_amount: 10, expected_amount: 100,
          closing_amount: 100, difference: 0,
        },
        {
          mode_of_payment: 'Card', opening_amount: 0, expected_amount: 50,
          closing_amount: 0, difference: -50,
        },
      ],
    })]);
  });
});

describe('blind cash count totals', () => {
  it('hides the Grand Total card and its expected amount before the cashier declares', async () => {
    const text = await renderClosing();
    expect(text).not.toContain('Grand Total');
    expect(text).not.toContain('654.32');
  });

  it('hides the Net Total card and its expected amount before the cashier declares', async () => {
    const text = await renderClosing();
    expect(text).not.toContain('Net Total');
    expect(text).not.toContain('600.11');
  });

  it.each([
    { label: 'Total Quantity', value: '7' },
    { label: 'Total Invoices', value: '1' },
  ])('hides the $label card and its sales activity before the cashier declares', async ({ label, value }) => {
    const text = await renderClosing();
    expect(text).not.toContain(label);
    const summaryValues = Array.from(container.querySelectorAll('p.text-lg.font-semibold'))
      .map((summary) => summary.textContent);
    expect(summaryValues).not.toContain(value);
  });

  it.each([0, undefined])('keeps totals and activity summaries visible when blind count is %s', async (flag) => {
    state.profile.custom_blind_cash_count = flag;
    const text = await renderClosing();
    expect(text).toContain('Grand Total');
    expect(text).toContain('654.32');
    expect(text).toContain('Net Total');
    expect(text).toContain('600.11');
    expect(text).toContain('Total Quantity');
    expect(text).toContain('Total Invoices');
    const summaryValues = Array.from(container.querySelectorAll('p.text-lg.font-semibold'))
      .map((summary) => summary.textContent);
    expect(summaryValues).toContain('7');
    expect(summaryValues).toContain('1');
  });
});

async function countPayments(cardSales: number, cashOpening = 10, cashCount = 100, cardCount = 0) {
  vi.mocked(db.getDoc).mockResolvedValue({
    name: 'POS-OPE-1',
    balance_details: [
      { mode_of_payment: 'Cash', opening_amount: cashOpening },
      { mode_of_payment: 'Card', opening_amount: 0 },
    ],
  });
  vi.mocked(getMainCashierPosInvoices).mockResolvedValue([{
    name: 'POS-INV-1', grand_total: 100 + cardSales, net_total: 100 + cardSales, total_qty: 1,
    change_amount: 0, account_for_change_amount: 'Cash', taxes: [],
    payments: [
      { mode_of_payment: 'Cash', amount: 100, account: 'Cash' },
      { mode_of_payment: 'Card', amount: cardSales, account: 'Card' },
    ],
  }]);
  await renderClosing(`${cardSales}:${cashOpening}:${cashCount}:${cardCount}`);

  for (const [mode, amount] of [['Cash', cashCount], ['Card', cardCount]] as const) {
    const row = Array.from(container.querySelectorAll('tbody tr'))
      .find((candidate) => candidate.querySelector('td')?.textContent === mode);
    const input = row?.querySelector<HTMLInputElement>('input[type="number"]');
    expect(input).not.toBeNull();
    expect(input).not.toBeUndefined();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(amount));
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  const submit = Array.from(container.querySelectorAll('button'))
    .find((button) => button.textContent === 'Close POS');
  expect(submit?.disabled).toBe(false);
  return Array.from(container.querySelectorAll('p.text-amber-700'))
    .map((warning) => warning.textContent);
}

describe('blind cash count zero-row warnings', () => {
  it('produces identical warnings for Card sales of 50 and 0 with the same opening and counted amounts', async () => {
    const warningsWithSales = await countPayments(50);
    const warningsWithoutSales = await countPayments(0);

    expect(warningsWithSales).toEqual(warningsWithoutSales);
    expect(warningsWithSales).toEqual([]);
  });

  it('still warns in blind mode when a nonzero opening amount is counted as zero', async () => {
    const warnings = await countPayments(50, 10, 0, 100);
    expect(warnings).toEqual([
      "One or more payment modes were left at 0 despite having activity today. Double-check before submitting.",
    ]);
  });

  it.each([0, undefined])('keeps sales-based warnings when blind count is %s', async (flag) => {
    state.profile.custom_blind_cash_count = flag;
    const warningsWithSales = await countPayments(50);
    const warningsWithoutSales = await countPayments(0);

    expect(warningsWithSales).toEqual([
      "One or more payment modes were left at 0 despite having activity today. Double-check before submitting.",
    ]);
    expect(warningsWithoutSales).toEqual([]);
  });
});
