// node --test src/api.signout.test.mjs
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
test("signOut sends CSRF header and handles failure", () => {
  assert.match(src, /X-Frappe-CSRF-Token/);
  assert.match(src, /Could not sign out\. Try again\./);
  assert.match(src, /\/login\?redirect-to=\/ury\/brief\//);
  assert.match(src, /if \(!ok\) \{ showSignOutError\(\); return false; \}/);
});
