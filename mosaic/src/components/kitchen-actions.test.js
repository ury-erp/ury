import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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

const settle = () => new Promise(setImmediate);
const socketTicket = (name, production = "Kitchen") => ({
  name, production, type: "New Order", order_status: "Ready For Prepare",
  time: "13:00:00", kot_items: [], invoice: "INV-001", user: "Cook",
});
const socketEvent = kot => ({ kot, audio_file: "/alert.wav", last_kot_time: null });
const kotSnapshot = (tickets, serverTime = "2026-10-01 13:00:30", settings = {}) => ({ message: {
  Branch: "Branch A", kot_alert_time: 9999, audio_alert: 1,
  audio_file: "/snapshot-alert.wav", ...settings,
  daily_order_number: 0, server_time: serverTime, KOT: structuredClone(tickets),
} });

function kitchen({ connected = true } = {}) {
  const requests = [];
  const timers = new Map();
  const intervals = new Map(), chimes = [], stored = new Map();
  const socket = new EventEmitter();
  socket.connected = connected;
  let snapshot = [socketTicket("KNOWN")], serverTime = "2026-10-01 13:00:30";
  let snapshotSettings = {};
  let timerId = 0;
  const call = {
    post: async (method, args) => { requests.push({ method, args }); return {}; },
    get: async (method, args) => {
      requests.push({ method, args });
      return kotSnapshot(snapshot, serverTime, snapshotSettings);
    },
  };
  const auth = { getLoggedInUser: async () => "cook@example.test" };
  const storage = {
    removeItem: key => stored.delete(key), getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  const component = new Function(
    "FrappeApp", "window", "navigator", "localStorage", "setTimeout", "clearTimeout", "fetch", "io", "console",
    "document", "Audio", "setInterval", "clearInterval",
    ...Object.keys(helpers),
    script.replace(/^import .*;\s*$/gm, "").replace("export default", "return"),
  )(
    class { call() { return call; } auth() { return auth; } },
    { location: { hostname: "test", protocol: "https:", port: "", origin: "https://test" },
      addEventListener() {}, removeEventListener() {} },
    { onLine: true }, storage,
    (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    (id) => timers.delete(id),
    async () => ({ json: async () => ({ message: { site_name: "test" } }) }),
    () => socket, { log() {}, error() {} },
    { addEventListener() {}, removeEventListener() {} },
    class { constructor(path) { this.path = path; } play() { chimes.push(this.path); } },
    (callback, delay) => { intervals.set(++timerId, { callback, delay }); return timerId; },
    id => intervals.delete(id), ...Object.values(helpers),
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
  function mount(production = "Kitchen") {
    const mounted = { ...component.data(), production };
    for (const [name, method] of Object.entries(component.methods)) mounted[name] = method.bind(mounted);
    mounted.masonryLoading = () => {};
    component.mounted.call(mounted);
    return mounted;
  }
  const html = mounted => {
    const { code } = compile(source.split("<template>")[1].split("</template>")[0], { mode: "function", prefixIdentifiers: true });
    const render = new Function("Vue", code)(Vue);
    return renderToString(Vue.createSSRApp({ data: () => mounted, computed: component.computed, render }));
  };
  return { state, ticket, requests, timers, call, component, socket, chimes, auth, intervals, mount, html,
    unmount: mounted => component.beforeUnmount.call(mounted),
    snapshot: (value, time = serverTime, settings = {}) => {
      snapshot = value; serverTime = time; snapshotSettings = settings;
    },
    disconnect() { socket.connected = false; socket.emit("disconnect", "transport close"); },
    connect() { socket.connected = true; socket.emit("connect"); },
  };
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

test("ticket elapsed time follows the site clock instead of the browser clock", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const { state } = kitchen();
  // Berlin's wall clock is one hour behind Africa/Kampala on this date.
  const cases = [
    { browserTime: "2026-10-01T12:00:30", offset: 3600000, ticketTime: "13:00:00", elapsed: "0 : 0" },
    { browserTime: "2026-10-01T12:05:30", offset: 3600000, ticketTime: "13:00:00", elapsed: "0 : 5" },
    { browserTime: "2026-10-01T12:05:30", offset: 3600000, ticketTime: "12:00:00", elapsed: "1 : 5" },
    { browserTime: "2026-10-01T13:05:30", offset: -3600000, ticketTime: "12:00:00", elapsed: "0 : 5" },
    { browserTime: "2026-09-30T23:05:30", offset: 3600000, ticketTime: "00:00:00", elapsed: "0 : 5" },
  ];
  for (const { browserTime, offset, ticketTime, elapsed } of cases) {
    t.mock.timers.setTime(new Date(browserTime).getTime());
    state.serverTimeOffset = offset;
    assert.equal(state.calculateTimeRemaining(ticketTime), elapsed, `${browserTime}, site offset ${offset}`);
  }
});

test("ticket elapsed time never displays a negative duration", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T12:00:00").getTime() });
  const { state } = kitchen();
  state.serverTimeOffset = 3600000;
  assert.equal(state.calculateTimeRemaining("13:00:01"), "0 : 0");
  assert.equal(state.calculateTimeRemaining("13:01:00"), "0 : 0");
});

test("elapsed time drives the LATE cue and delay notification on the site clock", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T12:15:00").getTime() });
  const { state, ticket, requests } = kitchen();
  state.serverTimeOffset = 3600000;
  state.kot_alert_time = 15;
  ticket.time = "13:00:00";
  state.updateTimeRemaining();
  assert.equal(ticket.timeRemaining, "0 : 15");
  assert.equal(ticket.late, true);
  assert.equal(ticket.timecolor, "text-[#DC0000]");
  assert.deepEqual(requests, [{
    method: "ury.ury.api.ury_kot_notification.order_delay_notification", args: { id: "KOT-001" },
  }]);
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

test("leaving a station detaches both listeners without disturbing shared subscribers", async () => {
  const k = kitchen();
  const old = k.mount();
  await settle();
  let observed = 0;
  k.socket.on("kot_update_Branch A_Kitchen", () => observed++);
  k.unmount(old);
  k.socket.emit("kot_update_Branch A_Kitchen", socketEvent(socketTicket("NEW")));
  k.socket.emit("kot_error_Branch A_Kitchen", { kot: "KNOWN", invoice: "INV-001" });
  assert.equal(k.chimes.length, 0, "An unmounted station must not chime");
  assert.equal(old.showKotErrorAlert, false, "An unmounted station must not receive delay alerts");
  assert.equal(observed, 1, "Unmount must preserve another consumer of the shared socket");
  assert.equal(k.intervals.size, 0, "The station's minute timer must still be cleaned up");
  k.disconnect();
  k.connect();
  await settle();
  assert.equal(k.requests.length, 1, "An old station must not resync on reconnect");
});

test("station to root to station produces exactly one chime and one card", async () => {
  const k = kitchen();
  const old = k.mount();
  await settle();
  k.unmount(old);
  const current = k.mount();
  await settle();
  k.socket.emit("kot_update_Branch A_Kitchen", socketEvent(socketTicket("NEW")));
  assert.deepEqual(k.chimes, ["https://test/alert.wav"], "Revisiting the station currently doubles its chime");
  assert.equal(old.kot.some(kot => kot.name === "NEW"), false);
  assert.equal(current.kot.filter(kot => kot.name === "NEW").length, 1);
});

test("known, repeated and wrong-station tickets do not produce new-ticket chimes", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("KNOWN")));
  k.socket.emit("kot_update_Branch A_Bar", socketEvent(socketTicket("OTHER", "Bar")));
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("NEW")));
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("NEW")));
  assert.equal(k.chimes.length, 1, "Only a previously unseen ticket for this station should chime");
  assert.deepEqual(state.kot.map(kot => kot.name), ["NEW", "KNOWN"]);
  state.kot = state.kot.filter(kot => kot.name !== "NEW");
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("NEW")));
  assert.equal(k.chimes.length, 1, "An already-seen served ticket is not a new ticket");
});

