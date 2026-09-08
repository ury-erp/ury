# URY Demo Data Seeder

This package contains an idempotent, rerunnable demo-data runner for URY v3.
It seeds the **existing** Company/Branch on a site — it never creates a new
company — and covers both the legacy restaurant workflow and the newer v3
features (stock issues, cost variance, commissions, KOT cancellation,
checklists, feature flags, inventory projection, etc.).

## Run the full seeder

```bash
bench --site ury.localhost execute ury.ury.dev_seed.demo_runner.seed_all
```

You can also pin a specific Company/Branch:

```bash
bench --site ury.localhost execute ury.ury.dev_seed.demo_runner.seed_all \
    --kwargs '{"company_name": "URI", "branch_name": "Demo Branch"}'
```

Because every module is idempotent, the runner is safe to re-run; it will skip
already-created records and only fill in missing data.

## What gets seeded

| Module | What it creates |
|--------|-----------------|
| `catalog` | Items, item prices, URY tables, customers |
| `profiles` | POS Profile, URY Self Ordering Profile, Mode of Payment accounts, POS Opening Entry |
| `operations` | Departments, URY Production Units, aggregator settings, URY Report Settings |
| `more_seed` | Demo wastage, stock reservations, rooms |
| `historical_sales` | ~120 days of submitted POS Invoices, cancelled invoices, draft/open orders, Daily P&L |
| `kot_seed` | URY KOTs across all departments and statuses |
| `kot_error_log_seed` | Sample URY KOT Error Logs |
| `purchasing_seed` | Purchase invoices and related stock data |
| `daily_pnl_seed` | Additional submitted URY Daily P and L documents |
| `stock_issue_seed` | Sales Plans → Issue Authorizations → Stock Movements |
| `cost_variance_seed` | Cost variance sample data |
| `kot_cancellation_seed` | URY KOT Execution cancellation records |
| `inventory_projection_seed` | Inventory projection sample rows |
| `commission_seed` | Commission/loyalty sample data |
| `feature_flag_seed` | URY Feature Flags |
| `checklist_seed` | POS Checklist Items and POS Checklist Logs |

## Tests

```bash
bench --site ury.localhost run-tests --module ury.ury.dev_seed.test_demo_runner
```

The tests verify that `seed_all()` runs without errors, creates the expected
key records (POS Invoices, KOTs, Daily P&L, POS Opening Entry), and is
idempotent across re-runs.
