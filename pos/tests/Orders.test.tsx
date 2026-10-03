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
  empty: false,
  paymentModes: ['Cash'],
}));

vi.mock('../src/store/root-store', () => ({
  useRootStore: () => ({
    orders: state.empty ? [] : [state.order], selectedOrder: state.order, selectedOrderItems: state.items,
    user: { name: 'cashier@example.com', roles: ['URY Cashier'] },
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
vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({
  posProfile: state.profile, paymentModes: state.paymentModes, fetchPaymentModes: state.fetchOrders,
}) }));
// Printing and Frappe calls are external boundaries; keep the page, menu and dialogs real.
vi.mock('../src/lib/print', () => ({ printOrder: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/lib/realtime', () => ({ getRealtimeSocket: async () => { throw new Error('Offline'); } }));

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
  state.empty = false;
  document.cookie = 'user_id=cashier%40example.com';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: [{
    name: 'ALERT-1', for_user: 'cashier@example.com', subject: 'Food ready: Table 1 (KOT-1)',
    creation: '2026-10-03 10:00:00', read: 0, document_type: 'URY KOT', document_name: 'KOT-1',
  }] }) }));
  state.order.custom_split_from = '';
  state.order.custom_merged_pos_invoice = '';
  state.order.custom_merged_total = 0;
  state.items = [{ name: 'ROW-1', item_name: 'Soup', qty: 2, rate: 20, amount: 40 }];
  vi.spyOn(call, 'get').mockImplementation(async (method) => {
    if (method === 'ury.ury_pos.api.getBranch') return { message: 'Branch A' };
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
  vi.useRealTimers();
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

describe('Orders native notifications working area', () => {
  it.each(['normal', 'empty', 'error'])('shows operational notifications alongside the %s queue', async (queue) => {
    state.empty = queue === 'empty';
    state.error = queue === 'error' ? 'Invoice list unavailable' : null;
    await act(async () => root.render(<MemoryRouter><Orders /></MemoryRouter>));
    expect(container.querySelector('[aria-label="Notifications"]')?.textContent).toContain('Food ready: Table 1 (KOT-1)');
  });

  it.each(['Split bill', 'Payment'])('refreshes alerts without resetting the check, filter, focus or %s dialog', async (label) => {
    vi.useFakeTimers();
    const row = await renderOrders();
    if (label === 'Split bill') {
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Order actions"]')!.click());
    }
    const action = label === 'Split bill' ? buttonIn(container, label) : buttonIn(row, label);
    expect(action).toBeDefined();
    await act(async () => action!.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const input = dialog.querySelector<HTMLElement>('input,button')!;
    input.focus();
    const calls = state.fetchOrders.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelector('[aria-label="Notifications"]')?.textContent).toContain('Food ready: Table 1 (KOT-1)');
    expect(container.querySelector('[role="dialog"]')).toBe(dialog);
    expect(document.activeElement).toBe(input);
    expect(state.fetchOrders.mock.calls.length).toBe(calls);
    expect(state.setSelectedStatus).not.toHaveBeenCalled();
    expect(state.selectOrder).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('opens the exact permitted KOT invoice, not another check at the same table', async () => {
    const nativeRead = vi.mocked(call.get).getMockImplementation()!;
    vi.mocked(call.get).mockImplementation(async (method, args: any) => {
      if (method === 'frappe.client.get' && args.doctype === 'URY KOT') return { message: { name: 'KOT-1', invoice: 'POS-OTHER' } };
      if (method === 'frappe.client.get' && args.doctype === 'POS Invoice') return { message: { ...state.order, name: 'POS-OTHER', branch: 'Branch A' } };
      return nativeRead(method, args);
    });
    await renderOrders();
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Open check');
    expect(button, 'food-ready should offer its matching check').toBeDefined();
    await act(async () => button!.click());
    expect(state.selectOrder).toHaveBeenCalledWith(expect.objectContaining({ name: 'POS-OTHER' }));
    expect(state.setSelectedStatus).not.toHaveBeenCalled();
  });

  it.each(['denied', 'missing', 'other branch'])('keeps a native Desk fallback for a %s KOT/check', async (failure) => {
    const nativeRead = vi.mocked(call.get).getMockImplementation()!;
    vi.mocked(call.get).mockImplementation(async (method, args: any) => {
      if (method === 'frappe.client.get' && args.doctype === 'URY KOT') {
        if (failure === 'denied') throw new Error('Denied');
        return { message: { name: 'KOT-1', invoice: failure === 'missing' ? null : 'POS-OTHER' } };
      }
      if (method === 'frappe.client.get' && args.doctype === 'POS Invoice') return { message: { ...state.order, name: 'POS-OTHER', branch: 'Branch B' } };
      return nativeRead(method, args);
    });
    await renderOrders();
    const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Open check');
    expect(button).toBeDefined(); await act(async () => button!.click());
    expect(state.selectOrder).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/app/ury-kot/KOT-1"]')).not.toBeNull();
    expect(container.textContent).toContain('Check unavailable');
  });
});
