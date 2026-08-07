import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createStore } from 'zustand/vanilla';
import { call, repositories } from '@ury/core';
import { createOrdersSlice, OrdersSlice } from '../../store/slices/orders-slice';

beforeEach(async () => {
  await repositories.orders.clear();
  await repositories.syncQueue.clear();

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    configurable: true,
    writable: true,
  });
});

function createTestStore() {
  return createStore<OrdersSlice>((...args) => createOrdersSlice(...args));
}

test('setSelectedStatus with selectedOrderId auto-selects the order after fetch', async () => {
  const orderId = 'POS-INV-STORE-PRINT-001';

  // Simulate the local state after a successful offline table print.
  await repositories.orders.put({
    id: orderId,
    order_type: 'Dine-In',
    status: 'Draft',
    invoice_printed: 1,
    no_of_pax: 1,
    table: 'T-01',
    customer: 'Guest',
    waiter: 'Waiter 1',
    cashier: 'Cashier 1',
    pos_profile: 'Test POS Profile',
    items: [],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'synced',
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  const store = createTestStore();

  try {
    assert.equal(store.getState().selectedOrder, null);

    await store.getState().setSelectedStatus('Draft', orderId);

    assert.equal(store.getState().selectedStatus, 'Draft');
    assert.equal(store.getState().selectedOrder?.name, orderId);
    assert.equal(store.getState().selectedOrder?.status, 'Draft');
  } finally {
    (call as any).get = originalGet;
  }
});

test('setSelectedStatus without selectedOrderId clears and fetches only', async () => {
  const orderId = 'POS-INV-STORE-PRINT-002';

  await repositories.orders.put({
    id: orderId,
    order_type: 'Dine-In',
    status: 'Draft',
    invoice_printed: 1,
    no_of_pax: 1,
    table: 'T-02',
    customer: 'Guest',
    waiter: 'Waiter 1',
    cashier: 'Cashier 1',
    pos_profile: 'Test POS Profile',
    items: [],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'synced',
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  const store = createTestStore();

  try {
    await store.getState().setSelectedStatus('Draft');

    assert.equal(store.getState().selectedStatus, 'Draft');
    assert.equal(store.getState().selectedOrder, null);
    assert.ok(store.getState().orders.some((o) => o.name === orderId));
  } finally {
    (call as any).get = originalGet;
  }
});
