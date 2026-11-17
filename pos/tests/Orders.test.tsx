import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import preset from '@ury/ui/tailwind-preset';
import { call } from '@ury/core';
import { initI18n } from '../src/i18n';
import { printOrder } from '../src/lib/print';
import Orders from '../src/pages/Orders';

const state = vi.hoisted(() => ({
  order: {
    name: 'POS-INV-1', status: 'Draft', invoice_printed: 1,
    grand_total: 40, rounded_total: 40, net_total: 40,
    total_taxes_and_charges: 0, restaurant_table: 'Table 1',
    cashier: 'cashier@example.com', waiter: 'Waiter', customer: 'Customer',
    mobile_number: '', posting_date: '2026-10-02', posting_time: '10:00:00',
    order_type: 'Dine In',
  },
  items: [{ name: 'ROW-1', item_name: 'Soup', qty: 2, rate: 20, amount: 40 }],
  fetchOrders: vi.fn(), selectOrder: vi.fn(), setSelectedStatus: vi.fn(),
  profile: { name: 'POS-1', print_format: 'Bill', view_all_status: 1, paid_limit: 10 },
}));

vi.mock('../src/store/root-store', () => ({
  useRootStore: () => ({
    orders: [state.order], selectedOrder: state.order, selectedOrderItems: state.items,
    selectedOrderTaxes: [], selectedStatus: state.order.status,
    orderLoading: false, selectedOrderLoading: false, error: null, selectedOrderError: null,
    pagination: { currentPage: 1, hasNextPage: false, hasPreviousPage: false },
    fetchOrders: state.fetchOrders, selectOrder: state.selectOrder,
    setSelectedStatus: state.setSelectedStatus, goToNextPage: vi.fn(),
    goToPreviousPage: vi.fn(), clearSelectedOrder: vi.fn(), orderSearchQuery: '',
  }),
}));
vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({ posProfile: state.profile }) }));
// Printing and Frappe calls are external boundaries; keep the page, menu and dialogs real.
vi.mock('../src/lib/print', () => ({ printOrder: vi.fn().mockResolvedValue(undefined) }));

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  const css = await postcss([tailwindcss({
    presets: [preset],
    content: ['../src/pages/Orders.tsx', '../../packages/ui/src/components/button.tsx'].map((path) => ({
      raw: readFileSync(new URL(path, import.meta.url), 'utf8'), extension: 'tsx',
    })),
  })]).process('@tailwind utilities;', { from: undefined });
  const style = document.createElement('style');
  style.textContent = css.css;
  document.head.appendChild(style);
});

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  await initI18n('en');
  state.order.status = 'Draft';
  state.order.invoice_printed = 1;
  state.items = [{ name: 'ROW-1', item_name: 'Soup', qty: 2, rate: 20, amount: 40 }];
  vi.spyOn(call, 'get').mockImplementation(async (method) => {
    if (method === 'frappe.client.has_permission') return { message: { has_permission: false } };
    if (method === 'ury.ury_pos.api.get_split_group') return { message: { invoices: [], current: 'POS-INV-1', group: null } };
    throw new Error(`Unexpected Frappe call: ${method}`);
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

async function renderOrders() {
  await act(async () => root.render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Orders /></MemoryRouter>,
  ));
  const row = container.querySelector('.sticky.bottom-0');
  expect(row).not.toBeNull();
  return row!;
}

function buttonIn(scope: Element, label: string) {
  return Array.from(scope.querySelectorAll('button')).find((button) => button.textContent?.trim() === label);
}

describe('Orders visible cashier actions', () => {
  it.each([
    ['Draft', 'Print bill'], ['Unbilled', 'Print bill'],
    ['Recently Paid', 'Print receipt'], ['Paid', 'Print receipt'],
    ['Consolidated', 'Print receipt'], ['Return', 'Print receipt'],
  ])('labels printing for %s as %s', async (status, label) => {
    state.order.status = status;
    const row = await renderOrders();
    expect(buttonIn(row, label)).toBeDefined();
    expect(buttonIn(row, label === 'Print bill' ? 'Print receipt' : 'Print bill')).toBeUndefined();
  });

  it.each([
    ['Draft', true], ['Unbilled', true], ['Recently Paid', true],
    ['Paid', false], ['Consolidated', false], ['Return', false],
  ])('preserves settlement visibility for %s with the Settle bill label', async (status, visible) => {
    state.order.status = status as string;
    const row = await renderOrders();
    expect(!!buttonIn(row, 'Settle bill')).toBe(visible);
    expect(buttonIn(row, 'Payment')).toBeUndefined();
  });

  it.each([
    { status: 'Draft', printed: 0, quantities: [1, 1], visible: true },
    { status: 'Draft', printed: 1, quantities: [2], visible: true },
    { status: 'Unbilled', printed: 0, quantities: [2], visible: true },
    { status: 'Recently Paid', printed: 1, quantities: [2], visible: true },
    { status: 'Paid', printed: 1, quantities: [2], visible: false },
    { status: 'Consolidated', printed: 1, quantities: [2], visible: false },
    { status: 'Return', printed: 1, quantities: [2], visible: false },
    { status: 'Draft', printed: 0, quantities: [], visible: false },
    { status: 'Draft', printed: 1, quantities: [1], visible: false },
    { status: 'Draft', printed: 2, quantities: [2], visible: false },
    { status: 'Draft', printed: '0', quantities: [2], visible: true },
    { status: 'Draft', printed: '1', quantities: [2], visible: true },
  ])('matches menu split eligibility for $status, printed=$printed, quantities=$quantities', async ({ status, printed, quantities, visible }) => {
    state.order.status = status;
    state.order.invoice_printed = printed as number;
    state.items = quantities.map((qty, index) => ({
      name: `ROW-${index + 1}`, item_name: 'Soup', qty, rate: 20, amount: qty * 20,
    }));
    const row = await renderOrders();
    const visibleSplit = buttonIn(row, 'Split bill');
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Order actions"]');
    if (trigger) await act(async () => trigger.click());
    const menuSplit = Array.from(container.querySelectorAll('button'))
      .find((button) => !row.contains(button) && button.textContent?.trim() === 'Split bill');
    expect(!!menuSplit).toBe(visible);
    expect(!!visibleSplit).toBe(visible);
  });

  it.each(['visible', 'menu'])('opens the native split dialog from the %s action', async (entry) => {
    const row = await renderOrders();
    if (entry === 'menu') {
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Order actions"]')!.click());
    }
    const split = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.trim() === 'Split bill' && row.contains(button) === (entry === 'visible'),
    );
    expect(split).toBeDefined();
    await act(async () => split!.click());
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Split bill');
    expect(dialog?.textContent).toContain('POS-INV-1');
    expect(dialog?.textContent).toContain('Soup');
  });

  it.each(['Print bill', 'Split bill', 'Settle bill'])('gives %s a minimum 44px touch height', async (label) => {
    const row = await renderOrders();
    const button = buttonIn(row, label);
    expect(button).toBeDefined();
    const minimum = getComputedStyle(button!).minHeight;
    const pixels = parseFloat(minimum) * (minimum.endsWith('rem') ? 16 : 1);
    expect(pixels).toBeGreaterThanOrEqual(44);
  });

  it('keeps the native printer and print-before-settlement guard', async () => {
    state.order.invoice_printed = 0;
    const row = await renderOrders();
    const settle = buttonIn(row, 'Settle bill');
    const print = buttonIn(row, 'Print bill');
    expect(settle).toBeDefined();
    expect(print).toBeDefined();
    await act(async () => settle!.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => print!.click());
    expect(printOrder).toHaveBeenCalledWith({
      orderId: 'POS-INV-1', posProfile: state.profile, printFormat: 'Bill',
    });
  });

  it.each([
    { lang: 'fr', print: 'Imprimer l’addition', receipt: 'Imprimer le reçu', split: "Diviser l'addition", settle: 'Régler l’addition' },
    { lang: 'ar', print: 'طباعة الفاتورة', receipt: 'طباعة الإيصال', split: 'تقسيم الفاتورة', settle: 'تسوية الفاتورة' },
  ])('uses $lang translations for the visible actions and paid receipt', async ({ lang, print, receipt, split, settle }) => {
    await initI18n(lang);
    const row = await renderOrders();
    for (const label of [print, split, settle]) expect(buttonIn(row, label)).toBeDefined();
    state.order.status = 'Paid';
    const paidRow = await renderOrders();
    expect(buttonIn(paidRow, receipt)).toBeDefined();
    expect(buttonIn(paidRow, settle)).toBeUndefined();
  });
});
