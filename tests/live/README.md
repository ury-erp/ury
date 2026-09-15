# tests/live/ — Live-bench adversarial testing toolkit

This is a **manual, pre-merge-gate toolkit**, not a CI suite. It is deliberately slow and
infra-heavy: it drives real HTTP traffic against a real, disposable Frappe bench and inspects
the real DB for invariant violations under concurrency. Run it by hand before merging
high-risk changes — production-control logic, KOT routing, POS closing, stock
reservation/order-lifecycle changes — not on every PR.

It generalizes the pattern used in an earlier one-off investigation
(`sa-production-control-unification`'s `harness.py` / `db_sampler.py` / `invariant_checker.py`,
which were never committed to this repo). These are the checked-in, reusable equivalents.

## Components

- `actor_harness.py` — HTTP order-lifecycle actor harness. Spins up N concurrent "actors",
  each repeatedly driving an order through create → add items → submit → pay → close against
  a live bench's `/api/method/...` endpoints. Config-driven endpoint names so it isn't tied
  to one specific doctype/flow.
- `invariant_checker.py` — connects to the bench's DB (via `frappe.db` under `bench execute`,
  or a raw PyMySQL connection standalone) and checks:
  - **no-oversell**: no Bin ever shows negative available stock (`actual_qty - reserved_qty < 0`)
    unless the item is explicitly flagged to allow negative stock.
  - **reservation-atomicity**: every active Stock Reservation Entry (or equivalent) points at
    a real, non-cancelled order — no orphaned reservations.
  - **audit-log-completeness**: every order that reached a submitted/cancelled state has at
    least one corresponding `Version` row recording that transition.
- `db_sampler.py` — polls `information_schema.INNODB_TRX` / lock-wait views and
  `SHOW ENGINE INNODB STATUS` at a fixed interval, writing JSONL samples. Run concurrently
  with the actor harness to catch locking/deadlock behavior under load.
- `config.example.json` — template config (bench URL, credentials, endpoint names, DB
  connection, invariant-check table/field names). Copy to `config.json` (gitignored) per
  investigation; never commit real credentials.

## Real ury_pos fixture/endpoint shape (reverse-engineered, Phase 6 round 2)

Round 1 of this toolkit reached a live bench but never actually drove a real order --
`config.example.json`'s `create`/`add_item`/`submit`/`pay`/`close` endpoint names were
placeholders (`ury.pos.api.order.*`), which do not exist. Round 2 reverse-engineered the
real shape by reading `ury/ury/doctype/ury_order/ury_order.py` and
`ury/ury/dev_seed/historical_sales.py` (which documents the same fixture problem for its
own seed data) end to end. The real picture:

- **No generic create/add_item/submit/pay/close split.** One whitelisted method,
  `ury.ury.doctype.ury_order.ury_order.sync_order`, both creates a draft `POS Invoice`
  (first call, `invoice=None`, `table=<name>`) and re-syncs its full item list on every
  subsequent call for the same table/invoice (`invoice=<name>`). A second whitelisted
  method, `ury.ury.doctype.ury_order.ury_order.make_invoice`, applies the payment rows
  AND calls `invoice.submit()` in one step -- there is no separate submit endpoint. Table
  closing/settlement (freeing the table) happens as a side effect of `make_invoice`, not
  a separate `close` call; per-table-group *POS Closing Entry* is a distinct, batch-level
  doctype out of scope for this per-order harness.
- **`sync_order`'s required args**: `items` (list of `{item, item_name, rate, qty}`),
  `cashier`, `owner`, `waiter` (existing `User` names -- a system user with `URY Cashier`/
  `URY Captain` role; also grant `System Manager` to a scripted actor to bypass the
  branch/room-assignment permission checks `sync_order` otherwise enforces via
  `ury_pos.api.getBranch`/`getRoom`), `mode_of_payment`, `customer` (existing `Customer`
  name), `no_of_pax`, `pos_profile` (existing `POS Profile` name), `table` (existing
  `URY Table` name), `invoice`/`last_invoice` (`None` on create).
- **`make_invoice`'s required args**: `customer`, `payments` (list of
  `{mode_of_payment, amount}` -- amount should cover the invoice's `grand_total`/
  `rounded_total` from the last `sync_order` response, matching the "dummy payment"
  convention `historical_sales.py` also uses), `cashier`, `pos_profile`, `owner`, `table`,
  `invoice` (the name returned by `sync_order`).
- **Item fixtures**: an `Item` needs an `Item Price` row under the `POS Profile`'s
  `selling_price_list` (see `price_items_for_invoice` in `ury_order.py`) to be sellable.
  Menu items in this app are **not stock-tracked** (`is_stock_item=0`) -- oversell risk
  is enforced through `URY Item Production Configuration` / `URY Stock Reservation` /
  `URY Sales Plan` (a production-capacity model), not through ERPNext `Bin` rows. The
  generic `no_oversell` (`tabBin`) check in this toolkit does **not** apply to this app's
  menu items; see `config.example.json`'s `no_oversell._comment`.
