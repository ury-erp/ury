/**
 * Unit tests for src/stores/Offline.js (Pinia store)
 *
 * The Offline store depends on:
 *   - UryOfflineDB (OfflineDB.js) — real implementation, backed by fake-indexeddb
 *   - frappe-js-sdk (frappeSdk.js) — mocked (no server)
 *   - navigator.onLine — overridden per test
 *   - navigator.serviceWorker — mocked
 *
 * Tests cover:
 *   - Initial state
 *   - enqueueOrder — offline stub shape, IDB write, count update
 *   - flush — success path, error path, mixed, empty queue, online guard
 *   - cacheMenu / getCachedMenu round-trip
 *   - cacheSettings / getCachedSettings round-trip
 *   - _refreshCounts — reflects IDB state
 *   - _registerBackgroundSync — graceful when API absent
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useOfflineStore } from '../Offline.js';
import { _resetOfflineDBForTesting } from '../OfflineDB.js';

// ─── Mock frappeSdk ───────────────────────────────────────────────────────────
// frappeSdk.js calls `new FrappeApp(url)` which reads window.location.
// In jsdom window.location is available but FrappeApp may not construct cleanly,
// so we mock the entire module to return a minimal call() shim.

vi.mock('../frappeSdk.js', () => ({
  default: {
    call: () => ({
      post: vi.fn(),
      get: vi.fn(),
    }),
    db: () => ({}),
    auth: () => ({}),
  },
}));

// ─── Mock the router used transitively by Table.js ────────────────────────────
vi.mock('../../router', () => ({
  default: { push: vi.fn(), beforeEach: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides = {}) {
  return {
    table: 'T-001',
    customer: 'Walk-In',
    items: [{ item: 'BURRITO', qty: 1 }],
    no_of_pax: 1,
    mode_of_payment: 'Cash',
    cashier: 'admin',
    owner: 'admin',
    waiter: 'waiter',
    last_modified_time: null,
    pos_profile: 'POS-V',
    invoice: null,
    aggregator_id: null,
    order_type: 'Dine In',
    last_invoice: null,
    comments: null,
    room: 'Main Room',
    ...overrides,
  };
}

/** Set navigator.onLine to a fixed value for the duration of a test. */
function mockOnline(value) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

/** Build a resolved sync_order success response. */
function makeSyncSuccess(name = 'POS-INV-0001') {
  return {
    message: {
      name,
      status: 'Success',
      grand_total: 100,
      modified: '2026-01-01 12:00:00',
      items: [{ item_code: 'BURRITO', qty: 1 }],
    },
  };
}

