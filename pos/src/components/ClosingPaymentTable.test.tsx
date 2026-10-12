import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatCurrency, storage } from '@ury/core';

// The shared UI barrel imports toast styles; styles do not affect static markup.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});
mock.method(storage, 'getItem', () => 'TEST');
// Vite supplies the automatic JSX runtime; tsx uses classic JSX for the UI package.
Object.assign(globalThis, { React });
const { default: ClosingPaymentTable } = await import('./ClosingPaymentTable');

const row = {
  mode_of_payment: 'Cash',
  opening_amount: 10,
  expected_amount: 123,
  closing_amount: 150,
  difference: 27,
};
const props = {
  rows: [row],
  touchedModes: new Set(['Cash']),
  onChange: () => {},
};

const blind = renderToStaticMarkup(
  React.createElement(ClosingPaymentTable, { ...props, blindCashCount: true })
);
assert.equal(blind.includes('Expected'), false, 'Blind count must hide the expected column');
assert.equal(blind.includes('Difference'), false, 'Blind count must hide the difference column');
assert.equal(blind.includes(formatCurrency(row.expected_amount)), false);
assert.equal(blind.includes(formatCurrency(row.difference)), false);
assert.equal((blind.match(/<th\b/g) || []).length, 3);
assert.equal((blind.match(/<td\b/g) || []).length, 3);
assert.ok(blind.includes('Cash') && blind.includes('Opening') && blind.includes('Closing'));
assert.ok(blind.includes('type="number"') && blind.includes('value="150"'));

const normal = renderToStaticMarkup(React.createElement(ClosingPaymentTable, props));
assert.ok(normal.includes('Expected') && normal.includes('Difference'));
assert.ok(normal.includes(formatCurrency(row.expected_amount)));
assert.ok(normal.includes(formatCurrency(row.difference)));
assert.equal((normal.match(/<th\b/g) || []).length, 5);
assert.equal((normal.match(/<td\b/g) || []).length, 5);
assert.equal(row.expected_amount, 123, 'UI hiding must not alter reconciliation data');
const { isBlindCashCount } = await import('../lib/pos-closing-visibility');
assert.equal(isBlindCashCount({ custom_blind_cash_count: 1 }), true);
assert.equal(isBlindCashCount({ custom_blind_cash_count: 0 }), false);
assert.equal(isBlindCashCount({}), false);
assert.equal(isBlindCashCount(null), false);
mock.restoreAll();
console.log('PASS: blind count hides expected/variance cells; normal closing and counted input remain (14 assertions).');
console.log('PASS: blind-count visibility is opt-in (4 assertions).');
