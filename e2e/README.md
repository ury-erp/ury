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

## Golden-path specs: round 2 update (2026-09-15) -- root cause found and fixed

Round 1 (above) reported the golden-path spec blocked on a "data-seeding
gap: no user is both role-authorized and POS-Profile-assigned." Round 2
re-investigated that with a real Playwright network-response listener
(rather than curl guesses at API endpoint names) and found the actual
root cause was different from round 1's theory:

- `test@erpnext.com` (the seeded `POS Profile User` for `Demo Branch`)
  already had the `URY Captain` role **and** was already a `POS Profile
  User` -- both things round 1 assumed were missing.
- Logging in as that user and hitting `/pos/order` still rendered
  "Access Denied." Capturing the failing XHR showed why:
  `ury.ury_pos.api.getPosProfile` throws `ValidationError: User is not
  Associated with any Branch.Please refresh Page`.
- Root cause, traced into `ury/ury_pos/api.py`'s `getBranch()`: it joins
  `` `tabURY User` `` (a child table declared **on the `Branch`
  doctype**, distinct from Frappe's `User`/role system) against
  `frappe.session.user`. Only `Administrator` had a `URY User` row on
  `Demo Branch` -- `test@erpnext.com` had none, despite having the right
  role and POS Profile membership.
- Fix (real, applied against the live `sa-testcov-verify` bench via
  `bench --site sa-testcov-verify.local console`):
  ```python
  branch = frappe.get_doc('Branch', 'Demo Branch')
  branch.append('user', {'user': 'test@erpnext.com'})
  branch.save(ignore_permissions=True)
  frappe.db.commit()
  ```
- After that single fix, `getPosProfile`/`getModeOfPayment` both return
  200, and the golden-path spec (`tests/pos.spec.ts`, no longer skipped)
  passes for real: log in via the actual `/login` form, land on
  `CaptainTables`'s "Tables" heading, tap a real "Free" table tile
  (`button[type="button"]` with a `Free` status badge -- confirmed from
  the live rendered DOM), and land on `/pos/order/table/:table`.

```
$ URY_BASE_URL=http://sa-testcov-verify.local:8114 npx playwright test --project=pos --workers=1
✓  [pos] loads and renders a recognizable app shell (1.1s)
✓  [pos] captain golden path: login -> tables list -> open a table (4.5s)
-  [pos] captain golden path: add items -> KOT -> serve -> POS close (skipped)
2 passed, 1 skipped
```

**Still (honestly) skipped**: the deeper "add items -> KOT -> serve ->
POS close" leg. Reaching `CaptainOrder` (the per-table screen) is real
and passing; driving `CaptainMenu` to add priced items, sending a KOT via
`syncOrder`/`reprintKot` (`pos/src/lib/order-api.ts`), and then completing
payment/POS Closing Entry on the cashier side of the app were not
attempted in this pass -- that's real additional UI-automation work
(menu item selection, quantity/comment dialogs, payment modal, POS
Closing Entry form), not a data gap, and is left as an explicit TODO in
`tests/pos.spec.ts` rather than faked.

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
- `tests/pos.spec.ts` -- app-shell assertion, a now-real (not skipped)
  login -> Tables -> open-a-table golden-path assertion, and one
  remaining `test.skip`'d leg (add items -> KOT -> serve -> POS close)
  with a TODO.
- `tests/self-order.spec.ts` / `tests/mosaic.spec.ts` -- one real,
  passing "app shell mounts" assertion per app, plus a `test.skip`'d
  golden-path test with a TODO describing exactly what's missing to make
  it real (not attempted in round 2 -- scope was the POS captain flow).
