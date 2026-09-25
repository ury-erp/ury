# Testing

Single entry point for humans and coding agents: `scripts/agent-test-gate.sh`.
It wraps the same checks `.github/workflows/test.yml` runs on every PR to
`v3-stg`, so a local PASS is meant to predict a CI PASS.

```
scripts/agent-test-gate.sh [tier1|tier2|tier3|all]   # default: tier1
```

Each step prints `PASS: <step>` or `FAIL: <step>`, unavailable/skippable
steps print `WARN: <step>`, and the run ends with one greppable line:

```
AGENT-GATE: PASS
AGENT-GATE: FAIL (<failed steps>)
```

Exit code is 0 on pass, 1 on fail. `all` runs tier1 → tier2 → tier3 and
stops after the first tier that fails as a whole (each tier still runs
all of its own steps and reports every failure inside that tier, so you
get the full picture for the tier that failed).

## Test layers

### Tier 1 — fast unit (no bench, target <2 min)

- `scripts/check-backend-test-modules.py` — the same registry check
  that runs as the `module-registry-check` job in CI. Fails if any
  `test_*.py` under `ury/` is not listed (or explicitly excluded with a
  reason) in `scripts/backend-test-modules.txt`.
- `ruff check ury --select F821,F632,E9,B008` — the exact blocking
  subset test.yml runs. (Full-repo ruff has ~900 pre-existing errors
  and is not gated; this narrow subset is clean today and blocking, so
  no *new* violations of these rules can land.) Uses `ruff` if on
  `PATH`, else `uvx ruff`.
- `yarn test` for every JS package CI tests: `frontend`, `pos`,
  `self-order`, `mosaic`, `serve`, `packages/core`, `packages/ui`.
  Blocking `yarn typecheck` for `packages/core` and `packages/ui` only
  (their typecheck is clean and blocking in CI). Other packages' own
  `typecheck`, when present, is run for visibility but does not fail
  the gate — same as CI's `yarn typecheck || true`.
- A package is skipped with a `WARN` (not a failure) if its
  `node_modules` is missing; the warning tells you the install command.

### Tier 2 — backend (needs a bench, target 5–10 min)

Runs `bench --site $URY_TEST_SITE run-tests --app ury --module <m>` for
every module in `scripts/backend-test-modules.txt` (comments and blank
lines skipped) — the single source of truth also read by
`.github/workflows/test.yml` and `test-v16-nightly.yml`. A module
passes if its output contains a line starting with `OK` or
`NO TESTS RAN`.

Requires:

- `URY_BENCH_DIR` — path to the frappe-bench directory (the path inside
  the container when `URY_BENCH_CONTAINER` is set).
- `URY_BENCH_CONTAINER` — optional; docker container that runs the bench.

  ```
  export URY_BENCH_CONTAINER=frappe_docker_devcontainer-frappe-1
  export URY_BENCH_DIR=/opt/benches/<bench>
  ```

- Tier 2 tests the code in the bench's `apps/ury` checkout, not your
  working tree. Make sure the bench app points at (or is synced from) the
  branch under test before running it.
- `URY_TEST_SITE` — the site name to run tests against.

Module selection, in priority order:

1. `URY_MODULES="mod.a mod.b"` — an explicit space-separated list.
2. `--changed <ref>` — maps `.py` files changed vs. `<ref>` to test
   modules (same-directory `test_*.py` files, plus a name match),
   intersected with the registry in `backend-test-modules.txt`.
3. Otherwise, every module in `scripts/backend-test-modules.txt`.

### Tier 3 — e2e (needs a live site, target <15 min)

Runs the Playwright suite under `e2e/`:

```
cd e2e && npx playwright test
```

Requires `URY_BASE_URL` pointing at a running, fully-built instance
(frontend/pos/self-order/mosaic apps built and served by that site).
Set `E2E_PROJECTS` to restrict to specific Playwright projects.

Note: `e2e/` is not wired into `.github/workflows/test.yml` today — it
is currently orphaned from CI. Running it locally via tier 3 is the
only way it gets exercised until that's wired up.

## Adding a backend test

Any new `test_*.py` under `ury/` **must** be added to
`scripts/backend-test-modules.txt` (as its dotted module path), or CI's
`module-registry-check` job fails the PR. Add a `# reason` comment on
an excluded line if a module is deliberately not run.

Prefer the shared factories in `ury/ury/tests/factories.py`
(`make_branch`, `make_customer`, `make_item`, `make_pos_profile`,
`make_user`) over hand-rolled `frappe.get_doc(...).insert()` calls —
they are idempotent get-or-create helpers built specifically to stop
that duplication. Restaurant and Menu doctypes do not have a shared
factory yet; follow the same get-or-create pattern if you add one.

## Rules

- **A bug fix ships with a test that fails before the fix.** If you
  cannot write a reproducing test, say so explicitly in the PR instead
  of skipping it silently.
- **Tests assert product intent.** If a product decision changes
  behavior, update the test in the same PR and cite the decision (a
  commit, an issue, or a one-line note in the test) — don't leave the
  old assertion in place as a false signal for the next change.
