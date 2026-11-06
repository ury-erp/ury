import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { call, repositories, tempIDMapper } from '@ury/core';
import { getPOSInvoices, getOrderForEdit, reprintKot, mergeBills, getSplitGroup } from '../invoice-api';
import { printOrder } from '../print';

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

// ============================================================================
// Task 3: Table Print Redirect & Offline Print Queue
// ============================================================================

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

const socketPosProfile = {
  print_type: 'socket',
  print_format: 'Standard POS Invoice',
  name: 'Test POS Profile',
  cashier: 'cashier@example.com',
  multiple_cashier: 0,
} as any;

test('printOrder returns queued and updates local state when navigator is offline', async () => {
  const tempId = 'TEMP-ORD-PRINT-ORDER-001';

  await repositories.orders.put({
    ...baseOrder,
    id: tempId,
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
  });

  setNavigatorOnline(false);
  setWindowMock();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('should not be called while offline');
  };

  try {
    const result = await printOrder({ orderId: tempId, posProfile: socketPosProfile });

    assert.equal(result.success, true);
    assert.equal(result.status, 'queued');

    const queued = await repositories.syncQueue.getById(`QZ-PRINT-${tempId}`);
    assert.ok(queued, 'QZ_PRINT_UPDATE command should be queued');
    assert.equal(queued?.action, 'qz_print_update');
    assert.deepEqual(queued?.dependency_ids, [`SYNC-ORDER-${tempId}`]);

    const local = await repositories.orders.getById(tempId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('printOrder returns printed when online updatePrintStatus succeeds', async () => {
  const serverId = 'POS-INV-PRINT-ORDER-002';

  await repositories.orders.put({
    ...baseOrder,
    id: serverId,
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
  });

  setNavigatorOnline(true);
  setWindowMock();

  const originalPost = call.post;
  (call as any).post = async () => ({ message: { status: 'Draft' } });

  try {
    const result = await printOrder({ orderId: serverId, posProfile: socketPosProfile });

    assert.equal(result.success, true);
    assert.equal(result.status, 'printed');

    const queued = await repositories.syncQueue.getById(`QZ-PRINT-${serverId}`);
    assert.equal(queued, undefined);
  } finally {
    (call as any).post = originalPost;
  }
});

test('printOrder returns queued and updates local state when online call fails', async () => {
  const tempId = 'TEMP-ORD-PRINT-ORDER-003';

  await repositories.orders.put({
    ...baseOrder,
    id: tempId,
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
  });

  setNavigatorOnline(true);
  setWindowMock();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Server unreachable');
  };

  try {
    const result = await printOrder({ orderId: tempId, posProfile: socketPosProfile });

    assert.equal(result.success, true);
    assert.equal(result.status, 'queued');

    const local = await repositories.orders.getById(tempId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);
  } finally {
    (call as any).post = originalPost;
  }
});

// ============================================================================
// Task 6: Table Order Print Flow Parity
// ============================================================================

test('Offline Table Print -> order appears in Draft tab for auto-selection', async () => {
  const tempId = 'TEMP-ORD-TABLE-PRINT-001';

  await repositories.orders.put({
    ...baseOrder,
    id: tempId,
    table: 'T-01',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
  });

  setNavigatorOnline(false);
  setWindowMock();

  const originalGet = call.get;
  const originalPost = call.post;
  (call as any).get = async () => {
    throw new Error('offline');
  };
  (call as any).post = async () => {
    throw new Error('should not be called while offline');
  };

  try {
    const result = await printOrder({ orderId: tempId, posProfile: socketPosProfile });

    assert.equal(result.status, 'queued');

    const local = await repositories.orders.getById(tempId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);

    // After printing, the Orders page Draft tab must contain the order so it
    // can be auto-selected. This mirrors the Online lifecycle.
    const draftResult = await getPOSInvoices({ status: 'Draft' });
    assert.equal(draftResult.invoices.length, 1);
    assert.equal(draftResult.invoices[0].name, tempId);
    assert.equal(draftResult.invoices[0].status, 'Draft');
    assert.equal(draftResult.invoices[0].invoice_printed, 1);
  } finally {
    (call as any).get = originalGet;
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('Offline Table Print -> Payment: order is printable/ payable locally', async () => {
  const tempId = 'TEMP-ORD-TABLE-PRINT-002';

  await repositories.orders.put({
    ...baseOrder,
    id: tempId,
    table: 'T-02',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'pending',
  });

  setNavigatorOnline(false);
  setWindowMock();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('should not be called while offline');
  };

  try {
    await printOrder({ orderId: tempId, posProfile: socketPosProfile });

    const local = await repositories.orders.getById(tempId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);

    // The POS UI blocks payment while invoice_printed === '0'. After an
    // offline print the local state must already allow payment.
    assert.ok(local?.invoice_printed === 1, 'invoice_printed must be 1 to enable payment');
    assert.ok(local?.status === 'Draft', 'status must be Draft to enable payment');
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('Offline Table Print -> Sync: server invoice print update is queued', async () => {
  const serverId = 'POS-INV-TABLE-PRINT-003';

  await repositories.orders.put({
    ...baseOrder,
    id: serverId,
    table: 'T-03',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
  });

  setNavigatorOnline(false);
  setWindowMock();

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('should not be called while offline');
  };

  try {
    await printOrder({ orderId: serverId, posProfile: socketPosProfile });

    const queued = await repositories.syncQueue.getById(`QZ-PRINT-${serverId}`);
    assert.ok(queued, 'QZ_PRINT_UPDATE command should be queued for server invoice');
    assert.equal(queued?.action, 'qz_print_update');
    assert.equal((queued?.payload as any)?.invoice, serverId);
    // Server invoices do not need to wait for a parent sync_order.
    assert.deepEqual(queued?.dependency_ids, []);
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('Online Table Print -> local order state transitions to Draft and invoice_printed', async () => {
  const serverId = 'POS-INV-TABLE-PRINT-004';

  await repositories.orders.put({
    ...baseOrder,
    id: serverId,
    table: 'T-04',
    status: 'Unbilled',
    invoice_printed: 0,
    sync_status: 'synced',
  });

  setNavigatorOnline(true);
  setWindowMock();

  const originalPost = call.post;
  (call as any).post = async () => ({ message: { status: 'Draft' } });

  try {
    const result = await printOrder({ orderId: serverId, posProfile: socketPosProfile });

    assert.equal(result.status, 'printed');

    const local = await repositories.orders.getById(serverId);
    assert.equal(local?.status, 'Draft');
    assert.equal(local?.invoice_printed, 1);

    const draftResult = await getPOSInvoices({ status: 'Draft' });
    assert.ok(draftResult.invoices.some((inv) => inv.name === serverId));
  } finally {
    (call as any).post = originalPost;
  }
});


// ============================================================================
// Task 5: Kitchen / KOT Print Offline Queue
// ============================================================================

test('reprintKot online succeeds without queueing', async () => {
  const serverId = 'POS-INV-KOT-ONLINE-001';

  const originalGet = call.get;
  (call as any).get = async () => ({ message: 'Success' });

  try {
    const result = await reprintKot(serverId);

    assert.equal(result.success, true);
    assert.equal(result.queued, false);

    const cmds = await repositories.syncQueue.getAll();
    const kotCmds = cmds.filter((c) => c.action === 'kot_reprint');
    assert.equal(kotCmds.length, 0, 'No KOT reprint command should be queued online');
  } finally {
    (call as any).get = originalGet;
  }
});

test('reprintKot offline queues KOT_REPRINT command', async () => {
  const serverId = 'POS-INV-KOT-OFFLINE-001';

  setNavigatorOnline(false);

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('should not be called while offline');
  };

  try {
    const result = await reprintKot(serverId);

    assert.equal(result.success, true);
    assert.equal(result.queued, true);

    const cmds = await repositories.syncQueue.getAll();
    const kotCmds = cmds.filter((c) => c.action === 'kot_reprint');
    assert.equal(kotCmds.length, 1);
    assert.equal((kotCmds[0]?.payload as any)?.invoice_number, serverId);
    assert.deepEqual(kotCmds[0]?.dependency_ids, []);
  } finally {
    (call as any).get = originalGet;
    setNavigatorOnline(true);
  }
});

test('reprintKot offline for temp invoice depends on parent sync_order', async () => {
  const tempId = 'TEMP-ORD-KOT-001';

  setNavigatorOnline(false);

  try {
    const result = await reprintKot(tempId);

    assert.equal(result.success, true);
    assert.equal(result.queued, true);

    const cmds = await repositories.syncQueue.getAll();
    const kotCmds = cmds.filter((c) => c.action === 'kot_reprint');
    assert.equal(kotCmds.length, 1);
    assert.deepEqual(kotCmds[0]?.dependency_ids, [`SYNC-ORDER-${tempId}`]);
  } finally {
    setNavigatorOnline(true);
  }
});

test('reprintKot online failure falls back to offline queue', async () => {
  const serverId = 'POS-INV-KOT-FAIL-001';

  setNavigatorOnline(true);

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('Server unreachable');
  };

  try {
    const result = await reprintKot(serverId);

    assert.equal(result.success, true);
    assert.equal(result.queued, true);

    const cmds = await repositories.syncQueue.getAll();
    const kotCmds = cmds.filter((c) => c.action === 'kot_reprint');
    assert.equal(kotCmds.length, 1);
    assert.equal((kotCmds[0]?.payload as any)?.invoice_number, serverId);
  } finally {
    (call as any).get = originalGet;
  }
});

// ============================================================================
// Offline Merge Bill
// ============================================================================

test('mergeBills offline updates local state and queues merge_bills command', async () => {
  const primaryId = 'POS-INV-MERGE-LOCAL-001';
  const secondaryId = 'POS-INV-MERGE-LOCAL-002';

  await repositories.orders.put({
    ...baseOrder,
    id: primaryId,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrder,
    id: secondaryId,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(false);

  try {
    const result = await mergeBills(primaryId, secondaryId);

    assert.equal(result.status, 'success');
    assert.equal(result.name, primaryId);

    const primary = await repositories.orders.getById(primaryId);
    const secondary = await repositories.orders.getById(secondaryId);

    assert.ok(primary);
    assert.ok(secondary);
    assert.equal(primary.custom_merged_pos_invoice, secondaryId);
    assert.equal(primary.custom_merged_total, 200);
    assert.equal(primary.custom_merged_pos_invoice_details?.length, 1);
    assert.equal(primary.custom_merged_pos_invoice_details?.[0].item, 'B');

    assert.equal(secondary.custom_merged_pos_invoice, primaryId);
    assert.equal(secondary.custom_merged_total, 100);
    assert.equal(secondary.custom_merged_pos_invoice_details?.length, 1);
    assert.equal(secondary.custom_merged_pos_invoice_details?.[0].item, 'A');

    const cmds = await repositories.syncQueue.getAll();
    const mergeCmds = cmds.filter(
      (c) =>
        c.action === 'MergeBillCommand' ||
        c.operation_type === 'MERGE_BILLS' ||
        c.endpoint?.includes('merge_bills')
    );
    assert.equal(mergeCmds.length, 1);
    assert.equal((mergeCmds[0]?.payload as any)?.primary_invoice, primaryId);
    assert.equal((mergeCmds[0]?.payload as any)?.secondary_invoice, secondaryId);
  } finally {
    setNavigatorOnline(true);
  }
});

test('mergeBills offline for temp primary depends on parent sync_order', async () => {
  const tempId = 'TEMP-ORD-MERGE-LOCAL-003';
  const secondaryId = 'POS-INV-MERGE-LOCAL-004';

  await repositories.orders.put({
    ...baseOrder,
    id: tempId,
    status: 'Draft',
    sync_status: 'pending',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrder,
    id: secondaryId,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(false);

  try {
    await mergeBills(tempId, secondaryId);

    const cmds = await repositories.syncQueue.getAll();
    const mergeCmds = cmds.filter(
      (c) =>
        c.action === 'MergeBillCommand' ||
        c.operation_type === 'MERGE_BILLS' ||
        c.endpoint?.includes('merge_bills')
    );
    assert.equal(mergeCmds.length, 1);
    assert.deepEqual(mergeCmds[0]?.dependency_ids, [`SYNC-ORDER-${tempId}`]);
  } finally {
    setNavigatorOnline(true);
  }
});

test('mergeBills online failure falls back to offline queue and local state', async () => {
  const primaryId = 'POS-INV-MERGE-FAIL-005';
  const secondaryId = 'POS-INV-MERGE-FAIL-006';

  await repositories.orders.put({
    ...baseOrder,
    id: primaryId,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrder,
    id: secondaryId,
    status: 'Draft',
    sync_status: 'synced',
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
  });

  setNavigatorOnline(true);

  const originalPost = call.post;
  (call as any).post = async () => {
    throw new Error('Server unreachable');
  };

  try {
    const result = await mergeBills(primaryId, secondaryId);

    assert.equal(result.status, 'success');
    assert.equal(result.name, primaryId);

    const primary = await repositories.orders.getById(primaryId);
    assert.equal(primary?.custom_merged_pos_invoice, secondaryId);

    const cmds = await repositories.syncQueue.getAll();
    const mergeCmds = cmds.filter(
      (c) =>
        c.action === 'MergeBillCommand' ||
        c.operation_type === 'MERGE_BILLS' ||
        c.endpoint?.includes('merge_bills')
    );
    assert.equal(mergeCmds.length, 1);
  } finally {
    (call as any).post = originalPost;
    setNavigatorOnline(true);
  }
});

test('getSplitGroup offline fallback reflects Draft/Paid statuses accurately', async () => {
  const sourceId = 'POS-INV-SPLIT-STATUS-001';
  const childId = 'POS-INV-SPLIT-STATUS-002';
  const groupId = 'SG-STATUS-001';

  await repositories.orders.put({
    ...baseOrder,
    id: sourceId,
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
    ...baseOrder,
    id: childId,
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

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const group = await getSplitGroup(childId);

    assert.equal(group.group, groupId);
    assert.equal(group.invoices.length, 2);

    const sourceInv = group.invoices.find(i => i.name === sourceId);
    const childInv = group.invoices.find(i => i.name === childId);

    assert.ok(sourceInv);
    assert.ok(childInv);
    assert.equal(sourceInv?.status, 'Paid');
    assert.equal(sourceInv?.docstatus, 1);
    assert.equal(childInv?.status, 'Draft');
    assert.equal(childInv?.docstatus, 0);
    assert.equal(sourceInv?.split_index, 1);
    assert.equal(childInv?.split_index, 2);
    assert.equal(sourceInv?.split_total, 2);
    assert.equal(childInv?.split_total, 2);
  } finally {
    (call as any).get = originalGet;
  }
});

test('getSplitGroup offline fallback includes sibling referenced only by split_siblings', async () => {
  const sourceId = 'POS-INV-SPLIT-SIBLING-001';
  const childId = 'POS-INV-SPLIT-SIBLING-002';

  await repositories.orders.put({
    ...baseOrder,
    id: sourceId,
    status: 'Draft',
    sync_status: 'synced',
    custom_split_group: null,
    split_index: 1,
    split_total: 2,
    split_siblings: [childId],
    items: [],
    grand_total: 100,
  });

  const originalGet = call.get;
  (call as any).get = async () => {
    throw new Error('offline');
  };

  try {
    const group = await getSplitGroup(sourceId);

    assert.equal(group.invoices.length, 2);
    assert.ok(group.invoices.some(i => i.name === sourceId));
    assert.ok(group.invoices.some(i => i.name === childId));
    assert.equal(group.invoices.every(i => i.split_total === 2), true);
  } finally {
    (call as any).get = originalGet;
  }
});


test('getPOSInvoices online fallback preserves split metadata for pending orders', async () => {
  const sourceId = 'POS-INV-PENDING-SPLIT-001';
  const childTempId = 'TEMP-SPLIT-PENDING-001';
  const groupId = 'SG-PENDING-001';

  // Server returns only the source invoice; the child is still pending locally.
  await repositories.orders.put({
    ...baseOrder,
    id: sourceId,
    table: 'T-PENDING-SPLIT-001',
    status: 'Draft',
    sync_status: 'synced',
    invoice_printed: 1,
    custom_split_group: groupId,
    custom_split_from: null,
    split_index: 1,
    split_total: 2,
    split_siblings: [childTempId],
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
  });

  await repositories.orders.put({
    ...baseOrder,
    id: childTempId,
    table: 'T-PENDING-SPLIT-001',
    status: 'Unbilled',
    sync_status: 'pending',
    invoice_printed: 0,
    custom_split_group: groupId,
    custom_split_from: sourceId,
    split_index: 2,
    split_total: 2,
    split_siblings: [sourceId],
    items: [{ item: 'B', item_name: 'Item B', rate: 50, qty: 1, amount: 50 }],
    grand_total: 50,
  });

  const originalGet = call.get;
  (call as any).get = async () => ({
    message: {
      data: [
        {
          name: sourceId,
          invoice_printed: 1,
          grand_total: 100,
          restaurant_table: 'T-PENDING-SPLIT-001',
          cashier: '',
          waiter: '',
          net_total: 100,
          posting_time: '12:00:00',
          total_taxes_and_charges: 0,
          customer: 'Guest',
          status: 'Draft',
          mobile_number: '',
          posting_date: '2026-08-06',
          rounded_total: 100,
          order_type: 'Dine-In',
          custom_split_group: groupId,
          custom_split_from: null,
          split_index: 1,
          split_total: 2,
          split_siblings: [childTempId],
          items: [],
        },
      ],
      next: false,
    },
  });

  try {
    const drafts = await getPOSInvoices({ status: 'Draft' });
    const sourceCard = drafts.invoices.find(i => i.name === sourceId);
    assert.ok(sourceCard);
    assert.equal(sourceCard.custom_split_group, groupId);
    assert.equal(sourceCard.split_index, 1);
    assert.equal(sourceCard.split_total, 2);
    assert.ok(sourceCard.split_siblings?.includes(childTempId));

    const unbilled = await getPOSInvoices({ status: 'Unbilled' });
    const childCard = unbilled.invoices.find(i => i.name === childTempId);
    assert.ok(childCard);
    assert.equal(childCard.custom_split_group, groupId);
    assert.equal(childCard.custom_split_from, sourceId);
    assert.equal(childCard.split_index, 2);
    assert.equal(childCard.split_total, 2);
  } finally {
    (call as any).get = originalGet;
  }
});
