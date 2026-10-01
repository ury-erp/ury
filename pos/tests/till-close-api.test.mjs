import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const tillMethod = 'ury.ury_pos.api.get_till_invoices';
const params = {
  start: '2026-10-01 08:00:00', end: '2026-10-01 18:00:00',
  pos_profile: 'Till', user: 'cashier2',
};
const invoice = {
  name: 'OTHER-CASHIER', cashier: 'cashier1', owner: 'waiter',
  grand_total: 15000, net_total: 15000, total_qty: 1, taxes: [],
  payments: [{ mode_of_payment: 'Cash', amount: 15000 }],
  modified: '2026-10-01 12:00:00',
};

function loadReactAPI(call) {
  const source = readFileSync(new URL('../src/lib/pos-closing-api.ts', import.meta.url), 'utf8');
  const script = stripTypeScriptTypes(source.replace("import { call, db } from '@ury/core';", ''))
    .replace(/\bexport /g, '');
  return vm.runInNewContext(`${script}\n({ getMainCashierPosInvoices, getSubCashierPosInvoices });`,
    { call, db: {}, console });
}

test('legacy main close requests the whole till and consumes full invoice documents', async () => {
  const source = readFileSync(new URL('../../urypos/src/stores/posClosing.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export const posClosing', 'const posClosing');
  const store = vm.runInNewContext(`${source}\nposClosing;`, {
    defineStore: (_name, options) => options, console,
  });
  const calls = [];
  const state = {
    startDate: params.start, periodEndDate: new Date(2026, 9, 1, 18, 0, 0),
    invoiceData: { posProfile: 'Till' }, cashier: 'cashier2',
    grandTotal: 0, netTotal: 0, totalQty: 0,
    call: { get: async (method, args) => {
      calls.push({ method, args: { ...args } });
      return { message: [invoice] };
    } },
  };
  store.actions.getInvoice.call(state);
  await Promise.resolve();
  assert.deepEqual(calls, [{ method: tillMethod, args: params }]);
  assert.equal(state.grandTotal, 15000);
  assert.equal(state.payments[0].expected_amount, 15000);
  assert.equal(state.posInvoice[0].pos_invoice, 'OTHER-CASHIER');
});

test('React main close requests the whole till with the existing response contract', async () => {
  const calls = [];
  const api = loadReactAPI({ get: async (method, args) => {
    calls.push({ method, args: { ...args } });
    return { message: [invoice] };
  } });
  const result = await api.getMainCashierPosInvoices(params.start, params.end, 'Till', 'cashier2');
  assert.deepEqual(calls, [{ method: tillMethod, args: params }]);
  assert.deepEqual(result, [invoice]);
});

test('React sub-cashier close keeps its separate per-cashier endpoint', async () => {
  const calls = [];
  const api = loadReactAPI({ get: async (method, args) => {
    calls.push({ method, args: { ...args } });
    return { message: [] };
  } });
  await api.getSubCashierPosInvoices(params.start, params.end, 'Till', 'cashier2');
  assert.deepEqual(calls, [{
    method: 'ury.ury.doctype.sub_pos_closing.sub_pos_closing.get_pos_invoices', args: params,
  }]);
});
