import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { setImmediate as flushPromises } from 'node:timers/promises';
import { useTableStore } from './Table.js';
import FloorPlan from '../components/Table.vue';

vi.mock('../router', () => ({ default: { push: vi.fn() } }));
vi.mock('./Menu.js', () => ({ useMenuStore: () => ({ fetchItems: vi.fn() }) }));
vi.mock('./invoiceData.js', () => ({
  useInvoiceDataStore: () => ({ tableAttention: 15 }),
}));
vi.mock('./Auth.js', () => ({ useAuthStore: () => ({}) }));
vi.mock('./Customer.js', () => ({ useCustomerStore: () => ({}) }));
vi.mock('./Notification.js', () => ({ useNotifications: () => ({}) }));
vi.mock('./Alert.js', () => ({ useAlert: () => ({}) }));
vi.mock('./recentOrder.js', () => ({ usetoggleRecentOrder: () => ({}) }));
vi.mock('./frappeSdk.js', () => ({
  default: {
    call: () => ({ get: vi.fn() }),
    db: () => ({ getDocList: vi.fn() }),
  },
}));

let floorApp;
let floorElement;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  floorApp?.unmount();
  floorElement?.remove();
  floorApp = undefined;
  floorElement = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function fetchTables(tables, serverNow, invoices = []) {
  const store = useTableStore();
  store.selectedRoom = 'Dining';
  store.db.getDocList.mockImplementation((doctype) => {
    if (doctype === 'URY Table') return Promise.resolve(tables);
    if (doctype === 'POS Invoice') return Promise.resolve(invoices);
    throw new Error(`Unexpected doctype: ${doctype}`);
  });
  store.call.get.mockImplementation((method) => {
    if (method !== 'ury.ury.api.ury_server_time.get_server_time') {
      throw new Error(`Unexpected endpoint: ${method}`);
    }
    return Promise.resolve({ message: serverNow });
  });
  store.fetchTable();
  await flushPromises();
  return store;
}

async function fetchTable(table, serverNow, invoices = []) {
  return fetchTables([table], serverNow, invoices);
}

function roomStore(tables, serverTime) {
  const store = useTableStore();
  store.selectedRoom = 'Dining';
  store.invoiceData.multipleCashier = true;
  store.invoiceData.posProfile = 'Dining POS';
  store.db.getDocList.mockReturnValue(tables);
  store.call.get.mockImplementation((method) => {
    switch (method) {
      case 'ury.ury.api.ury_server_time.get_server_time':
        return serverTime;
      case 'ury.ury_pos.api.getRestaurantMenu':
        return Promise.resolve({
          message: { items: [{ item: 'Coffee' }], name: 'Dining Menu', modified: '2026-10-02 12:00:00' },
        });
      case 'ury.ury_pos.api.getCashier':
        return Promise.resolve({ message: 'Dining Cashier' });
      default:
        throw new Error(`Unexpected endpoint: ${method}`);
    }
  });
  return store;
}

describe('room changes load menu and cashier independently of floor-plan requests', () => {
  it.each(['table list', 'server clock'])('loads the menu and cashier while the %s is pending', async (pending) => {
    const unresolved = new Promise(() => {});
    const store = roomStore(
      pending === 'table list' ? unresolved : Promise.resolve([]),
      pending === 'server clock' ? unresolved : Promise.resolve({ message: '2026-10-02T12:00:00' }),
    );

    store.handleRoomChange();
    await flushPromises();

    expect(store.call.get).toHaveBeenCalledWith('ury.ury_pos.api.getRestaurantMenu', {
      room: 'Dining', pos_profile: 'Dining POS',
    });
    expect(store.tableMenu).toEqual([{ item: 'Coffee' }]);
    expect(store.cashier).toBe('Dining Cashier');
  });

  it('loads the menu and cashier without propagating a rejected table list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = roomStore(
      Promise.reject(new Error('Table list unavailable')),
      Promise.resolve({ message: '2026-10-02T12:00:00' }),
    );
    let roomError;
    const change = store.handleRoomChange().catch((error) => { roomError = error; });
    await flushPromises();
    await change;

    expect(roomError).toBeUndefined();
    expect(store.call.get).toHaveBeenCalledWith('ury.ury_pos.api.getRestaurantMenu', {
      room: 'Dining', pos_profile: 'Dining POS',
    });
    expect(store.tableMenu).toEqual([{ item: 'Coffee' }]);
    expect(store.cashier).toBe('Dining Cashier');
  });
});

