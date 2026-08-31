"""Permanent, idempotent dev-seed data for `URY KOT Error Log`.

Written because `/ury/kot-error-log` (frontend/src/pages/Dashboard/
KotErrorLogPage.tsx) came up as "POS Profile selector, nothing below it" on
a freshly seeded bench: `frappe.get_all("URY KOT Error Log", ...)` (see
`ury.ury.api.ury_kot_validation.get_kot_errors`) had zero rows to return.
This is NOT a frontend or filter bug -- the POS Profile dropdown itself
resolves correctly (`profiles.py` seeds a "My Restaurant"-branch POS
Profile, and the page's `branch = activeBranchId` filter matches it); the
doctype backing the table below the dropdown was simply never populated by
any seed step.

`URY KOT Error Log` rows are created in production exactly once, by
`create_kot_log()` in `ury/ury/api/ury_kot_validation.py`, as a side effect
of detecting a *duplicate* KOT print/regenerate attempt against an existing
POS Invoice. `kot_seed.py` already creates one `URY KOT` per department
with `type="Duplicate"` (its "duplicate" `TICKET_SPECS` entry) precisely to
represent that scenario on the KDS -- but it only creates the `URY KOT`
doc, never the paired `URY KOT Error Log` entry `create_kot_log()` would
have written for a *real* duplicate event. This module closes that gap by
writing one `URY KOT Error Log` row per seeded "duplicate" KOT, using the
exact field shape `create_kot_log()` uses (kot, invoice,
invoice_creation_time, branch, production, pos_profile), so the page has
real, representative data instead of needing synthetic invented rows.

Idempotent: keyed on `kot` (one error-log row per duplicate KOT), via
`frappe.db.exists`.

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.kot_error_log_seed.seed
"""

import frappe


def seed():
	"""Create one `URY KOT Error Log` row per seeded "duplicate"-type `URY KOT`
	(see `kot_seed.py`), mirroring `create_kot_log()`'s field shape. Depends on
	`kot_seed.seed()` having already run (needs real "Duplicate" KOTs to exist);
	skips gracefully with a message if none are found.
	"""
	duplicate_kots = frappe.get_all(
		"URY KOT",
		filters={"type": "Duplicate", "docstatus": 1},
		fields=["name", "invoice", "production", "pos_profile", "creation"],
	)

	if not duplicate_kots:
		print("dev_seed.kot_error_log_seed: no 'Duplicate'-type URY KOT found -- run kot_seed.seed() first. Skipping.")
		return 0

	created = 0
	for kot in duplicate_kots:
		if frappe.db.exists("URY KOT Error Log", {"kot": kot.name}):
			continue

		invoice_creation_time = None
		branch = None
		if kot.invoice and frappe.db.exists("POS Invoice", kot.invoice):
			invoice_creation_time = frappe.db.get_value("POS Invoice", kot.invoice, "creation")
			branch = frappe.db.get_value("POS Invoice", kot.invoice, "branch")

		log_doc = frappe.get_doc(
			{
				"doctype": "URY KOT Error Log",
				"kot": kot.name,
				"invoice": kot.invoice,
				"invoice_creation_time": invoice_creation_time,
				"branch": branch,
				"production": kot.production,
				"pos_profile": kot.pos_profile,
				"date": kot.creation.date() if kot.creation else None,
				"time": kot.creation.time() if kot.creation else None,
			}
		)
		log_doc.insert(ignore_permissions=True)
		created += 1
		print(f"Created URY KOT Error Log {log_doc.name} for duplicate KOT {kot.name}")

	frappe.db.commit()
	print(f"KOT error log seed complete: {created} row(s) created")
	return created


run = seed