- **Reservation doctype**: `URY Stock Reservation` (`order_ref`, `status` in
  `Reserved`/`Fulfilled`/`Released` -- see `ury/ury/api/ury_reservation_service.py`), not
  ERPNext's `Stock Reservation Entry`. `invariant_checker.py`'s `reservation_atomicity`
  check now takes an explicit `active_statuses` config key for exactly this case (added
  in round 2) -- pass `["Reserved"]`, don't rely on the generic Cancelled/Delivered
  terminal-state exclusion, which silently misclassifies `Fulfilled`/`Released` rows too.
- **Auth against a bench's raw dev-server port**: `sa-testcov-verify` (and similarly
  provisioned benches) serve on a container-internal port (e.g. `:8114`), not through a
  hostname-routed proxy. Frappe resolves the site purely off the `Host` header in
  multi-tenant mode, so `BenchClient` now accepts a `host_header` config key -- without
  it every request 404s against the wrong (default) site. Auth used an API key/secret
  generated via `bench execute frappe.core.doctype.user.user.generate_keys --args
  '["user@example.com"]'` for a user role-eligible to place orders.

### Round 2 result: a real, reproducible data bug blocked every order on `sa-testcov-verify`

With the fixture shape correctly reverse-engineered and the harness pointed at a real,
already-running bench (`sa-testcov-verify`, port 8114, found already up from another
session's work -- reused per this track's "use an existing bench if available" guidance,
not re-provisioned), every single `sync_order` call failed, deterministically, for every
menu item:

```
417 Client Error: EXPECTATION FAILED
ValidationError: Warehouse Finished Goods - _TC7 does not belong to company _Test Company
```

Root-caused, not just observed: `Branch "Demo Branch".company` is `_Test Company 7`, but
`POS Profile "Demo Branch".company` is `_Test Company` -- a pre-existing data
inconsistency on this shared bench, unrelated to this track's own changes. Every menu
item's `URY Item Production Configuration` on this branch resolves its fulfillment
warehouse through `URY Production Department.department_warehouse`, which was itself
seeded pointing at `Finished Goods - _TC7` (a warehouse under `_Test Company 7`, matching
the Branch's own inconsistent company) while the `POS Invoice` being created inherits
`_Test Company` from the `POS Profile`. `erpnext`'s own `validate_warehouse()` then
correctly rejects the mismatch. This reproduced identically at concurrency 3 (3 actors x
2 orders = 6/6 errored, same message every time) -- see `EXECUTION_LOG.md` for the raw
harness output.

This is bench-wide, not item-specific: every `Item` on `Demo Branch` routes through the
same 4 misconfigured `URY Production Department` rows (confirmed via direct SQL — all
four have `department_warehouse = "Finished Goods - _TC7"`), so no menu item on this
branch can currently complete a real `sync_order`. A workaround was attempted (create one
new, isolated demo `Item` with its own `URY Item Production Configuration` row using a
Direct-Retail policy and a company-correct warehouse) but hit the *same* Branch/company
mismatch during that doctype's own `validate_link_ownership()` company-scope check, since
the check compares against the Branch's (broken) company, not the POS Profile's. Per this
track's explicit "don't disrupt concurrent work" instruction, this bench's shared
`Branch`/`URY Production Department` data was **not** mutated to fix this -- the one
attempted additive `Item`/`Item Price` was rolled back after the workaround also failed,
leaving the bench exactly as found. Fixing `Branch "Demo Branch".company` (or the four
`department_warehouse` values) to be consistent would very likely unblock real order
placement on this bench; that fix was left undone here since it touches shared state
another investigation may depend on.

### Invariant checker: ran for real, found false positives from decorative seed data

With the actor harness blocked from creating live data, the invariant checker was still
run for real against `sa-testcov-verify`'s **existing** DB state (standalone mode, via
`env/bin/python3 tests/live/invariant_checker.py --config tests/live/config.json
--standalone`, connecting directly with the site's own DB credentials from
`site_config.json` -- no `PROCESS` privilege needed for this checker, unlike
`db_sampler.py`). It reported 4 `reservation-atomicity` violations: `URY Stock
Reservation` rows in status `Reserved` whose `order_ref` (`ORD-2001`, `ORD-2002`,
`ORD-2003`, `ORD-2005`) does not match any real `POS Invoice`.