describe('floor-plan table age uses the site clock', () => {
  it('shows 0:00 when the invoice time is two seconds ahead of site now', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '12:00:02' },
      '2026-10-02T12:00:00',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('0:00');
    expect(store.getBadgeText(store.tables[0])).toBe('Occupied');
    expect(store.getBadgeType(store.tables[0])).toBe('yellow');
  });

  it('shows 0:00 while the site offset is not yet loaded', () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = useTableStore();

    expect(store.getTimeDifference({
      name: 'Table 1', occupied: 1, latest_invoice_time: '11:00:02',
    })).toBe('0:00');
  });

  it('does not roll back a day when the invoice is exactly twelve hours ahead', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '12:10:00' },
      '2026-10-03T00:10:00',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('0:00');
  });

  it('shows 0:05 when the browser is one hour behind the server', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '11:55:00' },
      '2026-10-02T12:00:00.000000',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('0:05');
    expect(store.getBadgeText(store.tables[0])).toBe('Occupied');
    expect(store.getBadgeType(store.tables[0])).toBe('yellow');
  });

  it.each([
    { browserNow: [2026, 9, 2, 23, 10, 0], clock: 'one hour behind' },
    { browserNow: [2026, 9, 3, 0, 10, 0], clock: 'matching the site' },
  ])('shows 0:20 after site midnight with the browser $clock', async ({ browserNow }) => {
    vi.setSystemTime(new Date(...browserNow));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '23:50:00' },
      '2026-10-03T00:10:00',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('0:20');
    expect(store.getBadgeText(store.tables[0])).toBe('Attention');
    expect(store.getBadgeType(store.tables[0])).toBe('red');
  });

  it('keeps advancing across site midnight without refetching', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 22, 55, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '23:50:00' },
      '2026-10-02T23:55:00',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('0:05');
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(store.getTimeDifference(store.tables[0])).toBe('0:25');
  });

  it('uses padded site time for unoccupied tables and keeps free badges unchanged', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 0, latest_invoice_time: '11:55:00' },
      '2026-10-02T12:00:00',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('12:00');
    expect(store.getBadgeText(store.tables[0])).toBe('Free');
    expect(store.getBadgeType(store.tables[0])).toBe('green');
  });

  it('still loads the floor plan if refreshing server time fails', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '11:55:00' },
      '2026-10-02T12:00:00',
    );
    store.call.get.mockRejectedValue(new Error('Server clock unavailable'));
    store.db.getDocList.mockResolvedValue([
      { name: 'Table 10', occupied: 0 },
      { name: 'Table 2', occupied: 1, latest_invoice_time: '11:55:00' },
    ]);

    store.fetchTable();
    await flushPromises();

    expect(store.tables.map((table) => table.name)).toEqual(['Table 2', 'Table 10']);
    expect(store.getTimeDifference(store.tables[0])).toBe('0:05');
  });
});

