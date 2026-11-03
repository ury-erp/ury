// Run: node --experimental-strip-types --test src/chat/when.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { relativeLabel, dayLabel, groupKey, parseServerTime } from "./when.ts";

const L = "en-GB";
const now = new Date(2026, 9, 21, 15, 0, 0); // 21 Oct 2026 15:00
const ago = (ms) => new Date(+now - ms);
const MIN = 60000, HR = 3600000;

test("relativeLabel: just now / minutes / hours", () => {
  assert.equal(relativeLabel(ago(30000), now, L), "Just now");
  assert.equal(relativeLabel(ago(5 * MIN), now, L), "5 min ago");
  assert.equal(relativeLabel(ago(59 * MIN), now, L), "59 min ago");
  assert.equal(relativeLabel(ago(2 * HR), now, L), "2 hours ago");
});
test("relativeLabel: previous calendar day is Yesterday even when under 24h", () => {
  const n = new Date(2026, 9, 21, 0, 30);
  assert.equal(relativeLabel(new Date(2026, 9, 20, 23, 30), n, L), "Yesterday");
  assert.equal(relativeLabel(new Date(2026, 9, 20, 22, 0), n, L), "Yesterday");
  assert.equal(relativeLabel(new Date(2026, 9, 20, 10, 0), now, L), "Yesterday");
});
test("relativeLabel: days, same-year date, other-year date", () => {
  assert.equal(relativeLabel(new Date(2026, 9, 19, 9), now, L), "2 days ago");
  assert.equal(relativeLabel(new Date(2026, 9, 15, 9), now, L), "6 days ago");
  assert.equal(relativeLabel(new Date(2026, 9, 14, 9), now, L), "14 Oct");
  assert.equal(relativeLabel(new Date(2025, 10, 23, 9), now, L), "23 Nov 2025");
});
test("dayLabel: midnight boundary", () => {
  assert.equal(dayLabel(new Date(2026, 9, 21, 0, 0, 0), now, L), "Today");
  assert.equal(dayLabel(new Date(2026, 9, 20, 23, 59, 59), now, L), "Yesterday");
  assert.equal(dayLabel(new Date(2026, 9, 19, 12), now, L), "19 Oct");
});
test("dayLabel: year boundary", () => {
  const jan = new Date(2026, 0, 2, 10);
  assert.equal(dayLabel(new Date(2025, 11, 31, 23, 59), jan, L), "31 Dec 2025");
  assert.equal(dayLabel(new Date(2026, 0, 1, 0, 0), jan, L), "Yesterday");
});
test("groupKey sections", () => {
  assert.equal(groupKey(new Date(2026, 9, 21, 1), now, L).label, "Today");
  assert.equal(groupKey(new Date(2026, 9, 20, 1), now, L).label, "Yesterday");
  assert.equal(groupKey(new Date(2026, 9, 14, 1), now, L).label, "Previous 7 days");
  const o = groupKey(new Date(2026, 9, 13, 1), now, L);
  assert.equal(o.label, "October 2026");
  assert.notEqual(o.key, groupKey(new Date(2025, 9, 13, 1), now, L).key);
});
test("parseServerTime parses space-separated local time with microseconds", () => {
  const d = parseServerTime("2026-10-21 08:05:09.123456");
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()], [2026, 9, 21, 8, 5, 9]);
  assert.equal(parseServerTime("2026-10-21 08:05:09").getHours(), 8);
  assert.equal(parseServerTime("garbage"), null);
  assert.equal(parseServerTime(undefined), null);
});
