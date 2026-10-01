import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as Vue from "vue";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";

// Exercise the real component methods without a DOM, site, or a test runner.
const source = await readFile(new URL("./kot.vue", import.meta.url), "utf8");
const script = source.split("<script>")[1].split("</script>")[0];
let helpers = {};
try {
  helpers = await import("./kitchen-actions.js");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

function kitchen() {
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  const call = {
    post: async (method, args) => { requests.push({ method, args }); return {}; },
    get: async () => ({ message: [] }),
  };
  const storage = { removeItem() {} };
  const component = new Function(
    "FrappeApp", "window", "navigator", "localStorage", "setTimeout", "clearTimeout", "fetch", "io", "console",
    ...Object.keys(helpers),
    script.replace(/^import .*;\s*$/gm, "").replace("export default", "return"),
  )(
    class { call() { return call; } },
    { location: { hostname: "test", protocol: "https:", port: "" } },
    { onLine: true }, storage,
    (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    (id) => timers.delete(id),
    async () => ({ json: async () => ({ message: { site_name: "test" } }) }),
    () => ({ on() {} }), { log() {}, error() {} }, ...Object.values(helpers),
  );
  const state = { ...component.data(), production: "Kitchen", ...component.methods };
  state.masonryLoading = () => {};
  state.removeAllItemsFromLocalStorage = () => { state.storageCleared = true; };
  const ticket = {
    name: "KOT-001", type: "New Order", order_status: "Ready For Prepare",
    production: "Kitchen", time: "12:00:00", kot_items: [], isRotated: true,
    invoice: "INV-001", tableortakeaway: "T-01", user: "Cook",
  };
  state.kot = [ticket];
  return { state, ticket, requests, timers, call, component };
}

test("serve waits five seconds before posting and removing the card", async () => {
  const { state, ticket, requests, timers } = kitchen();
  await state.serveOrder(ticket);
  assert.equal(requests.length, 0, "Serve currently commits immediately, without an undo window");
  assert.equal(state.kot.length, 1);
  assert.equal(timers.size, 1);
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 5000);
  await timer.callback();
  assert.deepEqual(requests, [{
    method: "ury.ury.api.ury_kot_display.serve_kot", args: { name: "KOT-001" },
  }]);
  assert.equal(state.kot.length, 0);
  assert.equal(state.storageCleared, true);
});

test("undo cancels the pending serve without posting or clearing item state", async () => {
  const { state, ticket, requests, timers } = kitchen();
  await state.serveOrder(ticket);
  assert.equal(typeof state.undoServe, "function", "Kitchen has no Undo control");
  state.undoServe(ticket);
  assert.equal(timers.size, 0);
  assert.equal(requests.length, 0);
  assert.equal(state.kot.length, 1);
  assert.equal(state.storageCleared, undefined);
});

test("double taps and refreshed card objects do not queue a second serve", async () => {
  const { state, ticket, timers, requests } = kitchen();
  await state.serveOrder(ticket);
  const refreshed = { ...ticket };
  state.kot = [refreshed];
  await state.serveOrder(refreshed);
  assert.equal(timers.size, 1, "Only one pending serve may exist per ticket");
  const timer = [...timers.values()][0];
  let finish;
  state.call.post = () => new Promise(resolve => { finish = resolve; });
  const sending = timer.callback();
  state.undoServe(refreshed);
  await state.serveOrder(refreshed);
  assert.equal(state.pendingServes[ticket.name].sending, true);
  finish({});
  await sending;
  assert.equal(state.kot.length, 0, "Remove the current card, not a stale object");
  assert.equal(requests.length, 0);
});

test("a failed serve shows an error and preserves the card and item state", async () => {
  const { state, ticket, timers } = kitchen();
  state.call.post = async () => { throw new Error("Network unavailable"); };
  await state.serveOrder(ticket);
  assert.equal(timers.size, 1, "Serve must wait before committing");
  await [...timers.values()][0].callback();
  assert.match(state.actionError, /Network unavailable/);
  assert.equal(state.kot.length, 1);
  assert.notEqual(ticket.showDiv, true);
  assert.equal(state.storageCleared, undefined);
  assert.equal(state.pendingServes[ticket.name], undefined);
});

test("failed cancellation confirmation is visible and keeps the card", async () => {
  const { state, ticket } = kitchen();
  state.call.post = async () => { throw { message: "Manager permission required" }; };
  await state.confirmOrder(ticket);
  await Promise.resolve();
  assert.match(state.actionError || "", /Manager permission required/);
  assert.equal(state.kot.length, 1);
  assert.equal(state.storageCleared, undefined);
});

test("leaving Mosaic cancels pending serves", async () => {
  const { state, ticket, timers, component } = kitchen();
  await state.serveOrder(ticket);
  assert.equal(typeof component.beforeUnmount, "function", "Vue 3 must cancel pending work on unmount");
  state.hideAudioAlertMessage = () => {};
  // The lifecycle also unregisters existing browser listeners.
  assert.equal(typeof state.cancelPendingServes, "function");
  state.cancelPendingServes();
  assert.equal(timers.size, 0);
});

test("LATE starts at the configured warning threshold and ignores an unset threshold", () => {
  const { state, ticket } = kitchen();
  state.kot_alert_time = "15";
  state.calculateTimeRemaining = () => "0 : 15";
  state.orderDelayNotify = () => {};
  state.updateTimeRemaining();
  assert.equal(ticket.late, true, "The card has no LATE state at the warning threshold");
  state.calculateTimeRemaining = () => "0 : 14";
  state.updateTimeRemaining();
  assert.equal(ticket.late, false);
  state.kot_alert_time = "";
  state.calculateTimeRemaining = () => "1 : 0";
  state.updateTimeRemaining();
  assert.equal(ticket.late, false);
});

test("recent served query is native and constrained to the branch and production unit", async () => {
  const { state, call } = kitchen();
  state.branch = "Branch A";
  state.serverTimeOffset = new Date("2026-10-01T00:05:00").getTime() - Date.now();
  const gets = [];
  call.get = async (method, args) => {
    gets.push({ method, args });
    return { message: [
      { name: "RECENT", order_status: "Served", creation: "2026-09-30 23:40:00", production_time: "15" },
      { name: "EXPIRED", order_status: "Served", creation: "2026-09-30 23:00:00", production_time: "15" },
    ] };
  };
  assert.equal(typeof state.fetchRecentServed, "function", "Mosaic has no native served-ticket list for recall");
  await state.fetchRecentServed();
  assert.equal(gets[0].method, "frappe.client.get_list");
  assert.equal(gets[0].args.doctype, "URY KOT");
  assert.equal(gets[0].args.filters.branch, "Branch A");
  assert.equal(gets[0].args.filters.production, "Kitchen");
  assert.equal(gets[0].args.filters.order_status, "Served");
  assert.equal(gets[0].args.filters.docstatus, 1);
  assert.deepEqual(state.recentServed.map(k => k.name), ["RECENT"]);
});

test("recall restores the active list only after the server accepts it", async () => {
  const { state, ticket, requests } = kitchen();
  state.recentServed = [ticket];
  let refreshed = false;
  state.fetchKOT = async () => { refreshed = true; };
  assert.equal(typeof state.recallOrder, "function", "Kitchen has no Recall control");
  await state.recallOrder(ticket);
  assert.deepEqual(requests, [{ method: "ury.ury.api.ury_kot_display.recall_kot", args: { name: "KOT-001" } }]);
  assert.equal(refreshed, true);
  assert.equal(state.recentServed.length, 0);
});

test("rejected recall keeps its ticket and shows a readable server error", async () => {
  const { state, ticket } = kitchen();
  state.recentServed = [ticket];
  state.call.post = async () => { throw { _server_messages: '["{\\"message\\":\\"Recall within <b>15 minutes</b>\\"}"]' }; };
  assert.equal(typeof state.recallOrder, "function", "Kitchen has no Recall control");
  await state.recallOrder(ticket);
  assert.match(state.actionError, /Recall within 15 minutes/);
  assert.equal(state.recentServed.length, 1);
});

test("pure recall decisions use serving time, not modified time, including midnight", () => {
  assert.equal(typeof helpers.canRecallKot, "function", "Missing recall-window decision");
  const ticket = {
    order_status: "Served", creation: "2026-09-30 23:40:00", production_time: "15",
    modified: "2026-10-01 00:10:01",
  };
  assert.equal(helpers.canRecallKot(ticket, new Date("2026-10-01T00:10:00")), true);
  assert.equal(helpers.canRecallKot(ticket, new Date("2026-10-01T00:10:01")), false);
  assert.equal(helpers.canRecallKot({ ...ticket, production_time: null }, new Date("2026-10-01T00:05:00")), false);
  assert.equal(helpers.canRecallKot({ ...ticket, order_status: "Ready For Prepare" }, new Date("2026-10-01T00:05:00")), false);
});

test("unknown request errors use a visible fallback message", () => {
  assert.equal(typeof helpers.kitchenErrorMessage, "function", "Missing kitchen error presentation");
  assert.equal(helpers.kitchenErrorMessage({}, "Could not serve KOT-001."), "Could not serve KOT-001.");
  assert.equal(helpers.kitchenErrorMessage({ _server_messages: "bad JSON" }, "Could not recall."), "Could not recall.");
});

test("Vue reacts when the undo window ends and the request becomes in-flight", async () => {
  const { state: plainState, ticket, timers } = kitchen();
  const state = Vue.reactive(plainState);
  const changes = [];
  const stop = Vue.watchEffect(() => changes.push(state.pendingServes[ticket.name]?.sending));
  let finish;
  state.call.post = () => new Promise(resolve => { finish = resolve; });
  state.serveOrder(ticket);
  await Vue.nextTick();
  const sending = [...timers.values()][0].callback();
  await Vue.nextTick();
  try {
    assert.equal(changes.at(-1), true, "Serving… and Undo must update through Vue's reactive state");
  } finally {
    finish({});
    await sending;
    stop();
  }
});

test("the rendered card shows LATE, an Undo control, and a visible failure banner", async () => {
  const { state, ticket, component } = kitchen();
  const { code } = compile(source.split("<template>")[1].split("</template>")[0], { mode: "function", prefixIdentifiers: true });
  const render = new Function("Vue", code)(Vue);
  ticket.late = true;
  state.actionError = "Could not serve KOT-001.";
  state.pendingServes[ticket.name] = { sending: false };
  let html = await renderToString(Vue.createSSRApp({ data: () => state, computed: component.computed, render }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not serve KOT-001\./);
  assert.match(html, /ring-4 ring-red-600/);
  assert.match(html, />LATE</);
  assert.match(html, />Undo</);
  state.pendingServes[ticket.name].sending = true;
  html = await renderToString(Vue.createSSRApp({ data: () => state, computed: component.computed, render }));
  assert.match(html, /Serving…/);
  assert.doesNotMatch(html, />Undo</);
});

test("the native recent-served query uses a site-local cutoff across midnight", () => {
  const query = helpers.recentServedQuery("Branch A", "Kitchen", new Date("2026-10-01T00:05:00"));
  assert.deepEqual(query.filters.modified, [">=", "2026-09-30 23:50:00"]);
  assert.deepEqual(query.filters.type, ["not in", ["Cancelled", "Partially cancelled"]]);
});
