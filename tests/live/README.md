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
