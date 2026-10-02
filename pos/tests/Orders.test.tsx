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
import { useRootStore } from '../src/store/root-store';

const state = vi.hoisted(() => ({
  order: {
    name: 'POS-INV-1', status: 'Draft', invoice_printed: 1,
    grand_total: 40, rounded_total: 40, net_total: 40,
    total_taxes_and_charges: 0, restaurant_table: 'Table 1',
    cashier: 'cashier@example.com', waiter: 'Waiter', customer: 'Customer',
    mobile_number: '', posting_date: '2026-10-02', posting_time: '10:00:00',
    order_type: 'Dine In',
    age_minutes: 42, items_preview: [{ item_name: 'Soup', qty: 2 }],
    custom_split_from: '', custom_merged_pos_invoice: '', custom_merged_total: 0,
  },
  items: [{ name: 'ROW-1', item_name: 'Soup', qty: 2, rate: 20, amount: 40 }],
  fetchOrders: vi.fn(), selectOrder: vi.fn(), setSelectedStatus: vi.fn(),
  profile: { name: 'POS-1', print_format: 'Bill', view_all_status: 1, paid_limit: 10 },
  selectedStatus: '',
  error: null as string | null,
}));

vi.mock('../src/store/root-store', () => ({
  useRootStore: () => ({
    orders: [state.order], selectedOrder: state.order, selectedOrderItems: state.items,
    selectedOrderTaxes: [], selectedStatus: state.selectedStatus || state.order.status,
    orderLoading: false, selectedOrderLoading: false, error: state.error, selectedOrderError: null,
    pagination: { currentPage: 1, hasNextPage: false, hasPreviousPage: false },
    fetchOrders: state.fetchOrders, selectOrder: state.selectOrder,
    setSelectedStatus: state.setSelectedStatus, goToNextPage: vi.fn(),
    goToPreviousPage: vi.fn(), clearSelectedOrder: vi.fn(), orderSearchQuery: '',
  }),
}));
Object.assign(useRootStore, {
  getState: () => ({ orders: [state.order] }),
  setState: vi.fn(),
});
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
  state.selectedStatus = '';
  state.error = null;
  state.order.custom_split_from = '';
  state.order.custom_merged_pos_invoice = '';
  state.order.custom_merged_total = 0;
  state.items = [{ name: 'ROW-1', item_name: 'Soup', qty: 2, rate: 20, amount: 40 }];
  vi.spyOn(call, 'get').mockImplementation(async (method) => {
    if (method === 'frappe.client.get_list') return { message: [] };
    if (method === 'ury.ury_pos.api.getPosInvoiceItems') return { message: [[], []] };
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
    ['Draft', true], ['Unbilled', true], ['Recently Paid', false],
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
    { status: 'Recently Paid', printed: 1, quantities: [2], visible: false },
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

describe('Outstanding settlement working area', () => {
  beforeEach(() => { state.selectedStatus = 'Outstanding'; });

  it('renders Outstanding first and the bill-request strip above the cards', async () => {
    await renderOrders();
    const tabs = Array.from(container.querySelectorAll('nav button'));
    expect(tabs[0]?.textContent).toBe('Outstanding');
    expect(container.textContent).toContain('Bill requests: 0 waiting');
    const strip = container.querySelector('[aria-label="Bill requests"]');
    const card = container.querySelector('h3[title="POS-INV-1"]');
    expect(strip).not.toBeNull();
    expect(strip!.compareDocumentPosition(card!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it.each([0, 1])('shows server age, printed=$printed state, waiter, items and existing split/merge badges', async (printed) => {
    state.order.invoice_printed = printed;
    state.order.custom_split_from = 'POS-PARENT';
    state.order.custom_merged_pos_invoice = 'POS-MERGED';
    state.order.custom_merged_total = 10;
    await renderOrders();
    const card = container.querySelector('h3[title="POS-INV-1"]')!.closest('[class*="cursor-pointer"]')!;
    for (const content of ['42 min', printed ? 'Printed' : 'Not printed', 'Waiter', '2× Soup', 'Dine In', '50', 'Split bill', 'Merged bill']) {
      expect(card.textContent).toContain(content);
    }
  });

  it('printing reloads Outstanding without switching filters', async () => {
    const row = await renderOrders();
    state.fetchOrders.mockClear();
    await act(async () => buttonIn(row, 'Print bill')!.click());
    expect(state.setSelectedStatus).not.toHaveBeenCalled();
    expect(state.fetchOrders).toHaveBeenCalledOnce();
  });

  it('splitting a printed table check reloads Outstanding without moving to Unbilled', async () => {
    vi.spyOn(call, 'post').mockResolvedValue({ message: { new_invoice: 'POS-CHILD' } });
    const row = await renderOrders();
    await act(async () => buttonIn(row, 'Split bill')!.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    await act(async () => (dialog.querySelector('[role="button"]') as HTMLElement).click());
    await act(async () => dialog.querySelector<HTMLButtonElement>('button:has(svg.lucide-minus)')!.click());
    state.fetchOrders.mockClear();
    await act(async () => buttonIn(dialog, 'Split bill')!.click());
    expect(call.post).toHaveBeenCalled();
    expect(state.setSelectedStatus).not.toHaveBeenCalled();
    expect(state.fetchOrders).toHaveBeenCalledOnce();
  });

  it('keeps the strip available while the invoice queue is unavailable', async () => {
    // Queue failure must not conceal the independently readable native request records.
    state.error = 'Invoice list unavailable';
    await act(async () => root.render(<MemoryRouter><Orders /></MemoryRouter>));
    expect(container.textContent).toContain('Invoice list unavailable');
    expect(container.textContent).toContain('Bill requests: 0 waiting');
  });
});
