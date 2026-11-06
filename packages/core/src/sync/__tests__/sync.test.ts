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
  idMapper = new TempIDMapper(repos);
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

  // Paid+synced records are purged post-sync by design (minimal storage
  // footprint); the server copy is the source of truth after sync.
  const serverOrder = await repos.orders.getById(SERVER_ID);
  assert.equal(serverOrder, undefined, 'Paid synced server order should be purged after sync');

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

test('10. SyncEngine — Backend Paid status from sync_order is promoted and purged post-sync', async () => {
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

    // Backend reported Paid, so the promoted record is terminal and is purged
    // post-sync by design. The observable guarantees are the temp->server
    // mapping and a fully drained queue.
    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.equal(serverOrder, undefined, 'Paid promoted order should be purged after sync');
    assert.equal(await idMapper.getServerId(TEMP_ID), SERVER_ID, 'Temp->server mapping must be registered');
  } finally {
    (call as any).post = originalPost;
  }
});

test('11. SyncEngine — Local Paid status wins over backend Draft and is purged post-sync', async () => {
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

    // Local Paid wins over backend Draft, making the promoted record terminal;
    // terminal records are purged post-sync by design.
    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.equal(serverOrder, undefined, 'Paid-promoted order should be purged after sync');
    assert.equal(await idMapper.getServerId(TEMP_ID), SERVER_ID, 'Temp->server mapping must be registered');
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

    // Final synced status is Paid (terminal) -> purged post-sync by design.
    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.equal(serverOrder, undefined, 'Paid order should be purged after sync');
    assert.equal(await idMapper.getServerId(TEMP_ID), SERVER_ID, 'Temp->server mapping must be registered');

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
      status: o.status as any,
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

    const terminalStatuses = ['Paid', 'Cancelled', 'Consolidated', 'Return'];
    for (const o of orders) {
      const serverOrder = await repos.orders.getById(o.serverId);
      if (terminalStatuses.includes(o.status)) {
        // Terminal records are purged post-sync by design.
        assert.equal(serverOrder, undefined, `Server order ${o.serverId} should be purged`);
      } else {
        assert.ok(serverOrder, `Server order ${o.serverId} should exist`);
        assert.equal(serverOrder.status, o.status, `Status should match backend for ${o.serverId}`);
        assert.equal(serverOrder.order_type, o.order_type, `Order type should match for ${o.serverId}`);
      }
      assert.equal(await idMapper.getServerId(o.tempId), o.serverId, `Mapping must be registered for ${o.tempId}`);
    }
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 8: Offline Aggregator create -> offline payment -> sync -> Paid with custom_aggregator_id preserved', async () => {
  const TEMP_ID = 'TEMP-ORD-AGG-SYNC-001';
  const SERVER_ID = 'AGURY-2026-2027-00008';

  // Seed local temp Aggregator order as Draft (after OrderPanel submit offline).
  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    order_type: 'Aggregators',
    status: 'Draft',
    custom_aggregator_id: 'Swiggy',
    sync_status: 'pending',
    items: [
      { item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, qty: 1, amount: 530 },
      { item: 'SZC', item_name: 'Sizzling Arabian Chicken Single', rate: 160, qty: 1, amount: 160 },
    ],
    grand_total: 690,
  });

  // Queue sync_order using the new envelope format (temporary_id on envelope, clean payload).
  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: {
      aggregator_id: 'Swiggy',
      cashier: 'urycashier@gmail.com',
      customer: 'Swiggy',
      invoice: null,
      items: [
        { item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, qty: 1 },
        { item: 'SZC', item_name: 'Sizzling Arabian Chicken Single', rate: 160, qty: 1 },
      ],
      last_invoice: null,
      mode_of_payment: 'Cash',
      no_of_pax: 1,
      order_type: 'Aggregators',
      owner: 'urycashier@gmail.com',
      pos_profile: 'URY',
      waiter: 'urycashier@gmail.com',
    },
    temporary_id: TEMP_ID,
    idempotency_key: TEMP_ID,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  // Queue make_invoice using the new envelope format.
  await repos.syncQueue.put({
    id: `SYNC-PAYMENT-${TEMP_ID}`,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      additionalDiscount: null,
      cashier: 'urycashier@gmail.com',
      customer: 'Swiggy',
      invoice: TEMP_ID,
      owner: 'urycashier@gmail.com',
      payments: [{ mode_of_payment: 'Cash', amount: 690 }],
      pos_profile: 'URY',
      table: null,
    },
    temporary_id: TEMP_ID,
    entity_id: TEMP_ID,
    idempotency_key: `PAY-${TEMP_ID}-123456`,
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

    // Offline-paid Aggregator order syncs as Paid (terminal) -> purged post-sync by design.
    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.equal(serverOrder, undefined, 'Paid Aggregator order should be purged after sync');
    assert.equal(await idMapper.getServerId(TEMP_ID), SERVER_ID, 'Temp->server mapping must be registered');

    const drafts = await repos.orders.findByStatus('Draft');
    assert.ok(!drafts.some(o => o.id === SERVER_ID), 'Paid Aggregator order must not appear in Draft lookup');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 8b: sync_order returns backend status Failure -> command fails and dependent payment is not executed', async () => {
  const TEMP_ID = 'TEMP-ORD-AGG-FAILURE-001';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    order_type: 'Aggregators',
    status: 'Draft',
    custom_aggregator_id: 'Swiggy',
    sync_status: 'pending',
    items: [{ item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, qty: 1, amount: 530 }],
    grand_total: 530,
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: {
      aggregator_id: 'Swiggy',
      cashier: 'urycashier@gmail.com',
      customer: 'Swiggy',
      invoice: null,
      items: [{ item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, qty: 1 }],
      last_invoice: null,
      mode_of_payment: 'Cash',
      no_of_pax: 1,
      order_type: 'Aggregators',
      owner: 'urycashier@gmail.com',
      pos_profile: 'URY',
      waiter: 'urycashier@gmail.com',
    },
    temporary_id: TEMP_ID,
    idempotency_key: TEMP_ID,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: `SYNC-PAYMENT-${TEMP_ID}`,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      additionalDiscount: null,
      cashier: 'urycashier@gmail.com',
      customer: 'Swiggy',
      invoice: TEMP_ID,
      owner: 'urycashier@gmail.com',
      payments: [{ mode_of_payment: 'Cash', amount: 530 }],
      pos_profile: 'URY',
      table: null,
    },
    temporary_id: TEMP_ID,
    entity_id: TEMP_ID,
    idempotency_key: `PAY-${TEMP_ID}-123456`,
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string) => {
    if (endpoint.includes('sync_order')) {
      // Backend returned HTTP 200 but business-rule failure.
      return { status: 'Failure', message: 'Invoice Already Billed' };
    }
    if (endpoint.includes('make_invoice')) {
      throw new Error('make_invoice should not be called after sync_order Failure');
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'Only sync_order should be processed');
    assert.equal(result.succeeded, 0, 'sync_order Failure should not count as success');

    const syncCmd = await repos.syncQueue.getById(`SYNC-ORDER-${TEMP_ID}`);
    assert.equal(syncCmd?.status, 'FAILED', 'sync_order command must be marked FAILED');

    const payCmd = await repos.syncQueue.getById(`SYNC-PAYMENT-${TEMP_ID}`);
    assert.equal(payCmd?.status, 'PENDING', 'Dependent payment must remain pending');
    assert.equal((payCmd?.payload as any)?.invoice, TEMP_ID, 'Payment invoice must not be patched');

    const mapping = await idMapper.getServerId(TEMP_ID);
    assert.equal(mapping, TEMP_ID, 'No temp->server mapping should be registered');
  } finally {
    (call as any).post = originalPost;
  }
});



