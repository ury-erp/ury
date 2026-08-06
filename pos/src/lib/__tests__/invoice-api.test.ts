import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, tempIDMapper } from '@ury/core';
import { getPOSInvoices, getOrderForEdit } from '../invoice-api';

const baseOrder = {
  order_type: 'Dine-In',
  items: [] as any[],
  grand_total: 100,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(async () => {
  await repositories.orders.clear();
  await repositories.syncQueue.clear();
  await tempIDMapper.clear();
});

test('getPOSInvoices online path reconciles local Draft status to server Paid', async () => {
  const SERVER_ID = 'POS-INV-2026-RECON-001';

  await repositories.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Draft',
    sync_status: 'synced',
  });

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: {
      data: [
        {
          name: SERVER_ID,
          invoice_printed: 0,
          grand_total: 100,
          restaurant_table: 'T-01',
          cashier: '',
          waiter: '',
          net_total: 100,
          posting_time: '12:00:00',
          total_taxes_and_charges: 0,
          customer: 'Guest',
          status: 'Paid',
          mobile_number: '',
          posting_date: '2026-08-06',
          rounded_total: 100,
          order_type: 'Dine-In',
          items: [],
        },
      ],
      next: false,
    },
  });

  try {
    const result = await getPOSInvoices({ status: 'Paid' });
    assert.equal(result.invoices.length, 1);
    assert.equal(result.invoices[0].name, SERVER_ID);
    assert.equal(result.invoices[0].status, 'Paid');

    const local = await repositories.orders.getById(SERVER_ID);
    assert.equal(local?.status, 'Paid');
  } finally {
    (call as any).get = originalGet;
  }
});

test('getPOSInvoices fallback merges TEMP Paid status onto server Draft copy', async () => {
  const SERVER_ID = 'POS-INV-2026-FALLBACK-001';
  const TEMP_ID = 'TEMP-ORD-FALLBACK-001';

  await repositories.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Draft',
    sync_status: 'synced',
  });

  await tempIDMapper.registerMapping(TEMP_ID, SERVER_ID);
  await repositories.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    status: 'Paid',
    sync_status: 'pending',
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const result = await getPOSInvoices({ status: 'Paid' });
    assert.equal(result.invoices.length, 1);
    assert.equal(result.invoices[0].name, SERVER_ID);
    assert.equal(result.invoices[0].status, 'Paid');

    const temp = await repositories.orders.getById(TEMP_ID);
    assert.equal(temp, undefined);

    const server = await repositories.orders.getById(SERVER_ID);
    assert.equal(server?.status, 'Paid');
  } finally {
    (call as any).get = originalGet;
  }
});

// ============================================================================
// Validation Matrix Scenarios (Task 4)
// ============================================================================

test('Scenario 1: Offline Draft -> Sync -> Backend Draft -> getPOSInvoices fallback shows Draft', async () => {
  const SERVER_ID = 'POS-INV-POS-SC1-001';

  await repositories.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Draft',
    sync_status: 'synced',
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const draftResult = await getPOSInvoices({ status: 'Draft' });
    assert.equal(draftResult.invoices.length, 1);
    assert.equal(draftResult.invoices[0].name, SERVER_ID);
    assert.equal(draftResult.invoices[0].status, 'Draft');
  } finally {
    (call as any).get = originalGet;
  }
});

test('Scenario 2: Offline Draft -> Offline Payment -> Sync -> Backend Paid -> fallback shows Paid, Draft tab empty', async () => {
  const SERVER_ID = 'POS-INV-POS-SC2-001';
  const TEMP_ID = 'TEMP-ORD-POS-SC2-001';

  await tempIDMapper.registerMapping(TEMP_ID, SERVER_ID);
  await repositories.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Draft',
    sync_status: 'synced',
  });
  await repositories.orders.put({
    ...baseOrder,
    id: TEMP_ID,
    status: 'Paid',
    sync_status: 'pending',
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const draftResult = await getPOSInvoices({ status: 'Draft' });
    assert.equal(draftResult.invoices.length, 0, 'Paid order must not appear in Draft tab');

    const paidResult = await getPOSInvoices({ status: 'Paid' });
    assert.equal(paidResult.invoices.length, 1);
    assert.equal(paidResult.invoices[0].name, SERVER_ID);
    assert.equal(paidResult.invoices[0].status, 'Paid');

    const local = await repositories.orders.getById(SERVER_ID);
    assert.equal(local?.status, 'Paid');
  } finally {
    (call as any).get = originalGet;
  }
});

