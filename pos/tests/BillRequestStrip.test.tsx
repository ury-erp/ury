import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { call } from '@ury/core';
import { initI18n } from '../src/i18n';
import { loadLocale } from '../src/i18n/loader';

const check = (name: string, table = 'Table 1', status = 'Draft') => ({
  name, restaurant_table: table, branch: 'Branch A', status, invoice_printed: 1, order_type: 'Dine In',
  rounded_total: 40, grand_total: 40, cashier: 'Cashier', waiter: 'Waiter', customer: 'Customer',
  mobile_number: '', posting_date: '2026-10-02', posting_time: '10:00:00',
  net_total: 40, total_taxes_and_charges: 0,
});
let Strip: ComponentType<any> = () => null; // An absent view renders nothing, not an import-error RED.
let root: Root;
let container: HTMLDivElement;
let select: ReturnType<typeof vi.fn>;
let requests: any[];
let queue: any[];
let search: any[];
let siblings: any[];
let tables: Array<{ name: string; branch: string }>;
async function nativeRead(method: string, args: any = {}) {
  if (method === 'ury.ury_pos.api.getBranch') return { message: 'Branch A' };
  if (method === 'frappe.client.get_list') {
    if (args.doctype === 'URY Table') return { message: tables.filter(table => table.branch === args.filters.branch) };
    if (args.doctype === 'URY Service Request') {
      const tableFilter = args.filters.find?.((filter: any[]) => filter[0] === 'table');
      return { message: tableFilter ? requests.filter(request => tableFilter[2].includes(request.table)) : requests };
    }
    if (args.doctype === 'POS Invoice') return { message: queue.filter(invoice =>
      invoice.restaurant_table === args.filters.restaurant_table && invoice.status === 'Draft' &&
      (!args.filters.branch || invoice.branch === args.filters.branch)) };
  }
  if (method === 'ury.ury_pos.api.searchPosInvoice') return { message: { data: search, next: false } };
  if (method === 'ury.ury_pos.api.get_split_group') return { message: { invoices: siblings, current: 'POS-1', group: 'GROUP-1' } };
  throw Error(`Unexpected read ${method}`);
}
beforeAll(async () => {
  if (existsSync(resolve('pos/src/components/BillRequestStrip.tsx'))) {
    const modulePath = '../src/components/BillRequestStrip';
    Strip = (await import(/* @vite-ignore */ modulePath)).default;
  }
});
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await initI18n('en');
  select = vi.fn(); queue = [check('POS-1')]; search = []; siblings = [];
  tables = [{ name: 'Table 1', branch: 'Branch A' }, { name: 'Table B', branch: 'Branch B' }];
  requests = [{ name: 'REQ-1', table: 'Table 1', invoice: 'POS-1', status: 'Pending', requested_at: '2026-10-02 10:05:00' }];
  vi.spyOn(call, 'get').mockImplementation(nativeRead);
  vi.spyOn(call, 'post').mockRejectedValue(Error('No writes permitted'));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  expect(call.post).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function render() { await act(async () => root.render(<Strip orders={queue} selectOrder={select} />)); }
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(label));
  expect(button, `Action ${label} must be available`).toBeDefined();
  await act(async () => button!.click());
}
async function pickup() { await click('Table 1'); }

