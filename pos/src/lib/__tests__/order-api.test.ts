import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, projectionBus } from '@ury/core';
import { syncOrder, cancelOrder, releaseTableAfterPayment, queueOfflinePayment, type SyncOrderData } from '../order-api';
import { updatePrintStatus, getPOSInvoices } from '../invoice-api';

const baseOrderData = (overrides: Partial<SyncOrderData> = {}): SyncOrderData => ({
  order_type: 'Dine-In',
  no_of_pax: 2,
  items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1 }],
  pos_profile: 'Test Profile',
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
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1 }],
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
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1 }],
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
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1 }],
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
    assert.deepEqual(queued?.dependency_ids, ['SYNC-ORDER-TEMP-ORD-CANCEL-002']);
    assert.equal((queued?.payload as any)?.invoice_id, 'TEMP-ORD-CANCEL-002');
    assert.equal((queued?.payload as any)?.reason, 'No show');
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

  const originalPost = call.post;
  (call as any).post = async () => ({ message: { status: 'Cancelled' } });

  try {
    const result = await cancelOrder(
      { name: 'POS-INV-CANCEL-003', restaurant_table: 'T-CANCEL-003' },
      'Customer request'
    );
    assert.equal(result.success, true);
    assert.equal(result.queued, false);

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
      invoice: null,
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
      'no_of_pax', 'order_type', 'owner', 'pos_profile', 'waiter',
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
