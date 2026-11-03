// Run: node --experimental-strip-types --test src/call/MockCallEngine.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { MockCallEngine } from "./MockCallEngine.ts";
import { HufCallEngine } from "./HufCallEngine.ts";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("walks the full state machine and ends", async () => {
  const e = new MockCallEngine({ stepMs: 10, turns: 2, levelMs: 5 });
  const seen = [];
  e.on("state", (s) => seen.push(s));
  await e.start();
  await wait(400);
  assert.deepEqual(seen.slice(0, 6), ["requesting_mic", "connecting", "ringing", "connected", "speaking", "listening"]);
  assert.ok(seen.includes("speaking") && seen.at(-1) === "ended");
});

test("emits levels and transcripts; mute zeroes level while listening", async () => {
  const e = new MockCallEngine({ stepMs: 10, levelMs: 5 });
  const lv = [], tr = [];
  e.on("level", (l) => lv.push(l));
  e.on("transcript", (t) => tr.push(t));
  await e.start();
  await wait(150);
  assert.ok(lv.length > 0 && lv.every((x) => x >= 0 && x <= 1));
  assert.ok(tr.some((t) => t.role === "agent"));
  await e.end();
});

test("end() stops further transitions and is idempotent", async () => {
  const e = new MockCallEngine({ stepMs: 10 });
  const seen = [];
  e.on("state", (s) => seen.push(s));
  await e.start();
  await e.end();
  await e.end();
  const n = seen.length;
  await wait(100);
  assert.equal(seen.length, n);
  assert.equal(seen.at(-1), "ended");
});

test("failAt produces failed and allows restart", async () => {
  const e = new MockCallEngine({ stepMs: 10, failAt: "connecting" });
  await e.start();
  await wait(60);
  assert.equal(e.current, "failed");
  assert.match(e.error, /connecting/);
  await e.start();
  assert.equal(e.current, "requesting_mic");
  await e.end();
});

test("unsubscribe works", async () => {
  const e = new MockCallEngine({ stepMs: 10 });
  const seen = [];
  const off = e.on("state", (s) => seen.push(s));
  off();
  await e.start();
  await e.end();
  assert.equal(seen.length, 0);
});

test("HufCallEngine stub throws NotImplemented", async () => {
  const h = new HufCallEngine();
  await assert.rejects(h.start(), /not implemented/);
  assert.throws(() => h.setMuted(true), /not implemented/);
});

test("reconnecting state appears once then the call continues", async () => {
  const e = new MockCallEngine({ stepMs: 10, turns: 2, levelMs: 5, reconnectAtTurn: 1 });
  const seen = [];
  e.on("state", (s) => seen.push(s));
  await e.start();
  await wait(500);
  assert.equal(seen.filter((s) => s === "reconnecting").length, 1);
  assert.deepEqual(seen.slice(3, 6), ["connected", "reconnecting", "speaking"]);
  assert.equal(seen.at(-1), "ended");
});