describe('read-only bill-request strip', () => {
  it('queries only unresolved Bill requests and renders count, table, time, status and native record link', async () => {
    await render();
    expect(call.get).toHaveBeenCalledWith('frappe.client.get_list', {
      doctype: 'URY Service Request',
      filters: [['request_type', '=', 'Bill'], ['status', '!=', 'Resolved'], ['table', 'in', ['Table 1']]],
      fields: ['name', 'table', 'invoice', 'status', 'requested_at'], limit_page_length: 0,
    });
    for (const text of ['Bill requests: 1 waiting', 'Table 1', 'Pending', '10:05']) expect(container.textContent).toContain(text);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/app/ury-service-request/REQ-1');
  });
  it('renders loading without a fabricated zero', async () => {
    vi.mocked(call.get).mockImplementation(() => new Promise(() => {}));
    await render();
    expect(container.textContent).toContain('Loading bill requests');
    expect(container.textContent).not.toContain('0 waiting');
  });
  it('renders unavailable on read failure, never zero, then retries with Refresh', async () => {
    vi.mocked(call.get).mockRejectedValueOnce(Error('Denied'));
    await render();
    expect(container.textContent).toContain('Bill requests unavailable');
    expect(container.textContent).not.toContain('0 waiting');
    await click('Refresh'); expect(container.textContent).toContain('1 waiting');
  });
  it('renders explicit empty after a successful read', async () => {
    requests = []; await render();
    expect(container.textContent).toContain('Bill requests: 0 waiting');
    expect(container.textContent).toContain('No bill requests waiting');
  });
  it('selects an exact invoice in the loaded queue without searching', async () => {
    await render(); await pickup(); expect(select).toHaveBeenCalledWith(queue[0]);
    expect(call.get).toHaveBeenCalledTimes(3);
  });
  it('searches Outstanding for an off-page invoice and selects only the exact readable draft', async () => {
    queue = []; search = [check('POS-10'), check('POS-1')];
    await render(); await pickup();
    expect(call.get).toHaveBeenNthCalledWith(4, 'ury.ury_pos.api.searchPosInvoice', { query: 'POS-1', status: 'Outstanding' });
    expect(select).toHaveBeenCalledWith(search[1]);
    expect(call.get).toHaveBeenCalledTimes(4);
  });
  it('offers unpaid split siblings as explicit choices without selecting one automatically', async () => {
    queue = []; siblings = [
      { ...check('POS-CHILD-A'), docstatus: 0 }, { ...check('POS-CHILD-B'), docstatus: 0 },
      { ...check('POS-PAID', 'Table 1', 'Paid'), docstatus: 1 },
      { ...check('POS-CANCELLED'), docstatus: 2 },
    ];
    await render(); await pickup();
    expect(call.get).toHaveBeenNthCalledWith(5, 'ury.ury_pos.api.get_split_group', { invoice: 'POS-1' });
    expect(select).not.toHaveBeenCalled();
    expect(container.textContent).toContain('POS-CHILD-A'); expect(container.textContent).toContain('POS-CHILD-B');
    expect(container.textContent).not.toContain('POS-PAID'); expect(container.textContent).not.toContain('POS-CANCELLED');
    await click('POS-CHILD-B'); expect(select).toHaveBeenCalledWith(expect.objectContaining({ name: 'POS-CHILD-B' }));
  });
  it('offers even a single unpaid split sibling rather than silently picking it', async () => {
    queue = []; siblings = [{ ...check('POS-CHILD'), docstatus: 0 }];
    await render(); await pickup(); expect(select).not.toHaveBeenCalled();
    await click('POS-CHILD'); expect(select).toHaveBeenCalledOnce();
  });
  it('reports a closed/missing invoice instead of picking a similarly named invoice or same-table draft', async () => {
    search = [check('POS-10'), check('POS-1', 'Table 1', 'Paid')];
    queue = [check('UNRELATED')];
    await render(); await pickup();
    expect(select).not.toHaveBeenCalled(); expect(container.textContent).toContain('Bill POS-1 is not open');
  });
  it('reports unavailable rather than closed when invoice search fails', async () => {
    queue = [];
    vi.mocked(call.get).mockImplementation(async (method, args: any) => {
      if (method === 'ury.ury_pos.api.getBranch' || method === 'frappe.client.get_list') return nativeRead(method, args);
      throw Error('Denied');
    });
    await render(); await pickup(); expect(container.textContent).toContain('Bill lookup unavailable');
    expect(select).not.toHaveBeenCalled();
  });
  it.each([
    { httpStatus: 404, exception: 'frappe.exceptions.DoesNotExistError', want: 'Bill POS-1 is not open' },
    { httpStatus: 403, exception: 'frappe.exceptions.PermissionError', want: 'Bill lookup unavailable' },
  ])('distinguishes $httpStatus at the native split-group lookup from an open bill', async ({ httpStatus, exception, want }) => {
    queue = [];
    vi.mocked(call.get).mockImplementation(async (method, args: any) => {
      if (method === 'ury.ury_pos.api.getBranch' || method === 'frappe.client.get_list') return nativeRead(method, args);
      if (method === 'ury.ury_pos.api.searchPosInvoice') return { message: { data: [], next: false } };
      throw { httpStatus, exception };
    });
    await render(); await pickup();
    expect(select).not.toHaveBeenCalled(); expect(container.textContent).toContain(want);
  });
  it('shows the native record when a request has neither table nor invoice', async () => {
    requests[0].table = null; requests[0].invoice = null;
    vi.mocked(call.get).mockImplementation(async (method, args: any) => args?.doctype === 'URY Service Request'
      ? { message: requests } : nativeRead(method, args));
    await render(); await click('REQ-1');
    expect(container.textContent).toContain('Request has no linked table or bill');
    expect(select).not.toHaveBeenCalled(); expect(call.get).toHaveBeenCalledTimes(3);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/app/ury-service-request/REQ-1');
  });
  it('renders the request count and controls in French', async () => {
    await initI18n('fr'); await render();
    expect(container.textContent).toContain('Demandes d’addition : 1 en attente');
    expect(container.textContent).toContain('Actualiser');
  });
  it.each([1, 2, 0])('resolves a table-only request with %i matching open checks, never guesses', async (count) => {
    requests[0].invoice = null;
    queue = [check('WRONG-TABLE', 'Table 10'), check('PAID', 'Table 1', 'Paid'),
      ...Array.from({ length: count }, (_, i) => check(`MATCH-${i}`))];
    await render(); await pickup();
    if (count === 1) expect(select).toHaveBeenCalledWith(queue[2]);
    else if (count === 2) {
      expect(select).not.toHaveBeenCalled(); await click('MATCH-1'); expect(select).toHaveBeenCalledWith(queue[3]);
    } else {
      expect(select).not.toHaveBeenCalled(); expect(container.textContent).toContain('No open checks for Table 1');
    }
  });
  it('table-only lookup reads off-page drafts instead of declaring an empty page authoritative', async () => {
    requests[0].invoice = null; queue = [];
    vi.mocked(call.get).mockImplementation(async (method, args: any) => {
      if (args?.doctype === 'POS Invoice') return { message: [check('OFF-PAGE')] };
      return nativeRead(method, args);
    });
    await render(); await pickup();
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ name: 'OFF-PAGE' }));
    expect(call.get).toHaveBeenCalledWith('frappe.client.get_list', expect.objectContaining({
      doctype: 'POS Invoice', filters: { restaurant_table: 'Table 1', branch: 'Branch A', status: 'Draft', docstatus: 0 }, limit_page_length: 0,
    }));
  });
  it('refreshes every 30 seconds and clears the interval on unmount', async () => {
    vi.useFakeTimers(); const timers = vi.getTimerCount();
    await render(); expect(call.get).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(30000)); expect(call.get).toHaveBeenCalledTimes(6);
    requests = []; await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.textContent).toContain('0 waiting');
    await act(async () => root.unmount()); expect(vi.getTimerCount()).toBe(timers);
    await act(async () => vi.advanceTimersByTimeAsync(30000)); expect(call.get).toHaveBeenCalledTimes(9);
    root = createRoot(container);
  });
  it('never renders Branch B requests on the Branch A till', async () => {
    requests.push({ ...requests[0], name: 'REQ-B', table: 'Table B', invoice: 'POS-B' });
    await render();
    expect(container.textContent).toContain('Table 1');
    expect(container.textContent).not.toContain('Table B');
    expect(container.textContent).not.toContain('POS-B');
    expect(container.textContent).toContain('1 waiting');
    expect(call.get).toHaveBeenCalledWith('ury.ury_pos.api.getBranch');
    expect(call.get).toHaveBeenCalledWith('frappe.client.get_list', {
      doctype: 'URY Table', filters: { branch: 'Branch A' }, fields: ['name'], limit_page_length: 0,
    });
  });
  it('shows empty without reading requests when the branch has no readable tables', async () => {
    tables = [];
    await render();
    expect(container.textContent).toContain('No bill requests waiting');
    expect(call.get).not.toHaveBeenCalledWith('frappe.client.get_list', expect.objectContaining({ doctype: 'URY Service Request' }));
  });
  it('fails closed without native list reads when the till branch is missing', async () => {
    vi.mocked(call.get).mockImplementation(async (method, args: any) => method === 'ury.ury_pos.api.getBranch'
      ? { message: '' } : nativeRead(method, args));
    await render();
    expect(container.textContent).toContain('Bill requests unavailable');
    expect(container.querySelector('li')).toBeNull();
    expect(call.get).not.toHaveBeenCalledWith('frappe.client.get_list', expect.anything());
  });
  it('does not select a Branch B draft from a table-only request', async () => {
    requests[0].invoice = null;
    queue = [{ ...check('POS-B'), branch: 'Branch B' }];
    await render(); await pickup();
    expect(select).not.toHaveBeenCalled();
    expect(container.textContent).toContain('No open checks for Table 1');
    expect(container.textContent).not.toContain('POS-B');
  });
  it('retains the same rendered rows until a 30-second refresh succeeds', async () => {
    vi.useFakeTimers();
    await render();
    const row = container.querySelector('li');
    const nextRequests = [{ ...requests[0], name: 'REQ-2', invoice: 'POS-2' }];
    let finish!: (response: any) => void;
    vi.mocked(call.get).mockImplementation(async (method, args: any) => args?.doctype === 'URY Service Request'
      ? new Promise(resolve => { finish = resolve; }) : nativeRead(method, args));
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelector('li')).toBe(row);
    expect(container.textContent).toContain('POS-1');
    expect(container.textContent).not.toContain('Loading bill requests');
    expect(container.textContent).not.toContain('POS-2');
    await act(async () => finish({ message: nextRequests }));
    expect(container.textContent).toContain('POS-2');
    expect(container.textContent).not.toContain('POS-1');
  });
  it('keeps rows usable on refresh failure and clears the non-blocking note on success', async () => {
    await render();
    const row = container.querySelector('li');
    vi.mocked(call.get).mockRejectedValueOnce(Error('Offline'));
    await click('Refresh');
    expect(container.querySelector('li')).toBe(row);
    expect(container.textContent).toContain('1 waiting');
    expect(container.textContent).toContain('Bill requests refresh failed');
    expect(container.textContent).not.toContain('Bill requests unavailable');
    await pickup(); expect(select).toHaveBeenCalledWith(queue[0]);
    await click('Refresh');
    expect(container.textContent).not.toContain('refresh failed');
  });
  it.each(['en', 'fr', 'ar'])('ships settlement strings in the %s locale bundle', async lang => {
    const locale: any = await loadLocale(lang);
    const keys = ['order.print_bill', 'order.print_receipt', 'order.settle_bill', 'order.printed',
      'order.not_printed', 'order.age_minutes', 'footer.analytics', 'order_status_types.outstanding',
      'bill_split.split_bill', 'bill_requests.title', 'bill_requests.waiting', 'bill_requests.loading',
      'bill_requests.unavailable', 'bill_requests.refresh_failed', 'bill_requests.empty', 'bill_requests.refresh',
      'bill_requests.open_record', 'bill_requests.not_open', 'bill_requests.no_open_checks', 'bill_requests.no_link',
      'bill_requests.lookup_unavailable', 'bill_requests.lookup_loading', 'bill_requests.choose_check'];
    for (const key of keys) {
      const [group, name] = key.split('.');
      expect(locale[group]?.[name], `${lang}: ${key} must not render a raw key`).toEqual(expect.any(String));
    }
  });
});
