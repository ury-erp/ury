import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setImmediate as flushPromises } from 'node:timers/promises';
import { useTableStore } from './Table.js';

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

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function fetchTable(table, serverNow) {
  const store = useTableStore();
  store.selectedRoom = 'Dining';
  store.db.getDocList.mockResolvedValue([table]);
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