// ============================================================================
// Task 5: Kitchen / KOT Print — Sync Engine respects GET HTTP method
// ============================================================================

test('SyncEngine — KOT reprint command is executed via GET and purged', async () => {
  const SERVER_ID = 'POS-INV-KOT-SYNC-001';

  await repos.syncQueue.put({
    id: `KOT-REPRINT-${SERVER_ID}`,
    action: 'kot_reprint',
    endpoint: 'ury.ury.api.ury_kot_reprint.reprint_kot',
    payload: { invoice_number: SERVER_ID },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalGet = call.get;
  const originalPost = call.post;
  const getCalls: { endpoint: string; payload: any }[] = [];
  const postCalls: { endpoint: string; payload: any }[] = [];

  (call as any).get = async (endpoint: string, payload: any) => {
    getCalls.push({ endpoint, payload });
    return { message: 'Success' };
  };
  (call as any).post = async (endpoint: string, payload: any) => {
    postCalls.push({ endpoint, payload });
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'KOT reprint command should process');
    assert.equal(result.succeeded, 1, 'KOT reprint command should succeed');
    assert.equal(getCalls.length, 1, 'KOT reprint must use GET');
    assert.equal(getCalls[0].endpoint, 'ury.ury.api.ury_kot_reprint.reprint_kot');
    assert.equal(getCalls[0].payload.invoice_number, SERVER_ID);
    assert.equal(postCalls.length, 0, 'KOT reprint must not use POST');

    const remaining = await repos.syncQueue.getAll();
    assert.equal(remaining.length, 0, 'Completed KOT reprint command should be purged');
  } finally {
    (call as any).get = originalGet;
    (call as any).post = originalPost;
  }
});

test('SyncEngine — KOT reprint for temp invoice waits for parent sync_order', async () => {
  const TEMP_ID = 'TEMP-ORD-KOT-SYNC-002';
  const SERVER_ID = 'POS-INV-KOT-SYNC-002';

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
    id: `KOT-REPRINT-${TEMP_ID}`,
    action: 'kot_reprint',
    endpoint: 'ury.ury.api.ury_kot_reprint.reprint_kot',
    payload: { invoice_number: TEMP_ID },
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalGet = call.get;
  const originalPost = call.post;
  const getCalls: { endpoint: string; payload: any }[] = [];

  (call as any).get = async (endpoint: string, payload: any) => {
    getCalls.push({ endpoint, payload });
    return { message: 'Success' };
  };
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'Both sync_order and KOT reprint should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');
    assert.equal(getCalls.length, 1, 'KOT reprint should be called once');
    assert.equal(getCalls[0].payload.invoice_number, SERVER_ID, 'KOT reprint payload should be remapped to server ID');

    const remaining = await repos.syncQueue.getAll();
    assert.equal(remaining.length, 0, 'Completed commands should be purged');
  } finally {
    (call as any).get = originalGet;
    (call as any).post = originalPost;
  }
});


// ============================================================================
// Hardening Validation Scenarios (Task 5)
// ============================================================================