test("reconnect resyncs the server clock and chimes once for all missed station tickets", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T12:00:30").getTime() });
  const k = kitchen();
  const state = k.mount();
  await settle();
  assert.equal(state.serverTimeOffset, 3600000);
  k.disconnect();
  t.mock.timers.setTime(new Date("2026-10-01T12:05:30").getTime());
  k.snapshot([socketTicket("MISSED"), socketTicket("MISSED-2"), socketTicket("KNOWN")], "2026-10-01 13:05:30");
  k.connect();
  await settle();
  assert.deepEqual(state.kot.map(kot => kot.name), ["MISSED", "MISSED-2", "KNOWN"], "Socket.IO does not replay disconnected tickets");
  assert.deepEqual(k.requests, Array.from({ length: 2 }, () => ({ method: "ury.ury.api.ury_kot_display.kot_list", args: {} })));
  assert.equal(state.serverTimeOffset, 3600000, "Reconnect must also refresh the site-clock offset");
  assert.equal(state.calculateTimeRemaining("13:00:00"), "0 : 5");
  assert.deepEqual(k.chimes, ["https://test/snapshot-alert.wav"], "Reconnect must combine missed station tickets into one chime using the snapshot sound");
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("KNOWN")));
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("MISSED")));
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("MISSED-2")));
  assert.equal(k.chimes.length, 1, "Resynced tickets are already known");
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("AFTER")));
  assert.equal(k.chimes.length, 2);
});

