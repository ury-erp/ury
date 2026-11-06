/**
 * @file offline-sync-regression.test.ts
 * @description Regression suite for the network-resilient order regression fix.
 *
 * Core invariant under test: `syncOrder` must distinguish genuine network/transport
 * failures from deterministic server rejections.
 *   - Network failures  -> order stored locally, SYNC-ORDER command queued offline.
 *   - Server rejections   -> error re-thrown to the UI, NOTHING queued, NOTHING cached.
 *
 * Also locks the payload contract that prevents the backend 500 which originally
 * forced every online order into the catch block: `mode_of_payment` must always be
 * present (falling back to null) in both the live request and the queued payload.
 */

import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, projectionBus } from '@ury/core';
import { syncOrder, type SyncOrderData } from '../order-api';

const baseOrderData = (overrides: Partial<SyncOrderData> = {}): SyncOrderData => ({
  order_type: 'Dine-In',
  no_of_pax: 2,
  items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 2 }],
  pos_profile: 'Test Profile',
  mode_of_payment: 'Cash',
  customer: 'CUST-001',
  cashier: 'cashier@example.com',
  owner: 'owner@example.com',
  waiter: 'waiter@example.com',
  ...overrides,
});

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

after(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  }
});

async function pendingQueueEntries() {
  const all = await repositories.syncQueue.getAll();
  return all.filter((e: any) => e.status === 'PENDING' || e.status === 'PENDING_SYNC');
}

beforeEach(async () => {
  setNavigatorOnline(true);
  await repositories.orders.clear();
  await repositories.syncQueue.clear();
  await repositories.tables.clear();
  projectionBus.clear();
});

// ---------------------------------------------------------------------------
// Payload contract
// ---------------------------------------------------------------------------

test('online syncOrder posts mode_of_payment null fallback when caller omits it', async () => {
  const originalPost = call.post;
  const captured: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    captured.push({ endpoint, payload });
    return { message: { name: 'POS-INV-ONLINE-001', status: 'Draft' } };
  };

  try {
    const data = baseOrderData({ mode_of_payment: undefined as any });
    const result = await syncOrder(data);

    assert.equal(captured.length, 1, 'exactly one live request is made');
    assert.ok('mode_of_payment' in captured[0].payload, 'mode_of_payment key must be present');
    assert.equal(captured[0].payload.mode_of_payment, null, 'mode_of_payment falls back to null');
    assert.equal((result as any).name, 'POS-INV-ONLINE-001');
  } finally {
    (call as any).post = originalPost;
  }
});

test('online Aggregator syncOrder posts trimmed payload with mode_of_payment null fallback', async () => {
  const originalPost = call.post;
  const captured: any[] = [];
  (call as any).post = async (endpoint: string, payload: any) => {
    captured.push({ endpoint, payload });
    return { message: { name: 'AGGR-INV-001', status: 'Draft' } };
  };

  try {
    await syncOrder(
      baseOrderData({
        order_type: 'Aggregators',
        aggregator_id: 'Swiggy',
        mode_of_payment: undefined as any,
      })
    );

    assert.equal(captured.length, 1);
    assert.equal(captured[0].payload.mode_of_payment, null);
    assert.equal(captured[0].payload.aggregator_id, 'Swiggy');
  } finally {
    (call as any).post = originalPost;
  }
});

// ---------------------------------------------------------------------------
// Server rejections must propagate and must NOT enter the offline queue
// ---------------------------------------------------------------------------

test('server validation error (_server_messages) is re-thrown and nothing is queued', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw Object.assign(new Error('Validation Error'), { _server_messages: ['{"message":"Duplicate"}'] });
  };

  try {
    await assert.rejects(() => syncOrder(baseOrderData()), /Validation Error/);

    const queue = await pendingQueueEntries();
    assert.equal(queue.length, 0, 'server rejection must not be queued offline');
    const orders = await repositories.orders.getAll();
    assert.equal(orders.length, 0, 'server rejection must not be cached locally');
  } finally {
    (call as any).post = originalPost;
  }
});

test('HTTP 500 with response.status is re-thrown and nothing is queued', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    const err: any = new Error('Internal Server Error');
    err.response = { status: 500, data: { exc_type: 'Exception' } };
    throw err;
  };

  try {
    await assert.rejects(() => syncOrder(baseOrderData()), /Internal Server Error/);
    assert.equal((await pendingQueueEntries()).length, 0, 'HTTP 500 must not be queued offline');
    assert.equal((await repositories.orders.getAll()).length, 0, 'HTTP 500 must not be cached locally');
  } finally {
    (call as any).post = originalPost;
  }
});

