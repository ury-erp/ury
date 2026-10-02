import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { create } from 'zustand';
import { environment, loadModule } from '../../packages/core/test/logout-harness.mjs';

test('Outstanding is first while the existing history filters remain available', () => {
  const { getOrderStatusTypes } = loadModule(resolve('pos/src/data/order-types.ts'), {});
  assert.deepEqual(Array.from(getOrderStatusTypes(1, 30), (tab: { value: string }) => tab.value),
    ['Outstanding', 'Draft', 'Unbilled', 'Recently Paid', 'Paid', 'Consolidated', 'Return']);
});

test('the initial orders fetch and search both use Outstanding at the real API boundary', async () => {
  const env = environment();
  env.globals.sessionStorage.removeItem('posProfile');
  const calls: unknown[][] = [];
  const api = loadModule(resolve('pos/src/lib/invoice-api.ts'), env.globals, {
    '@ury/core': { call: { get: async (...args: unknown[]) => {
      calls.push(args);
      return { message: { data: [], next: false } };
    } } },
  });
  const { createOrdersSlice } = loadModule(resolve('pos/src/store/slices/orders-slice.ts'), env.globals, {
    '../../lib/invoice-api': api,
  });
  const orders = create(createOrdersSlice);
  assert.equal(orders.getState().selectedStatus, 'Outstanding');
  await orders.getState().fetchOrders();
  assert.equal(calls[0][0], 'ury.ury_pos.api.getPosInvoice');
  assert.equal((calls[0][1] as { status: string }).status, 'Outstanding');
  orders.getState().setOrderSearchQuery('POS-INV-1');
  await orders.getState().fetchOrders();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),
    ['ury.ury_pos.api.searchPosInvoice', { query: 'POS-INV-1', status: 'Outstanding' }]);
});