Investigated, not taken at face value: these are **not real orphaned reservations**.
`ury/ury/dev_seed/more_seed.py::_seed_stock_reservations()` seeds exactly these rows with
synthetic placeholder `order_ref` values (`f"ORD-{2000 + i + 1}"`) purely for
dashboard/report demo data -- they were never meant to reference a real order document
(there is no `URY Order`/`Sales Order` doctype with that naming series at all on this
site). This is a real, useful finding about the *toolkit*, not the app: the generic
`reservation_atomicity` check has no way to distinguish "genuinely orphaned" from
"intentionally-decorative demo data," so a bench seeded via `more_seed.py` will always
show these 4 as false-positive violations. Anyone reusing this checker against a
demo-seeded bench should expect and filter these (e.g. via `since_clause` scoped to a
time window, or by excluding known dev-seed `reservation_group` values) rather than
treating every reported violation as a live bug.

## Standard procedure

## Standard procedure

1. **Provision a disposable bench.** Use the `frappe-multihand` tooling (`mh new <name>`,
   e.g. `mh new sa-testcov-verify`) inside the devcontainer to get an isolated bench/site
   backed by the shared MariaDB/Redis services, on the branch under test. See the
   `frappe-multihand` skill for exact flags if they've changed since this was written.

2. **Seed test data.** Create a handful of test items with known starting stock levels
   (`TEST-ITEM-001` etc.), a test branch/warehouse, and a payment mode. A minimal seed script
   or `bench execute` snippet is expected per investigation — this toolkit does not ship one
   because required doctypes/fields vary by what's under test.

3. **Fill in `config.json`** from `config.example.json`: bench URL, an API key/secret (or
   session cookie) for a user allowed to place orders, the actual whitelisted method paths
   for create/add_item/submit/pay/close, the seeded item pool, and DB credentials (same
   MariaDB the bench uses — usually `mariadb` host inside the devcontainer network, database
   name matching the site).

   Note: `db_sampler.py`'s `INNODB_TRX`/`SHOW ENGINE INNODB STATUS` queries require the
   `PROCESS` privilege. A site's normal per-site DB user (the one in `site_config.json`) does
   NOT have this by default — confirmed against a real bench, where the sampler ran end-to-end
   but every sample recorded an `Access denied; you need (at least one of) the PROCESS
   privilege(s)` error. Use the MariaDB root user (or a user explicitly granted `PROCESS`) for
   `db.user`/`db.password` in `config.json` when you actually need lock/deadlock visibility.

4. **Start the DB sampler** in one terminal, running for at least as long as the harness:
   ```
   python3 tests/live/db_sampler.py --config tests/live/config.json \
       --interval 2 --duration 180 --out tests/live/lock_samples.jsonl
   ```

5. **Run the actor harness** at modest concurrency (5–10 actors is the recommended default —
   enough to expose real races without saturating a dev-grade bench):
   ```
   python3 tests/live/actor_harness.py --config tests/live/config.json \
       --concurrency 8 --orders-per-actor 5 --out tests/live/results.jsonl
   ```

6. **Run the invariant checker** once the harness finishes (give the bench a few seconds to
   settle any async jobs):
   ```
   bench --site sa-testcov-verify.localhost execute tests/live/invariant_checker.py:main \
       --kwargs "{'config': 'tests/live/config.json'}"
   ```
   or, standalone (outside a bench context, using the raw DB connection):
   ```
   python3 tests/live/invariant_checker.py --config tests/live/config.json --standalone
   ```

7. **Inspect `lock_samples.jsonl`** for any sample with a non-empty `trx`/`lock_waits` list
   sustained across multiple consecutive samples (a normal, short-lived lock during a submit
   is expected; a lock held across many samples, or an `innodb_status_excerpt` deadlock
   report, is worth investigating).

8. **Write up a report** alongside the change under review: what was seeded, actor/orders
   counts, invariant checker pass/fail with any violation detail, and any lock/deadlock
   findings from the sampler. Attach `results.jsonl` / `lock_samples.jsonl` or a summary if
   the raw files are large. Treat a clean run as necessary-but-not-sufficient evidence —
   this catches concurrency bugs the harness happens to trigger, not all possible races.

9. **Tear down the disposable bench** (`mh` teardown command) once done; don't leave it
   running as an unmonitored, credentialed target.

## What this is NOT

- **Not CI-automated.** It needs a live bench with real data and is slow by nature. Do not
  wire it into any CI workflow or shard matrix — it stays a manual gate a human runs before
  merging a high-risk PR.
- **Not a replacement for unit/integration tests.** It complements them by exercising real
  concurrency and real DB state, which mocked tests structurally cannot catch.
- **Not exhaustive.** A clean run reduces risk; it does not prove correctness. Concurrency
  bugs are probabilistic — consider running more than once, and at higher concurrency, for
  especially high-risk changes.