/** Build a resolved sync_order Failure response. */
function makeSyncFailure() {
  return { message: { status: 'Failure', _error_message: 'Table occupied' } };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Fresh Pinia instance — isolates store state between tests
  setActivePinia(createPinia());

  // Reset the offlineDB singleton to reconnect to the fresh IDBFactory
  // that setup.js installed in globalThis.indexedDB via beforeEach there.
  // Without this the singleton holds a stale IDB connection from a prior test
  // and all its records bleed through, causing count assertions to fail.
  _resetOfflineDBForTesting();
  await new Promise(resolve => setTimeout(resolve, 0)); // let IDB open settle

  // Default: online, no service worker
  mockOnline(true);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('Offline store — initial state', () => {
  it('isOnline mirrors navigator.onLine on first access', () => {
    mockOnline(true);
    const offline = useOfflineStore();
    expect(offline.isOnline).toBe(true);
  });

  it('pendingCount is 0 before any enqueue', () => {
    const offline = useOfflineStore();
    expect(offline.pendingCount).toBe(0);
  });

  it('errorCount is 0 before any errors', () => {
    const offline = useOfflineStore();
    expect(offline.errorCount).toBe(0);
  });

  it('isSyncing is false initially', () => {
    const offline = useOfflineStore();
    expect(offline.isSyncing).toBe(false);
  });

  it('totalQueued is 0 initially', () => {
    const offline = useOfflineStore();
    expect(offline.totalQueued).toBe(0);
  });

  it('hasQueue is false initially', () => {
    const offline = useOfflineStore();
    expect(offline.hasQueue).toBe(false);
  });
});

// ─── statusClass getter ───────────────────────────────────────────────────────

describe('Offline store — statusClass getter', () => {
  it('returns "online" when online with empty queue', () => {
    mockOnline(true);
    const offline = useOfflineStore();
    expect(offline.statusClass).toBe('online');
  });

  it('returns "offline" when offline', () => {
    mockOnline(false);
    const offline = useOfflineStore();
    offline.isOnline = false;
    expect(offline.statusClass).toBe('offline');
  });

  it('returns "syncing" when isSyncing is true', () => {
    const offline = useOfflineStore();
    offline.isSyncing = true;
    expect(offline.statusClass).toBe('syncing');
  });

  it('returns "error" when errorCount > 0', () => {
    const offline = useOfflineStore();
    offline.errorCount = 1;
    expect(offline.statusClass).toBe('error');
  });
});

// ─── enqueueOrder ─────────────────────────────────────────────────────────────

describe('Offline store — enqueueOrder', () => {
  it('returns a stub with _offline=true', async () => {
    const offline = useOfflineStore();
    const response = await offline.enqueueOrder(makePayload());
    expect(response.message._offline).toBe(true);
  });

  it('returns a stub with status=Queued', async () => {
    const offline = useOfflineStore();
    const response = await offline.enqueueOrder(makePayload());
    expect(response.message.status).toBe('Queued');
  });

  it('stub includes _local_id as a number', async () => {
    const offline = useOfflineStore();
    const response = await offline.enqueueOrder(makePayload());
    expect(typeof response.message._local_id).toBe('number');
  });

  it('stub items reflects the original payload items', async () => {
    const offline = useOfflineStore();
    const payload = makePayload({ items: [{ item: 'TACO', qty: 3 }] });
    const response = await offline.enqueueOrder(payload);
    expect(response.message.items).toEqual(payload.items);
  });

  it('increments pendingCount after enqueue', async () => {
    const offline = useOfflineStore();
    expect(offline.pendingCount).toBe(0);
    await offline.enqueueOrder(makePayload());
    expect(offline.pendingCount).toBe(1);
    await offline.enqueueOrder(makePayload());
    expect(offline.pendingCount).toBe(2);
  });

  it('hasQueue becomes true after enqueue', async () => {
    const offline = useOfflineStore();
    await offline.enqueueOrder(makePayload());
    expect(offline.hasQueue).toBe(true);
  });

  it('multiple enqueues each get unique local_ids', async () => {
    const offline = useOfflineStore();
    const r1 = await offline.enqueueOrder(makePayload());
    const r2 = await offline.enqueueOrder(makePayload());
    expect(r1.message._local_id).not.toBe(r2.message._local_id);
  });
});

// ─── flush — empty queue ──────────────────────────────────────────────────────

describe('Offline store — flush with empty queue', () => {
  it('returns { success: 0, errors: 0 } when queue is empty', async () => {
    const offline = useOfflineStore();
    const result = await offline.flush();
    expect(result).toEqual({ success: 0, errors: 0 });
  });

  it('does not set isSyncing when queue is empty', async () => {
    const offline = useOfflineStore();
    await offline.flush();
    expect(offline.isSyncing).toBe(false);
  });
});

// ─── flush — offline guard ────────────────────────────────────────────────────

describe('Offline store — flush offline guard', () => {
  it('returns { success: 0, errors: 0 } when offline', async () => {
    mockOnline(false);
    const offline = useOfflineStore();
    offline.isOnline = false;
    await offline.enqueueOrder(makePayload());
    const result = await offline.flush();
    expect(result).toEqual({ success: 0, errors: 0 });
  });

  it('does not call _callSyncOrder when offline', async () => {
    mockOnline(false);
    const offline = useOfflineStore();
    offline.isOnline = false;
    await offline.enqueueOrder(makePayload());
    const spy = vi.spyOn(offline, '_callSyncOrder');
    await offline.flush();
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── flush — concurrent guard ─────────────────────────────────────────────────

describe('Offline store — flush concurrency guard', () => {
  it('second flush call returns early while first is running', async () => {
    const offline = useOfflineStore();
    await offline.enqueueOrder(makePayload());

    // Make _callSyncOrder hang indefinitely
    let resolveHang;
    const hanging = new Promise(r => { resolveHang = r; });
    vi.spyOn(offline, '_callSyncOrder').mockReturnValue(hanging);

    // Start first flush — don't await, it will hang on _callSyncOrder
    const first = offline.flush();

    // Yield to the event loop so flush() runs up to the point where it
    // sets isSyncing = true and calls _callSyncOrder (which hangs).
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(offline.isSyncing).toBe(true);

    // Second flush should return immediately without touching IDB
    const second = await offline.flush();
    expect(second).toEqual({ success: 0, errors: 0 });

    // Resolve the hanging call so first flush completes cleanly
    resolveHang(makeSyncSuccess());
    await first;
  });
});

// ─── flush — success path ─────────────────────────────────────────────────────

describe('Offline store — flush success path', () => {
  it('returns { success: 1, errors: 0 } for a single successful sync', async () => {
    const offline = useOfflineStore();
    offline._call = { post: vi.fn().mockResolvedValue(makeSyncSuccess()) };
    vi.spyOn(offline, '_callSyncOrder').mockResolvedValue(makeSyncSuccess());

    await offline.enqueueOrder(makePayload());
    const result = await offline.flush();

    expect(result.success).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('pendingCount drops to 0 after successful flush', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockResolvedValue(makeSyncSuccess());

    await offline.enqueueOrder(makePayload());
    await offline.enqueueOrder(makePayload());
    await offline.flush();

    expect(offline.pendingCount).toBe(0);
  });

  it('isSyncing is false after flush completes', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockResolvedValue(makeSyncSuccess());
    await offline.enqueueOrder(makePayload());
    await offline.flush();
    expect(offline.isSyncing).toBe(false);
  });

  it('lastSyncResult is set after successful flush', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockResolvedValue(makeSyncSuccess());
    await offline.enqueueOrder(makePayload());
    await offline.flush();
    expect(offline.lastSyncResult).not.toBeNull();
    expect(offline.lastSyncResult.success).toBe(1);
    expect(offline.lastSyncResult.errors).toBe(0);
    expect(typeof offline.lastSyncResult.at).toBe('number');
  });

  it('multiple queued orders all sync successfully', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder')
      .mockResolvedValueOnce(makeSyncSuccess('POS-001'))
      .mockResolvedValueOnce(makeSyncSuccess('POS-002'))
      .mockResolvedValueOnce(makeSyncSuccess('POS-003'));

    await offline.enqueueOrder(makePayload({ table: 'T-1' }));
    await offline.enqueueOrder(makePayload({ table: 'T-2' }));
    await offline.enqueueOrder(makePayload({ table: 'T-3' }));

    const result = await offline.flush();
    expect(result.success).toBe(3);
    expect(result.errors).toBe(0);
    expect(offline.pendingCount).toBe(0);
  });
});

// ─── flush — error path ───────────────────────────────────────────────────────

describe('Offline store — flush error path', () => {
  it('returns { success: 0, errors: 1 } when server call throws', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockRejectedValue(new Error('timeout'));

    await offline.enqueueOrder(makePayload());
    const result = await offline.flush();

    expect(result.success).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('errorCount increments after a failed flush', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockRejectedValue(new Error('timeout'));
    await offline.enqueueOrder(makePayload());
    await offline.flush();
    expect(offline.errorCount).toBe(1);
  });

  it('isSyncing is false even after a failed flush', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockRejectedValue(new Error('timeout'));
    await offline.enqueueOrder(makePayload());
    await offline.flush();
    expect(offline.isSyncing).toBe(false);
  });

  it('server Failure response is treated as an error', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder').mockResolvedValue(makeSyncFailure());
    await offline.enqueueOrder(makePayload());
    const result = await offline.flush();
    expect(result.errors).toBe(1);
    expect(offline.errorCount).toBe(1);
  });

  it('flush continues after one error and processes remaining records', async () => {
    const offline = useOfflineStore();
    vi.spyOn(offline, '_callSyncOrder')
      .mockRejectedValueOnce(new Error('fail first'))
      .mockResolvedValueOnce(makeSyncSuccess('POS-002'))
      .mockResolvedValueOnce(makeSyncSuccess('POS-003'));

    await offline.enqueueOrder(makePayload({ table: 'T-1' }));
    await offline.enqueueOrder(makePayload({ table: 'T-2' }));
    await offline.enqueueOrder(makePayload({ table: 'T-3' }));

    const result = await offline.flush();
    expect(result.success).toBe(2);
    expect(result.errors).toBe(1);
    // 2 succeeded (removed) + 1 errored (still in IDB) = errorCount=1, pending=0
    expect(offline.errorCount).toBe(1);
    expect(offline.pendingCount).toBe(0);
  });
});

// ─── menu cache helpers ───────────────────────────────────────────────────────

describe('Offline store — menu cache helpers', () => {
  it('getCachedMenu returns null on a cold cache', async () => {
    const offline = useOfflineStore();
    const result = await offline.getCachedMenu('Victorias', 'Main Room');
    expect(result).toBeNull();
  });

  it('cacheMenu then getCachedMenu returns the same data', async () => {
    const offline = useOfflineStore();
    const data = { items: [{ item: 'TACO', rate: 50 }], name: 'V-Menu' };
    await offline.cacheMenu('Victorias', 'Main Room', data);
    const result = await offline.getCachedMenu('Victorias', 'Main Room');
    expect(result).toEqual(data);
  });

  it('null room key works for cashier-side caching', async () => {
    const offline = useOfflineStore();
    const data = { items: [], name: 'Cashier Menu' };
    await offline.cacheMenu('Victorias', null, data);
    expect(await offline.getCachedMenu('Victorias', null)).toEqual(data);
  });

  it('cacheMenu does not throw on IDB error (graceful)', async () => {
    const offline = useOfflineStore();
    // Simulate IDB failure by passing an invalid value — should not throw
    await expect(
      offline.cacheMenu('', '', undefined)
    ).resolves.not.toThrow();
  });
});

// ─── settings cache helpers ───────────────────────────────────────────────────

describe('Offline store — settings cache helpers', () => {
  it('getCachedSettings returns null on a cold cache', async () => {
    const offline = useOfflineStore();
    const result = await offline.getCachedSettings('Victorias');
    expect(result).toBeNull();
  });

  it('cacheSettings then getCachedSettings returns the same data', async () => {
    const offline = useOfflineStore();
    const settings = { pos_profile: 'POS-V', branch: 'Victorias', cashier: 'admin' };
    await offline.cacheSettings('Victorias', settings);
    const result = await offline.getCachedSettings('Victorias');
    expect(result).toEqual(settings);
  });

  it('cacheSettings for two branches are independent', async () => {
    const offline = useOfflineStore();
    await offline.cacheSettings('Victorias', { pos_profile: 'POS-V' });
    await offline.cacheSettings('SecretGarden', { pos_profile: 'POS-SG' });
    expect((await offline.getCachedSettings('Victorias')).pos_profile).toBe('POS-V');
    expect((await offline.getCachedSettings('SecretGarden')).pos_profile).toBe('POS-SG');
  });
});

// ─── _registerBackgroundSync ──────────────────────────────────────────────────

describe('Offline store — _registerBackgroundSync', () => {
  it('does not throw when serviceWorker is undefined', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });
    const offline = useOfflineStore();
    await expect(offline._registerBackgroundSync()).resolves.not.toThrow();
  });

  it('does not throw when sync API is absent on the registration', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ /* no sync property */ }),
      },
    });
    const offline = useOfflineStore();
    await expect(offline._registerBackgroundSync()).resolves.not.toThrow();
  });

  it('calls reg.sync.register when Background Sync is available', async () => {
    const mockRegister = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ sync: { register: mockRegister } }),
      },
    });
    const offline = useOfflineStore();
    await offline._registerBackgroundSync();
    expect(mockRegister).toHaveBeenCalledWith('ury-pos-sync');
  });
});
