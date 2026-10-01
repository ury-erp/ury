import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "vue/server-renderer";

const storeUrl = new URL("../stores/invoiceData.js", import.meta.url).href;
const cartSource = parse(
  readFileSync(new URL("../components/Cart.vue", import.meta.url), "utf8")
).descriptor;
const storeNames = {
  useTableStore: "table",
  useMenuStore: "menu",
  useCustomerStore: "customers",
  useNotifications: "notification",
  usetoggleRecentOrder: "recentOrders",
  useAlert: "alert",
  useNotificationModal: "notificationModal",
  useAuthStore: "auth",
  useInvoiceDataStore: "invoiceData",
};

// Isolate only the browser/network stores. The real action and Cart render run.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "order-test:cart") {
      return { url: specifier, shortCircuit: true };
    }
    if (context.parentURL === storeUrl || context.parentURL === "order-test:cart") {
      let source;
      if (specifier === "pinia") {
        source = "export const defineStore = (name, options) => options;";
      } else if (specifier.includes("router")) {
        source = "export default { push: async path => globalThis.orderTest.routes.push(path) };";
      } else if (specifier.includes("frappeSdk")) {
        source = "export default { db: () => ({}), call: () => ({}) };";
      } else if (specifier.includes("PrintWithQz")) {
        source = "export const printWithQz = () => {}; export const loadQzPrinter = () => {}; export const disconnectQzPrinter = () => {};";
      } else if (specifier.endsWith(".vue")) {
        source = "export default { render: () => null };";
      } else if (specifier.includes("stores/") || /^\.\/[A-Z]|^\.\/recentOrder/.test(specifier)) {
        source = Object.entries(storeNames).map(([name, key]) =>
          `export const ${name} = () => globalThis.orderTest.${key};`
        ).join("\n");
      }
      if (source) {
        return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
      }
      // Resolve the pure helper normally, including from the compiled SFC.
      if (context.parentURL === "order-test:cart") {
        return nextResolve(specifier, { ...context, parentURL: new URL("../components/Cart.vue", import.meta.url).href });
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "order-test:cart") {
      return { format: "module", source: cartSource.script.content, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const { useInvoiceDataStore: options } = await import(storeUrl);
const { default: Cart } = await import("order-test:cart");
hooks.deregister();
Cart.render = new Function(
  "Vue", compile(cartSource.template.content, { prefixIdentifiers: true }).code
)(Vue);

function fixture(cashier = false) {
  const events = { routes: [], alerts: [], notifications: [], posts: [], reloads: 0 };
  globalThis.orderTest = {};
  const state = Object.assign(options.state(), options.actions, {
    posProfile: "Salama POS",
    auth: { cashier },
    menu: {
      cart: [{ item: "SOUP", item_name: "Soup", qty: 1 }],
      items: [{ item: "SOUP", comment: "", qty: 1 }],
      selectedOrderType: "Dine In",
    },
    table: { selectedTable: "T-01", takeAwayTable: 0, invoiceNo: "", fetchTable() {} },
    recentOrders: { draftInvoice: "", viewRecentOrder() {} },
    customers: { search: "", numberOfPax: "2", validateInput() {} },
    alert: { createAlert: async (title, message) => events.alerts.push(message) },
    notification: { createNotification: message => events.notifications.push(message) },
    call: {
      post: async (method, payload) => {
        events.posts.push({ method, payload });
        return { message: { name: "POS-INV-001", items: [], modified: "now" } };
      },
    },
  });
  globalThis.orderTest = { ...state, invoiceData: state, ...events };
  globalThis.window = { location: { reload: () => events.reloads++ } };
  return { state, events };
}

async function renderCart() {
  return renderToString(Vue.createSSRApp(Cart));
}

test("new orders offer Send to Kitchen", async () => {
  fixture();
  assert.match(await renderCart(), />\s*Send to Kitchen\s*<\/button>/);
});

test("existing orders offer Send Changes", async () => {
  for (const source of ["table", "recentOrders", "invoiceData"]) {
    const { state } = fixture();
    if (source === "table") state.table.invoiceNo = "POS-INV-001";
    if (source === "recentOrders") state.recentOrders.draftInvoice = "POS-INV-001";
    if (source === "invoiceData") state.invoiceNumber = "POS-INV-001";
    assert.match(await renderCart(), />\s*Send Changes\s*<\/button>/);
  }
});

test("the send button is disabled and says Sending… while pending", async () => {
  const { state } = fixture();
  state.invoiceUpdating = true;
  state.showUpdateButtton = false;
  assert.match(await renderCart(), /<button[^>]*disabled[^>]*>\s*Sending…\s*<\/button>/);
});

test("Cart exposes the shared Pax value without defaulting it", async () => {
  const { state } = fixture();
  state.customers.numberOfPax = "";
  assert.match(await renderCart(), /<input[^>]*id="cart-pax"[^>]*value(?:=""|(?=[ >]))/);
  state.customers.numberOfPax = "3";
  assert.match(await renderCart(), /<input[^>]*id="cart-pax"[^>]*value="3"/);
});

test("missing Pax asks only for Pax and does not send", async () => {
  const { state, events } = fixture();
  state.customers.numberOfPax = "";
  await state.invoiceCreation();
  assert.deepEqual(events.alerts, ["Please enter the number of Pax"]);
  assert.equal(events.posts.length, 0);
  assert.equal(state.customers.numberOfPax, "");
  assert.equal(state.menu.cart.length, 1);
  assert.equal(state.invoiceUpdating, false);
});

for (const cashier of [false, true]) {
  test(`successful ${cashier ? "cashier" : "captain"} sends clear the cart and return to Tables`, async () => {
    const { state, events } = fixture(cashier);
    await state.invoiceCreation();
    assert.deepEqual(events.notifications, ["Sent to kitchen · T-01"]);
    assert.deepEqual(state.menu.cart, []);
    assert.equal(state.customers.numberOfPax, "");
    assert.equal(state.table.selectedTable, "");
    assert.equal(state.table.invoiceNo, "");
    assert.equal(state.invoiceNumber, "");
    assert.deepEqual(events.routes, ["/Table"]);
    assert.equal(events.reloads, 0);
    assert.equal(state.invoiceUpdating, false);
    assert.equal(events.posts[0].payload.customer, "");
    assert.equal(events.posts[0].payload.no_of_pax, "2");
  });
}

test("clearing a sent table order removes its old invoice and items", async () => {
  const { state } = fixture();
  state.table.invoiceNo = "POS-INV-OLD";
  state.table.previousOrderdItem = [{ item_code: "SOUP", qty: 1 }];
  state.recentOrders.pastOrderdItem = state.table.previousOrderdItem;
  state.previousOrderItem = [{ item: "SOUP", qty: 1 }];
  await state.invoiceCreation();
  assert.equal(state.table.invoiceNo, "");
  assert.deepEqual(state.table.previousOrderdItem, []);
  assert.deepEqual(state.recentOrders.pastOrderdItem, []);
  assert.deepEqual(state.previousOrderItem, []);
});

test("a reported failure preserves the cart and explains stale-table recovery", async () => {
  const { state, events } = fixture();
  state.call.post = async () => ({
    message: { status: "Failure" },
    _server_messages: JSON.stringify([JSON.stringify({
      message: "This order has been modified. Please reload the page to retrieve the latest edits.",
    })]),
  });
  await state.invoiceCreation();
  assert.match(events.alerts[0], /order has been modified/);
  assert.match(events.alerts[0], /Reopen the table/);
  assert.equal(state.menu.cart.length, 1);
  assert.equal(state.table.selectedTable, "T-01");
  assert.deepEqual(events.routes, []);
  assert.equal(events.reloads, 0);
  assert.equal(state.invoiceUpdating, false);
});

for (const error of [
  new Error("Network connection lost"),
  { _server_messages: "not JSON" },
  { _server_messages: JSON.stringify([JSON.stringify({ message: "<strong>POS Opening Entry</strong> is outdated" })]) },
  { _server_messages: JSON.stringify([JSON.stringify({ message: "Please enter valid customer details" })]) },
]) {
  test(`failed requests retain the cart and show a readable message: ${error.message || error._server_messages}`, async () => {
    const { state, events } = fixture();
    state.call.post = async () => { throw error; };
    await state.invoiceCreation();
    assert.equal(events.alerts.length, 1);
    assert.ok(events.alerts[0].length > 0);
    assert.doesNotMatch(events.alerts[0], /<[^>]*>|\[object Object\]/);
    if (error.message) assert.match(events.alerts[0], /Network connection lost/);
    if (error._server_messages?.includes("outdated")) assert.match(events.alerts[0], /POS Opening Entry is outdated/);
    assert.equal(state.menu.cart.length, 1);
    assert.deepEqual(events.routes, []);
    assert.equal(events.reloads, 0);
    assert.equal(state.invoiceUpdating, false);
    assert.equal(state.showUpdateButtton, true);
  });
}

test("a failure response without server messages still has visible feedback", async () => {
  const { state, events } = fixture();
  state.call.post = async () => ({ message: { status: "Failure" } });
  await state.invoiceCreation();
  assert.equal(events.alerts.length, 1);
  assert.match(events.alerts[0], /Could not send/);
  assert.equal(state.menu.cart.length, 1);
  assert.deepEqual(events.routes, []);
});

test("a second send while pending does not post a duplicate", async () => {
  const { state, events } = fixture();
  let complete;
  state.call.post = async () => {
    events.posts.push({});
    return new Promise(resolve => { complete = resolve; });
  };
  const pending = state.invoiceCreation();
  assert.equal(state.invoiceUpdating, true);
  const duplicate = state.invoiceCreation();
  assert.equal(events.posts.length, 1);
  complete({ message: { name: "POS-INV-001", items: [] } });
  await Promise.all([pending, duplicate]);
});