test("initial snapshots and reconnects with only known or other-station tickets stay silent", async () => {
  const k = kitchen();
  k.snapshot([socketTicket("KNOWN"), socketTicket("KNOWN-2")]);
  const state = k.mount();
  await settle();
  assert.equal(k.chimes.length, 0, "Initial page load must stay silent");
  k.disconnect();
  k.snapshot([socketTicket("OTHER", "Bar"), socketTicket("KNOWN"), socketTicket("KNOWN-2")]);
  k.connect();
  await settle();
  assert.equal(k.chimes.length, 0, "Another station's unseen tickets must not chime here");
  k.socket.emit("kot_update_Branch A_Bar", socketEvent(socketTicket("OTHER", "Bar")));
  assert.equal(k.chimes.length, 0);
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("NEW")));
  assert.deepEqual(k.chimes, ["https://test/alert.wav"]);
});

test("reconnect uses the last socket-delivered sound when the snapshot has none", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.socket.emit(state.kot_channel, { ...socketEvent(socketTicket("KNOWN")), audio_file: "/socket-alert.wav" });
  assert.equal(k.chimes.length, 0, "A known socket ticket can supply the fallback without chiming");
  k.disconnect();
  k.snapshot([socketTicket("MISSED"), socketTicket("KNOWN")], undefined, { audio_file: undefined });
  k.connect();
  await settle();
  assert.deepEqual(k.chimes, ["https://test/socket-alert.wav"]);
});

test("reconnect prefers the server sound over the last socket-delivered sound", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.socket.emit(state.kot_channel, { ...socketEvent(socketTicket("KNOWN")), audio_file: "/old-alert.wav" });
  k.disconnect();
  k.snapshot([socketTicket("MISSED")]);
  k.connect();
  await settle();
  assert.deepEqual(k.chimes, ["https://test/snapshot-alert.wav"]);
});

test("reconnect respects disabled audio and remembers missed tickets without replay", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  k.snapshot([socketTicket("MISSED")], undefined, { audio_alert: 0 });
  k.connect();
  await settle();
  assert.equal(state.kot[0].name, "MISSED");
  assert.equal(k.chimes.length, 0);
  k.disconnect();
  k.snapshot([socketTicket("MISSED")]);
  k.connect();
  await settle();
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("MISSED")));
  assert.equal(k.chimes.length, 0, "Re-enabling audio must not replay a previously seen ticket");
});

test("a reconnect with no snapshot or socket sound does not play an invalid audio URL", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  k.snapshot([socketTicket("MISSED")], undefined, { audio_file: null });
  k.connect();
  await settle();
  assert.equal(state.kot[0].name, "MISSED");
  assert.equal(k.chimes.length, 0);
});

test("an older resync cannot clear staleness or update the board while a newer resync is pending", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  const finishes = [];
  k.call.get = () => new Promise(resolve => finishes.push(resolve));
  k.disconnect();
  k.connect();
  k.disconnect();
  k.connect();
  assert.equal(finishes.length, 2);
  finishes[0](kotSnapshot([socketTicket("OLDER")]));
  await settle();
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*stale/i);
  assert.deepEqual(state.kot.map(kot => kot.name), ["KNOWN"]);
  assert.equal(k.chimes.length, 0);
  finishes[1](kotSnapshot([socketTicket("LATEST")]));
  await settle();
  assert.doesNotMatch(await k.html(state), /role="status"/);
  assert.deepEqual(state.kot.map(kot => kot.name), ["LATEST"]);
  assert.deepEqual(k.chimes, ["https://test/snapshot-alert.wav"]);
});

test("an older resync finishing last cannot overwrite the latest board, clock or seen tickets", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-01T12:00:30").getTime() });
  const k = kitchen();
  const state = k.mount();
  await settle();
  const finishes = [];
  k.call.get = () => new Promise(resolve => finishes.push(resolve));
  k.disconnect();
  k.connect();
  k.disconnect();
  k.connect();
  assert.equal(finishes.length, 2);
  finishes[1](kotSnapshot([socketTicket("LATEST")], "2026-10-01 13:05:30"));
  await settle();
  const offset = state.serverTimeOffset;
  finishes[0](kotSnapshot([socketTicket("OLDER")], "2026-10-01 13:00:30", { audio_alert: 0 }));
  await settle();
  assert.deepEqual(state.kot.map(kot => kot.name), ["LATEST"]);
  assert.equal(state.serverTimeOffset, offset);
  assert.equal(state.audio_alert, 1);
  assert.doesNotMatch(await k.html(state), /role="status"/);
  assert.deepEqual(k.chimes, ["https://test/snapshot-alert.wav"]);
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("OLDER")));
  assert.equal(k.chimes.length, 2, "Discarded snapshots must not mark their tickets as seen");
});

