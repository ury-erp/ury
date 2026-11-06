import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, projectionBus } from '@ury/core';
import { syncOrder, getTableOrder, type SyncOrderData } from '../order-api';
import { updatePrintStatus } from '../invoice-api';
import { queryClient } from '../query-client';

const baseOrderData = (overrides: Partial<SyncOrderData> = {}): SyncOrderData => ({
  order_type: 'Dine-In',
  no_of_pax: 2,
  items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1 }],
  pos_profile: 'Test Profile',
  mode_of_payment: 'Cash',
  ...overrides,
});

const baseOrderEntity = (overrides: Partial<Record<string, unknown>> = {}) => ({
  order_type: 'Dine-In',
  items: [] as any[],
  grand_total: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

async function seedTable(name: string, occupied = 0, overrides: Record<string, unknown> = {}) {
  await repositories.tables.put({
    name,
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied,
    ...overrides,
  });
}

function captureEvents() {
  const events: string[] = [];
  const unsubscribe = projectionBus.subscribe((event) => events.push(event));
  return { events, unsubscribe };
}

function stubCallPostError() {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };
  return () => {
    (call as any).post = originalPost;
  };
}

function stubCallGetError() {
  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };
  return () => {
    (call as any).get = originalGet;
  };
}

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
}

function spyQueryClient() {
  const originalInvalidateQueries = (queryClient as any).invalidateQueries;
  const invalidatedKeys: string[][] = [];
  (queryClient as any).invalidateQueries = (options: any) => {
    invalidatedKeys.push(options?.queryKey || []);
    return Promise.resolve();
  };
  return {
    invalidatedKeys,
    restore: () => {
      (queryClient as any).invalidateQueries = originalInvalidateQueries;
    },
  };
}

beforeEach(async () => {
  await repositories.orders.clear();
  await repositories.syncQueue.clear();
  await repositories.tables.clear();
  projectionBus.clear();
  setNavigatorOnline(true);
});

test('online syncOrder creates order and marks table occupied with query invalidation', async () => {
  await seedTable('T-ONLINE-001', 0);
  const { events, unsubscribe } = captureEvents();
  const { invalidatedKeys, restore } = spyQueryClient();

  const originalPost = call.post;
  (call as any).post = async () => ({
    message: {
      name: 'POS-INV-ONLINE-001',
      status: 'Draft',
    },
  });

  try {
    const result = await syncOrder(baseOrderData({ table: 'T-ONLINE-001' }));

    assert.equal(result.name, 'POS-INV-ONLINE-001');
    assert.equal(result.status, 'Draft');

    const local = await repositories.orders.getById('POS-INV-ONLINE-001');
    assert.ok(local);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.sync_status, 'synced');
    assert.equal(local?.table, 'T-ONLINE-001');

    const table = await repositories.tables.getById('T-ONLINE-001');
    assert.equal(table?.occupied, 1);
    assert.ok(table?.latest_invoice_time);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));

    assert.ok(invalidatedKeys.some((k) => k[0] === 'tables'));
    assert.ok(invalidatedKeys.some((k) => k[0] === 'roomCounts'));
  } finally {
    (call as any).post = originalPost;
    unsubscribe();
    restore();
  }
});

