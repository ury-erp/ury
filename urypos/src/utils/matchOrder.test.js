import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// Load the real store without a browser or its unrelated UI dependencies.
// The extracted pure matcher resolves normally once the store imports it.
const storeUrl = new URL("../stores/recentOrder.js", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === storeUrl && specifier !== "../utils/matchOrder.js") {
      const source = `
        export default {};
        export const defineStore = (_id, options) => options;
        export const useMenuStore = () => ({});
        export const useCustomerStore = () => ({});
        export const useNotifications = () => ({});
        export const useInvoiceDataStore = () => ({});
        export const useTableStore = () => ({});
        export const useAlert = () => ({});
      `;
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { usetoggleRecentOrder: store } = await import(storeUrl);
hooks.deregister();
const matches = (order, searchOrder) =>
  store.actions.matchesSearchOrder.call({ searchOrder }, order);

test("a Walk-in check with a null mobile number remains visible", () => {
  assert.equal(matches({ name: "POS-001", customer: "Walk-in", mobile_number: null }, ""), true);
});

test("a Walk-in or split check can be searched by customer without a mobile number", () => {
  assert.equal(matches({ name: "POS-002", customer: "Walk-in", mobile_number: null }, "WALK"), true);
});

test("null or missing names and customers are empty search fields", () => {
  assert.equal(matches({ name: null, customer: null, mobile_number: "0700123456" }, "123"), true);
  assert.equal(matches({}, "not-present"), false);
});

test("matching remains case-insensitive for invoice, customer, and phone", () => {
  const order = { name: "POS-AbC", customer: "Alice", mobile_number: "0700123456" };
  for (const query of ["abc", "ALICE", "123"]) assert.equal(matches(order, query), true);
  assert.equal(matches(order, "not-present"), false);
});

test("one Walk-in row does not break filtering the whole order log", () => {
  const orders = [
    { name: "POS-001", customer: "Walk-in", mobile_number: null },
    { name: "POS-002", customer: "Alice", mobile_number: "0700123456" },
  ];
  assert.deepEqual(orders.filter(order => matches(order, "002")), [orders[1]]);
});
