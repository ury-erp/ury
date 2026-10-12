# Running URY's tests

## The warning first

**`bench --site <site> run-tests` deletes data. Never point it at a site you
care about.**

Frappe runs every installed app's `before_tests` hook before it runs anything,
and erpnext's hook contains, verbatim:

```python
frappe.db.sql("delete from `tabItem Price`")
```

On a real site that wipes every published menu price in one go — the exact
failure that took this system's ordering down once already (see
`ury/patches/v2_0/publish_menu_prices.py`). It also completes the setup wizard
and creates a `Wind Power LLC` company if the site has none.

There is no flag that makes this safe. Use a throwaway site, or use the
module runner below.

## Backend

### In CI (the full suite)

`.github/workflows/tests.yml` builds a fresh bench with frappe and erpnext on
`version-15`, installs ury, and runs:

```bash
bench --site ci.localhost run-tests --app ury
```

`--app ury` does two jobs at once. It selects which tests run, and it selects
which apps' `before_tests` hooks fire — `frappe.get_hooks("before_tests",
app_name="ury")` returns only ury's, and ury defines none.

That scoping is also why a developer machine with **hrms** installed cannot run
the suite unscoped: hrms built against v16 imports
`frappe.tests.IntegrationTestCase`, which does not exist in frappe v15, and the
import blows up before a single test runs. Nothing to do with ury. Scope with
`--app ury` and it never loads.

### Locally, one module at a time

```bash
bench --site <site> run-tests --app ury --module ury.ury.api.test_service_requests
```

Safe on any site: no `before_tests` hook runs, so nothing is deleted.

### Locally, the whole suite without bench

The suite is plain `unittest`, so it runs directly inside a site context. This
touches no fixtures and deletes nothing:

```python
# scratch_run_tests.py
import sys, unittest, frappe

frappe.init(site="your.site")
frappe.connect()
frappe.flags.in_test = True

suite = unittest.TestLoader().loadTestsFromNames(sys.argv[1:])
result = unittest.TextTestRunner(verbosity=1).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
```

```bash
cd sites && ../env/bin/python scratch_run_tests.py \
  $(cd ../apps/ury && find ury -name "test_*.py" ! -path "*__pycache__*" \
    | sed 's|/|.|g;s|.py$||' | tr '\n' ' ')
```

What this does *not* give you is the fixture setup `bench run-tests` performs
(`_Test Company`, `_Test Cost Center`, and the rest). Tests that need real
linked masters must therefore resolve them from the site instead of assuming
stock ERPNext fixture names — `ury/ury_pos/test_e2e_p0_p1_flow.py` shows the
pattern, and used to die in `setUp` on every install that had a real company
in it precisely because it did not.

## Frontend

One vitest runner covers every workspace package (`packages/*`, `pos`,
`frontend`, `self-order`). The two Vue apps sit outside the yarn workspace by
design and have no tests.

```bash
yarn test         # once
yarn test:watch   # while working
```

Config lives in `vitest.config.ts` at the repo root. The environment is jsdom,
because several of these exercise browser APIs the POS depends on —
`localStorage` for the offline order queue above all.

## Where the gaps still are

- The frontend suite covers pure logic only. No React component is tested yet.
- `.gitignore` excludes `*.lock`, so there is no committed `yarn.lock` and CI
  resolves dependency ranges fresh on every run. It can legitimately install
  versions no developer has.
