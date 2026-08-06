/**
 * @file sync.test.ts
 * @description Unit tests for URY POS Sync Engine verifying sequential queue processing,
 * dependency ordering, exponential backoff, Temp-ID mapping, and request deduplication.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { UryPosDatabase } from '../../storage/db';
import { createRepositories, type StorageRepositories } from '../../storage/repositories';
import { CommandQueueManager } from '../../commands/command-queue';
import { CreateOrderCommand } from '../../commands/create-order.command';
import { TempIDMapper } from '../temp-id-mapper';
import { calculateBackoffDelay, isMaxAttemptsReached } from '../backoff';
import { SyncEngine } from '../sync.engine';
import { projectionBus } from '../../projections/projection.bus';
import { call } from '../../frappe/client';

let testDb: UryPosDatabase;
let repos: StorageRepositories;
let queueMgr: CommandQueueManager;
let idMapper: TempIDMapper;

const baseOrder = {
  order_type: 'Dine-In',
  items: [] as any[],
  grand_total: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

before(() => {
  testDb = new UryPosDatabase('TestSyncDb');
  repos = createRepositories(testDb);
  queueMgr = new CommandQueueManager(repos.syncQueue);
  idMapper = new TempIDMapper();
});

beforeEach(async () => {
  await repos.syncQueue.clear();
  await repos.orders.clear();
  await repos.metadata.clear();
  await idMapper.clear();
  projectionBus.clear();
});

after(async () => {
  await testDb.delete();
});

test('1. TempIDMapper — Register, Retrieve & Recursive Payload Remapping', async () => {
  await idMapper.registerMapping('TEMP-ORD-01', 'POS-INV-2026-0001');

  const mapped = await idMapper.getServerId('TEMP-ORD-01');
  assert.equal(mapped, 'POS-INV-2026-0001');

  const nestedPayload = {
    invoice: 'TEMP-ORD-01',
    details: { target: 'TEMP-ORD-01' },
    unrelated: 'TEXT_VAL',
  };

  const remapped = await idMapper.remapPayload(nestedPayload);
  assert.equal(remapped.invoice, 'POS-INV-2026-0001');
  assert.equal(remapped.details.target, 'POS-INV-2026-0001');
  assert.equal(remapped.unrelated, 'TEXT_VAL');
});

test('2. Exponential Backoff Calculator — Formula and max attempts check', () => {
  const delay1 = calculateBackoffDelay(1, { baseMs: 1000, maxMs: 30000, jitter: false });
  assert.equal(delay1, 1000);

  const delay2 = calculateBackoffDelay(2, { baseMs: 1000, maxMs: 30000, jitter: false });
  assert.equal(delay2, 2000);

  const delay3 = calculateBackoffDelay(3, { baseMs: 1000, maxMs: 30000, jitter: false });
  assert.equal(delay3, 4000);

  const maxDelay = calculateBackoffDelay(10, { baseMs: 1000, maxMs: 5000, jitter: false });
  assert.equal(maxDelay, 5000);

  assert.equal(isMaxAttemptsReached(5, 5), true);
  assert.equal(isMaxAttemptsReached(3, 5), false);
});

test('3. SyncEngine — Deduplication Lock and Sequential Processing', async () => {
  const engine = new SyncEngine(queueMgr, idMapper);

  assert.equal(engine.active, false);

  const cmd = new CreateOrderCommand(
    { order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] },
    { id: 'TEMP-ORD-10' }
  );
  await queueMgr.enqueue(cmd);

  // Execute sync
  const result = await engine.triggerSync();
  assert.equal(result.processed, 1);
  assert.equal(engine.active, false);
});

test('4. SyncEngine — Payment command referencing TEMP-* invoice is deferred, not failed', async () => {
  const { PaymentCommand } = await import('../../commands/payment.command');

  const TEMP_ID = 'TEMP-ORD-DEFER-002';

  // Enqueue payment command that references a TEMP-* invoice
  const payCmd = new PaymentCommand(
    { invoice: TEMP_ID, payments: [{ mode_of_payment: 'Cash', amount: 250 }] },
    { id: 'CMD-PAY-DEFERRED-SYNC' }
  );
  await queueMgr.enqueue(payCmd);

  const engine = new SyncEngine(queueMgr, idMapper);
  const result = await engine.triggerSync();

  // Payment should be deferred (not processed, not failed)
  assert.equal(result.processed, 0, 'Payment should not be processed while invoice is TEMP-*');
  assert.equal(result.failed, 0, 'Payment should not be marked failed while waiting for server invoice');

  const record = await repos.syncQueue.getById('CMD-PAY-DEFERRED-SYNC');
  assert.ok(record);
  assert.equal(record.status, 'PENDING', 'Payment command must remain PENDING so it can run after parent sync_order');
  assert.equal(record.attempts || record.retry_count || 0, 0, 'Retry count must not increase when command is deferred');
});

test('7. SyncEngine — Post-sync cleanup removes mapped TEMP-* orders and completed queue entries', async () => {
  const TEMP_ID = 'TEMP-ORD-CLEANUP-001';
  const SERVER_ID = 'POS-INV-2026-00999';

  // Seed a completed sync_order command and a pending payment command
  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID },
    timestamp: new Date().toISOString(),
    status: 'COMPLETED',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: 'SYNC-PAYMENT-CLEANUP-001',
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: { invoice: SERVER_ID, payments: [] },
    timestamp: new Date().toISOString(),
    status: 'COMPLETED',
    priority: 1,
  });

  // Seed the local TEMP-* order and its promoted server copy
  await repos.orders.put({
    id: TEMP_ID,
    order_type: 'Dine-In',
    status: 'Paid',
    items: [],
    grand_total: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  await repos.orders.put({
    id: SERVER_ID,
    order_type: 'Dine-In',
    status: 'Paid',
    items: [],
    grand_total: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'synced',
  });

  // Register the temp→server mapping
  await idMapper.registerMapping(TEMP_ID, SERVER_ID);

  let eventFired = false;
  projectionBus.subscribe(event => {
    if (event === 'ORDERS_UPDATED') eventFired = true;
  });

  const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
  const result = await engine.triggerSync();

  // Cleanup should remove the completed queue entries and the mapped TEMP-* order
  assert.equal(result.processed, 0, 'No pending commands to process');

  const tempOrder = await repos.orders.getById(TEMP_ID);
  assert.equal(tempOrder, undefined, 'Mapped TEMP-* order should be deleted after sync');

  const serverOrder = await repos.orders.getById(SERVER_ID);
  assert.ok(serverOrder, 'Server order should remain in IndexedDB');

  const queue = await repos.syncQueue.getAll();
  assert.equal(queue.length, 0, 'Completed queue entries should be purged');
  assert.equal(eventFired, true, 'ORDERS_UPDATED should fire after cleanup');
});

test('5. CommandQueueManager — Two-Stage Payment Dependency Resolution (findPaymentCommandsForTempId + updatePayload)', async () => {
  const { PaymentCommand } = await import('../../commands/payment.command');

  const TEMP_ID = 'TEMP-ORD-PAY-001';
  const SERVER_ID = 'URY-2026-2027-00123';

  // Enqueue a make_invoice command with a temp invoice ID
  const payCmd = new PaymentCommand(
    {
      invoice: TEMP_ID,
      payments: [{ mode_of_payment: 'Cash', amount: 389 }],
      cashier: 'cashier@example.com',
    },
    { id: 'CMD-PAY-TWO-STAGE' }
  );
  await queueMgr.enqueue(payCmd);

  // Verify it is findable by temp ID before patching
  const foundBefore = await queueMgr.findPaymentCommandsForTempId(TEMP_ID);
  assert.equal(foundBefore.length, 1);
  assert.equal((foundBefore[0].payload as any).invoice, TEMP_ID);

  // Simulate what SyncEngine does after sync_order resolves serverId
  const updatedPayload = {
    ...(foundBefore[0].payload as Record<string, unknown>),
    invoice: SERVER_ID,
  };
  await queueMgr.updatePayload('CMD-PAY-TWO-STAGE', updatedPayload);

  // Verify the payment command now has the real server ID
  const foundAfter = await queueMgr.findPaymentCommandsForTempId(TEMP_ID);
  assert.equal(foundAfter.length, 0, 'Payment command should no longer match old temp ID');

  const allCmds = await repos.syncQueue.findPending();
  const patchedCmd = allCmds.find(c => c.id === 'CMD-PAY-TWO-STAGE');
  assert.ok(patchedCmd, 'Payment command still exists in queue');
  assert.equal(
    (patchedCmd!.payload as any).invoice,
    SERVER_ID,
    'Payment command invoice field patched to real server ID'
  );
});

test('6. SyncEngine — Offline paid order: payment command is released after parent sync_order completes', async () => {
  const TEMP_ID = 'TEMP-ORD-OFFLINE-PAID-001';
  const SERVER_ID = 'POS-INV-2026-7777';

  // Stub Frappe API calls so this test does not need a running server.
  const originalPost = call.post;
  const postedEndpoints: string[] = [];
  (call as any).post = async (endpoint: string, _payload: any) => {
    postedEndpoints.push(endpoint);
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID };
    }
    if (endpoint.includes('make_invoice')) {
      return { name: SERVER_ID };
    }
    return {};
  };

  try {
    // Seed parent sync_order command exactly as the POS frontend queues it.
    await repos.syncQueue.put({
      id: `SYNC-ORDER-${TEMP_ID}`,
      action: 'sync_order',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
      payload: { temp_id: TEMP_ID, items: [] },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      priority: 1,
    });

    // Seed dependent make_invoice command as PaymentDialog queues it.
    await repos.syncQueue.put({
      id: `SYNC-PAYMENT-${TEMP_ID}`,
      action: 'make_invoice',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
      payload: {
        invoice: TEMP_ID,
        payments: [{ mode_of_payment: 'Cash', amount: 500 }],
      },
      dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
      dependencies: [`SYNC-ORDER-${TEMP_ID}`],
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      priority: 1,
    });

    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'Both sync_order and make_invoice should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');
    assert.ok(postedEndpoints.some(e => e.includes('sync_order')), 'sync_order endpoint should be called');
    assert.ok(postedEndpoints.some(e => e.includes('make_invoice')), 'make_invoice endpoint should be called');

    // Completed queue entries should be purged; no orphaned payment command remains.
    const remaining = await repos.syncQueue.getAll();
    assert.equal(remaining.length, 0, 'Completed queue entries should be purged');
  } finally {
    (call as any).post = originalPost;
  }
});

test('8. SyncEngine — Offline update of a synced order replays with the real server invoice ID', async () => {
  const SERVER_ID = 'POS-INV-2026-UPDATE-001';

  await repos.syncQueue.put({
    id: `SYNC-ORDER-UPDATE-${SERVER_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: SERVER_ID, last_invoice: SERVER_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  let postedPayload: any;
  (call as any).post = async (endpoint: string, payload: any) => {
    if (endpoint.includes('sync_order')) {
      postedPayload = payload;
      return { name: SERVER_ID };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'Update command should process');
    assert.equal(result.succeeded, 1, 'Update command should succeed');
    assert.equal(postedPayload.invoice, SERVER_ID, 'Payload must retain real invoice ID for update');
    assert.equal(postedPayload.last_invoice, SERVER_ID, 'Payload must retain last_invoice for update');
  } finally {
    (call as any).post = originalPost;
  }
});

test('9. SyncEngine — Offline update of a pending temp order reuses temp ID and maps to server ID', async () => {
  const TEMP_ID = 'TEMP-ORD-UPDATE-002';
  const SERVER_ID = 'POS-INV-2026-UPDATE-002';

  await repos.orders.put({
    id: TEMP_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: null, last_invoice: null, temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'Temp order update should process');
    assert.equal(result.succeeded, 1, 'Temp order update should succeed');

    const mapping = await idMapper.getServerId(TEMP_ID);
    assert.equal(mapping, SERVER_ID, 'Temp ID should be mapped to server ID');

    const tempOrder = await repos.orders.getById(TEMP_ID);
    assert.equal(tempOrder, undefined, 'Temp order record should be promoted/deleted');

    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.ok(serverOrder, 'Server order record should exist after promotion');
    assert.equal(serverOrder.sync_status, 'synced', 'Promoted order should be marked synced');
  } finally {
    (call as any).post = originalPost;
  }
});

test('10. SyncEngine — Promoted temp order adopts backend status from sync_order response', async () => {
  const TEMP_ID = 'TEMP-ORD-BACKEND-STATUS-001';
  const SERVER_ID = 'POS-INV-2026-BE-001';

  await repos.orders.put({
    id: TEMP_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    items: [],
    grand_total: 250,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      // Backend reports the invoice is already Paid (e.g. paid before sync).
      return { name: SERVER_ID, status: 'Paid' };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'Temp order sync should process');
    assert.equal(result.succeeded, 1, 'Temp order sync should succeed');

    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.ok(serverOrder, 'Server order record should exist after promotion');
    assert.equal(serverOrder.status, 'Paid', 'Promoted order should use backend Paid status');
    assert.equal(serverOrder.sync_status, 'synced', 'Promoted order should be marked synced');
  } finally {
    (call as any).post = originalPost;
  }
});

test('11. SyncEngine — Local Paid status is preserved when backend returns Draft', async () => {
  const TEMP_ID = 'TEMP-ORD-LOCAL-PAID-001';
  const SERVER_ID = 'POS-INV-2026-LOCAL-PAID-001';

  await repos.orders.put({
    id: TEMP_ID,
    order_type: 'Dine-In',
    status: 'Paid',
    items: [],
    grand_total: 400,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'Temp order sync should process');
    assert.equal(result.succeeded, 1, 'Temp order sync should succeed');

    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.ok(serverOrder, 'Server order record should exist after promotion');
    assert.equal(serverOrder.status, 'Paid', 'Offline Paid status must not be overwritten by backend Draft');
  } finally {
    (call as any).post = originalPost;
  }
});

// ============================================================================
// Validation Matrix Scenarios (Task 4)
// ============================================================================

test('Scenario 1: Offline Draft -> Sync -> Backend Draft -> offline fallback shows Draft', async () => {
  const TEMP_ID = 'TEMP-ORD-SC1-001';
  const SERVER_ID = 'POS-INV-2026-SC1-001';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    status: 'Draft',
    sync_status: 'pending',
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'sync_order should process');
    assert.equal(result.succeeded, 1, 'sync_order should succeed');

    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.ok(serverOrder, 'Server order record should exist after promotion');
    assert.equal(serverOrder.status, 'Draft', 'Backend Draft status must be preserved locally');
    assert.equal(serverOrder.sync_status, 'synced', 'Promoted order should be marked synced');

    const tempOrder = await repos.orders.getById(TEMP_ID);
    assert.equal(tempOrder, undefined, 'TEMP record should be deleted after promotion');

    const drafts = await repos.orders.findByStatus('Draft');
    assert.ok(drafts.some(o => o.id === SERVER_ID), 'Order must appear in Draft status lookup');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 2: Offline Draft -> Offline Payment -> Sync -> Backend Paid -> offline fallback shows Paid, not Draft', async () => {
  const TEMP_ID = 'TEMP-ORD-SC2-001';
  const SERVER_ID = 'POS-INV-2026-SC2-001';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    status: 'Draft',
    sync_status: 'pending',
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: `SYNC-PAYMENT-${TEMP_ID}`,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: TEMP_ID,
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    },
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    dependencies: [`SYNC-ORDER-${TEMP_ID}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    if (endpoint.includes('make_invoice')) {
      return { name: SERVER_ID };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'Both sync_order and make_invoice should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');

    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.ok(serverOrder, 'Server order record should exist after sync');
    assert.equal(serverOrder.status, 'Paid', 'Final local status must be Paid after payment sync');
    assert.equal(serverOrder.sync_status, 'synced');

    const drafts = await repos.orders.findByStatus('Draft');
    assert.ok(!drafts.some(o => o.id === SERVER_ID), 'Paid order must not appear in Draft lookup');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 3: Offline Draft -> Sync -> Offline Update -> no failure', async () => {
  const TEMP_ID = 'TEMP-ORD-SC3-001';
  const SERVER_ID = 'POS-INV-2026-SC3-001';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    status: 'Draft',
    sync_status: 'pending',
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const firstSync = await engine.triggerSync();
    assert.equal(firstSync.succeeded, 1, 'Initial sync should succeed');

    // Simulate offline update of the now-synced draft.
    await repos.syncQueue.put({
      id: `SYNC-ORDER-UPDATE-${SERVER_ID}`,
      action: 'sync_order',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
      payload: {
        invoice: SERVER_ID,
        last_invoice: SERVER_ID,
        items: [{ item: 'ITEM-002', item_name: 'Updated Item', rate: 50, qty: 1, amount: 50 }],
      },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      priority: 1,
    });

    const secondSync = await engine.triggerSync();
    assert.equal(secondSync.failed, 0, 'Offline update must not fail');
    assert.equal(secondSync.succeeded, 1, 'Offline update should sync successfully');

    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.ok(serverOrder, 'Server order should remain after offline update');
    assert.equal(serverOrder.status, 'Draft', 'Draft status should be retained after update');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 5: Refresh Browser -> IndexedDB state remains correct', async () => {
  const SERVER_ID = 'POS-INV-2026-SC5-001';

  await repos.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Paid',
    sync_status: 'synced',
  });

  // Simulate a browser refresh by re-creating repositories from the same database.
  const refreshedRepos = createRepositories(testDb);
  const orderAfterRefresh = await refreshedRepos.orders.getById(SERVER_ID);
  assert.ok(orderAfterRefresh, 'Order should survive a browser refresh');
  assert.equal(orderAfterRefresh.status, 'Paid', 'Status should remain Paid after refresh');
});

test('Scenario 6: Restart Browser -> IndexedDB state remains correct', async () => {
  const DB_NAME = 'PersistenceTestDb-SC6';
  const SERVER_ID = 'POS-INV-2026-SC6-001';

  const db1 = new UryPosDatabase(DB_NAME);
  const repos1 = createRepositories(db1);
  await repos1.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Paid',
    sync_status: 'synced',
  });
  await db1.close();

  try {
    const db2 = new UryPosDatabase(DB_NAME);
    const repos2 = createRepositories(db2);
    const orderAfterRestart = await repos2.orders.getById(SERVER_ID);
    assert.ok(orderAfterRestart, 'Order should persist across browser restart');
    assert.equal(orderAfterRestart.status, 'Paid', 'Status should remain Paid after restart');
    await db2.delete();
  } catch (err) {
    try { await new UryPosDatabase(DB_NAME).delete(); } catch {}
    throw err;
  }
});

test('12. SyncEngine — Payment command matched by entity_id is patched and dependencies cleared', async () => {
  const TEMP_ID = 'TEMP-ORD-ENTITY-ID-001';
  const SERVER_ID = 'POS-INV-2026-ENTITY-001';

  // Seed parent sync_order command
  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  // Seed a make_invoice command whose payload.invoice is the temp ID but that
  // also carries entity_id / temporary_id envelope metadata (as PaymentDialog
  // now writes). It has a hard dependency on the parent sync_order.
  await repos.syncQueue.put({
    id: `SYNC-PAYMENT-${TEMP_ID}`,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: TEMP_ID,
      payments: [{ mode_of_payment: 'Cash', amount: 500 }],
    },
    temporary_id: TEMP_ID,
    entity_id: TEMP_ID,
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    dependencies: [`SYNC-ORDER-${TEMP_ID}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedEndpoints: string[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedEndpoints.push(endpoint);
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    if (endpoint.includes('make_invoice')) {
      assert.equal(payload.invoice, SERVER_ID, 'make_invoice must be called with server ID after patch');
      return { name: SERVER_ID };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'Both sync_order and make_invoice should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');
    assert.ok(postedEndpoints.some(e => e.includes('sync_order')));
    assert.ok(postedEndpoints.some(e => e.includes('make_invoice')));

    const remaining = await repos.syncQueue.getAll();
    assert.equal(remaining.length, 0, 'Completed commands should be purged');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 7: Multiple Orders statuses and order types match backend', async () => {
  const orders = [
    { tempId: 'TEMP-ORD-SC7-001', serverId: 'POS-INV-2026-SC7-001', status: 'Draft', order_type: 'Dine-In', table: 'T-01' },
    { tempId: 'TEMP-ORD-SC7-002', serverId: 'POS-INV-2026-SC7-002', status: 'Paid', order_type: 'Takeaway' },
    { tempId: 'TEMP-ORD-SC7-003', serverId: 'POS-INV-2026-SC7-003', status: 'Cancelled', order_type: 'Delivery' },
    { tempId: 'TEMP-ORD-SC7-004', serverId: 'POS-INV-2026-SC7-004', status: 'Draft', order_type: 'Aggregators' },
    { tempId: 'TEMP-ORD-SC7-005', serverId: 'POS-INV-2026-SC7-005', status: 'Unbilled', order_type: 'Phone In', table: 'T-02' },
  ];

  for (const o of orders) {
    await repos.orders.put({
      ...baseOrder,
      id: o.tempId,
      table: o.table,
      order_type: o.order_type,
      status: o.status === 'Paid' ? 'Paid' : 'Draft',
      sync_status: 'pending',
    });
    await repos.syncQueue.put({
      id: `SYNC-ORDER-${o.tempId}`,
      action: 'sync_order',
      endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
      payload: { temp_id: o.tempId, items: [] },
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      priority: 1,
    });
  }

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, payload: any) => {
    if (endpoint.includes('sync_order')) {
      const order = orders.find(o => o.tempId === payload.temp_id);
      return { name: order?.serverId, status: order?.status };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();
    assert.equal(result.succeeded, orders.length, 'All order syncs should succeed');

    for (const o of orders) {
      const serverOrder = await repos.orders.getById(o.serverId);
      assert.ok(serverOrder, `Server order ${o.serverId} should exist`);
      assert.equal(serverOrder.status, o.status, `Status should match backend for ${o.serverId}`);
      assert.equal(serverOrder.order_type, o.order_type, `Order type should match for ${o.serverId}`);
    }
  } finally {
    (call as any).post = originalPost;
  }
});

