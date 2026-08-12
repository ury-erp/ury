import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, projectionBus } from '@ury/core';
import { syncOrder, cancelOrder, releaseTableAfterPayment, queueOfflinePayment, splitBill, tableTransfer, getTableOrder, type SyncOrderData } from '../order-api';
import { updatePrintStatus, getPOSInvoices, getSplitGroup } from '../invoice-api';
import { printOrder } from '../print';
import { formatMergedTableLabel } from '../table-utils';

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

async function seedTable(name: string, occupied = 0) {
  await repositories.tables.put({
    name,
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied,
  });
}

function captureEvents() {
  const events: string[] = [];
  const unsubscribe = projectionBus.subscribe((event) => events.push(event));
  return { events, unsubscribe };
}

beforeEach(async () => {
  await repositories.orders.clear();
  await repositories.syncQueue.clear();
  await repositories.tables.clear();
  projectionBus.clear();
});

test('offline table order creation saves status Unbilled, sets table Occupied, and emits projections', async () => {
  await seedTable('T-01', 0);
  const { events } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await syncOrder(baseOrderData({ table: 'T-01' }));

    assert.equal(result.status, 'Unbilled');

    const local = await repositories.orders.getById(result.name);
    assert.ok(local);
    assert.equal(local?.status, 'Unbilled');
    assert.equal(local?.invoice_printed, 0);
    assert.equal(local?.sync_status, 'pending');
    assert.equal(local?.table, 'T-01');

    const table = await repositories.tables.getById('T-01');
    assert.equal(table?.occupied, 1);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline preview of unbilled table order preserves Unbilled status and Occupied table', async () => {
  await seedTable('T-02', 1);
  const tempId = 'TEMP-ORD-PREVIEW-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: tempId,
    table: 'T-02',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await syncOrder(baseOrderData({ invoice: tempId, table: 'T-02' }));

    assert.equal(result.name, tempId);
    assert.equal(result.status, 'Unbilled');

    const local = await repositories.orders.getById(tempId);
    assert.equal(local?.status, 'Unbilled');
    assert.equal(local?.invoice_printed, 0);

    const table = await repositories.tables.getById('T-02');
    assert.equal(table?.occupied, 1);
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline print queues QZ_PRINT_UPDATE and transitions order to Draft', async () => {
  await seedTable('T-03', 1);
  const tempId = 'TEMP-ORD-PRINT-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: tempId,
    table: 'T-03',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  const { events } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await updatePrintStatus(tempId);

    const local = await repositories.orders.getById(tempId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);

    const queued = await repositories.syncQueue.getById(`QZ-PRINT-${tempId}`);
    assert.ok(queued);
    assert.equal(queued?.action, 'qz_print_update');
    assert.deepEqual(queued?.dependency_ids, [`SYNC-ORDER-${tempId}`]);

    assert.ok(events.includes('ORDERS_UPDATED'));
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline print for synced invoice queues QZ_PRINT_UPDATE without temp dependency', async () => {
  const serverId = 'POS-INV-PRINT-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: serverId,
    table: 'T-04',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await updatePrintStatus(serverId);

    const queued = await repositories.syncQueue.getById(`QZ-PRINT-${serverId}`);
    assert.ok(queued);
    assert.equal(queued?.action, 'qz_print_update');
    assert.deepEqual(queued?.dependency_ids, []);
  } finally {
    (call as any).post = originalPost;
  }
});

test('cancelOrder offline marks order Cancelled, releases table, and emits projections', async () => {
  await seedTable('T-CANCEL-001', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'TEMP-ORD-CANCEL-001',
    table: 'T-CANCEL-001',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  const { events } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await cancelOrder(
      { name: 'TEMP-ORD-CANCEL-001', restaurant_table: 'T-CANCEL-001' },
      'Customer request'
    );

    assert.equal(result.success, true);
    assert.equal(result.queued, true);

    const local = await repositories.orders.getById('TEMP-ORD-CANCEL-001');
    assert.equal(local?.status, 'Cancelled');

    const table = await repositories.tables.getById('T-CANCEL-001');
    assert.equal(table?.occupied, 0);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    (call as any).post = originalPost;
  }
});

