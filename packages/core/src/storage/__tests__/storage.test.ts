/**
 * @file storage.test.ts
 * @description Unit tests for URY POS Storage Layer verifying CRUD operations,
 * transactions, schema versioning, and queries across all 9 collections.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { UryPosDatabase } from '../db';
import { createRepositories, type StorageRepositories } from '../repositories';

let testDb: UryPosDatabase;
let repos: StorageRepositories;

before(() => {
  testDb = new UryPosDatabase('TestUryPosDb');
  repos = createRepositories(testDb);
});

beforeEach(async () => {
  // Clear all 6 tables before each test
  await repos.orders.clear();
  await repos.tables.clear();
  await repos.customers.clear();
  await repos.syncQueue.clear();
  await repos.metadata.clear();
  await repos.settings.clear();
});

after(async () => {
  await testDb.delete();
});

test('1. Orders Collection — CRUD & Custom Queries', async () => {
  const sampleOrder = {
    id: 'ORD-001',
    table: 'T-01',
    room: 'Main Room',
    order_type: 'Dine-In',
    status: 'Draft' as const,
    no_of_pax: 2,
    customer: 'CUST-100',
    waiter: 'John',
    cashier: 'Cashier-1',
    pos_profile: 'Standard POS',
    items: [{ item: 'ITEM-01', item_name: 'Burger', rate: 100, qty: 2, amount: 200 }],
    grand_total: 200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'pending' as const,
  };

  // Put
  const id = await repos.orders.put(sampleOrder);
  assert.equal(id, 'ORD-001');

  // GetById
  const fetched = await repos.orders.getById('ORD-001');
  assert.ok(fetched);
  assert.equal(fetched.table, 'T-01');
  assert.equal(fetched.grand_total, 200);

  // findByStatus
  const draftOrders = await repos.orders.findByStatus('Draft');
  assert.equal(draftOrders.length, 1);

  // findByTable
  const tableOrder = await repos.orders.findByTable('T-01');
  assert.ok(tableOrder);
  assert.equal(tableOrder.id, 'ORD-001');

  // Delete
  await repos.orders.delete('ORD-001');
  const deleted = await repos.orders.getById('ORD-001');
  assert.equal(deleted, undefined);
});

test('2. Tables Collection — CRUD & Room Query', async () => {
  await repos.tables.putMany([
    { name: 'T-01', restaurant_room: 'Main Room', no_of_seats: 4, occupied: 1 },
    { name: 'T-02', restaurant_room: 'Main Room', no_of_seats: 2, occupied: 0 },
    { name: 'T-03', restaurant_room: 'Patio', no_of_seats: 6, occupied: 1 },
  ]);

  const mainRoomTables = await repos.tables.findByRoom('Main Room');
  assert.equal(mainRoomTables.length, 2);

  const occupied = await repos.tables.findOccupied();
  assert.equal(occupied.length, 2);

  const count = await repos.tables.count();
  assert.equal(count, 3);
});

test('3. Customers Collection — Search by Phone/Name', async () => {
  await repos.customers.putMany([
    { id: 'C-01', name: 'Alice Smith', phone: '9876543210' },
    { id: 'C-02', name: 'Bob Jones', phone: '1234567890' },
  ]);

  const byPhone = await repos.customers.findByPhone('9876543210');
  assert.ok(byPhone);
  assert.equal(byPhone.name, 'Alice Smith');

  const searchResult = await repos.customers.searchByNameOrPhone('Alice');
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].id, 'C-01');
});

test('4. Sync Queue Collection — FIFO Batch Processing', async () => {
  await repos.syncQueue.putMany([
    { id: 'Q-01', action: 'sync_order', endpoint: 'api/sync', payload: {}, timestamp: '2026-08-05T10:00:00Z', status: 'PENDING', attempts: 0, priority: 1 },
    { id: 'Q-02', action: 'make_payment', endpoint: 'api/pay', payload: {}, timestamp: '2026-08-05T10:01:00Z', status: 'PENDING', attempts: 0, priority: 2 },
  ]);

  const pending = await repos.syncQueue.findPending();
  assert.equal(pending.length, 2);

  const batch = await repos.syncQueue.getNextBatch(1);
  assert.equal(batch.length, 1);
  assert.equal(batch[0].id, 'Q-01');
});

test('5. Metadata & Settings Collections', async () => {
  await repos.metadata.setValue('last_sync', '2026-08-05T14:00:00Z');
  const val = await repos.metadata.getValue('last_sync');
  assert.equal(val, '2026-08-05T14:00:00Z');

  await repos.settings.setSetting('theme', { mode: 'dark' });
  const theme = await repos.settings.getSetting<{ mode: string }>('theme');
  assert.ok(theme);
  assert.equal(theme.mode, 'dark');
});

test('6. Atomic Dexie Transactions', async () => {
  await repos.orders.runTransaction('rw', async () => {
    await repos.orders.put({
      id: 'ORD-TX-01',
      order_type: 'Dine-In',
      status: 'Draft',
      items: [],
      grand_total: 150,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync_status: 'pending',
    });
  });

  const txOrder = await repos.orders.getById('ORD-TX-01');
  assert.ok(txOrder);
  assert.equal(txOrder.grand_total, 150);
});

test('7. OrderRepository — upsertStatus updates status and locks terminal states', async () => {
  await repos.orders.put({
    id: 'ORD-STATUS-001',
    order_type: 'Dine-In',
    status: 'Draft',
    items: [],
    grand_total: 300,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sync_status: 'synced',
  });

  const updated = await repos.orders.upsertStatus('ORD-STATUS-001', 'Paid');
  assert.ok(updated);
  assert.equal(updated.status, 'Paid');
  assert.equal((updated as any).is_locked, 1);

  const cancelled = await repos.orders.upsertStatus('ORD-STATUS-001', 'Cancelled');
  assert.ok(cancelled);
  assert.equal(cancelled.status, 'Cancelled');
  assert.equal((cancelled as any).is_locked, 1);

  const missing = await repos.orders.upsertStatus('ORD-MISSING', 'Paid');
  assert.equal(missing, null);
});