describe('floor-plan age uses the oldest open bill creation', () => {
  it.each([
    { creation: '2026-10-02 11:05:00.000000', age: '13:05' },
    { creation: '2026-10-01 11:05:00', age: '37:05' },
  ])('shows $age across midnight instead of guessing from a time-only field', async ({ creation, age }) => {
    vi.setSystemTime(new Date(2026, 9, 2, 23, 10, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '11:05:00' },
      '2026-10-03 00:10:00',
      [{ restaurant_table: 'Table 1', creation, custom_merged_tables: '' }],
    );

    expect(store.getTimeDifference(store.tables[0])).toBe(age);
    expect(store.getBadgeText(store.tables[0])).toBe('Attention');
    expect(store.getBadgeType(store.tables[0])).toBe('red');
    vi.advanceTimersByTime(20 * 60 * 1000);
    expect(store.getTimeDifference(store.tables[0])).toBe(age === '13:05' ? '13:25' : '37:25');
  });

  it('uses the oldest draft creation after a transfer, not a reset table time or a newer bill', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 23, 10, 0));
    const store = await fetchTables([
      { name: 'Table 2', occupied: 1, latest_invoice_time: '00:05:00' },
      { name: 'Table 10', occupied: 0, latest_invoice_time: '11:05:00' },
      { name: 'Table 3', occupied: 1, latest_invoice_time: '00:08:00' },
    ], '2026-10-03 00:10:00', [
      { restaurant_table: 'Table 2', creation: '2026-10-02 11:05:00', custom_merged_tables: '' },
      { restaurant_table: 'Table 2', creation: '2026-10-01 11:05:00', custom_merged_tables: '' },
    ]);

    expect(store.getTimeDifference(store.tables[0])).toBe('37:05');
    expect(store.getTimeDifference(store.tables[1])).toBe('0:02');
    expect(store.getBadgeText(store.tables[2])).toBe('Free');
    // Verify the external read contract: room table names, drafts only,
    // include merged partners, and no default 20-row pagination truncation.
    expect(store.db.getDocList).toHaveBeenCalledWith('POS Invoice', {
      fields: ['restaurant_table', 'creation', 'custom_merged_tables'],
      filters: [['docstatus', '=', 0]],
      orFilters: [
        ['restaurant_table', 'in', ['Table 2', 'Table 3']],
        ['custom_merged_tables', 'like', '%Table 2%'],
        ['custom_merged_tables', 'like', '%Table 3%'],
      ],
      orderBy: { field: 'creation', order: 'desc' },
      limit: 0,
    });
  });

  it.each(['newest first', 'reversed'])('selects the oldest open check with the list returned %s', async (order) => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const drafts = [
      { restaurant_table: 'Table 1', creation: '2026-10-03 00:05:00', custom_merged_tables: '' },
      { restaurant_table: 'Table 1', creation: '2026-10-01 11:05:00', custom_merged_tables: '' },
      { restaurant_table: 'Table 1', creation: '2026-10-02 11:05:00', custom_merged_tables: '' },
    ];
    if (order === 'reversed') drafts.reverse();
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '00:05:00' },
      '2026-10-03 00:10:00', drafts,
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('37:05');
    expect(store.getBadgeText(store.tables[0])).toBe('Attention');
    expect(store.getBadgeType(store.tables[0])).toBe('red');
  });

  it('keeps seating age and Attention after a split inserts a newer sibling draft', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const source = { restaurant_table: 'Table 1', creation: '2026-10-03 00:00:00', custom_merged_tables: '' };
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '00:00:00' },
      '2026-10-03 00:10:00', [source],
    );
    expect(store.getTimeDifference(store.tables[0])).toBe('0:10');
    vi.advanceTimersByTime(10 * 60 * 1000);
    store.call.get.mockResolvedValue({ message: '2026-10-03 00:20:00' });
    store.db.getDocList.mockImplementation((doctype) => Promise.resolve(doctype === 'URY Table'
      ? [{ name: 'Table 1', occupied: 1, latest_invoice_time: '00:19:00' }]
      : [{ ...source, creation: '2026-10-03 00:19:00' }, source]));

    store.fetchTable();
    await flushPromises();

    expect(store.getTimeDifference(store.tables[0])).toBe('0:20');
    expect(store.getBadgeText(store.tables[0])).toBe('Attention');
    expect(store.getBadgeType(store.tables[0])).toBe('red');
  });

  it('takes the oldest primary or exact merged-partner draft even when the primary is outside the room', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTable(
      { name: 'Table 2', occupied: 1, latest_invoice_time: '00:05:00', merged_with: 'Other Room Table' },
      '2026-10-03 00:10:00', [
        { restaurant_table: 'Table 2', creation: '2026-10-03 00:05:00', custom_merged_tables: '' },
        { restaurant_table: 'Other Room Table', creation: '2026-10-03 00:04:00', custom_merged_tables: ' Table 2, Table 3 ' },
        { restaurant_table: 'Other Room Table', creation: '2026-10-01 11:05:00', custom_merged_tables: ' Table 2, Table 3 ' },
        { restaurant_table: 'Other Table', creation: '2026-09-30 11:05:00', custom_merged_tables: 'Table 20, Table 21' },
      ],
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('37:05');
    expect(store.getBadgeText(store.tables[0])).toBe('Attention');
    expect(store.getBadgeType(store.tables[0])).toBe('red');
    expect(store.db.getDocList).toHaveBeenCalledWith('POS Invoice', {
      fields: ['restaurant_table', 'creation', 'custom_merged_tables'],
      filters: [['docstatus', '=', 0]],
      orFilters: [
        ['restaurant_table', 'in', ['Table 2']],
        ['custom_merged_tables', 'like', '%Table 2%'],
      ],
      orderBy: { field: 'creation', order: 'desc' },
      limit: 0,
    });
  });

  it('uses the primary bill for merged partners with exact, trimmed table names', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTables([
      { name: 'Table 1', occupied: 1, latest_invoice_time: '00:05:00' },
      { name: 'Table 2', occupied: 1, latest_invoice_time: '00:05:00', merged_with: 'Table 1' },
      { name: 'Table 20', occupied: 1, latest_invoice_time: '00:05:00' },
      { name: 'Table 3', occupied: 0, latest_invoice_time: '00:05:00' },
    ], '2026-10-03 00:10:00', [
      { restaurant_table: 'Table 1', creation: '2026-10-02 11:05:00', custom_merged_tables: ' Table 2, Table 3, Other Room Table ' },
    ]);

    expect(store.tables.map((table) => store.getTimeDifference(table))).toEqual(['13:05', '13:05', '0:10', '0:05']);
    expect(store.getBadgeText(store.tables[1])).toBe('Attention');
    expect(store.getBadgeText(store.tables[2])).toBe('Free');
  });

  it('does not let a stale time-only value age a future bill', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '10:00:00' },
      '2026-10-02 12:00:00',
      [{ restaurant_table: 'Table 1', creation: '2026-10-02 12:00:02', custom_merged_tables: '' }],
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('0:00');
    expect(store.getBadgeText(store.tables[0])).toBe('Occupied');
  });

  it('can age an occupied table even when its time-only field is empty', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: null },
      '2026-10-03 00:10:00',
      [{ restaurant_table: 'Table 1', creation: '2026-10-02 11:05:00', custom_merged_tables: '' }],
    );
    expect(store.getTimeDifference(store.tables[0])).toBe('13:05');
  });

  it('falls back to the time-only field for an invalid bill datetime', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '23:50:00' },
      '2026-10-03 00:10:00',
      [{ restaurant_table: 'Table 1', creation: 'invalid', custom_merged_tables: '' }],
    );
    expect(store.getTimeDifference(store.tables[0])).toBe('0:20');
  });

  it('does not query invoices when the room has no occupied tables', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 0 }, '2026-10-03 00:10:00',
    );
    expect(store.db.getDocList.mock.calls.map(([doctype]) => doctype)).toEqual(['URY Table']);
    expect(store.getBadgeText(store.tables[0])).toBe('Free');
  });

  it('clears a previous bill timestamp on refresh when an occupied table no longer has an open bill', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '00:05:00' },
      '2026-10-03 00:10:00',
      [{ restaurant_table: 'Table 1', creation: '2026-10-02 11:05:00', custom_merged_tables: '' }],
    );
    expect(store.getTimeDifference(store.tables[0])).toBe('13:05');

    store.db.getDocList.mockImplementation((doctype) => Promise.resolve(doctype === 'URY Table'
      ? [{ name: 'Table 1', occupied: 1, latest_invoice_time: '00:05:00' }] : []));
    store.fetchTable();
    await flushPromises();

    expect(store.getTimeDifference(store.tables[0])).toBe('0:05');
  });

  it('keeps floor, menu and cashier usable while the open-bill query is pending or denied', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    let deny;
    const billQuery = new Promise((resolve, reject) => { deny = reject; });
    const store = roomStore(Promise.resolve([]), Promise.resolve({ message: '2026-10-03 00:10:00' }));
    store.db.getDocList.mockImplementation((doctype) => doctype === 'URY Table'
      ? Promise.resolve([{ name: 'Table 1', occupied: 1, latest_invoice_time: '23:50:00' }]) : billQuery);

    await store.handleRoomChange();
    await flushPromises();
    expect(store.tables.map((table) => table.name)).toEqual(['Table 1']);
    expect(store.tableMenu).toEqual([{ item: 'Coffee' }]);
    expect(store.cashier).toBe('Dining Cashier');
    expect(store.db.getDocList).toHaveBeenCalledWith('POS Invoice', expect.any(Object));
    expect(store.getTimeDifference(store.tables[0])).toBe('0:20');

    deny(new Error('POS Invoice read denied'));
    await flushPromises();
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ message: 'POS Invoice read denied' }));
    expect(store.getTimeDifference(store.tables[0])).toBe('0:20');
  });

  it('does not apply a pending old-room bill to the newly loaded room', async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 0, 10, 0));
    let finishBills;
    const oldBills = new Promise((resolve) => { finishBills = resolve; });
    const store = useTableStore();
    store.selectedRoom = 'Dining';
    store.call.get.mockResolvedValue({ message: '2026-10-03 00:10:00' });
    store.db.getDocList.mockImplementation((doctype) => doctype === 'URY Table'
      ? Promise.resolve([{ name: 'Table 1', occupied: 1, latest_invoice_time: '00:05:00' }]) : oldBills);
    store.fetchTable();
    await flushPromises();
    expect(store.db.getDocList).toHaveBeenCalledWith('POS Invoice', expect.any(Object));

    store.selectedRoom = 'Terrace';
    store.db.getDocList.mockResolvedValue([{ name: 'Terrace 1', occupied: 0 }]);
    store.fetchTable();
    await flushPromises();
    finishBills([{ restaurant_table: 'Table 1', creation: '2026-10-02 11:05:00', custom_merged_tables: 'Terrace 1' }]);
    await flushPromises();

    expect(store.tables.map((table) => table.name)).toEqual(['Terrace 1']);
    expect(store.getBadgeText(store.tables[0])).toBe('Free');
    expect(store.getTimeDifference(store.tables[0])).toBe('0:10');
  });
});

