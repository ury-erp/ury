import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@ury/core';
import { initI18n } from '../src/i18n';
import { getMainCashierPosInvoices, getOpenPosOpeningEntries } from '../src/lib/pos-closing-api';
import POSClosingDialog from '../src/components/POSClosingDialog';

const state = vi.hoisted(() => ({
  profile: { name: 'POS-1', company: 'Test Co', multiple_cashier: 0, custom_blind_cash_count: 1 as number | undefined },
  user: { name: 'cashier@example.com' },
}));

vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({ posProfile: state.profile }) }));
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

async function renderClosing() {
  await act(async () => root.render(<POSClosingDialog open onOpenChange={() => {}} />));
  expect(container.querySelector('input[type="number"]')).not.toBeNull();
  return container.textContent || '';
}

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

  it.each([0, undefined])('keeps both totals visible when blind count is %s', async (flag) => {
    state.profile.custom_blind_cash_count = flag;
    const text = await renderClosing();
    expect(text).toContain('Grand Total');
    expect(text).toContain('654.32');
    expect(text).toContain('Net Total');
    expect(text).toContain('600.11');
  });
});
