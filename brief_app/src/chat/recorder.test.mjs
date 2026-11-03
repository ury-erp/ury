// Run: node --experimental-strip-types --test src/chat/recorder.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pickMime } from "./recorder.ts";

test("pickMime falls back to audio/mp4 when only mp4 is supported (Safari)", () => {
  assert.equal(pickMime((t) => t === "audio/mp4"), "audio/mp4");
});
test("pickMime prefers webm/opus and returns null when nothing matches", () => {
  assert.equal(pickMime(() => true), "audio/webm;codecs=opus");
  assert.equal(pickMime(() => false), null);
});