test("socket disconnect shows a persistent offline/stale banner even with navigator online", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  assert.equal(state.isOnline, true, "This test does not simulate a browser offline event");
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*(?:offline|stale)/i, "The board currently hides a dead realtime connection");
  state.handleOnline();
  await settle();
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*(?:offline|stale)/i, "navigator.onLine cannot clear socket staleness");
});

test("reconnect keeps the board stale until its server snapshot succeeds", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  let finish;
  k.call.get = () => new Promise(resolve => { finish = resolve; });
  k.connect();
  await settle();
  assert.equal(typeof finish, "function", "Reconnect must request a snapshot");
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*stale/i);
  finish(kotSnapshot([socketTicket("MISSED")]));
  await settle();
  assert.doesNotMatch(await k.html(state), /role="status"/);
  assert.equal(state.kot[0].name, "MISSED");
  assert.deepEqual(k.chimes, ["https://test/snapshot-alert.wav"]);
});

test("failed reconnect snapshots keep a visible stale warning", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  k.call.get = async () => { throw new Error("Server unavailable"); };
  k.connect();
  await settle();
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*stale/i);
  assert.equal(state.kot[0].name, "KNOWN");
  assert.equal(state.showModal, false, "A reconnect read failure is not an authentication failure");
});

test("leaving during authentication never installs late station listeners", async () => {
  const k = kitchen();
  let login;
  k.auth.getLoggedInUser = () => new Promise(resolve => { login = resolve; });
  const old = k.mount();
  k.unmount(old);
  login("cook@example.test");
  await settle();
  k.socket.emit("kot_update_Branch A_Kitchen", socketEvent(socketTicket("LATE")));
  assert.equal(k.chimes.length, 0, "Async mount completion must not resurrect an unmounted station");
  assert.equal(old.kot.some(kot => kot.name === "LATE"), false);
});

test("leaving during the initial snapshot never installs late station listeners", async () => {
  const k = kitchen();
  let finish;
  k.call.get = () => new Promise(resolve => { finish = resolve; });
  const old = k.mount();
  await settle();
  k.unmount(old);
  finish(kotSnapshot([socketTicket("KNOWN")]));
  await settle();
  k.socket.emit("kot_update_Branch A_Kitchen", socketEvent(socketTicket("NEW")));
  assert.equal(k.chimes.length, 0, "An initial read completing after unmount must not attach listeners");
});

test("mounting onto an already-disconnected socket immediately shows staleness", async () => {
  const k = kitchen({ connected: false });
  const state = k.mount();
  await settle();
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*(?:offline|stale)/i);
});

test("a disconnect during resync cannot be cleared by the late snapshot", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  let finish;
  k.call.get = () => new Promise(resolve => { finish = resolve; });
  k.connect();
  await settle();
  assert.equal(typeof finish, "function", "Reconnect must request a snapshot");
  k.disconnect();
  finish(kotSnapshot([socketTicket("MISSED")]));
  await settle();
  assert.match(await k.html(state), /role="status"[^>]*>[^<]*(?:offline|stale)/i);
  assert.deepEqual(state.kot.map(kot => kot.name), ["KNOWN"]);
  assert.equal(k.chimes.length, 0);
});

test("leaving during reconnect discards the late snapshot and its chime", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  k.disconnect();
  let finish;
  k.call.get = () => new Promise(resolve => { finish = resolve; });
  k.connect();
  await settle();
  k.unmount(state);
  finish(kotSnapshot([socketTicket("MISSED")]));
  await settle();
  assert.deepEqual(state.kot.map(kot => kot.name), ["KNOWN"]);
  assert.equal(k.chimes.length, 0);
});

test("new-ticket chimes still respect the configured audio setting", async () => {
  const k = kitchen();
  const state = k.mount();
  await settle();
  state.audio_alert = 0;
  k.socket.emit(state.kot_channel, socketEvent(socketTicket("NEW")));
  assert.equal(k.chimes.length, 0);
  assert.equal(state.kot[0].name, "NEW");
});
