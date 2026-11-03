import test from "node:test";
import assert from "node:assert/strict";
import { parse, href } from "./router.ts";

test("parse routes", () => {
  assert.deepEqual(parse(""), { name: "brief" });
  assert.deepEqual(parse("#/ask"), { name: "ask" });
  assert.deepEqual(parse("#/ask/abc%20d"), { name: "thread", id: "abc d" });
  assert.deepEqual(parse("#/call"), { name: "call" });
  assert.deepEqual(parse("#/nope"), { name: "brief" });
});
test("href round trip", () => {
  for (const r of [{ name: "brief" }, { name: "ask" }, { name: "thread", id: "x y" }, { name: "call" }]) assert.deepEqual(parse(href(r)), r);
});
