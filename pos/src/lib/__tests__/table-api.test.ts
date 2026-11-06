import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, projectionBus } from '@ury/core';
import { mergeTablesBatch, unmergeTables, getTables, getVacantTablesForBranch } from '../table-api';

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

function stubCallPostServerError(message: string, excType = 'ValidationError') {
  const originalPost = call.post;
  (call as any).post = async () => {
    const err: any = new Error(message);
    err.exc_type = excType;
    err.httpStatus = 500;
    err._server_messages = JSON.stringify([{ message, title: excType }]);
    throw err;
  };
  return () => {
    (call as any).post = originalPost;
  };
}

function stubNavigatorOnline(online: boolean) {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
  Object.defineProperty(globalThis.navigator, 'onLine', {
    value: online,
    configurable: true,
    writable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis.navigator, 'onLine', original);
    } else {
      delete (globalThis.navigator as any).onLine;
    }
  };
}

beforeEach(async () => {
  await repositories.orders.clear();
  await repositories.syncQueue.clear();
  await repositories.tables.clear();
  projectionBus.clear();
});

test('offline mergeTablesBatch updates local table entities with merged_with and occupied=1', async () => {
  await seedTable('F1', 0);
  await seedTable('F2', 0);
  const { events, unsubscribe } = captureEvents();
  const restore = stubCallPostError();

  try {
    const result = await mergeTablesBatch('F1', ['F2']);
    assert.equal(result.status, 'Queued Offline');

    const f1 = await repositories.tables.getById('F1');
    const f2 = await repositories.tables.getById('F2');

    assert.equal(f1?.occupied, 1, 'anchor should be occupied');
    assert.equal(f1?.merged_with, 'F2', 'anchor should list target in merged_with');
    assert.equal(f2?.occupied, 1, 'target should be occupied');
    assert.equal(f2?.merged_with, 'F1', 'target should point back to anchor');

    assert.ok(events.includes('TABLES_UPDATED'), 'should emit TABLES_UPDATED');
  } finally {
    restore();
    unsubscribe();
  }
});

test('offline mergeTablesBatch handles multi-table clusters', async () => {
  await seedTable('F1', 0);
  await seedTable('F2', 0);
  await seedTable('F3', 0);
  const { events, unsubscribe } = captureEvents();
  const restore = stubCallPostError();

  try {
    await mergeTablesBatch('F1', ['F2', 'F3']);

    const f1 = await repositories.tables.getById('F1');
    const f2 = await repositories.tables.getById('F2');
    const f3 = await repositories.tables.getById('F3');

    assert.equal(f1?.merged_with, 'F2,F3');
    assert.equal(f2?.merged_with, 'F1');
    assert.equal(f3?.merged_with, 'F1');
    assert.equal(f1?.occupied, 1);
    assert.equal(f2?.occupied, 1);
    assert.equal(f3?.occupied, 1);
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    restore();
    unsubscribe();
  }
});

