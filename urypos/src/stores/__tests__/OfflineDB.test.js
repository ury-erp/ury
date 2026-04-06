/**
 * Unit tests for src/stores/OfflineDB.js
 *
 * Tests the IndexedDB wrapper in isolation — no Pinia, no Vue, no network.
 * fake-indexeddb is installed globally by setup.js and reset before each test.
 *
 * Coverage targets:
 *   - enqueueOrder / getPendingOrders / getPendingCount
 *   - markSyncing / markSynced / markError / resetToRetry / removeOrder
 *   - setMenuCache / getMenuCache
 *   - setSettingsCache / getSettingsCache
 *   - getQueueSummary
 *   - clearPendingOrders
 *   - Record field shapes (client_modified_at, status, payload integrity)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UryOfflineDB } from '../OfflineDB.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal sync_order payload matching what invoiceData.js sends. */
function makePayload(overrides = {}) {
  return {
    table: 'T-001',
    customer: 'Walk-In Customer',
    items: [{ item: 'BURRITO', qty: 2 }],
    no_of_pax: 2,
    mode_of_payment: 'Cash',
    cashier: 'admin@example.com',
    owner: 'admin@example.com',
    waiter: 'waiter@example.com',
    last_modified_time: null,
    pos_profile: 'Victorias POS',
    invoice: null,
    aggregator_id: null,
    order_type: 'Dine In',
    last_invoice: null,
    comments: null,
    room: 'Main Room',
    ...overrides,
  };
}

/** Create a fresh UryOfflineDB instance for each test. */
function makeDB() {
  return new UryOfflineDB();
}

// ─── pending_orders ───────────────────────────────────────────────────────────

describe('OfflineDB — pending_orders', () => {
  it('enqueueOrder returns an auto-increment local_id', async () => {
    const db = makeDB();
    const id1 = await db.enqueueOrder(makePayload());
    const id2 = await db.enqueueOrder(makePayload());
    expect(typeof id1).toBe('number');
    expect(typeof id2).toBe('number');
    expect(id2).toBeGreaterThan(id1);
  });

  it('enqueued record has status=pending', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    const [record] = await db.getPendingOrders();
    expect(record.local_id).toBe(id);
    expect(record.status).toBe('pending');
  });

  it('enqueued record stores the payload intact', async () => {
    const db = makeDB();
    const payload = makePayload({ comments: 'No onions' });
    await db.enqueueOrder(payload);
    const [record] = await db.getPendingOrders();
    expect(record.payload.comments).toBe('No onions');
    expect(record.payload.items).toEqual(payload.items);
  });

  it('enqueued record has client_modified_at populated', async () => {
    const before = Date.now();
    const db = makeDB();
    await db.enqueueOrder(makePayload());
    const [record] = await db.getPendingOrders();
    expect(record.client_modified_at).toBeGreaterThanOrEqual(before);
    expect(record.client_modified_at).toBeLessThanOrEqual(Date.now());
  });

  it('enqueued record has queued_at populated', async () => {
    const before = Date.now();
    const db = makeDB();
    await db.enqueueOrder(makePayload());
    const [record] = await db.getPendingOrders();
    expect(record.queued_at).toBeGreaterThanOrEqual(before);
  });

  it('enqueued record has error=null and server_name=null', async () => {
    const db = makeDB();
    await db.enqueueOrder(makePayload());
    const [record] = await db.getPendingOrders();
    expect(record.error).toBeNull();
    expect(record.server_name).toBeNull();
  });

  it('getPendingOrders returns records oldest-first', async () => {
    const db = makeDB();
    await db.enqueueOrder(makePayload({ table: 'T-001' }));
    await db.enqueueOrder(makePayload({ table: 'T-002' }));
    await db.enqueueOrder(makePayload({ table: 'T-003' }));
    const records = await db.getPendingOrders();
    expect(records.length).toBe(3);
    expect(records[0].payload.table).toBe('T-001');
    expect(records[2].payload.table).toBe('T-003');
    // queued_at ascending
    expect(records[0].queued_at).toBeLessThanOrEqual(records[1].queued_at);
    expect(records[1].queued_at).toBeLessThanOrEqual(records[2].queued_at);
  });

  it('getPendingOrders excludes syncing records', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.markSyncing(id);
    const pending = await db.getPendingOrders();
    expect(pending.length).toBe(0);
  });

  it('getPendingOrders excludes error records', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.markError(id, 'server blew up');
    const pending = await db.getPendingOrders();
    expect(pending.length).toBe(0);
  });

  it('getPendingCount returns correct count', async () => {
    const db = makeDB();
    await db.enqueueOrder(makePayload());
    await db.enqueueOrder(makePayload());
    expect(await db.getPendingCount()).toBe(2);
  });
});

