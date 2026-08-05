/**
 * @file projections.test.ts
 * @description Unit tests for URY POS Projection Cache verifying computed read models
 * for Menu, Orders, Tables, Aggregators, and Customers, as well as automatic event updates.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { UryPosDatabase } from '../../storage/db';
import { createRepositories, type StorageRepositories } from '../../storage/repositories';
import { getMenuProjection, updateMenuProjection } from '../menu.projection';
import { getOrdersProjection } from '../orders.projection';
import { getTablesProjection } from '../tables.projection';
import { getAggregatorProjection } from '../aggregator.projection';
import { getCustomerProjection } from '../customer.projection';
import { projectionBus } from '../projection.bus';

let testDb: UryPosDatabase;
let repos: StorageRepositories;

before(() => {
  testDb = new UryPosDatabase('TestProjectionsDb');
  repos = createRepositories(testDb);
});

beforeEach(async () => {
  await repos.menu.clear();
  await repos.orders.clear();
  await repos.tables.clear();
  await repos.aggregators.clear();
  await repos.customers.clear();
  projectionBus.clear();
});

after(async () => {
  await testDb.delete();
});

test('1. Menu Projection — Category grouping, special dish count & update notification', async () => {
  let eventFired = false;
  projectionBus.subscribe(event => {
    if (event === 'MENU_UPDATED') eventFired = true;
  });

  await updateMenuProjection([
    { id: 'M1', name: 'Garlic Bread', price: 120, category: 'Starters', course: 'Starters', image: null, special_dish: false },
    { id: 'M2', name: 'Chef Special Pizza', price: 450, category: 'Main Course', course: 'Mains', image: null, special_dish: true },
  ], repos);

  assert.equal(eventFired, true);

  const proj = await getMenuProjection(undefined, repos);
  assert.equal(proj.totalCount, 2);
  assert.equal(proj.specialsCount, 1);
  assert.deepEqual(proj.categories, ['Main Course', 'Starters']);
});

test('2. Orders Projection — Status count aggregations and pending sync tracking', async () => {
  await repos.orders.putMany([
    {
      id: 'ORD-1',
      table: 'T1',
      order_type: 'Dine-In',
      status: 'Draft',
      items: [{ item: 'A', item_name: 'A', rate: 100, qty: 1, amount: 100 }],
      grand_total: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync_status: 'synced',
    },
    {
      id: 'ORD-2',
      table: 'T2',
      order_type: 'Takeaway',
      status: 'Paid',
      items: [{ item: 'B', item_name: 'B', rate: 200, qty: 2, amount: 400 }],
      grand_total: 400,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync_status: 'pending',
    },
  ]);

  const proj = await getOrdersProjection(undefined, repos);
  assert.equal(proj.orders.length, 2);
  assert.equal(proj.draftCount, 1);
  assert.equal(proj.paidCount, 1);
  assert.equal(proj.pendingSyncCount, 1);
  assert.equal(proj.totalRevenue, 400);
});

test('3. Tables Projection — Occupancy statistics and room grouping', async () => {
  await repos.tables.putMany([
    { name: 'T1', restaurant_room: 'Main Room', no_of_seats: 4, occupied: 1 },
    { name: 'T2', restaurant_room: 'Main Room', no_of_seats: 2, occupied: 0 },
    { name: 'T3', restaurant_room: 'Patio', no_of_seats: 6, occupied: 0 },
  ]);

  const proj = await getTablesProjection('Main Room', repos);
  assert.equal(proj.tables.length, 2);
  assert.equal(proj.totalTables, 3);
  assert.equal(proj.occupiedCount, 1);
  assert.equal(proj.vacantCount, 2);
  assert.deepEqual(proj.rooms, ['Main Room', 'Patio']);
});

test('4. Aggregators Projection — Enabled platform metrics', async () => {
  await repos.aggregators.putMany([
    { name: 'Zomato', customer: 'Zomato Cust', enabled: true },
    { name: 'Swiggy', customer: 'Swiggy Cust', enabled: false },
  ]);

  const proj = await getAggregatorProjection(repos);
  assert.equal(proj.aggregators.length, 2);
  assert.equal(proj.enabledCount, 1);
});

test('5. Customers Projection — Search query filter', async () => {
  await repos.customers.putMany([
    { id: 'C1', name: 'John Doe', phone: '9876543210', customer_group: 'Individual' },
    { id: 'C2', name: 'Jane Smith', phone: '1234567890', customer_group: 'Commercial' },
  ]);

  const proj = await getCustomerProjection('John', repos);
  assert.equal(proj.customers.length, 1);
  assert.equal(proj.customers[0].name, 'John Doe');
});