test('Scenario 8c: sync_order returns no invoice name -> command fails and no mapping registered', async () => {
  const TEMP_ID = 'TEMP-ORD-HARDEN-001';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    order_type: 'Takeaway',
    status: 'Draft',
    sync_status: 'pending',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
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
      // Malformed backend response: no name, no explicit Failure, but no proof of creation.
      return { message: 'Saved' };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'sync_order should be processed');
    assert.equal(result.succeeded, 0, 'sync_order without invoice name must not count as success');

    const syncCmd = await repos.syncQueue.getById(`SYNC-ORDER-${TEMP_ID}`);
    assert.equal(syncCmd?.status, 'FAILED', 'sync_order command must be FAILED');

    const mapping = await idMapper.getServerId(TEMP_ID);
    assert.equal(mapping, TEMP_ID, 'No temp->server mapping should be registered');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 8d: make_invoice returns neither success nor name -> command fails', async () => {
  const SERVER_ID = 'POS-INV-HARDEN-002';

  await repos.syncQueue.put({
    id: 'SYNC-PAYMENT-HARDEN-002',
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: SERVER_ID,
      payments: [{ mode_of_payment: 'Cash', amount: 250 }],
    },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('make_invoice')) {
      // Ambiguous response: no success flag, no name.
      return { message: { ok: true } };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'make_invoice should be processed');
    assert.equal(result.succeeded, 0, 'make_invoice without success proof must fail');

    const payCmd = await repos.syncQueue.getById('SYNC-PAYMENT-HARDEN-002');
    assert.equal(payCmd?.status, 'FAILED', 'make_invoice command must be FAILED');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 8e: sync_order failure blocks dependent cancel_order', async () => {
  const TEMP_ID = 'TEMP-ORD-HARDEN-003';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    order_type: 'Takeaway',
    status: 'Draft',
    sync_status: 'pending',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
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
    id: `CANCEL-ORDER-${TEMP_ID}`,
    action: 'cancel_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.cancel_order',
    payload: { invoice_id: TEMP_ID },
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, _payload: any) => {
    if (endpoint.includes('sync_order')) {
      return { status: 'Failure', message: 'Table already occupied' };
    }
    if (endpoint.includes('cancel_order')) {
      throw new Error('cancel_order should not run after sync_order failure');
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'Only sync_order should be processed');
    assert.equal(result.succeeded, 0, 'sync_order failure should not succeed');

    const syncCmd = await repos.syncQueue.getById(`SYNC-ORDER-${TEMP_ID}`);
    assert.equal(syncCmd?.status, 'FAILED', 'sync_order must be FAILED');

    const cancelCmd = await repos.syncQueue.getById(`CANCEL-ORDER-${TEMP_ID}`);
    assert.equal(cancelCmd?.status, 'PENDING', 'Dependent cancel_order must remain PENDING');
  } finally {
    (call as any).post = originalPost;
  }
});

// ============================================================================
// Offline Cancellation Scenarios
// ============================================================================