test('getTableOrder fallback returns active order items for occupied table', async () => {
  await seedTable('T-ORDER-001', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-ORDER-001',
    table: 'T-ORDER-001',
    room: 'Main Hall',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  const restoreGet = stubCallGetError();

  try {
    const response = await getTableOrder('T-ORDER-001');

    assert.ok(response.message);
    assert.equal(response.message?.name, 'POS-INV-ORDER-001');
    assert.equal(response.message?.restaurant_table, 'T-ORDER-001');
    assert.equal(response.message?.items.length, 1);
    assert.equal(response.message?.items[0].item_code, 'ITEM-001');
    assert.equal(response.message?.items[0].qty, 2);
    assert.equal(response.message?.grand_total, 200);
  } finally {
    restoreGet();
  }
});

test('offline syncOrder with invoice/last_invoice updates existing order and preserves occupancy', async () => {
  await seedTable('T-UPDATE-001', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-UPDATE-001',
    table: 'T-UPDATE-001',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const { events, unsubscribe } = captureEvents();
  const restorePost = stubCallPostError();

  try {
    const result = await syncOrder(baseOrderData({
      table: 'T-UPDATE-001',
      invoice: 'POS-INV-UPDATE-001',
      last_invoice: 'POS-INV-UPDATE-001',
      items: [
        { item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1 },
        { item: 'ITEM-002', item_name: 'Second Item', rate: 50, qty: 1 },
      ],
    }));

    assert.equal(result.name, 'POS-INV-UPDATE-001');
    assert.equal(result.status, 'Unbilled');

    const local = await repositories.orders.getById('POS-INV-UPDATE-001');
    assert.ok(local);
    assert.equal(local?.status, 'Unbilled');
    assert.equal(local?.items.length, 2);
    assert.equal(local?.grand_total, 150);
    assert.equal(local?.sync_status, 'pending');

    const table = await repositories.tables.getById('T-UPDATE-001');
    assert.equal(table?.occupied, 1);

    const queued = await repositories.syncQueue.getById('SYNC-ORDER-UPDATE-POS-INV-UPDATE-001');
    assert.ok(queued);
    assert.equal(queued?.action, 'sync_order');
    assert.equal((queued?.payload as any).invoice, 'POS-INV-UPDATE-001');
    assert.equal((queued?.payload as any).last_invoice, 'POS-INV-UPDATE-001');

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    restorePost();
    unsubscribe();
  }
});

test('updatePrintStatus transitions Unbilled order to Draft with invoice_printed=1', async () => {
  await seedTable('T-PRINT-001', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-PRINT-001',
    table: 'T-PRINT-001',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const { events, unsubscribe } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => ({ message: { status: 'Draft' } });

  try {
    const result = await updatePrintStatus('POS-INV-PRINT-001');

    assert.equal(result.queued, false);

    const local = await repositories.orders.getById('POS-INV-PRINT-001');
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);

    const table = await repositories.tables.getById('T-PRINT-001');
    assert.equal(table?.occupied, 0);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    (call as any).post = originalPost;
    unsubscribe();
  }
});

test('successful updatePrintStatus releases merged table cluster and emits TABLES_UPDATED', async () => {
  await seedTable('T-CLUSTER-A', 1, { merged_with: 'T-CLUSTER-B' });
  await seedTable('T-CLUSTER-B', 1, { merged_with: 'T-CLUSTER-A' });
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-CLUSTER-001',
    table: 'T-CLUSTER-A',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const { events, unsubscribe } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => ({ message: { status: 'Draft' } });

  try {
    const result = await updatePrintStatus('POS-INV-CLUSTER-001');
    assert.equal(result.queued, false);

    for (const tableName of ['T-CLUSTER-A', 'T-CLUSTER-B']) {
      const t = await repositories.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared`);
    }

    assert.ok(events.includes('TABLES_UPDATED'));
    assert.ok(events.includes('ORDERS_UPDATED'));
  } finally {
    (call as any).post = originalPost;
    unsubscribe();
  }
});

test('updatePrintStatus on network failure queues offline and releases table cluster', async () => {
  await seedTable('T-FAIL-A', 1, { merged_with: 'T-FAIL-B' });
  await seedTable('T-FAIL-B', 1, { merged_with: 'T-FAIL-A' });
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-FAIL-001',
    table: 'T-FAIL-A',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const { events, unsubscribe } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await updatePrintStatus('POS-INV-FAIL-001');
    assert.equal(result.queued, true);

    const local = await repositories.orders.getById('POS-INV-FAIL-001');
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);

    for (const tableName of ['T-FAIL-A', 'T-FAIL-B']) {
      const t = await repositories.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared`);
    }

    const queued = await repositories.syncQueue.getById('QZ-PRINT-POS-INV-FAIL-001');
    assert.ok(queued);
    assert.equal(queued?.action, 'qz_print_update');
    assert.deepEqual(queued?.dependency_ids, []);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    (call as any).post = originalPost;
    unsubscribe();
  }
});

test('repeated offline update does not create duplicate orders and keeps table occupied', async () => {
  await seedTable('T-REPEAT-001', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-REPEAT-001',
    table: 'T-REPEAT-001',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const restorePost = stubCallPostError();

  try {
    await syncOrder(baseOrderData({
      table: 'T-REPEAT-001',
      invoice: 'POS-INV-REPEAT-001',
      last_invoice: 'POS-INV-REPEAT-001',
      items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 2 }],
    }));

    await syncOrder(baseOrderData({
      table: 'T-REPEAT-001',
      invoice: 'POS-INV-REPEAT-001',
      last_invoice: 'POS-INV-REPEAT-001',
      items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 3 }],
    }));

    const allOrders = await repositories.orders.getAll();
    const tableOrders = allOrders.filter((o) => o.table === 'T-REPEAT-001');
    assert.equal(tableOrders.length, 1);

    const local = tableOrders[0];
    assert.equal(local.id, 'POS-INV-REPEAT-001');
    assert.equal(local.items[0].qty, 3);
    assert.equal(local.grand_total, 300);

    const table = await repositories.tables.getById('T-REPEAT-001');
    assert.equal(table?.occupied, 1);

    const queuedCommands = await repositories.syncQueue.getAll();
    const updateCommands = queuedCommands.filter(
      (c) => c.action === 'sync_order' && c.id === 'SYNC-ORDER-UPDATE-POS-INV-REPEAT-001'
    );
    assert.equal(updateCommands.length, 1);
  } finally {
    restorePost();
  }
});

