# URY e2e (Playwright)

Browser end-to-end tests against the URY frontend SPAs served by a real,
running Frappe bench: `pos/` (captain/cashier POS), `self-order/`
(customer self-ordering), `mosaic/` (production board). `frontend/` has a
`testMatch` entry reserved for symmetry but no spec yet (out of scope for
this pass).

## What this actually verified (2026-09-15, live-bench run)

Contrary to this repo's own vite.config.ts-per-app assumption (the original
scaffold pointed each project's `baseURL` at a separate `yarn dev --port
517x` process), **`pos/` and `self-order/` define no dev-server proxy to a
backend at all** (only `frontend/` and `mosaic/` do) -- a standalone `yarn
dev` server for those two apps cannot reach a live API, ever, regardless of
seeding. The apps are actually served in production as built static assets
through Frappe's own `website_route_rules` (`ury/hooks.py`): `/pos`,
`/order`, `/mosaic`, `/ury` each resolve to that app's built
`index.html`/`public/` bundle, requiring a real running bench + site, not a
Vite dev server.

`playwright.config.ts` now points a single `baseURL` (`URY_BASE_URL`, default
`http://sa-testcov-verify.local:8114`) at a live bench serving those built
routes directly, matching how the apps actually ship.

Real results this session (`workers=1`; running all 3 projects in
parallel crashed Chromium on this container's ARM64 host -- a known
resource-contention issue, not a test failure, so run with `--workers=1`
or one `--project` at a time):

```
[pos] loads and renders a recognizable app shell           passed (1.2s)
[self-order] loads and renders a recognizable app shell     passed (985ms)
[mosaic] loads and renders a recognizable app shell         passed (632ms)
3 passed, 3 skipped (golden-path specs, see below)
```

## Golden-path specs: still (honestly) skipped

Attempted to un-skip the POS captain golden path against the live,
seeded `sa-testcov-verify` bench (12 `URY Table` / 4 `URY Room` rows
already present):

- Logging in as `Administrator` and hitting `/pos/order` does **not**
  reach the `CaptainTables` "Tables" screen the spec's TODO describes --
  it reaches an "Open POS Session" screen instead (`AuthGuard` passes,
  but the app's POS-session flow gates further), and fails with "No POS
  Profile is available for your user in this branch" (Administrator
  isn't assigned to the seeded `Demo Branch` POS Profile).
- The one seeded `POS Profile User" (`test@erpnext.com`) hits a harder
  wall: `/pos/order` renders "Access Denied" for that user entirely --
  it lacks whatever role `CaptainRouteGuard` requires.

Making the golden path real needs a properly role-and-POS-Profile-seeded
captain user, not just any bench with rooms/tables -- that's a data-seeding
fix beyond this pass's budget, so the `test.skip` stays, with this
concrete finding recorded here (and in `tests/pos.spec.ts`'s TODO) instead
of silently re-skipping without evidence.

## QUnit: real client-script logic exists, still correctly out of scope

Per this track's own instruction ("drop QUnit entirely"), no QUnit harness
was added. `grep -rn "frappe.ui.form.on" ury/` does find genuine Desk
client-script logic on ~15 `ury` doctypes (`URY Table`, `URY Room`, `URY
Order`, `URY KOT`, `URY Menu`, `Sub POS Closing`, etc.) plus several
`POS Invoice`/`Journal Entry` client scripts under `ury/public/js/` and
`ury/fixtures/client_script.json` -- this is **not** the "no genuine
client-script logic" case the track description hoped for. None of it is
covered by this Playwright pass either (scope was the 3 SPA golden paths).
This is a real, open gap: Desk-form client-script coverage for those ~15
doctypes remains untested by anything, QUnit or Playwright.

## Layout

- `playwright.config.ts` -- one shared `baseURL` (env-overridable), 4
  project entries (one per app, `frontend` unused for now).
- `tests/pos.spec.ts` / `tests/self-order.spec.ts` / `tests/mosaic.spec.ts`
  -- one real, passing "app shell mounts" assertion per app, plus a
  `test.skip`'d golden-path test with a TODO describing exactly what's
  missing to make it real (see above).