test('numeric error status >= 400 is re-thrown and nothing is queued', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    const err: any = new Error('Bad Request');
    err.status = 417;
    throw err;
  };

  try {
    await assert.rejects(() => syncOrder(baseOrderData()), /Bad Request/);
    assert.equal((await pendingQueueEntries()).length, 0);
    assert.equal((await repositories.orders.getAll()).length, 0);
  } finally {
    (call as any).post = originalPost;
  }
});

test('Frappe exc_type error is re-thrown and nothing is queued', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw Object.assign(new Error('Not Permitted'), { exc_type: 'PermissionError' });
  };

  try {
    await assert.rejects(() => syncOrder(baseOrderData()), /Not Permitted/);
    assert.equal((await pendingQueueEntries()).length, 0);
    assert.equal((await repositories.orders.getAll()).length, 0);
  } finally {
    (call as any).post = originalPost;
  }
});

// ---------------------------------------------------------------------------
// Genuine network failures must store locally and queue an offline command
// ---------------------------------------------------------------------------

test('failed-to-fetch TypeError while online stores order locally and queues SYNC-ORDER', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    const data = baseOrderData();
    const result: any = await syncOrder(data);

    const orders = await repositories.orders.getAll();
    assert.equal(orders.length, 1, 'order must be stored locally on network failure');
    assert.equal(orders[0].sync_status, 'pending');
    assert.equal(orders[0].status, 'Draft');

    const queue = await pendingQueueEntries();
    assert.equal(queue.length, 1, 'exactly one offline command is queued');
    assert.equal(queue[0].action, 'sync_order');
    assert.ok('mode_of_payment' in queue[0].payload, 'queued payload must include mode_of_payment');
    assert.equal(queue[0].payload.mode_of_payment, 'Cash');
    assert.ok(queue[0].idempotency_key, 'queued command carries an idempotency key');
    assert.equal(result.status, 'Draft', 'offline result reports local status');
  } finally {
    (call as any).post = originalPost;
  }
});

test('queued offline payload includes mode_of_payment null fallback when caller omits it', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    await syncOrder(baseOrderData({ mode_of_payment: undefined as any }));
    const queue = await pendingQueueEntries();
    assert.equal(queue.length, 1);
    assert.ok('mode_of_payment' in queue[0].payload, 'queued payload must include the key');
    assert.equal(queue[0].payload.mode_of_payment, null);
  } finally {
    (call as any).post = originalPost;
  }
});

test('navigator offline forces queueing even for ambiguous errors', async () => {
  setNavigatorOnline(false);
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('ambiguous failure without response shape');
  };

  try {
    await syncOrder(baseOrderData());
    assert.equal((await pendingQueueEntries()).length, 1, 'offline browser state must queue');
    assert.equal((await repositories.orders.getAll()).length, 1);
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('ECONNABORTED timeout error queues offline', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    const err: any = new Error('timeout of 30000ms exceeded');
    err.code = 'ECONNABORTED';
    throw err;
  };

  try {
    await syncOrder(baseOrderData());
    assert.equal((await pendingQueueEntries()).length, 1, 'request timeout must queue offline');
  } finally {
    (call as any).post = originalPost;
  }
});

test('wrapped "Network Disconnected" error queues offline', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await syncOrder(baseOrderData());
    assert.equal((await pendingQueueEntries()).length, 1, 'wrapped network error must queue offline');
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline update of an existing server invoice queues SYNC-ORDER-UPDATE without temp dependency', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    await syncOrder(baseOrderData({ invoice: 'POS-INV-EXISTING-001' }));
    const queue = await pendingQueueEntries();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, 'SYNC-ORDER-UPDATE-POS-INV-EXISTING-001');
    assert.equal(queue[0].payload.invoice, 'POS-INV-EXISTING-001');
    assert.equal(queue[0].payload.last_invoice, 'POS-INV-EXISTING-001');
    assert.equal(queue[0].temporary_id ?? null, null, 'server updates carry no temp dependency');
  } finally {
    (call as any).post = originalPost;
  }
});