test('Scenario 3: Offline Draft -> Sync -> Offline -> getOrderForEdit works without Failed to Fetch', async () => {
  const SERVER_ID = 'POS-INV-POS-SC3-001';

  await repositories.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'ITEM-001', item_name: 'Test Item', rate: 100, qty: 1, amount: 100 }],
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Failed to Fetch');
  };

  try {
    const editResult = await getOrderForEdit(SERVER_ID);
    assert.ok(editResult, 'getOrderForEdit should return a fallback result offline');
    assert.equal(editResult.name, SERVER_ID);
    assert.equal(editResult.status, 'Draft');
  } finally {
    (call as any).get = originalGet;
  }
});

test('Scenario 4: Offline Paid -> Orders Page shows Paid, not Draft', async () => {
  const SERVER_ID = 'POS-INV-POS-SC4-001';

  await repositories.orders.put({
    ...baseOrder,
    id: SERVER_ID,
    status: 'Paid',
    sync_status: 'synced',
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const draftResult = await getPOSInvoices({ status: 'Draft' });
    assert.equal(draftResult.invoices.length, 0, 'Paid order must not appear under Draft');

    const paidResult = await getPOSInvoices({ status: 'Paid' });
    assert.equal(paidResult.invoices.length, 1);
    assert.equal(paidResult.invoices[0].name, SERVER_ID);
    assert.equal(paidResult.invoices[0].status, 'Paid');
  } finally {
    (call as any).get = originalGet;
  }
});

test('Scenario 7: Multiple Orders statuses and order types match backend', async () => {
  const orders = [
    { id: 'POS-INV-POS-SC7-001', status: 'Draft', order_type: 'Dine-In', table: 'T-01' },
    { id: 'POS-INV-POS-SC7-002', status: 'Paid', order_type: 'Takeaway' },
    { id: 'POS-INV-POS-SC7-003', status: 'Cancelled', order_type: 'Delivery' },
    { id: 'POS-INV-POS-SC7-004', status: 'Draft', order_type: 'Aggregators' },
    { id: 'POS-INV-POS-SC7-005', status: 'Unbilled', order_type: 'Phone In', table: 'T-02' },
  ];

  for (const o of orders) {
    await repositories.orders.put({
      ...baseOrder,
      id: o.id,
      table: o.table,
      order_type: o.order_type,
      status: o.status,
      sync_status: 'synced',
    });
  }

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const draftResult = await getPOSInvoices({ status: 'Draft' });
    assert.equal(draftResult.invoices.length, 2);
    assert.ok(draftResult.invoices.every(inv => inv.status === 'Draft'));

    const paidResult = await getPOSInvoices({ status: 'Paid' });
    assert.equal(paidResult.invoices.length, 1);
    assert.equal(paidResult.invoices[0].status, 'Paid');

    const cancelledResult = await getPOSInvoices({ status: 'Cancelled' });
    assert.equal(cancelledResult.invoices.length, 1);
    assert.equal(cancelledResult.invoices[0].status, 'Cancelled');

    const unbilledResult = await getPOSInvoices({ status: 'Unbilled' });
    assert.equal(unbilledResult.invoices.length, 1);
    assert.equal(unbilledResult.invoices[0].status, 'Unbilled');

    // Verify no cross-status leakage.
    assert.ok(!draftResult.invoices.some(inv => inv.status !== 'Draft'));
    assert.ok(!paidResult.invoices.some(inv => inv.name === 'POS-INV-POS-SC7-003'));
  } finally {
    (call as any).get = originalGet;
  }
});
