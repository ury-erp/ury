import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTableStore } from './Table.js';

vi.mock('../router', () => ({ default: { push: vi.fn() } }));
vi.mock('./Menu.js', () => ({ useMenuStore: () => ({}) }));
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
  await store.fetchTable();
  return store;
}

describe('floor-plan table age uses the site clock', () => {
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

  it('leaves unoccupied table time and free badges unchanged', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 11, 0, 0));
    const store = await fetchTable(
      { name: 'Table 1', occupied: 0, latest_invoice_time: '11:55:00' },
      '2026-10-02T12:00:00',
    );

    expect(store.getTimeDifference(store.tables[0])).toBe('11:0');
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

    await store.fetchTable();

    expect(store.tables.map((table) => table.name)).toEqual(['Table 2', 'Table 10']);
    expect(store.getTimeDifference(store.tables[0])).toBe('0:05');
  });
});