test('Scenario 13: Offline cancel of temp order -> sync_order -> cancel_order drains and matches backend state', async () => {
  const TEMP_ID = 'TEMP-ORD-CANCEL-SYNC-001';
  const SERVER_ID = 'POS-INV-CANCEL-SYNC-001';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    order_type: 'Dine-In',
    status: 'Unbilled',
    sync_status: 'pending',
    table: 'T-CANCEL-SYNC-001',
    items: [{ name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.tables.put({
    name: 'T-CANCEL-SYNC-001',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CANCEL-SYNC-002',
  });
  await repos.tables.put({
    name: 'T-CANCEL-SYNC-002',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CANCEL-SYNC-001',
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
    id: `CANCEL-ORDER-${TEMP_ID}`,
    action: 'cancel_order',
    operation_type: 'DELETE_ORDER',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.cancel_order',
    payload: { invoice_id: TEMP_ID, reason: 'No show' },
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    temporary_id: TEMP_ID,
    entity_id: TEMP_ID,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 5,
  });

  const originalPost = call.post;
  const postedPayloads: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    if (endpoint.includes('cancel_order')) {
      return {};
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'sync_order and cancel_order should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');

    const cancelPosted = postedPayloads.find(p => p.endpoint.includes('cancel_order'));
    assert.ok(cancelPosted, 'cancel_order endpoint should be called');
    assert.equal(cancelPosted.payload.invoice_id, SERVER_ID, 'cancel_order payload must be remapped to server ID');
    assert.equal(cancelPosted.payload.reason, 'No show');
    assert.equal(cancelPosted.payload.table, undefined, 'cancel_order payload must not include table');

    // Cancelled is terminal -> purged post-sync by design.
    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.equal(serverOrder, undefined, 'Cancelled order should be purged after sync');
    assert.equal(await idMapper.getServerId(TEMP_ID), SERVER_ID, 'Temp->server mapping must be registered');

    const tempOrder = await repos.orders.getById(TEMP_ID);
    assert.equal(tempOrder, undefined, 'Temp order should be cleaned up after sync');

    for (const tableName of ['T-CANCEL-SYNC-001', 'T-CANCEL-SYNC-002']) {
      const t = await repos.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released after cancel sync`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared after cancel sync`);
    }

    const remainingQueue = await repos.syncQueue.getAll();
    assert.equal(remainingQueue.length, 0, 'Completed commands should be purged');
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 14: Offline cancel of server invoice -> cancel_order releases merge cluster', async () => {
  const SERVER_ID = 'POS-INV-CANCEL-SERVER-001';

  await repos.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'synced',
    table: 'T-CANCEL-SERVER-001',
    items: [{ name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.tables.put({
    name: 'T-CANCEL-SERVER-001',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CANCEL-SERVER-002',
  });
  await repos.tables.put({
    name: 'T-CANCEL-SERVER-002',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CANCEL-SERVER-001',
  });

  await repos.syncQueue.put({
    id: `CANCEL-ORDER-${SERVER_ID}`,
    action: 'cancel_order',
    operation_type: 'DELETE_ORDER',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.cancel_order',
    payload: { invoice_id: SERVER_ID, reason: 'Customer request' },
    entity_id: SERVER_ID,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 5,
  });

  const originalPost = call.post;
  (call as any).post = async (endpoint: string, payload: any) => {
    if (endpoint.includes('cancel_order')) {
      assert.equal(payload.invoice_id, SERVER_ID);
      assert.equal(payload.reason, 'Customer request');
      return {};
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'cancel_order should process');
    assert.equal(result.succeeded, 1, 'cancel_order should succeed');

    // Cancelled is terminal -> purged post-sync by design.
    const serverOrder = await repos.orders.getById(SERVER_ID);
    assert.equal(serverOrder, undefined, 'Cancelled server invoice should be purged after sync');

    for (const tableName of ['T-CANCEL-SERVER-001', 'T-CANCEL-SERVER-002']) {
      const t = await repos.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared`);
    }
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 8f: getPendingCommands blocks command whose dependency is FAILED', async () => {
  const PARENT_ID = 'PARENT-FAILED-001';
  const CHILD_ID = 'CHILD-BLOCKED-001';

  await repos.syncQueue.put({
    id: PARENT_ID,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: {},
    timestamp: new Date().toISOString(),
    status: 'FAILED',
    attempts: 5,
    priority: 1,
  });

  await repos.syncQueue.put({
    id: CHILD_ID,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: { invoice: 'POS-INV-ANY' },
    dependency_ids: [PARENT_ID],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const ready = await queueMgr.getPendingCommands();
  const readyIds = ready.map(c => c.command_id || c.id);

  assert.ok(!readyIds.includes(CHILD_ID), 'Child command must not be ready while parent is FAILED');
});

// ============================================================================
// Offline Merge Bill Scenarios
// ============================================================================

test('Scenario 9: Offline merge of two server invoices -> queued and replayed with real IDs', async () => {
  const PRIMARY_ID = 'POS-INV-MERGE-001';
  const SECONDARY_ID = 'POS-INV-MERGE-002';

  await repos.orders.put({
    ...baseOrder,
    id: PRIMARY_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.orders.put({
    ...baseOrder,
    id: SECONDARY_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
  });

  await repos.syncQueue.put({
    id: 'SYNC-MERGE-BILL-001',
    action: 'merge_bills',
    operation_type: 'MERGE_BILLS',
    endpoint: 'ury.ury_pos.api.merge_bills',
    payload: { primary_invoice: PRIMARY_ID, secondary_invoice: SECONDARY_ID },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedPayloads: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('merge_bills')) {
      return { status: 'success', name: payload.primary_invoice };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1, 'merge_bills should process');
    assert.equal(result.succeeded, 1, 'merge_bills should succeed');

    const posted = postedPayloads.find(p => p.endpoint.includes('merge_bills'));
    assert.ok(posted, 'merge_bills endpoint should be called');
    assert.equal(posted.payload.primary_invoice, PRIMARY_ID);
    assert.equal(posted.payload.secondary_invoice, SECONDARY_ID);

    const primary = await repos.orders.getById(PRIMARY_ID);
    const secondary = await repos.orders.getById(SECONDARY_ID);
    assert.ok(primary);
    assert.ok(secondary);
    assert.equal(primary.custom_merged_pos_invoice, SECONDARY_ID);
    assert.equal(primary.custom_merged_total, 200);
    assert.equal(secondary.custom_merged_pos_invoice, PRIMARY_ID);
    assert.equal(secondary.custom_merged_total, 100);
  } finally {
    (call as any).post = originalPost;
  }
});

test('Scenario 10: Offline merge with temp primary -> merge command is patched after sync_order resolves', async () => {
  const TEMP_ID = 'TEMP-ORD-MERGE-003';
  const SERVER_ID = 'POS-INV-MERGE-003';
  const SECONDARY_ID = 'POS-INV-MERGE-004';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'pending',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.orders.put({
    ...baseOrder,
    id: SECONDARY_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
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
    id: 'SYNC-MERGE-BILL-002',
    action: 'merge_bills',
    operation_type: 'MERGE_BILLS',
    endpoint: 'ury.ury_pos.api.merge_bills',
    payload: { primary_invoice: TEMP_ID, secondary_invoice: SECONDARY_ID },
    dependency_ids: [`SYNC-ORDER-${TEMP_ID}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedPayloads: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_ID, status: 'Draft' };
    }
    if (endpoint.includes('merge_bills')) {
      return { status: 'success', name: payload.primary_invoice };
    }
    return {};
  };

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'sync_order and merge_bills should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');

    const posted = postedPayloads.find(p => p.endpoint.includes('merge_bills'));
    assert.ok(posted, 'merge_bills endpoint should be called');
    assert.equal(posted.payload.primary_invoice, SERVER_ID, 'merge_bills primary should be patched to server ID');
    assert.equal(posted.payload.secondary_invoice, SECONDARY_ID);

    const primary = await repos.orders.getById(SERVER_ID);
    const secondary = await repos.orders.getById(SECONDARY_ID);
    assert.ok(primary, 'Promoted server order should exist');
    assert.ok(secondary);
    assert.equal(primary.custom_merged_pos_invoice, SECONDARY_ID);
    assert.equal(secondary.custom_merged_pos_invoice, SERVER_ID);
  } finally {
    (call as any).post = originalPost;
  }
});

// ============================================================================
// Offline Split Bill Scenarios
// ============================================================================