test('cancelOrder offline releases the full merged table cluster', async () => {
  await repositories.tables.put({
    name: 'T-CLUSTER-ANCHOR',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CLUSTER-P1,T-CLUSTER-P2',
  });
  await repositories.tables.put({
    name: 'T-CLUSTER-P1',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CLUSTER-ANCHOR',
  });
  await repositories.tables.put({
    name: 'T-CLUSTER-P2',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-CLUSTER-ANCHOR',
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-CLUSTER-CANCEL',
    table: 'T-CLUSTER-ANCHOR',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await cancelOrder(
      { name: 'POS-INV-CLUSTER-CANCEL', restaurant_table: 'T-CLUSTER-ANCHOR' },
      'Party cancelled'
    );

    assert.equal(result.success, true);
    assert.equal(result.queued, true);

    for (const tableName of ['T-CLUSTER-ANCHOR', 'T-CLUSTER-P1', 'T-CLUSTER-P2']) {
      const t = await repositories.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared`);
    }
  } finally {
    (call as any).post = originalPost;
  }
});

test('cancelOrder offline enqueues cancel_order command with dependency for temp ID', async () => {
  await seedTable('T-CANCEL-002', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'TEMP-ORD-CANCEL-002',
    table: 'T-CANCEL-002',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
    items: [],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await cancelOrder(
      { name: 'TEMP-ORD-CANCEL-002', restaurant_table: 'T-CANCEL-002' },
      'No show'
    );

    const queued = await repositories.syncQueue.getById('CANCEL-ORDER-TEMP-ORD-CANCEL-002');
    assert.ok(queued);
    assert.equal(queued?.action, 'cancel_order');
    assert.equal(queued?.operation_type, 'DELETE_ORDER');
    assert.deepEqual(queued?.dependency_ids, ['SYNC-ORDER-TEMP-ORD-CANCEL-002']);
    assert.equal(queued?.temporary_id, 'TEMP-ORD-CANCEL-002');
    assert.equal(queued?.entity_id, 'TEMP-ORD-CANCEL-002');
    assert.ok(queued?.idempotency_key);

    const payload = queued?.payload as any;
    assert.equal(payload.invoice_id, 'TEMP-ORD-CANCEL-002');
    assert.equal(payload.reason, 'No show');
    assert.equal(payload.table, undefined, 'Payload must not include extra table key');
    assert.equal(payload.idempotency_key, undefined, 'Idempotency key lives on envelope only');
  } finally {
    (call as any).post = originalPost;
  }
});

test('cancelOrder online succeeds without queueing', async () => {
  await seedTable('T-CANCEL-003', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-CANCEL-003',
    table: 'T-CANCEL-003',
    status: 'Draft',
    sync_status: 'synced',
    items: [],
  });

  const { events } = captureEvents();

  const originalPost = call.post;
  (call as any).post = async () => ({ message: { status: 'Cancelled' } });

  try {
    const result = await cancelOrder(
      { name: 'POS-INV-CANCEL-003', restaurant_table: 'T-CANCEL-003' },
      'Customer request'
    );
    assert.equal(result.success, true);
    assert.equal(result.queued, false);

    const local = await repositories.orders.getById('POS-INV-CANCEL-003');
    assert.equal(local?.status, 'Cancelled');

    const table = await repositories.tables.getById('T-CANCEL-003');
    assert.equal(table?.occupied, 0);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));

    const queued = await repositories.syncQueue.getById('CANCEL-ORDER-POS-INV-CANCEL-003');
    assert.equal(queued, undefined);
  } finally {
    (call as any).post = originalPost;
  }
});

test('cancelOrder offline for server invoice has no temp dependency', async () => {
  await seedTable('T-CANCEL-004', 1);
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-CANCEL-004',
    table: 'T-CANCEL-004',
    status: 'Draft',
    sync_status: 'synced',
    items: [],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await cancelOrder(
      { name: 'POS-INV-CANCEL-004', restaurant_table: 'T-CANCEL-004' },
      'Customer request'
    );

    const queued = await repositories.syncQueue.getById('CANCEL-ORDER-POS-INV-CANCEL-004');
    assert.ok(queued);
    assert.deepEqual(queued?.dependency_ids, []);
    assert.equal(queued?.temporary_id, null);
    assert.equal(queued?.entity_id, 'POS-INV-CANCEL-004');

    const payload = queued?.payload as any;
    assert.equal(payload.invoice_id, 'POS-INV-CANCEL-004');
    assert.equal(payload.reason, 'Customer request');
    assert.equal(payload.table, undefined, 'Payload must not include extra table key');
  } finally {
    (call as any).post = originalPost;
  }
});

test('releaseTableAfterPayment releases occupied table and emits TABLES_UPDATED', async () => {
  await seedTable('T-PAY-001', 1);
  const { events } = captureEvents();

  await releaseTableAfterPayment('T-PAY-001');

  const table = await repositories.tables.getById('T-PAY-001');
  assert.equal(table?.occupied, 0);
  assert.ok(events.includes('TABLES_UPDATED'));
});

test('releaseTableAfterPayment is a no-op when table is null', async () => {
  const { events } = captureEvents();
  await releaseTableAfterPayment(null);
  await releaseTableAfterPayment(undefined);
  assert.equal(events.filter(e => e === 'TABLES_UPDATED').length, 0);
});

test('getPOSInvoices fallback maps Unbilled orders to Unbilled tab and Draft orders to Draft tab', async () => {
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-FILTER-001',
    table: 'T-10',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
    items: [],
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-FILTER-002',
    status: 'Draft',
    invoice_printed: 1,
    sync_status: 'pending',
    items: [],
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const unbilled = await getPOSInvoices({ status: 'Unbilled' });
    assert.equal(unbilled.invoices.length, 1);
    assert.equal(unbilled.invoices[0].name, 'POS-INV-FILTER-001');
    assert.equal(unbilled.invoices[0].status, 'Unbilled');
    assert.equal(unbilled.invoices[0].invoice_printed, 0);

    const draft = await getPOSInvoices({ status: 'Draft' });
    assert.equal(draft.invoices.length, 1);
    assert.equal(draft.invoices[0].name, 'POS-INV-FILTER-002');
    assert.equal(draft.invoices[0].status, 'Draft');
    assert.equal(draft.invoices[0].invoice_printed, 1);
  } finally {
    (call as any).get = originalGet;
  }
});

test('offline Aggregator order creation stores Draft with custom_aggregator_id and clean sync_order payload', async () => {
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const result = await syncOrder(baseOrderData({
      order_type: 'Aggregators',
      customer: 'Swiggy',
      aggregator_id: 'Swiggy',
      no_of_pax: 1,
      invoice: undefined,
    }));

    assert.equal(result.status, 'Draft');

    const local = await repositories.orders.getById(result.name);
    assert.ok(local);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.sync_status, 'pending');
    assert.equal(local?.order_type, 'Aggregators');
    assert.equal(local?.custom_aggregator_id, 'Swiggy');
    assert.equal(local?.table, undefined);

    const queued = await repositories.syncQueue.getById(`SYNC-ORDER-${result.name}`);
    assert.ok(queued);
    assert.equal(queued?.action, 'sync_order');

    const payload = queued?.payload as any;
    assert.deepEqual(Object.keys(payload).sort(), [
      'aggregator_id', 'cashier', 'customer', 'invoice', 'items', 'last_invoice',
      'mode_of_payment', 'no_of_pax', 'order_type', 'owner', 'pos_profile', 'waiter',
    ].sort());
    assert.equal(payload.aggregator_id, 'Swiggy');
    assert.equal(payload.customer, 'Swiggy');
    assert.equal(payload.order_type, 'Aggregators');
    assert.equal(payload.invoice, null);
    assert.equal(payload.last_invoice, null);
    assert.equal(payload.no_of_pax, 1);

    assert.equal(queued?.temporary_id, result.name);
    assert.ok(queued?.idempotency_key);
    assert.equal((queued?.payload as any)?.idempotency_key, undefined);
    assert.equal((queued?.payload as any)?.temp_id, undefined);
  } finally {
    (call as any).post = originalPost;
  }
});

test('queueOfflinePayment stores clean make_invoice payload with envelope metadata', async () => {
  const tempId = 'TEMP-ORD-AGG-PAY-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: tempId,
    order_type: 'Aggregators',
    status: 'Draft',
    custom_aggregator_id: 'Swiggy',
    sync_status: 'pending',
    items: [{ item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, qty: 1, amount: 530 }],
    grand_total: 530,
  });

  await queueOfflinePayment({
    invoice: tempId,
    customer: 'Swiggy',
    cashier: 'urycashier@gmail.com',
    owner: 'urycashier@gmail.com',
    pos_profile: 'URY',
    table: null,
    payments: [{ mode_of_payment: 'Cash', amount: 530 }],
    additionalDiscount: null,
  });

  const cmds = await repositories.syncQueue.getAll();
  const paymentCmd = cmds.find(c => c.action === 'make_invoice');
  assert.ok(paymentCmd);

  const payload = paymentCmd?.payload as any;
  assert.deepEqual(Object.keys(payload).sort(), [
    'additionalDiscount', 'cashier', 'customer', 'invoice', 'owner', 'payments', 'pos_profile', 'table',
  ].sort());
  assert.equal(payload.invoice, tempId);
  assert.equal(payload.table, null);
  assert.deepEqual(payload.payments, [{ mode_of_payment: 'Cash', amount: 530 }]);

  assert.equal(paymentCmd?.temporary_id, tempId);
  assert.equal(paymentCmd?.entity_id, tempId);
  assert.ok(paymentCmd?.idempotency_key);
  assert.equal(payload.idempotency_key, undefined);

  const local = await repositories.orders.getById(tempId);
  assert.equal(local?.status, 'Paid');
});

test('online sync of paid temp Aggregator order promotes to Paid server record preserving custom_aggregator_id', async () => {
  const tempId = 'TEMP-ORD-AGG-SYNC-001';
  const serverId = 'AGURY-2026-2027-00008';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: tempId,
    order_type: 'Aggregators',
    status: 'Paid',
    custom_aggregator_id: 'Swiggy',
    sync_status: 'pending',
    items: [
      { item: 'SZF', item_name: 'Sizzling Arabian Chicken Full', rate: 530, qty: 1, amount: 530 },
      { item: 'SZC', item_name: 'Sizzling Arabian Chicken Single', rate: 160, qty: 1, amount: 160 },
    ],
    grand_total: 690,
  });

  const originalPost = call.post;
  (call as any).post = async () => ({
    message: {
      name: serverId,
      status: 'Draft',
    },
  });

  try {
    const result = await syncOrder(baseOrderData({
      invoice: tempId,
      order_type: 'Aggregators',
      customer: 'Swiggy',
      aggregator_id: 'Swiggy',
      no_of_pax: 1,
    }));

    assert.equal(result.name, serverId);

    const temp = await repositories.orders.getById(tempId);
    assert.equal(temp, undefined);

    const server = await repositories.orders.getById(serverId);
    assert.ok(server);
    assert.equal(server?.status, 'Paid');
    assert.equal(server?.order_type, 'Aggregators');
    assert.equal(server?.custom_aggregator_id, 'Swiggy');
    assert.equal(server?.sync_status, 'synced');
  } finally {
    (call as any).post = originalPost;
  }
});


function setNavigatorOnline(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
}

function setWindowMock() {
  Object.defineProperty(globalThis, 'window', {
    value: { open: () => undefined },
    configurable: true,
    writable: true,
  });
}

test('splitBill offline creates local child, updates source, and queues split_bill command', async () => {
  const sourceId = 'POS-INV-SPLIT-LOCAL-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-001',
    status: 'Draft',
    sync_status: 'synced',
    items: [
      { item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 },
      { item: 'B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 },
    ],
    grand_total: 250,
  });

  setNavigatorOnline(false);

  try {
    const result = await splitBill(sourceId, [{ name: 'A', qty: 1 }]);

    assert.ok(result.new_invoice.startsWith('TEMP-SPLIT-'));
    assert.equal(result.source_invoice, sourceId);

    const source = await repositories.orders.getById(sourceId);
    assert.ok(source);
    assert.equal(source.items.length, 2);
    assert.equal(source.items[0].qty, 1);
    assert.equal(source.items[0].amount, 100);
    assert.equal(source.items[1].qty, 1);
    assert.equal(source.grand_total, 150);
    assert.ok(source.custom_split_group);
    assert.equal(source.split_index, 1);
    assert.equal(source.split_total, 2);

    const child = await repositories.orders.getById(result.new_invoice);
    assert.ok(child);
    assert.equal(child.items.length, 1);
    assert.equal(child.items[0].qty, 1);
    assert.equal(child.items[0].amount, 100);
    assert.equal(child.grand_total, 100);
    assert.equal(child.custom_split_from, sourceId);
    assert.equal(child.custom_split_group, source.custom_split_group);
    assert.equal(child.split_index, 2);
    assert.equal(child.split_total, 2);
    assert.equal(child.sync_status, 'pending');

    const cmds = await repositories.syncQueue.getAll();
    const splitCmds = cmds.filter(
      c =>
        c.action === 'SplitBillCommand' ||
        c.operation_type === 'SPLIT_BILL' ||
        c.endpoint?.includes('split_bill')
    );
    assert.equal(splitCmds.length, 1);
    assert.equal((splitCmds[0]?.payload as any)?.source_invoice, sourceId);
    assert.deepEqual((splitCmds[0]?.payload as any)?.items_to_move, [{ name: 'A', qty: 1 }]);
    assert.equal(splitCmds[0]?.temporary_id, result.new_invoice);
    assert.equal(splitCmds[0]?.entity_id, sourceId);
    assert.deepEqual(splitCmds[0]?.dependency_ids, []);
  } finally {
    setNavigatorOnline(true);
  }
});

test('splitBill offline for temp source depends on parent sync_order', async () => {
  const tempId = 'TEMP-ORD-SPLIT-LOCAL-002';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: tempId,
    table: 'T-SPLIT-002',
    status: 'Unbilled',
    sync_status: 'pending',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(false);

  try {
    const result = await splitBill(tempId, [{ name: 'A', qty: 1 }]);

    assert.ok(result.new_invoice.startsWith('TEMP-SPLIT-'));

    const cmds = await repositories.syncQueue.getAll();
    const splitCmds = cmds.filter(
      c =>
        c.action === 'SplitBillCommand' ||
        c.operation_type === 'SPLIT_BILL' ||
        c.endpoint?.includes('split_bill')
    );
    assert.equal(splitCmds.length, 1);
    assert.deepEqual(splitCmds[0]?.dependency_ids, [`SYNC-ORDER-${tempId}`]);

    const child = await repositories.orders.getById(result.new_invoice);
    assert.equal(child?.pending_command_id, splitCmds[0]?.id);
  } finally {
    setNavigatorOnline(true);
  }
});

test('splitBill online failure falls back to offline split', async () => {
  const sourceId = 'POS-INV-SPLIT-FAIL-003';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(true);

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Server unreachable');
  };

  try {
    const result = await splitBill(sourceId, [{ name: 'A', qty: 1 }]);

    assert.ok(result.new_invoice.startsWith('TEMP-SPLIT-'));

    const source = await repositories.orders.getById(sourceId);
    assert.equal(source?.items[0].qty, 1);

    const cmds = await repositories.syncQueue.getAll();
    const splitCmds = cmds.filter(
      c =>
        c.action === 'SplitBillCommand' ||
        c.operation_type === 'SPLIT_BILL' ||
        c.endpoint?.includes('split_bill')
    );
    assert.equal(splitCmds.length, 1);
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('getSplitGroup offline fallback returns local split members', async () => {
  const sourceId = 'POS-INV-SPLIT-GROUP-001';
  const childId = 'POS-INV-SPLIT-GROUP-002';
  const groupId = 'SG-LOCAL-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-GROUP-001',
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: groupId,
    split_index: 1,
    split_total: 2,
    split_siblings: [childId],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: childId,
    table: 'T-SPLIT-GROUP-001',
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: groupId,
    custom_split_from: sourceId,
    split_index: 2,
    split_total: 2,
    split_siblings: [sourceId],
    items: [{ item: 'B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 }],
    grand_total: 50,
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const group = await getSplitGroup(sourceId);

    assert.equal(group.group, groupId);
    assert.equal(group.current, sourceId);
    assert.equal(group.invoices.length, 2);

    const original = group.invoices.find(i => i.is_original);
    assert.ok(original);
    assert.equal(original?.name, sourceId);
    assert.equal(original?.split_index, 1);
    assert.equal(original?.split_total, 2);

    const child = group.invoices.find(i => !i.is_original);
    assert.ok(child);
    assert.equal(child?.name, childId);
    assert.equal(child?.split_index, 2);
  } finally {
    (call as any).get = originalGet;
  }
});

test('offline tableTransfer moves order entity to destination table and releases source', async () => {
  await seedTable('T-SOURCE-001', 1);
  await repositories.tables.put({
    name: 'T-DEST-001',
    restaurant_room: 'Garden',
    no_of_seats: 4,
    occupied: 0,
  });

  const orderId = 'POS-INV-TRANSFER-001';
  const createdAt = '2026-08-07T08:00:00.000Z';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: orderId,
    table: 'T-SOURCE-001',
    room: 'Main Hall',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    createdAt,
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const { events, unsubscribe } = captureEvents();
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await tableTransfer('T-SOURCE-001', 'T-DEST-001', orderId);

    const order = await repositories.orders.getById(orderId);
    assert.equal(order?.table, 'T-DEST-001');
    assert.equal(order?.room, 'Garden');

    const source = await repositories.tables.getById('T-SOURCE-001');
    assert.equal(source?.occupied, 0);
    assert.equal(source?.latest_invoice_time, null);
    assert.equal(source?.merged_with, null);

    const dest = await repositories.tables.getById('T-DEST-001');
    assert.equal(dest?.occupied, 1);
    assert.equal(dest?.latest_invoice_time, createdAt);
    assert.equal(dest?.merged_with, null);

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    (call as any).post = originalPost;
    unsubscribe();
  }
});

test('offline tableTransfer queues table_transfer command with byte-equivalent payload and temp dependency', async () => {
  await seedTable('T-SOURCE-002', 1);
  await seedTable('T-DEST-002', 0);

  const tempId = 'TEMP-ORD-TRANSFER-002';
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: tempId,
    table: 'T-SOURCE-002',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await tableTransfer('T-SOURCE-002', 'T-DEST-002', tempId);

    const cmds = await repositories.syncQueue.getAll();
    const transferCmd = cmds.find(c => c.action === 'table_transfer');
    assert.ok(transferCmd, 'table_transfer command should be queued');

    const payload = transferCmd?.payload as any;
    assert.equal(payload.table, 'T-SOURCE-002');
    assert.equal(payload.newTable, 'T-DEST-002');
    assert.equal(payload.invoice, tempId);
    assert.equal(payload.source_table, undefined, 'payload must be byte-equivalent to online API');
    assert.equal(payload.target_table, undefined, 'payload must be byte-equivalent to online API');

    assert.deepEqual(transferCmd?.dependency_ids, [`SYNC-ORDER-${tempId}`]);
    assert.equal(transferCmd?.temporary_id, tempId);
    assert.equal(transferCmd?.entity_id, tempId);
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline tableTransfer for synced invoice has no temp dependency', async () => {
  await seedTable('T-SOURCE-003', 1);
  await seedTable('T-DEST-003', 0);

  const orderId = 'POS-INV-TRANSFER-003';
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: orderId,
    table: 'T-SOURCE-003',
    status: 'Draft',
    sync_status: 'synced',
    items: [],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await tableTransfer('T-SOURCE-003', 'T-DEST-003', orderId);

    const cmds = await repositories.syncQueue.getAll();
    const transferCmd = cmds.find(c => c.action === 'table_transfer');
    assert.ok(transferCmd);
    assert.deepEqual(transferCmd?.dependency_ids, []);
    assert.equal(transferCmd?.temporary_id, null);
    assert.equal(transferCmd?.entity_id, orderId);
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline tableTransfer clears stale merge linkage on source and destination', async () => {
  await repositories.tables.put({
    name: 'T-SOURCE-MERGED',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-PARTNER',
  });
  await repositories.tables.put({
    name: 'T-DEST-MERGED',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 0,
    merged_with: 'T-SOURCE-MERGED',
  });

  const orderId = 'POS-INV-TRANSFER-MERGED';
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: orderId,
    table: 'T-SOURCE-MERGED',
    status: 'Unbilled',
    sync_status: 'synced',
    items: [],
  });

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await tableTransfer('T-SOURCE-MERGED', 'T-DEST-MERGED', orderId);

    const source = await repositories.tables.getById('T-SOURCE-MERGED');
    const dest = await repositories.tables.getById('T-DEST-MERGED');

    assert.equal(source?.merged_with, null);
    assert.equal(dest?.merged_with, null);
  } finally {
    (call as any).post = originalPost;
  }
});

test('offline tableTransfer updates getTableOrder and getPOSInvoices fallbacks', async () => {
  await seedTable('T-SOURCE-004', 1);
  await seedTable('T-DEST-004', 0);

  const orderId = 'POS-INV-TRANSFER-004';
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: orderId,
    table: 'T-SOURCE-004',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  const originalPost = call.post;
  const originalGet = call.get;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    await tableTransfer('T-SOURCE-004', 'T-DEST-004', orderId);

    const sourceOrder = await getTableOrder('T-SOURCE-004');
    assert.equal(sourceOrder.message, null);

    const destOrder = await getTableOrder('T-DEST-004');
    assert.equal(destOrder.message?.name, orderId);
    assert.equal(destOrder.message?.restaurant_table, 'T-DEST-004');

    const unbilled = await getPOSInvoices({ status: 'Unbilled' });
    const transferred = unbilled.invoices.find(i => i.name === orderId);
    assert.ok(transferred);
    assert.equal(transferred?.restaurant_table, 'T-DEST-004');
  } finally {
    (call as any).post = originalPost;
    (call as any).get = originalGet;
  }
});

test('offline payment of split child marks target Paid and leaves sibling Draft', async () => {
  const sourceId = 'POS-INV-SPLIT-PAY-001';
  const childId = 'POS-INV-SPLIT-PAY-002';
  const groupId = 'SG-PAY-001';

  await seedTable('T-SPLIT-PAY-001', 1);

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-PAY-001',
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: groupId,
    split_index: 1,
    split_total: 2,
    split_siblings: [childId],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: childId,
    table: 'T-SPLIT-PAY-001',
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: groupId,
    custom_split_from: sourceId,
    split_index: 2,
    split_total: 2,
    split_siblings: [sourceId],
    items: [{ item: 'B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 }],
    grand_total: 50,
  });

  const { events, unsubscribe } = captureEvents();

  await queueOfflinePayment({
    invoice: childId,
    customer: 'Guest',
    cashier: 'cashier@example.com',
    owner: 'cashier@example.com',
    pos_profile: 'Test Profile',
    table: 'T-SPLIT-PAY-001',
    payments: [{ mode_of_payment: 'Cash', amount: 50 }],
    additionalDiscount: null,
  });

  try {
    const child = await repositories.orders.getById(childId);
    assert.equal(child?.status, 'Paid');
    assert.equal((child as any).is_locked, 1);

    const source = await repositories.orders.getById(sourceId);
    assert.equal(source?.status, 'Draft');

    const table = await repositories.tables.getById('T-SPLIT-PAY-001');
    assert.equal(table?.occupied, 1, 'shared table stays occupied while sibling is open');

    assert.ok(events.includes('ORDERS_UPDATED'));
  } finally {
    unsubscribe();
  }
});

test('offline payment of last split sibling releases shared table', async () => {
  const sourceId = 'POS-INV-SPLIT-PAY-003';
  const childId = 'POS-INV-SPLIT-PAY-004';
  const groupId = 'SG-PAY-002';

  await seedTable('T-SPLIT-PAY-002', 1);

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-PAY-002',
    status: 'Paid',
    sync_status: 'synced',
    custom_split_group: groupId,
    split_index: 1,
    split_total: 2,
    split_siblings: [childId],
    items: [],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: childId,
    table: 'T-SPLIT-PAY-002',
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: groupId,
    custom_split_from: sourceId,
    split_index: 2,
    split_total: 2,
    split_siblings: [sourceId],
    items: [],
    grand_total: 50,
  });

  const { events, unsubscribe } = captureEvents();

  await queueOfflinePayment({
    invoice: childId,
    customer: 'Guest',
    cashier: 'cashier@example.com',
    owner: 'cashier@example.com',
    pos_profile: 'Test Profile',
    table: 'T-SPLIT-PAY-002',
    payments: [{ mode_of_payment: 'Cash', amount: 50 }],
    additionalDiscount: null,
  });

  try {
    const table = await repositories.tables.getById('T-SPLIT-PAY-002');
    assert.equal(table?.occupied, 0, 'shared table is released when all splits are settled');
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    unsubscribe();
  }
});

test('offline payment of merged bill clears merge linkages and releases table cluster', async () => {
  const primaryId = 'POS-INV-MERGE-PAY-001';
  const secondaryId = 'POS-INV-MERGE-PAY-002';

  await repositories.tables.put({
    name: 'T-MERGE-PAY-001',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-MERGE-PAY-002',
  });
  await repositories.tables.put({
    name: 'T-MERGE-PAY-002',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'T-MERGE-PAY-001',
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: primaryId,
    table: 'T-MERGE-PAY-001',
    status: 'Draft',
    sync_status: 'synced',
    custom_merged_pos_invoice: secondaryId,
    custom_merged_total: 200,
    custom_merged_pos_invoice_details: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: secondaryId,
    table: 'T-MERGE-PAY-002',
    status: 'Draft',
    sync_status: 'synced',
    custom_merged_pos_invoice: primaryId,
    custom_merged_total: 100,
    custom_merged_pos_invoice_details: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
  });

  const { events, unsubscribe } = captureEvents();

  await queueOfflinePayment({
    invoice: primaryId,
    customer: 'Guest',
    cashier: 'cashier@example.com',
    owner: 'cashier@example.com',
    pos_profile: 'Test Profile',
    table: 'T-MERGE-PAY-001',
    payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    additionalDiscount: null,
  });

  try {
    const primary = await repositories.orders.getById(primaryId);
    assert.equal(primary?.status, 'Paid');
    assert.equal(primary?.custom_merged_pos_invoice, null);
    assert.equal(primary?.custom_merged_total, null);

    const secondary = await repositories.orders.getById(secondaryId);
    assert.equal(secondary?.status, 'Paid');
    assert.equal(secondary?.custom_merged_pos_invoice, null);
    assert.equal(secondary?.custom_merged_total, null);

    for (const tableName of ['T-MERGE-PAY-001', 'T-MERGE-PAY-002']) {
      const t = await repositories.tables.getById(tableName);
      assert.equal(t?.occupied, 0, `${tableName} should be released`);
      assert.equal(t?.merged_with, null, `${tableName} merge link should be cleared`);
    }

    assert.ok(events.includes('ORDERS_UPDATED'));
    assert.ok(events.includes('TABLES_UPDATED'));
  } finally {
    unsubscribe();
  }
});

test('queueOfflinePayment for temp split child depends on split command', async () => {
  const sourceId = 'POS-INV-SPLIT-PAY-TEMP-001';
  const childTempId = 'TEMP-SPLIT-PAY-TEMP-002';
  const splitCmdId = 'SYNC-SPLIT-PAY-TEMP-002';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: 'SG-TEMP-001',
    split_index: 1,
    split_total: 2,
    split_siblings: [childTempId],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: childTempId,
    status: 'Draft',
    sync_status: 'pending',
    custom_split_group: 'SG-TEMP-001',
    custom_split_from: sourceId,
    split_index: 2,
    split_total: 2,
    split_siblings: [sourceId],
    pending_command_id: splitCmdId,
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await queueOfflinePayment({
    invoice: childTempId,
    customer: 'Guest',
    cashier: 'cashier@example.com',
    owner: 'cashier@example.com',
    pos_profile: 'Test Profile',
    table: null,
    payments: [{ mode_of_payment: 'Cash', amount: 100 }],
    additionalDiscount: null,
  });

  const cmds = await repositories.syncQueue.getAll();
  const paymentCmd = cmds.find(c => c.action === 'make_invoice');
  assert.ok(paymentCmd);
  assert.deepEqual(paymentCmd?.dependency_ids, [splitCmdId]);
  assert.equal(paymentCmd?.temporary_id, childTempId);
});

// ============================================================================
// Merged Table Order Lookup & Display Parity (Task 9f)
// ============================================================================

const socketPosProfile = {
  print_type: 'socket',
  print_format: 'Standard POS Invoice',
  name: 'Test POS Profile',
  cashier: 'cashier@example.com',
  multiple_cashier: 0,
} as any;

async function seedMergedCluster() {
  await repositories.tables.put({
    name: 'F1',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'F5',
  });
  await repositories.tables.put({
    name: 'F5',
    restaurant_room: 'Main Hall',
    no_of_seats: 4,
    occupied: 1,
    merged_with: 'F1',
  });
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-F1-MASTER',
    table: 'F1',
    room: 'Main Hall',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });
}

test('offline getTableOrder(F5) returns master order for F1 with merged table metadata', async () => {
  await seedMergedCluster();

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };

  try {
    const master = await getTableOrder('F1');
    assert.equal(master.message?.name, 'POS-INV-F1-MASTER');
    assert.equal(master.message?.restaurant_table, 'F1');
    assert.equal(master.message?.custom_merged_tables, 'F5');

    const child = await getTableOrder('F5');
    assert.equal(child.message?.name, 'POS-INV-F1-MASTER');
    assert.equal(child.message?.restaurant_table, 'F1');
    assert.equal(child.message?.custom_merged_tables, 'F5');

    const tableLabel = formatMergedTableLabel(
      child.message?.restaurant_table,
      child.message?.custom_merged_tables
    );
    assert.equal(tableLabel, 'F1 + F5');
  } finally {
    (call as any).get = originalGet;
  }
});

test('offline Print on merged child table F5 queues print for master order without error', async () => {
  await seedMergedCluster();

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Network Disconnected');
  };
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('should not be called while offline');
  };

  setNavigatorOnline(false);
  setWindowMock();

  try {
    const orderResponse = await getTableOrder('F5');
    const invoiceId = orderResponse.message?.name;
    assert.ok(invoiceId, 'getTableOrder should resolve master invoice from child table');

    const result = await printOrder({ orderId: invoiceId, posProfile: socketPosProfile });
    assert.equal(result.success, true);
    assert.equal(result.status, 'queued');

    const queued = await repositories.syncQueue.getById(`QZ-PRINT-${invoiceId}`);
    assert.ok(queued, 'QZ_PRINT_UPDATE command should be queued for master invoice');
    assert.equal(queued?.action, 'qz_print_update');
    assert.deepEqual(queued?.dependency_ids, []);

    const local = await repositories.orders.getById(invoiceId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);
  } finally {
    (call as any).get = originalGet;
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('getPOSInvoices offline fallback formats merged table display string as F1 + F5', async () => {
  await seedMergedCluster();

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const result = await getPOSInvoices({ status: 'Unbilled' });
    assert.equal(result.invoices.length, 1);
    assert.equal(result.invoices[0].name, 'POS-INV-F1-MASTER');
    assert.equal(result.invoices[0].restaurant_table, 'F1');
    assert.equal(result.invoices[0].custom_merged_tables, 'F5');

    const tableLabel = formatMergedTableLabel(
      result.invoices[0].restaurant_table,
      result.invoices[0].custom_merged_tables
    );
    assert.equal(tableLabel, 'F1 + F5');
  } finally {
    (call as any).get = originalGet;
  }
});


test('offline split creates two distinct order entities and renders two order cards', async () => {
  const sourceId = 'POS-INV-SPLIT-CARDS-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-CARDS-001',
    status: 'Draft',
    sync_status: 'synced',
    invoice_printed: 1,
    items: [
      { item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 },
      { item: 'B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 },
    ],
    grand_total: 250,
  });

  setNavigatorOnline(false);
  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const splitResult = await splitBill(sourceId, [{ name: 'A', qty: 1 }]);

    // Both source and child must exist as distinct order entities.
    const source = await repositories.orders.getById(sourceId);
    const child = await repositories.orders.getById(splitResult.new_invoice);
    assert.ok(source);
    assert.ok(child);

    assert.equal(source.split_index, 1);
    assert.equal(source.split_total, 2);
    assert.ok(source.split_siblings?.includes(splitResult.new_invoice));

    assert.equal(child.split_index, 2);
    assert.equal(child.split_total, 2);
    assert.ok(child.split_siblings?.includes(sourceId));
    assert.equal(child.custom_split_from, sourceId);
    assert.ok(child.pending_command_id, 'Child must store pending split command id');

    // getPOSInvoices fallback must return BOTH split invoices as distinct cards.
    // The source stays Draft (already printed); the freshly split child is unprinted
    // and therefore lands in the Unbilled tab for table orders, matching the backend.
    const drafts = await getPOSInvoices({ status: 'Draft' });
    const unbilled = await getPOSInvoices({ status: 'Unbilled' });

    const sourceCard = drafts.invoices.find(
      inv => inv.custom_split_group === source.custom_split_group && inv.split_index === 1
    );
    const childCard = unbilled.invoices.find(
      inv => inv.custom_split_group === source.custom_split_group && inv.split_index === 2
    );

    assert.ok(sourceCard, 'Source split card must render in Draft tab');
    assert.ok(childCard, 'Child split card must render in Unbilled tab');
    assert.equal(sourceCard.name, sourceId);
    assert.equal(childCard.name, splitResult.new_invoice);
  } finally {
    setNavigatorOnline(true);
    (call as any).get = originalGet;
  }
});


test('offline split matches items by server row name like the backend', async () => {
  const sourceId = 'POS-INV-SPLIT-ROW-NAME-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-ROW-001',
    status: 'Draft',
    sync_status: 'synced',
    invoice_printed: 1,
    items: [
      // Server POS Invoice Item rows have a row `name` that differs from item_code.
      { name: 'ROW-A', item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 },
      { name: 'ROW-B', item: 'A', item_name: 'Item A duplicate', rate: 100, qty: 1, amount: 100 },
    ],
    grand_total: 300,
  });

  setNavigatorOnline(false);

  try {
    // Move the specific ROW-A quantity; ROW-B must stay untouched.
    const result = await splitBill(sourceId, [{ name: 'ROW-A', qty: 1 }]);

    const source = await repositories.orders.getById(sourceId);
    const child = await repositories.orders.getById(result.new_invoice);

    assert.ok(source);
    assert.ok(child);
    assert.equal(source.items.length, 2);
    assert.equal(source.items.find(i => i.name === 'ROW-A')?.qty, 1);
    assert.equal(source.items.find(i => i.name === 'ROW-B')?.qty, 1);
    assert.equal(child.items.length, 1);
    assert.equal(child.items[0].name, 'ROW-A');
    assert.equal(child.items[0].qty, 1);
  } finally {
    setNavigatorOnline(true);
  }
});

test('offline split resets child invoice_printed to 0 and sets Unbilled for table orders', async () => {
  const sourceId = 'POS-INV-SPLIT-CHILD-STATUS-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-STATUS-001',
    status: 'Draft',
    sync_status: 'synced',
    invoice_printed: 1,
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(false);

  try {
    const result = await splitBill(sourceId, [{ name: 'A', qty: 1 }]);

    const child = await repositories.orders.getById(result.new_invoice);
    assert.ok(child);
    assert.equal(child.invoice_printed, 0);
    assert.equal(child.status, 'Unbilled');

    const source = await repositories.orders.getById(sourceId);
    assert.equal(source?.invoice_printed, 1);
    assert.equal(source?.status, 'Draft');
  } finally {
    setNavigatorOnline(true);
  }
});

test('offline split applies customer override to child locally', async () => {
  const sourceId = 'POS-INV-SPLIT-CUSTOMER-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-CUSTOMER-001',
    status: 'Draft',
    sync_status: 'synced',
    customer: 'Guest',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(false);

  try {
    const result = await splitBill(sourceId, [{ name: 'A', qty: 1 }], 'CUST-NEW');

    const child = await repositories.orders.getById(result.new_invoice);
    assert.ok(child);
    assert.equal(child.customer, 'CUST-NEW');

    const source = await repositories.orders.getById(sourceId);
    assert.equal(source?.customer, 'Guest');

    const cmds = await repositories.syncQueue.getAll();
    const splitCmd = cmds.find(
      c =>
        c.action === 'SplitBillCommand' ||
        c.operation_type === 'SPLIT_BILL' ||
        c.endpoint?.includes('split_bill')
    );
    assert.equal((splitCmd?.payload as any)?.customer, 'CUST-NEW');
  } finally {
    setNavigatorOnline(true);
  }
});

test('offline split for TEMP-SPLIT-* source depends on parent split command', async () => {
  const parentTempId = 'TEMP-SPLIT-SOURCE-001';
  const parentCmdId = 'SYNC-SPLIT-PARENT-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: parentTempId,
    table: 'T-SPLIT-NESTED-001',
    status: 'Unbilled',
    sync_status: 'pending',
    pending_command_id: parentCmdId,
    custom_split_group: 'SG-NESTED-001',
    split_index: 1,
    split_total: 2,
    split_siblings: ['TEMP-SPLIT-SIBLING-001'],
    custom_split_from: 'POS-INV-SPLIT-NESTED-PARENT',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(false);

  try {
    const result = await splitBill(parentTempId, [{ name: 'A', qty: 1 }]);

    const cmds = await repositories.syncQueue.getAll();
    const splitCmds = cmds.filter(
      c =>
        c.action === 'SplitBillCommand' ||
        c.operation_type === 'SPLIT_BILL' ||
        c.endpoint?.includes('split_bill')
    );
    assert.equal(splitCmds.length, 1);
    assert.deepEqual(splitCmds[0]?.dependency_ids, [parentCmdId]);

    const child = await repositories.orders.getById(result.new_invoice);
    assert.equal(child?.pending_command_id, splitCmds[0]?.id);
  } finally {
    setNavigatorOnline(true);
  }
});

test('offline split of an already-split invoice updates all siblings', async () => {
  const sourceId = 'POS-INV-SPLIT-MULTI-001';
  const child1Id = 'POS-INV-SPLIT-MULTI-002';
  const groupId = 'SG-MULTI-001';
  const createdAtBase = '2026-08-07T10:00:00.000Z';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: sourceId,
    table: 'T-SPLIT-MULTI-001',
    status: 'Draft',
    sync_status: 'synced',
    invoice_printed: 1,
    custom_split_group: groupId,
    split_index: 1,
    split_total: 2,
    split_siblings: [child1Id],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 3, amount: 300 }],
    grand_total: 300,
    createdAt: createdAtBase,
  });

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: child1Id,
    table: 'T-SPLIT-MULTI-001',
    status: 'Unbilled',
    sync_status: 'synced',
    invoice_printed: 0,
    custom_split_group: groupId,
    custom_split_from: sourceId,
    split_index: 2,
    split_total: 2,
    split_siblings: [sourceId],
    items: [{ item: 'B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 }],
    grand_total: 50,
    createdAt: '2026-08-07T10:05:00.000Z',
  });

  setNavigatorOnline(false);

  try {
    const result = await splitBill(sourceId, [{ name: 'A', qty: 1 }]);

    const source = await repositories.orders.getById(sourceId);
    const child1 = await repositories.orders.getById(child1Id);
    const child2 = await repositories.orders.getById(result.new_invoice);

    assert.ok(source);
    assert.ok(child1);
    assert.ok(child2);

    assert.equal(source.split_total, 3);
    assert.equal(child1.split_total, 3);
    assert.equal(child2.split_total, 3);

    assert.equal(source.split_index, 1);
    assert.equal(child1.split_index, 2);
    assert.equal(child2.split_index, 3);

    assert.deepEqual(source.split_siblings?.sort(), [child1Id, result.new_invoice].sort());
    assert.deepEqual(child1.split_siblings?.sort(), [sourceId, result.new_invoice].sort());
    assert.deepEqual(child2.split_siblings?.sort(), [sourceId, child1Id].sort());
  } finally {
    setNavigatorOnline(true);
  }
});

// ============================================================================
// Task 12: Offline Split + Payment Queue Dependency Chain
// ============================================================================

test('offline split of temp order queues payment dependencies on correct creators', async () => {
  // 1. Create a TEMP order (total 200) while offline.
  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Network Disconnected');
  };

  let tempId: string;
  setNavigatorOnline(false);

  try {
    const order = await syncOrder(baseOrderData({
      table: 'T-SPLIT-PAY-CHAIN-001',
      items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 2 }],
    }));
    tempId = order.name;

    // 2. Split the TEMP order moving 1 qty -> TEMP1 (100) + TEMP2 (100).
    const splitResult = await splitBill(tempId, [{ name: 'A', qty: 1 }]);
    const childTempId = splitResult.new_invoice;

    // 3. Queue payment on the original (now reduced) invoice.
    await queueOfflinePayment({
      invoice: tempId,
      customer: 'Guest',
      cashier: 'cashier@example.com',
      owner: 'cashier@example.com',
      pos_profile: 'Test Profile',
      table: 'T-SPLIT-PAY-CHAIN-001',
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
      additionalDiscount: null,
    });

    // 4. Queue payment on the split child invoice.
    await queueOfflinePayment({
      invoice: childTempId,
      customer: 'Guest',
      cashier: 'cashier@example.com',
      owner: 'cashier@example.com',
      pos_profile: 'Test Profile',
      table: 'T-SPLIT-PAY-CHAIN-001',
      payments: [{ mode_of_payment: 'Cash', amount: 100 }],
      additionalDiscount: null,
    });

    // Invariant: two independent order entities with independent totals/items/statuses.
    const source = await repositories.orders.getById(tempId);
    const child = await repositories.orders.getById(childTempId);

    assert.ok(source);
    assert.ok(child);
    assert.equal(source.items.length, 1);
    assert.equal(source.items[0].qty, 1);
    assert.equal(source.grand_total, 100);
    assert.equal(child.items.length, 1);
    assert.equal(child.items[0].qty, 1);
    assert.equal(child.grand_total, 100);
    assert.equal(source.status, 'Paid');
    assert.equal(child.status, 'Paid');

    // Find the split command that created the child.
    const cmds = await repositories.syncQueue.getAll();
    const splitCmd = cmds.find(
      c =>
        c.operation_type === 'SPLIT_BILL' &&
        (c.action === 'SplitBillCommand' || c.endpoint?.includes('split_bill')) &&
        c.temporary_id === childTempId
    );
    assert.ok(splitCmd, 'Split command for child must exist in queue');
    assert.deepEqual(splitCmd?.dependency_ids, [`SYNC-ORDER-${tempId}`]);

    // Payment commands must depend on the correct creators.
    const paymentCmds = cmds.filter(c => c.action === 'make_invoice');
    assert.equal(paymentCmds.length, 2, 'Two independent payment commands must be queued');

    const sourcePayment = paymentCmds.find(c => (c.payload as any).invoice === tempId);
    const childPayment = paymentCmds.find(c => (c.payload as any).invoice === childTempId);

    assert.ok(sourcePayment, 'Payment for original temp invoice must exist');
    assert.ok(childPayment, 'Payment for split child temp invoice must exist');
    assert.deepEqual(sourcePayment?.dependency_ids, [`SYNC-ORDER-${tempId}`]);
    assert.deepEqual(childPayment?.dependency_ids, [splitCmd?.id]);
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});
