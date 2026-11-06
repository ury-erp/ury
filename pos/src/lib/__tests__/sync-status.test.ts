import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { repositories } from '@ury/core';
import { getOrderSyncBadgeState, getTableSyncBadgeState } from '../sync-status';
import type { POSInvoice } from '../invoice-api';

const baseOrderEntity = (overrides: Partial<Record<string, unknown>> = {}) => ({
  order_type: 'Dine-In',
  items: [] as any[],
  grand_total: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(async () => {
  await repositories.orders.clear();
  await repositories.syncQueue.clear();
});

test('temp order is reported as pending sync', async () => {
  const order: POSInvoice = {
    name: 'TEMP-ORD-001',
    sync_status: 'pending',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'pending');
});

test('server order with sync_status pending is reported as pending sync', async () => {
  const order: POSInvoice = {
    name: 'POS-INV-001',
    sync_status: 'pending',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'pending');
});

test('server order with sync_status synced and no failed commands is reported as synced', async () => {
  const order: POSInvoice = {
    name: 'POS-INV-002',
    sync_status: 'synced',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'synced');
});

test('order with a FAILED sync_order command referencing it is reported as failed', async () => {
  const orderId = 'POS-INV-003';

  await repositories.syncQueue.put({
    id: `SYNC-ORDER-${orderId}`,
    command_id: `SYNC-ORDER-${orderId}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: orderId },
    status: 'FAILED',
    priority: 1,
    timestamp: new Date().toISOString(),
  });

  const order: POSInvoice = {
    name: orderId,
    sync_status: 'synced',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'failed');
});

test('failed state takes precedence over pending sync_status', async () => {
  const orderId = 'TEMP-ORD-FAILED-001';

  await repositories.syncQueue.put({
    id: `SYNC-ORDER-${orderId}`,
    command_id: `SYNC-ORDER-${orderId}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: orderId },
    status: 'FAILED',
    priority: 1,
    timestamp: new Date().toISOString(),
  });

  const order: POSInvoice = {
    name: orderId,
    sync_status: 'pending',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'failed');
});

test('failed payment command referencing an order via payload invoice marks order failed', async () => {
  const orderId = 'POS-INV-PAY-FAIL-001';

  await repositories.syncQueue.put({
    id: `SYNC-PAYMENT-${orderId}`,
    command_id: `SYNC-PAYMENT-${orderId}`,
    action: 'make_invoice',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.make_invoice',
    payload: { invoice: orderId },
    status: 'FAILED',
    priority: 1,
    timestamp: new Date().toISOString(),
  });

  const order: POSInvoice = {
    name: orderId,
    sync_status: 'synced',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'failed');
});

test('pending command does not mark order as failed', async () => {
  const orderId = 'POS-INV-PENDING-001';

  await repositories.syncQueue.put({
    id: `SYNC-ORDER-${orderId}`,
    command_id: `SYNC-ORDER-${orderId}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: orderId },
    status: 'PENDING',
    priority: 1,
    timestamp: new Date().toISOString(),
  });

  const order: POSInvoice = {
    name: orderId,
    sync_status: 'synced',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'synced');
});

test('table with active pending order reports pending sync badge state', async () => {
  await repositories.orders.put({
    ...baseOrderEntity(),
    id: 'POS-INV-TABLE-PENDING-001',
    table: 'T-PENDING-001',
    status: 'Unbilled',
    sync_status: 'pending',
    invoice_printed: 0,
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  const state = await getTableSyncBadgeState('T-PENDING-001');
  assert.equal(state, 'pending');
});

test('table with active order that has a failed command reports failed sync badge state', async () => {
  const orderId = 'POS-INV-TABLE-FAILED-001';
  const tableName = 'T-FAILED-001';

  await repositories.orders.put({
    ...baseOrderEntity(),
    id: orderId,
    table: tableName,
    status: 'Unbilled',
    sync_status: 'synced',
    invoice_printed: 0,
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  await repositories.syncQueue.put({
    id: `SYNC-ORDER-${orderId}`,
    command_id: `SYNC-ORDER-${orderId}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: orderId },
    status: 'FAILED',
    priority: 1,
    timestamp: new Date().toISOString(),
  });

  const state = await getTableSyncBadgeState(tableName);
  assert.equal(state, 'failed');
});

test('table with no active order reports synced badge state', async () => {
  const state = await getTableSyncBadgeState('T-EMPTY-001');
  assert.equal(state, 'synced');
});

test('completed command does not mark order as failed', async () => {
  const orderId = 'POS-INV-COMPLETED-001';

  await repositories.syncQueue.put({
    id: `SYNC-ORDER-${orderId}`,
    command_id: `SYNC-ORDER-${orderId}`,
    action: 'sync_order',
    endpoint: 'ury.ury.doctype.ury_order.ury_order.sync_order',
    payload: { invoice: orderId },
    status: 'COMPLETED',
    priority: 1,
    timestamp: new Date().toISOString(),
  });

  const order: POSInvoice = {
    name: orderId,
    sync_status: 'synced',
  } as POSInvoice;

  const state = await getOrderSyncBadgeState(order);
  assert.equal(state, 'synced');
});
