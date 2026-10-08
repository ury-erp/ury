import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call } from '@ury/core';
import { showToast } from '@ury/ui';
import { initI18n } from '../src/i18n';
import Orders from '../src/pages/Orders';

const state = vi.hoisted(() => ({
  canCancel: true,
  order: {
    name: 'POS-INV-1', status: 'Draft', invoice_printed: 1,
    grand_total: 40, rounded_total: 40, net_total: 40,
    total_taxes_and_charges: 0, restaurant_table: 'Table 1',
    cashier: 'cashier@example.com', waiter: 'Waiter', customer: 'Customer',
    mobile_number: '', posting_date: '2026-10-04', posting_time: '10:00:00',
    order_type: 'Dine In', age_minutes: 10,
  },
}));

vi.mock('../src/store/root-store', () => ({ useRootStore: () => ({
  orders: [state.order], selectedOrder: state.order,
  selectedOrderItems: [{ name: 'ROW-1', item_name: 'Soup', qty: 2, rate: 20, amount: 40 }],
  selectedOrderTaxes: [], selectedStatus: 'Draft',
  user: { name: 'cashier@example.com', roles: ['URY Cashier'] },
  orderLoading: false, selectedOrderLoading: false, error: null, selectedOrderError: null,
  pagination: { currentPage: 1, hasNextPage: false, hasPreviousPage: false },
  fetchOrders: vi.fn(), selectOrder: vi.fn(), setSelectedStatus: vi.fn(),
  goToNextPage: vi.fn(), goToPreviousPage: vi.fn(), clearSelectedOrder: vi.fn(), orderSearchQuery: '',
}) }));
vi.mock('../src/store/pos-store', () => ({ usePOSStore: () => ({
  posProfile: { name: 'POS-1', view_all_status: 1, paid_limit: 10 },
  paymentModes: ['Cash'], fetchPaymentModes: vi.fn(),
}) }));
vi.mock('../src/lib/realtime', () => ({ getRealtimeSocket: async () => { throw new Error('Offline'); } }));

let container: HTMLDivElement;
let root: Root;
const cancelMethod = 'ury.ury.doctype.ury_order.ury_order.cancel_order';

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.canCancel = true;
  await initI18n('en');
  document.cookie = 'user_id=cashier%40example.com';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: [] }) }));
  vi.spyOn(call, 'get').mockImplementation(async (method) => {
    if (method === 'frappe.client.has_permission') return { message: { has_permission: state.canCancel } };
    if (method === 'ury.ury_pos.api.getBranch') return { message: 'Test Branch' };
    return { message: [] };
  });
  vi.spyOn(call, 'post').mockResolvedValue({ message: null });
  vi.spyOn(showToast, 'error').mockImplementation(() => {});
  vi.spyOn(showToast, 'success').mockImplementation(() => {});
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
}

async function submitReason(reason: string) {
  await renderOrders();
  const cancel = container.querySelector<HTMLButtonElement>('button[aria-label="Cancel order"]');
  expect(cancel).not.toBeNull();
  await act(async () => cancel!.click());
  const dialog = container.querySelector('[role="dialog"]')!;
  const textarea = dialog.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, reason);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const confirm = dialog.querySelector<HTMLButtonElement>('button[data-variant="danger"]')
    || Array.from(dialog.querySelectorAll('button')).find((button) => button.className.includes('bg-red'));
  expect(confirm).toBeDefined();
  await act(async () => confirm!.click());
}

describe('Orders mandatory void reason', () => {
  it.each(['', ' \t\n ', 'a', 'ab', 'abc', '  abc  '])('refuses %j before posting and explains the minimum', async (reason) => {
    await submitReason(reason);
    expect(call.post).not.toHaveBeenCalledWith(cancelMethod, expect.anything());
    expect(showToast.error).toHaveBeenCalledWith(expect.stringContaining('at least 4 characters'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it.each([
    ['en', 'at least 4 characters'], ['fr', '4 caractères'], ['ar', '4 أحرف'],
  ])('explains the minimum in %s before posting', async (language, minimum) => {
    await initI18n(language);
    await submitReason('abc');
    expect(call.post).not.toHaveBeenCalledWith(cancelMethod, expect.anything());
    expect(showToast.error).toHaveBeenCalledWith(expect.stringContaining(minimum));
  });

  it.each(['Void', ' \tVoid\n '])('posts an accepted reason %j without surrounding whitespace', async (reason) => {
    await submitReason(reason);
    expect(call.post).toHaveBeenCalledWith(cancelMethod, { invoice_id: 'POS-INV-1', reason: 'Void' });
    expect(showToast.error).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not offer cancellation without native cancel permission', async () => {
    state.canCancel = false;
    await renderOrders();
    expect(container.querySelector('button[aria-label="Cancel order"]')).toBeNull();
    expect(call.post).not.toHaveBeenCalledWith(cancelMethod, expect.anything());
  });
});