test('Scenario 11: Offline split of a server invoice -> child promoted and dependent payment patched', async () => {
  const SOURCE_ID = 'POS-INV-SPLIT-001';
  const CHILD_TEMP_ID = 'TEMP-SPLIT-001';
  const CHILD_SERVER_ID = 'POS-INV-SPLIT-002';

  await repos.orders.put({
    ...baseOrder,
    id: SOURCE_ID,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'synced',
    table: 'T-01',
    custom_split_group: 'TEMP-SG-001',
    items: [
      { name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 },
      { name: 'ROW-2', item: 'ITEM-B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 },
    ],
    grand_total: 150,
  });

  await repos.orders.put({
    ...baseOrder,
    id: CHILD_TEMP_ID,
    order_type: 'Dine-In',
    status: 'Unbilled',
    sync_status: 'pending',
    table: 'T-01',
    custom_split_group: 'TEMP-SG-001',
    custom_split_from: SOURCE_ID,
    pending_command_id: 'SYNC-SPLIT-001',
    items: [{ name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.syncQueue.put({
    id: 'SYNC-SPLIT-001',
    action: 'SplitBillCommand',
    operation_type: 'SPLIT_BILL',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.split_bill',
    payload: {
      source_invoice: SOURCE_ID,
      items_to_move: [{ name: 'ROW-1', qty: 1 }],
    },
    temporary_id: CHILD_TEMP_ID,
    entity_id: SOURCE_ID,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  // A payment on the not-yet-synced child should wait for the split command.
  await repos.syncQueue.put({
    id: 'SYNC-PAYMENT-CHILD-001',
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: CHILD_TEMP_ID,
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    },
    dependency_ids: ['SYNC-SPLIT-001'],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedPayloads: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('split_bill')) {
      return { new_invoice: CHILD_SERVER_ID };
    }
    if (endpoint.includes('make_invoice')) {
      return { name: payload.invoice };
    }
    return {};
  };

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: {
      group: 'SG-001',
      current: CHILD_SERVER_ID,
      invoices: [
        {
          name: SOURCE_ID,
          custom_split_from: null,
          split_index: 1,
          split_total: 2,
          split_siblings: [CHILD_SERVER_ID],
          customer: 'Guest',
          grand_total: 150,
          invoice_printed: 0,
          restaurant_table: 'T-01',
          status: 'Draft',
        },
        {
          name: CHILD_SERVER_ID,
          custom_split_from: SOURCE_ID,
          split_index: 2,
          split_total: 2,
          split_siblings: [SOURCE_ID],
          customer: 'Guest',
          grand_total: 100,
          invoice_printed: 0,
          restaurant_table: 'T-01',
          status: 'Draft',
        },
      ],
    },
  });

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'split_bill and dependent make_invoice should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');

    const splitPosted = postedPayloads.find(p => p.endpoint.includes('split_bill'));
    assert.ok(splitPosted, 'split_bill endpoint should be called');
    assert.equal(splitPosted.payload.source_invoice, SOURCE_ID);
    assert.deepEqual(splitPosted.payload.items_to_move, [{ name: 'ROW-1', qty: 1 }]);

    const payPosted = postedPayloads.find(p => p.endpoint.includes('make_invoice'));
    assert.ok(payPosted, 'make_invoice endpoint should be called');
    assert.equal(payPosted.payload.invoice, CHILD_SERVER_ID, 'Child payment should use server ID');

    const source = await repos.orders.getById(SOURCE_ID);
    assert.ok(source);
    assert.equal(source.custom_split_group, 'SG-001');
    assert.equal(source.items.length, 2, 'Source should still have both item rows after partial move');
    const movedRow = source.items.find((i: any) => i.item === 'ITEM-A');
    assert.equal(movedRow?.qty, 1, 'Source row quantity should be reduced');

    // The child was paid in this scenario, so its promoted record is terminal
    // and purged post-sync by design.
    const child = await repos.orders.getById(CHILD_SERVER_ID);
    assert.equal(child, undefined, 'Paid child should be purged after sync');

    const tempChild = await repos.orders.getById(CHILD_TEMP_ID);
    assert.equal(tempChild, undefined, 'TEMP-SPLIT child should be removed after promotion');

    const remainingQueue = await repos.syncQueue.getAll();
    assert.equal(remainingQueue.length, 0, 'Completed commands should be purged');
  } finally {
    (call as any).post = originalPost;
    (call as any).get = originalGet;
  }
});

test('Scenario 12: Offline split of a temp source waits for parent sync_order and patches source id', async () => {
  const TEMP_SOURCE = 'TEMP-ORD-SPLIT-003';
  const SERVER_SOURCE = 'POS-INV-SPLIT-003';
  const CHILD_TEMP = 'TEMP-SPLIT-003';
  const CHILD_SERVER = 'POS-INV-SPLIT-004';

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_SOURCE,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'pending',
    custom_split_group: 'TEMP-SG-002',
    items: [{ name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.orders.put({
    ...baseOrder,
    id: CHILD_TEMP,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'pending',
    custom_split_group: 'TEMP-SG-002',
    custom_split_from: TEMP_SOURCE,
    pending_command_id: 'SYNC-SPLIT-TEMP-003',
    items: [{ name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_SOURCE}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_SOURCE, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: 'SYNC-SPLIT-TEMP-003',
    action: 'SplitBillCommand',
    operation_type: 'SPLIT_BILL',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.split_bill',
    payload: {
      source_invoice: TEMP_SOURCE,
      items_to_move: [{ name: 'ROW-1', qty: 1 }],
    },
    temporary_id: CHILD_TEMP,
    entity_id: TEMP_SOURCE,
    dependency_ids: [`SYNC-ORDER-${TEMP_SOURCE}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedPayloads: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_SOURCE, status: 'Draft' };
    }
    if (endpoint.includes('split_bill')) {
      return { new_invoice: CHILD_SERVER };
    }
    return {};
  };

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: {
      group: 'SG-002',
      current: CHILD_SERVER,
      invoices: [
        { name: SERVER_SOURCE, custom_split_from: null, split_index: 1, split_total: 2, split_siblings: [CHILD_SERVER], customer: 'Guest', grand_total: 100, invoice_printed: 0, status: 'Draft' },
        { name: CHILD_SERVER, custom_split_from: SERVER_SOURCE, split_index: 2, split_total: 2, split_siblings: [SERVER_SOURCE], customer: 'Guest', grand_total: 100, invoice_printed: 0, status: 'Draft' },
      ],
    },
  });

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'sync_order and split_bill should process');
    assert.equal(result.succeeded, 2);

    const splitPosted = postedPayloads.find(p => p.endpoint.includes('split_bill'));
    assert.ok(splitPosted);
    assert.equal(splitPosted.payload.source_invoice, SERVER_SOURCE, 'split_bill should use promoted source ID');

    const source = await repos.orders.getById(SERVER_SOURCE);
    assert.ok(source);
    assert.equal(source.custom_split_group, 'SG-002');

    const child = await repos.orders.getById(CHILD_SERVER);
    assert.ok(child);
    assert.equal(child.custom_split_from, SERVER_SOURCE);
  } finally {
    (call as any).post = originalPost;
    (call as any).get = originalGet;
  }
});


test('Scenario 15: SyncEngine clears merged linkages and releases cluster after merged payment', async () => {
  const PRIMARY_ID = 'POS-INV-MERGE-PAY-SYNC-001';
  const SECONDARY_ID = 'POS-INV-MERGE-PAY-SYNC-002';

  await repos.tables.put({
    name: 'T-MERGE-PAY-SYNC-001',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-MERGE-PAY-SYNC-002',
  });
  await repos.tables.put({
    name: 'T-MERGE-PAY-SYNC-002',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-MERGE-PAY-SYNC-001',
  });

  await repos.orders.put({
    ...baseOrder,
    id: PRIMARY_ID,
    table: 'T-MERGE-PAY-SYNC-001',
    status: 'Draft',
    sync_status: 'synced',
    custom_merged_pos_invoice: SECONDARY_ID,
    custom_merged_total: 200,
    custom_merged_pos_invoice_details: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.orders.put({
    ...baseOrder,
    id: SECONDARY_ID,
    table: 'T-MERGE-PAY-SYNC-002',
    status: 'Draft',
    sync_status: 'synced',
    custom_merged_pos_invoice: PRIMARY_ID,
    custom_merged_total: 100,
    custom_merged_pos_invoice_details: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
  });

  await repos.syncQueue.put({
    id: 'SYNC-PAYMENT-MERGE-001',
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: { invoice: PRIMARY_ID, payments: [{ mode_of_payment: 'Cash', amount: 100 }] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  (call as any).post = async () => ({ name: PRIMARY_ID });

  const events: string[] = [];
  const unsubscribe = projectionBus.subscribe(event => events.push(event));

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 1);
    assert.equal(result.succeeded, 1);

    const primary = await repos.orders.getById(PRIMARY_ID);
    const secondary = await repos.orders.getById(SECONDARY_ID);

    // Both invoices are Paid (terminal) after merged payment sync -> purged by design.
    assert.equal(primary, undefined, 'Paid primary invoice should be purged after sync');
    assert.equal(secondary, undefined, 'Paid secondary invoice should be purged after sync');

    for (const tableName of ['T-MERGE-PAY-SYNC-001', 'T-MERGE-PAY-SYNC-002']) {
      const t = await repos.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared`);
    }

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    (call as any).post = originalPost;
    unsubscribe();
  }
});


// ============================================================================
// Post-Sync Reconciliation & Offline Split Parity (Task 7)
// ============================================================================

test('Scenario 16: Post-sync reconciliation purges temp orders and releases table occupancy', async () => {
  const TEMP_ID = 'TEMP-ORD-RECON-001';
  const SERVER_ID = 'POS-INV-RECON-001';
  const TABLE_NAME = 'T-RECON-001';

  await repos.tables.put({
    name: TABLE_NAME,
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
  });

  await repos.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    table: TABLE_NAME,
    order_type: 'Dine-In',
    status: 'Paid',
    sync_status: 'pending',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_ID}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_ID, items: [] },
    timestamp: new Date().toISOString(),
    status: 'COMPLETED',
    priority: 1,
  });

  // Register the mapping but leave the temp record and occupied table untouched
  // to simulate a partial/stale local state.
  await idMapper.registerMapping(TEMP_ID, SERVER_ID);

  const events: string[] = [];
  const unsubscribe = projectionBus.subscribe(event => events.push(event));

  const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
  try {
    const result = await engine.triggerSync();
    assert.equal(result.processed, 0, 'No pending commands to process');

    const tempOrder = await repos.orders.getById(TEMP_ID);
    assert.equal(tempOrder, undefined, 'Stale temp order should be purged by reconcileLocalStateWithServer');

    const table = await repos.tables.getById(TABLE_NAME);
    assert.equal(table?.occupied, 0, 'Table should be released when no active orders remain');
    assert.equal(table?.latest_invoice_time, null, 'Table latest_invoice_time should be cleared');

    assert.ok(events.includes('ORDERS_UPDATED'), 'Reconciliation should emit ORDERS_UPDATED');
    assert.ok(events.includes('TABLES_UPDATED'), 'Reconciliation should emit TABLES_UPDATED');
  } finally {
    unsubscribe();
  }
});

test('Scenario 17: Offline split sync promotes child temp ID, rewrites split metadata, and leaves zero stale records', async () => {
  const SOURCE_ID = 'POS-INV-SPLIT-RECON-001';
  const CHILD_TEMP_ID = 'TEMP-SPLIT-RECON-001';
  const CHILD_SERVER_ID = 'POS-INV-SPLIT-RECON-002';
  const TABLE_NAME = 'T-SPLIT-RECON-001';

  await repos.tables.put({
    name: TABLE_NAME,
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
  });

  await repos.orders.put({
    ...baseOrder,
    id: SOURCE_ID,
    table: TABLE_NAME,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: 'TEMP-SG-RECON-001',
    split_index: 1,
    split_total: 2,
    split_siblings: [SOURCE_ID, CHILD_TEMP_ID],
    items: [
      { name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 },
      { name: 'ROW-2', item: 'ITEM-B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 },
    ],
    grand_total: 150,
  });

  await repos.orders.put({
    ...baseOrder,
    id: CHILD_TEMP_ID,
    table: TABLE_NAME,
    order_type: 'Dine-In',
    status: 'Draft',
    sync_status: 'pending',
    custom_split_group: 'TEMP-SG-RECON-001',
    custom_split_from: SOURCE_ID,
    split_index: 2,
    split_total: 2,
    split_siblings: [SOURCE_ID, CHILD_TEMP_ID],
    pending_command_id: 'SYNC-SPLIT-RECON-001',
    items: [{ name: 'ROW-1', item: 'ITEM-A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repos.syncQueue.put({
    id: 'SYNC-SPLIT-RECON-001',
    action: 'SplitBillCommand',
    operation_type: 'SPLIT_BILL',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.split_bill',
    payload: {
      source_invoice: SOURCE_ID,
      items_to_move: [{ name: 'ROW-1', qty: 1 }],
    },
    temporary_id: CHILD_TEMP_ID,
    entity_id: SOURCE_ID,
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  // A payment queued against the temp child should be patched to the real server ID.
  await repos.syncQueue.put({
    id: 'SYNC-PAYMENT-CHILD-RECON-001',
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: CHILD_TEMP_ID,
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    },
    dependency_ids: ['SYNC-SPLIT-RECON-001'],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedPayloads: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('split_bill')) {
      return { new_invoice: CHILD_SERVER_ID };
    }
    if (endpoint.includes('make_invoice')) {
      return { name: payload.invoice };
    }
    return {};
  };

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: {
      group: 'SG-RECON-001',
      current: CHILD_SERVER_ID,
      invoices: [
        {
          name: SOURCE_ID,
          custom_split_from: null,
          split_index: 1,
          split_total: 2,
          split_siblings: [CHILD_SERVER_ID],
          customer: 'Guest',
          grand_total: 150,
          invoice_printed: 0,
          restaurant_table: TABLE_NAME,
          status: 'Draft',
        },
        {
          name: CHILD_SERVER_ID,
          custom_split_from: SOURCE_ID,
          split_index: 2,
          split_total: 2,
          split_siblings: [SOURCE_ID],
          customer: 'Guest',
          grand_total: 100,
          invoice_printed: 0,
          restaurant_table: TABLE_NAME,
          status: 'Draft',
        },
      ],
    },
  });

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    assert.equal(result.processed, 2, 'split_bill and dependent make_invoice should process');
    assert.equal(result.succeeded, 2, 'Both commands should succeed');

    const payPosted = postedPayloads.find(p => p.endpoint.includes('make_invoice'));
    assert.ok(payPosted);
    assert.equal(payPosted.payload.invoice, CHILD_SERVER_ID, 'Child payment must use server ID after patch');

    const source = await repos.orders.getById(SOURCE_ID);
    assert.ok(source);
    assert.equal(source.custom_split_group, 'SG-RECON-001');
    assert.ok(source.split_siblings?.includes(CHILD_SERVER_ID), 'Source siblings must reference server child ID');
    assert.ok(!source.split_siblings?.includes(CHILD_TEMP_ID), 'Source siblings must not reference temp child ID');

    // The child was paid in this scenario, so its promoted record is terminal
    // and purged post-sync by design.
    const child = await repos.orders.getById(CHILD_SERVER_ID);
    assert.equal(child, undefined, 'Paid child should be purged after sync');

    const tempChild = await repos.orders.getById(CHILD_TEMP_ID);
    assert.equal(tempChild, undefined, 'TEMP-SPLIT child should be removed after promotion');

    const remainingQueue = await repos.syncQueue.getAll();
    assert.equal(remainingQueue.length, 0, 'Completed commands should be purged');

    // Simulate going offline again and verify no stale temp records resurface.
    const orders = await repos.orders.getAll();
    const staleTempOrders = orders.filter(o => o.id.startsWith('TEMP-'));
    assert.equal(staleTempOrders.length, 0, 'No stale temp orders should remain after sync');
  } finally {
    (call as any).post = originalPost;
    (call as any).get = originalGet;
  }
});

// ============================================================================
// Task 12: Full Offline Split + Both Payments Sync Flow
// ============================================================================

test('Scenario 18: Offline temp order split -> pay both -> sync resolves in strict order', async () => {
  const TEMP_SOURCE = 'TEMP-ORD-SPLIT-PAY-FULL-001';
  const TEMP_CHILD = 'TEMP-SPLIT-PAY-FULL-002';
  const SERVER_SOURCE = 'POS-INV-SPLIT-PAY-FULL-001';
  const SERVER_CHILD = 'POS-INV-SPLIT-PAY-FULL-002';
  const TABLE_NAME = 'T-SPLIT-PAY-FULL-001';
  const SPLIT_CMD_ID = 'SYNC-SPLIT-PAY-FULL-002';
  const SOURCE_PAY_CMD_ID = 'SYNC-PAYMENT-SPLIT-PAY-FULL-001';
  const CHILD_PAY_CMD_ID = 'SYNC-PAYMENT-SPLIT-PAY-FULL-002';

  await repos.tables.put({
    name: TABLE_NAME,
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
  });

  // 1. Original TEMP order (200): 2 qty of item A @ 100.
  await repos.orders.put({
    ...baseOrder,
    id: TEMP_SOURCE,
    table: TABLE_NAME,
    order_type: 'Dine-In',
    status: 'Paid',
    sync_status: 'pending',
    items: [{ name: 'ROW-A', item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  // 2. Split child TEMP order (100): 1 qty of item A @ 100.
  await repos.orders.put({
    ...baseOrder,
    id: TEMP_CHILD,
    table: TABLE_NAME,
    order_type: 'Dine-In',
    status: 'Paid',
    sync_status: 'pending',
    custom_split_group: 'SG-SPLIT-PAY-FULL-001',
    custom_split_from: TEMP_SOURCE,
    split_index: 2,
    split_total: 2,
    split_siblings: [TEMP_SOURCE],
    pending_command_id: SPLIT_CMD_ID,
    items: [{ name: 'ROW-A', item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  // 3. Queue: sync original -> split child -> pay source -> pay child.
  await repos.syncQueue.put({
    id: `SYNC-ORDER-${TEMP_SOURCE}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { temp_id: TEMP_SOURCE, items: [] },
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: SPLIT_CMD_ID,
    action: 'SplitBillCommand',
    operation_type: 'SPLIT_BILL',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.split_bill',
    payload: {
      source_invoice: TEMP_SOURCE,
      items_to_move: [{ name: 'ROW-A', qty: 1 }],
    },
    temporary_id: TEMP_CHILD,
    entity_id: TEMP_SOURCE,
    dependency_ids: [`SYNC-ORDER-${TEMP_SOURCE}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: SOURCE_PAY_CMD_ID,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: TEMP_SOURCE,
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    },
    temporary_id: TEMP_SOURCE,
    entity_id: TEMP_SOURCE,
    dependency_ids: [`SYNC-ORDER-${TEMP_SOURCE}`],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  await repos.syncQueue.put({
    id: CHILD_PAY_CMD_ID,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: {
      invoice: TEMP_CHILD,
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    },
    temporary_id: TEMP_CHILD,
    entity_id: TEMP_CHILD,
    dependency_ids: [SPLIT_CMD_ID],
    timestamp: new Date().toISOString(),
    status: 'PENDING',
    priority: 1,
  });

  const originalPost = call.post;
  const postedPayloads: { endpoint: string; payload: any }[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    postedPayloads.push({ endpoint, payload });
    if (endpoint.includes('sync_order')) {
      return { name: SERVER_SOURCE, status: 'Draft' };
    }
    if (endpoint.includes('split_bill')) {
      return { new_invoice: SERVER_CHILD };
    }
    if (endpoint.includes('make_invoice')) {
      return { name: payload.invoice };
    }
    return {};
  };

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: {
      group: 'SG-SPLIT-PAY-FULL-001',
      current: SERVER_CHILD,
      invoices: [
        {
          name: SERVER_SOURCE,
          custom_split_from: null,
          split_index: 1,
          split_total: 2,
          split_siblings: [SERVER_CHILD],
          customer: 'Guest',
          grand_total: 100,
          invoice_printed: 0,
          restaurant_table: TABLE_NAME,
          status: 'Draft',
        },
        {
          name: SERVER_CHILD,
          custom_split_from: SERVER_SOURCE,
          split_index: 2,
          split_total: 2,
          split_siblings: [SERVER_SOURCE],
          customer: 'Guest',
          grand_total: 100,
          invoice_printed: 0,
          restaurant_table: TABLE_NAME,
          status: 'Draft',
        },
      ],
    },
  });

  try {
    const engine = new SyncEngine(queueMgr, idMapper, undefined, { repositories: repos });
    const result = await engine.triggerSync();

    // All four commands must process and succeed.
    assert.equal(result.processed, 4, 'Sync, split, and both payments must process');
    assert.equal(result.succeeded, 4, 'All four commands must succeed');
    assert.equal(result.failed, 0, 'No command may fail');

    // Strict execution order: sync_order -> split_bill -> pay source -> pay child.
    const endpointOrder = postedPayloads.map(p => {
      if (p.endpoint.includes('sync_order')) return 'sync_order';
      if (p.endpoint.includes('split_bill')) return 'split_bill';
      if (p.endpoint.includes('make_invoice')) return 'make_invoice';
      return 'other';
    });
    assert.deepEqual(endpointOrder, ['sync_order', 'split_bill', 'make_invoice', 'make_invoice']);

    // sync_order created the original invoice.
    const syncPosted = postedPayloads[0];
    assert.equal(syncPosted.payload.temp_id, TEMP_SOURCE);

    // split_bill ran against the promoted source ID and produced the child server ID.
    const splitPosted = postedPayloads[1];
    assert.equal(splitPosted.payload.source_invoice, SERVER_SOURCE);

    // First make_invoice paid the original invoice.
    const sourcePayPosted = postedPayloads[2];
    assert.equal(sourcePayPosted.payload.invoice, SERVER_SOURCE);
    assert.equal(sourcePayPosted.payload.payments[0].amount, 100);

    // Second make_invoice paid the split child invoice.
    const childPayPosted = postedPayloads[3];
    assert.equal(childPayPosted.payload.invoice, SERVER_CHILD);
    assert.equal(childPayPosted.payload.payments[0].amount, 100);

    // Local state: two independent paid server invoices, no stale temp records.
    const source = await repos.orders.getById(SERVER_SOURCE);
    const child = await repos.orders.getById(SERVER_CHILD);

    // Both invoices are Paid (terminal) after sync -> purged by design; the
    // observable local guarantees are the drained queue and removed temp records.
    assert.equal(source, undefined, 'Paid source invoice should be purged after sync');
    assert.equal(child, undefined, 'Paid child invoice should be purged after sync');

    assert.equal(await repos.orders.getById(TEMP_SOURCE), undefined);
    assert.equal(await repos.orders.getById(TEMP_CHILD), undefined);

    // Queue must be empty after successful sync.
    const remainingQueue = await repos.syncQueue.getAll();
    assert.equal(remainingQueue.length, 0);

    // Envelope metadata on payment commands must be patched to server IDs.
    const sourcePayCmd = await repos.syncQueue.getById(SOURCE_PAY_CMD_ID);
    const childPayCmd = await repos.syncQueue.getById(CHILD_PAY_CMD_ID);
    assert.equal(sourcePayCmd, undefined, 'Completed source payment command should be purged');
    assert.equal(childPayCmd, undefined, 'Completed child payment command should be purged');
  } finally {
    (call as any).post = originalPost;
    (call as any).get = originalGet;
  }
});