test('offline table order sync queues command, occupies table, and print updates state', async () => {
  await seedTable('T-OFFLINE-001', 0);
  const { events, unsubscribe } = captureEvents();
  const restorePost = stubCallPostError();

  let tempId: string;

  try {
    const orderResult = await syncOrder(baseOrderData({ table: 'T-OFFLINE-001' }));
    tempId = orderResult.name;

    assert.ok(tempId.startsWith('TEMP-ORD-'));
    assert.equal(orderResult.status, 'Unbilled');

    const local = await repositories.orders.getById(tempId);
    assert.ok(local);
    assert.equal(local?.status, 'Unbilled');
    assert.equal(local?.invoice_printed, 0);
    assert.equal(local?.sync_status, 'pending');
    assert.equal(local?.table, 'T-OFFLINE-001');

    const table = await repositories.tables.getById('T-OFFLINE-001');
    assert.equal(table?.occupied, 1);

    const syncCommand = await repositories.syncQueue.getById(`SYNC-ORDER-${tempId}`);
    assert.ok(syncCommand);
    assert.equal(syncCommand?.action, 'sync_order');

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));

    // Subsequent print while offline updates order state and queues print command.
    setNavigatorOnline(false);
    const printResult = await updatePrintStatus(tempId);

    assert.equal(printResult.queued, true);

    const printedOrder = await repositories.orders.getById(tempId);
    assert.equal(printedOrder?.status, 'Draft');
    assert.equal(printedOrder?.invoice_printed, 1);

    const releasedTable = await repositories.tables.getById('T-OFFLINE-001');
    assert.equal(releasedTable?.occupied, 0);

    const printCommand = await repositories.syncQueue.getById(`QZ-PRINT-${tempId}`);
    assert.ok(printCommand);
    assert.equal(printCommand?.action, 'qz_print_update');
    assert.deepEqual(printCommand?.dependency_ids, [`SYNC-ORDER-${tempId}`]);
  } finally {
    restorePost();
    unsubscribe();
    setNavigatorOnline(true);
  }
});