test('offline unmergeTables clears merged_with and preserves active-order occupation', async () => {
  await seedTable('F1', 1, { merged_with: 'F2' });
  await seedTable('F2', 1, { merged_with: 'F1' });
  await repositories.orders.put({
    id: 'POS-INV-F1',
    order_type: 'Dine-In',
    table: 'F1',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const { events, unsubscribe } = captureEvents();
  const restore = stubCallPostError();

  try {
    const result = await unmergeTables('F1');
    assert.equal(result.status, 'Queued Offline');

    const f1 = await repositories.tables.getById('F1');
    const f2 = await repositories.tables.getById('F2');

    assert.equal(f1?.merged_with, null, 'anchor merge link should be cleared');
    assert.equal(f2?.merged_with, null, 'partner merge link should be cleared');
    assert.equal(f1?.occupied, 1, 'table with active order stays occupied');
    assert.equal(f2?.occupied, 0, 'partner table is released');

    assert.ok(events.includes('TABLES_UPDATED'), 'should emit TABLES_UPDATED');
  } finally {
    restore();
    unsubscribe();
  }
});

test('offline unmergeTables keeps all tables occupied when active order spans cluster', async () => {
  await seedTable('F1', 1, { merged_with: 'F2' });
  await seedTable('F2', 1, { merged_with: 'F1' });
  await repositories.orders.put({
    id: 'POS-INV-F1',
    order_type: 'Dine-In',
    table: 'F1',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await repositories.orders.put({
    id: 'POS-INV-F2',
    order_type: 'Dine-In',
    table: 'F2',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-002', item_name: 'Test Item 2', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const restore = stubCallPostError();

  try {
    await unmergeTables('F1');

    const f1 = await repositories.tables.getById('F1');
    const f2 = await repositories.tables.getById('F2');

    assert.equal(f1?.merged_with, null);
    assert.equal(f2?.merged_with, null);
    assert.equal(f1?.occupied, 1);
    assert.equal(f2?.occupied, 1);
  } finally {
    restore();
  }
});

test('getTables fallback returns merged state from local IndexedDB', async () => {
  await seedTable('F1', 1, { merged_with: 'F2' });
  await seedTable('F2', 1, { merged_with: 'F1' });

  const restore = stubCallPostError();

  try {
    const tables = await getTables('Main Hall');
    const f1 = tables.find((t) => t.name === 'F1');
    const f2 = tables.find((t) => t.name === 'F2');

    assert.ok(f1);
    assert.ok(f2);
    assert.equal(f1?.occupied, 1);
    assert.equal(f1?.merged_with, 'F2');
    assert.equal(f2?.occupied, 1);
    assert.equal(f2?.merged_with, 'F1');
  } finally {
    restore();
  }
});

test('getVacantTablesForBranch fallback excludes occupied merged tables', async () => {
  await seedTable('F1', 1, { merged_with: 'F2' });
  await seedTable('F2', 1, { merged_with: 'F1' });
  await seedTable('F3', 0);

  const restore = stubCallPostError();

  try {
    const vacant = await getVacantTablesForBranch('Main Branch');
    const names = vacant.map((t) => t.name);
    assert.ok(!names.includes('F1'));
    assert.ok(!names.includes('F2'));
    assert.ok(names.includes('F3'));
  } finally {
    restore();
  }
});

test('OrderRepository.findByTable resolves merged child table to master order', async () => {
  await seedTable('F1', 1, { merged_with: 'F5' });
  await seedTable('F5', 1, { merged_with: 'F1' });
  await repositories.orders.put({
    id: 'POS-INV-F1-MASTER',
    order_type: 'Dine-In',
    table: 'F1',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const byMaster = await repositories.orders.findByTable('F1');
  assert.equal(byMaster?.id, 'POS-INV-F1-MASTER');
  assert.equal(byMaster?.table, 'F1');

  const byChild = await repositories.orders.findByTable('F5');
  assert.equal(byChild?.id, 'POS-INV-F1-MASTER');
  assert.equal(byChild?.table, 'F1');
});

test('OrderRepository.findByTable returns undefined for unmerged table without order', async () => {
  await seedTable('F9', 0);
  const result = await repositories.orders.findByTable('F9');
  assert.equal(result, undefined);
});

test('getTables fallback preserves full server schema fields', async () => {
  await repositories.tables.put({
    name: 'F-SCHEMA',
    restaurant_room: 'Main Hall',
    no_of_seats: 6,
    occupied: 1,
    latest_invoice_time: '2026-08-07T08:00:00.000Z',
    merged_with: null,
    layout_x: 10,
    layout_y: 20,
    table_shape: 'Circle',
    is_take_away: 1,
    minimum_seating: 2,
  });

  const restore = stubCallPostError();

  try {
    const tables = await getTables('Main Hall');
    const table = tables.find((t) => t.name === 'F-SCHEMA');

    assert.ok(table);
    assert.equal(table?.occupied, 1);
    assert.equal(table?.is_take_away, 1);
    assert.equal(table?.minimum_seating, 2);
    assert.equal(table?.restaurant_room, 'Main Hall');
    assert.equal(table?.table_shape, 'Circle');
    assert.equal(table?.merged_with, null);
    assert.equal(table?.no_of_seats, 6);
    assert.equal(table?.layout_x, 10);
    assert.equal(table?.layout_y, 20);
  } finally {
    restore();
  }
});

test('online mergeTablesBatch throws server ValidationError without queueing', async () => {
  await seedTable('F1', 0);
  await seedTable('F2', 0);
  const restorePost = stubCallPostServerError('Cannot merge an already merged table.');
  const restoreOnline = stubNavigatorOnline(true);

  try {
    await assert.rejects(
      async () => mergeTablesBatch('F1', ['F2']),
      /Cannot merge an already merged table/
    );

    const queue = await repositories.syncQueue.getAll();
    assert.equal(queue.length, 0, 'server error should not enqueue sync command');

    const f1 = await repositories.tables.getById('F1');
    const f2 = await repositories.tables.getById('F2');
    assert.equal(f1?.merged_with, undefined, 'anchor should not be locally merged');
    assert.equal(f2?.merged_with, undefined, 'target should not be locally merged');
  } finally {
    restorePost();
    restoreOnline();
  }
});

test('online unmergeTables throws server TypeError without queueing', async () => {
  await seedTable('F1', 1, { merged_with: 'F2' });
  await seedTable('F2', 1, { merged_with: 'F1' });
  const restorePost = stubCallPostServerError("'dict' object is not callable", 'TypeError');
  const restoreOnline = stubNavigatorOnline(true);

  try {
    await assert.rejects(
      async () => unmergeTables('F1'),
      /'dict' object is not callable/
    );

    const queue = await repositories.syncQueue.getAll();
    assert.equal(queue.length, 0, 'server error should not enqueue sync command');

    const f1 = await repositories.tables.getById('F1');
    const f2 = await repositories.tables.getById('F2');
    assert.equal(f1?.merged_with, 'F2', 'anchor merge state should be unchanged');
    assert.equal(f2?.merged_with, 'F1', 'target merge state should be unchanged');
  } finally {
    restorePost();
    restoreOnline();
  }
});