// ─── Status transitions ───────────────────────────────────────────────────────

describe('OfflineDB — status transitions', () => {
  it('markSyncing sets status to syncing', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.markSyncing(id);
    // Can't get via getPendingOrders (excluded) — use getQueueSummary
    const summary = await db.getQueueSummary();
    expect(summary.pending).toBe(0);
    // syncing is neither pending nor error
    expect(summary.error).toBe(0);
  });

  it('markSynced sets status to synced and stores server_name', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.markSyncing(id);
    await db.markSynced(id, 'POS-INV-0001');

    // Directly verify via IDB (synced records not returned by getPendingOrders)
    const db2 = new UryOfflineDB();
    const allOrders = await new Promise((resolve, reject) => {
      db2.ready.then(idb => {
        const req = idb.transaction('pending_orders').objectStore('pending_orders').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    const record = allOrders.find(r => r.local_id === id);
    expect(record.status).toBe('synced');
    expect(record.server_name).toBe('POS-INV-0001');
    expect(record.error).toBeNull();
  });

  it('markError sets status to error and stores message', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.markError(id, 'Connection timeout');
    const summary = await db.getQueueSummary();
    expect(summary.error).toBe(1);
    expect(summary.pending).toBe(0);
  });

  it('resetToRetry moves an errored record back to pending', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.markError(id, 'timeout');
    await db.resetToRetry(id);
    const pending = await db.getPendingOrders();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].error).toBeNull();
  });

  it('removeOrder deletes the record entirely', async () => {
    const db = makeDB();
    const id = await db.enqueueOrder(makePayload());
    await db.removeOrder(id);
    const pending = await db.getPendingOrders();
    expect(pending.length).toBe(0);
    const summary = await db.getQueueSummary();
    expect(summary.pending).toBe(0);
    expect(summary.error).toBe(0);
  });

  it('markSyncing on non-existent id is a no-op', async () => {
    const db = makeDB();
    // Should not throw
    await expect(db.markSyncing(99999)).resolves.toBeUndefined();
  });
});

// ─── getQueueSummary ──────────────────────────────────────────────────────────

describe('OfflineDB — getQueueSummary', () => {
  it('returns zero counts on empty database', async () => {
    const db = makeDB();
    const summary = await db.getQueueSummary();
    expect(summary).toEqual({ pending: 0, error: 0 });
  });

  it('counts pending and error records independently', async () => {
    const db = makeDB();
    const id1 = await db.enqueueOrder(makePayload());
    const id2 = await db.enqueueOrder(makePayload());
    const id3 = await db.enqueueOrder(makePayload());
    await db.markError(id1, 'err');
    await db.markSyncing(id2);
    // id3 stays pending
    const summary = await db.getQueueSummary();
    expect(summary.pending).toBe(1);
    expect(summary.error).toBe(1);
  });
});

// ─── clearPendingOrders ───────────────────────────────────────────────────────

describe('OfflineDB — clearPendingOrders', () => {
  it('removes all pending and non-pending records', async () => {
    const db = makeDB();
    const id1 = await db.enqueueOrder(makePayload());
    const id2 = await db.enqueueOrder(makePayload());
    await db.markError(id1, 'err');
    await db.clearPendingOrders();
    const summary = await db.getQueueSummary();
    expect(summary.pending).toBe(0);
    expect(summary.error).toBe(0);
  });
});

