"""Permanent, idempotent demo-data seed package for the URY app.

Run the full set in dependency order via:

    bench --site <site> execute ury.ury.dev_seed.run_all

Each submodule is independently idempotent (safe to re-run). Order matters
on first run: catalog (items/tables/customers) and profiles (POS/Self
Ordering Profile) have no dependencies on each other and could run in
either order, but historical_sales depends on both (needs real items,
tables, and a POS Profile to create valid POS Invoices against).
"""

import frappe

from ury.ury.dev_seed import (
	catalog,
	daily_pnl_seed,
	historical_sales,
	kot_seed,
	more_seed,
	operations,
	profiles,
	purchasing_seed,
)


def run_all():
	print("=== dev_seed: catalog ===")
	catalog.seed()

	print("=== dev_seed: profiles ===")
	profiles.seed()

	print("=== dev_seed: operations ===")
	operations.seed()

	print("=== dev_seed: more_seed ===")
	more_seed.seed()

	print("=== dev_seed: historical_sales ===")
	historical_sales.seed()

	print("=== dev_seed: kot_seed ===")
	kot_seed.seed()

	print("=== dev_seed: purchasing_seed ===")
	purchasing_seed.seed()

	print("=== dev_seed: daily_pnl_seed ===")
	daily_pnl_seed.seed()

	frappe.db.commit()
	print("=== dev_seed: done ===")


# Alias matching the bench execute convention used elsewhere in this codebase.
run = run_all
