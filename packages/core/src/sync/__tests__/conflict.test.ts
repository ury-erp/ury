/**
 * @file conflict.test.ts
 * @description Unit tests for URY POS Conflict Resolver verifying classification and resolution
 * strategies across all 11 conflict scenarios (AUTOMATIC, MANUAL, RETRY, ROLLBACK, IGNORE).
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { UryPosDatabase } from '../../storage/db';
import { createRepositories, type StorageRepositories } from '../../storage/repositories';
import { ConflictResolver } from '../conflict.resolver';
import { CreateOrderCommand } from '../../commands/create-order.command';
import { MergeTableCommand } from '../../commands/merge-table.command';
import { MergeBillCommand } from '../../commands/merge-bill.command';
import { SplitBillCommand } from '../../commands/split-bill.command';
import { PaymentCommand } from '../../commands/payment.command';
import { DeleteDraftCommand } from '../../commands/delete-draft.command';
import { CancelOrderCommand } from '../../commands/cancel-order.command';
import { projectionBus } from '../../projections/projection.bus';

let testDb: UryPosDatabase;
let repos: StorageRepositories;
let resolver: ConflictResolver;

before(() => {
  testDb = new UryPosDatabase('TestConflictsDb');
  repos = createRepositories(testDb);
  resolver = new ConflictResolver(repos);
});

beforeEach(async () => {
  await repos.orders.clear();
  await repos.tables.clear();
  projectionBus.clear();
});

after(async () => {
  await testDb.delete();
});

test('1. Conflict: TABLE_OCCUPIED -> AUTOMATIC Takeaway conversion', async () => {
  const cmd = new CreateOrderCommand(
    { table: 'T-01', order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] },
    { id: 'TEMP-ORD-01' }
  );

  await repos.orders.put({
    id: 'TEMP-ORD-01',
    table: 'T-01',
    order_type: 'Dine-In',
    status: 'Draft',
    items: [],
    grand_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  const res = await resolver.resolveConflict(cmd.envelope, 'Table T-01 is already occupied.');
  assert.equal(res.conflictCode, 'TABLE_OCCUPIED');
  assert.equal(res.strategy, 'AUTOMATIC');

  if (res.remedyAction) await res.remedyAction();

  const updatedOrd = await repos.orders.getById('TEMP-ORD-01');
  assert.ok(updatedOrd);
  assert.equal(updatedOrd.table, null);
  assert.equal(updatedOrd.order_type, 'Takeaway');
});

test('2. Conflict: INVOICE_DELETED -> ROLLBACK local draft', async () => {
  const cmd = new DeleteDraftCommand({ invoice: 'DRAFT-99' }, { id: 'DRAFT-99' });
  await repos.orders.put({
    id: 'DRAFT-99',
    order_type: 'Dine-In',
    status: 'Draft',
    items: [],
    grand_total: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  const res = await resolver.resolveConflict(cmd.envelope, 'POS Invoice DRAFT-99 not found');
  assert.equal(res.conflictCode, 'INVOICE_DELETED');
  assert.equal(res.strategy, 'ROLLBACK');

  if (res.remedyAction) await res.remedyAction();

  const deleted = await repos.orders.getById('DRAFT-99');
  assert.equal(deleted, undefined);
});

test('3. Conflict: INVOICE_ALREADY_PAID -> IGNORE payment command & update local state', async () => {
  const cmd = new PaymentCommand({ invoice: 'INV-100', payments: [] }, { id: 'INV-100' });
  await repos.orders.put({
    id: 'INV-100',
    order_type: 'Dine-In',
    status: 'Draft',
    items: [],
    grand_total: 300,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending',
  });

  const res = await resolver.resolveConflict(cmd.envelope, 'Invoice Already Billed');
  assert.equal(res.conflictCode, 'INVOICE_ALREADY_PAID');
  assert.equal(res.strategy, 'IGNORE');

  if (res.remedyAction) await res.remedyAction();

  const updated = await repos.orders.getById('INV-100');
  assert.ok(updated);
  assert.equal(updated.status, 'Paid');
});

test('4. Conflict: MERGE_FAILED -> ROLLBACK merged_with pointer', async () => {
  const cmd = new MergeTableCommand({ anchor_table: 'T-01', tables: ['T-02'] });
  await repos.tables.put({ name: 'T-01', restaurant_room: 'Main Room', no_of_seats: 4, occupied: 1, merged_with: 'T-02' });

  const res = await resolver.resolveConflict(cmd.envelope, 'Occupied tables cannot be merged.');
  assert.equal(res.conflictCode, 'MERGE_FAILED');
  assert.equal(res.strategy, 'ROLLBACK');

  if (res.remedyAction) await res.remedyAction();

  const updatedTbl = await repos.tables.getById('T-01');
  assert.ok(updatedTbl);
  assert.equal(updatedTbl.merged_with, null);
});

test('4b. Conflict: MERGE_FAILED (bill merge) -> ROLLBACK merge linkages', async () => {
  const cmd = new MergeBillCommand(
    { primary_invoice: 'POS-001', secondary_invoice: 'POS-002' },
    { id: 'CMD-MERGE-BILL-01' }
  );

  await repos.orders.put({
    id: 'POS-001',
    order_type: 'Dine-In',
    status: 'Draft',
    items: [{ item: 'A', item_name: 'Item A', rate: 100, qty: 1, amount: 100 }],
    grand_total: 100,
    custom_merged_pos_invoice: 'POS-002',
    custom_merged_total: 200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'synced',
  });

  await repos.orders.put({
    id: 'POS-002',
    order_type: 'Dine-In',
    status: 'Draft',
    items: [{ item: 'B', item_name: 'Item B', rate: 200, qty: 1, amount: 200 }],
    grand_total: 200,
    custom_merged_pos_invoice: 'POS-001',
    custom_merged_total: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'synced',
  });

  const res = await resolver.resolveConflict(cmd.envelope, 'Cannot merge: selected bill already includes another bill.');
  assert.equal(res.conflictCode, 'MERGE_FAILED');
  assert.equal(res.strategy, 'ROLLBACK');

  if (res.remedyAction) await res.remedyAction();

  const primary = await repos.orders.getById('POS-001');
  const secondary = await repos.orders.getById('POS-002');
  assert.ok(primary);
  assert.ok(secondary);
  assert.equal(primary.custom_merged_pos_invoice, null);
  assert.equal(primary.custom_merged_total, null);
  assert.equal(secondary.custom_merged_pos_invoice, null);
  assert.equal(secondary.custom_merged_total, null);
});

test('5. Conflict: SPLIT_FAILED -> MANUAL cashier prompt', async () => {
  const cmd = new SplitBillCommand({ source_invoice: 'INV-100', items_to_move: [] });
  const res = await resolver.resolveConflict(cmd.envelope, 'Split bill failed on server.');
  assert.equal(res.conflictCode, 'SPLIT_FAILED');
  assert.equal(res.strategy, 'MANUAL');
  assert.equal(res.shouldNotifyUser, true);
});

test('6. Conflict: PAYMENT_DUPLICATED -> IGNORE', async () => {
  const cmd = new PaymentCommand({ invoice: 'INV-100', payments: [] });
  const res = await resolver.resolveConflict(cmd.envelope, 'Payment Entry already exists');
  assert.equal(res.conflictCode, 'PAYMENT_DUPLICATED');
  assert.equal(res.strategy, 'IGNORE');
});

test('7. Conflict: PERMISSION_CHANGED -> MANUAL', async () => {
  const cmd = new CancelOrderCommand({ invoice_id: 'INV-100', reason: 'Guest left' });
  const res = await resolver.resolveConflict(cmd.envelope, 'Not allowed for billing');
  assert.equal(res.conflictCode, 'PERMISSION_CHANGED');
  assert.equal(res.strategy, 'MANUAL');
});

test('8. Conflict: SESSION_EXPIRED -> RETRY', async () => {
  const cmd = new CreateOrderCommand({ order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] });
  const res = await resolver.resolveConflict(cmd.envelope, 'SessionExpired');
  assert.equal(res.conflictCode, 'SESSION_EXPIRED');
  assert.equal(res.strategy, 'RETRY');
});

test('9. Conflict: MENU_UPDATED -> AUTOMATIC menu refresh', async () => {
  const cmd = new CreateOrderCommand({ order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] });
  const res = await resolver.resolveConflict(cmd.envelope, 'Item price changed');
  assert.equal(res.conflictCode, 'MENU_UPDATED');
  assert.equal(res.strategy, 'AUTOMATIC');
});

test('10. Conflict: CUSTOMER_DELETED -> AUTOMATIC fallback to Guest', async () => {
  const cmd = new CreateOrderCommand({ order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', customer: 'OLD-CUST', items: [] });
  const res = await resolver.resolveConflict(cmd.envelope, 'Customer deleted');
  assert.equal(res.conflictCode, 'CUSTOMER_DELETED');
  assert.equal(res.strategy, 'AUTOMATIC');

  if (res.remedyAction) await res.remedyAction();
  assert.equal(cmd.envelope.payload.customer, 'Guest');
});

test('11. Conflict: ROLE_CHANGED -> MANUAL session refresh prompt', async () => {
  const cmd = new CreateOrderCommand({ order_type: 'Dine-In', no_of_pax: 2, pos_profile: 'Standard', items: [] });
  const res = await resolver.resolveConflict(cmd.envelope, 'User role updated');
  assert.equal(res.conflictCode, 'ROLE_CHANGED');
  assert.equal(res.strategy, 'MANUAL');
});