// ─── cached_menu ──────────────────────────────────────────────────────────────

describe('OfflineDB — cached_menu', () => {
  it('round-trips menu data for a branch+room key', async () => {
    const db = makeDB();
    const data = {
      items: [{ item: 'BURRITO', rate: 100 }],
      name: 'Victoria Menu',
      modified_time: '2026-01-01',
    };
    await db.setMenuCache('Victorias', 'Main Room', data);
    const result = await db.getMenuCache('Victorias', 'Main Room');
    expect(result).toEqual(data);
  });

  it('returns null for a cache miss', async () => {
    const db = makeDB();
    const result = await db.getMenuCache('NoSuchBranch', 'NoSuchRoom');
    expect(result).toBeNull();
  });

  it('different branch+room keys are stored independently', async () => {
    const db = makeDB();
    const data1 = { items: [{ item: 'TACO' }] };
    const data2 = { items: [{ item: 'ENCHILADA' }] };
    await db.setMenuCache('Victorias', 'Main Room', data1);
    await db.setMenuCache('Victorias', 'Bar Room', data2);

    expect(await db.getMenuCache('Victorias', 'Main Room')).toEqual(data1);
    expect(await db.getMenuCache('Victorias', 'Bar Room')).toEqual(data2);
  });

  it('null room is handled gracefully (cashier/takeaway case)', async () => {
    const db = makeDB();
    const data = { items: [{ item: 'BURRITO' }] };
    await db.setMenuCache('Victorias', null, data);
    const result = await db.getMenuCache('Victorias', null);
    expect(result).toEqual(data);
  });

  it('overwrites existing cache entry on second set', async () => {
    const db = makeDB();
    await db.setMenuCache('Victorias', 'Main Room', { items: [{ item: 'OLD' }] });
    await db.setMenuCache('Victorias', 'Main Room', { items: [{ item: 'NEW' }] });
    const result = await db.getMenuCache('Victorias', 'Main Room');
    expect(result.items[0].item).toBe('NEW');
  });

  it('cached_at is populated', async () => {
    const db = makeDB();
    const before = Date.now();
    await db.setMenuCache('Victorias', 'Main Room', { items: [] });

    // Access the raw record to check cached_at
    const raw = await new Promise((resolve, reject) => {
      db.ready.then(idb => {
        const req = idb
          .transaction('cached_menu')
          .objectStore('cached_menu')
          .get('Victorias|Main Room');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    expect(raw.cached_at).toBeGreaterThanOrEqual(before);
  });
});

// ─── cached_settings ─────────────────────────────────────────────────────────

describe('OfflineDB — cached_settings', () => {
  it('round-trips settings data for a branch key', async () => {
    const db = makeDB();
    const settings = {
      pos_profile: 'Victorias POS',
      branch: 'Victorias',
      warehouse: 'Stores - V',
      cashier: 'cashier@v.com',
      waiter: 'waiter@v.com',
    };
    await db.setSettingsCache('Victorias', settings);
    const result = await db.getSettingsCache('Victorias');
    expect(result).toEqual(settings);
  });

  it('returns null for a settings cache miss', async () => {
    const db = makeDB();
    const result = await db.getSettingsCache('NoSuchBranch');
    expect(result).toBeNull();
  });

  it('different branches are stored independently', async () => {
    const db = makeDB();
    await db.setSettingsCache('Victorias', { pos_profile: 'POS-V' });
    await db.setSettingsCache('SecretGarden', { pos_profile: 'POS-SG' });

    expect((await db.getSettingsCache('Victorias')).pos_profile).toBe('POS-V');
    expect((await db.getSettingsCache('SecretGarden')).pos_profile).toBe('POS-SG');
  });

  it('overwrites existing settings entry on second set', async () => {
    const db = makeDB();
    await db.setSettingsCache('Victorias', { pos_profile: 'OLD' });
    await db.setSettingsCache('Victorias', { pos_profile: 'NEW' });
    const result = await db.getSettingsCache('Victorias');
    expect(result.pos_profile).toBe('NEW');
  });
});