describe('idle floor-plan rendering', () => {
  it.each([false, true])('advances the rendered age and Attention badge without refetching (takeaway=%s)', async (takeaway) => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 1, latest_invoice_time: '11:46:00', is_take_away: takeaway ? 1 : 0 },
      '2026-10-02 12:00:00',
      [{ restaurant_table: 'Table 1', creation: '2026-10-02 11:46:00', custom_merged_tables: '' }],
    );
    store.isTakeaeay = takeaway;
    floorElement = document.createElement('div');
    document.body.appendChild(floorElement);
    floorApp = createApp(FloorPlan);
    floorApp.use(getActivePinia());
    const timerCount = vi.getTimerCount();
    floorApp.mount(floorElement);

    expect(floorElement.textContent).toContain('0:14');
    expect(floorElement.textContent).toContain('Occupied');
    const listReads = store.db.getDocList.mock.calls.length;
    const serverReads = store.call.get.mock.calls.length;

    vi.advanceTimersByTime(60 * 1000);
    await nextTick();
    expect(floorElement.textContent).toContain('0:15');
    expect(floorElement.textContent).toContain('Occupied');
    vi.advanceTimersByTime(60 * 1000);
    await nextTick();
    expect(floorElement.textContent).toContain('0:16');
    expect(floorElement.textContent).toContain('Attention');
    expect(floorElement.querySelector('.bg-red-100')).not.toBeNull();
    expect(store.db.getDocList).toHaveBeenCalledTimes(listReads);
    expect(store.call.get).toHaveBeenCalledTimes(serverReads);

    floorApp.unmount();
    floorApp = undefined;
    expect(vi.getTimerCount()).toBe(timerCount);
  });
});
