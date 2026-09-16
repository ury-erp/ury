"""Backfill `URY Sales Plan.docstatus` to match its workflow `status`.

`URY Sales Plan` only recently became `is_submittable: 1`, and its Workflow
(``ury/fixtures/workflow.json``) now maps each state onto a `doc_status`:

    Draft / Proposed / Submitted for Approval -> 0 (Draft)
    Approved / Locked for Production          -> 1 (Submitted)
    Superseded/Cancelled                      -> 2 (Cancelled)

Every row that existed before that change -- and every row a dev_seed script
created by assigning `.status` directly, bypassing the workflow engine --
still carries `docstatus = 0` no matter what its `status` says. Frappe's real
permission, edit-lock and cancel machinery keys off `docstatus`, not off this
app's `status` field, so such a row is stuck in a state it can never leave:

  * it cannot be cancelled, because `Document.check_docstatus_transition`
    only permits 1 -> 2 and explicitly raises `DocstatusTransitionError`
    ("Cannot change docstatus from 0 (Draft) to 2 (Cancelled)") for 0 -> 2;
  * meanwhile it remains fully editable and deletable, because nothing in
    Frappe treats `status = "Approved"` as submitted.

This patch repairs those rows with a single raw `UPDATE` per state bucket.
It deliberately does NOT go through `doc.submit()` / `doc.cancel()`: those
re-run `validate()` and the whole Sales Plan business chain (production
context resolution, BOM staleness flags, item production configuration
validation, overlap checks) against historical data whose referenced Items,
BOMs and Production Units may no longer validate -- which would either fail
the migration outright or silently rewrite frozen historical plans. The
docstatus column is pure bookkeeping here; the `status` field already is the
source of truth and is left untouched.

Idempotent: rows already carrying the right docstatus are excluded by the
WHERE clause, so a re-run is a no-op.
"""

import frappe

DOCTYPE = "URY Sales Plan"

# status value -> docstatus, mirroring `doc_status` in the "URY Sales Plan"
# Workflow fixture. Keep these two in sync.
STATUS_DOCSTATUS_MAP = {
	"Draft": 0,
	"Proposed": 0,
	"Submitted for Approval": 0,
	"Approved": 1,
	"Locked for Production": 1,
	"Superseded/Cancelled": 2,
}


def execute():
	if not frappe.db.exists("DocType", DOCTYPE):
		return

	table = f"tab{DOCTYPE}"

	# Group statuses by target docstatus so this is at most three UPDATEs.
	by_docstatus = {}
	for status, docstatus in STATUS_DOCSTATUS_MAP.items():
		by_docstatus.setdefault(docstatus, []).append(status)

	for docstatus, statuses in sorted(by_docstatus.items()):
		frappe.db.sql(
			f"""
			UPDATE `{table}`
			SET docstatus = %(docstatus)s
			WHERE status IN %(statuses)s
			  AND docstatus != %(docstatus)s
			""",
			{"docstatus": docstatus, "statuses": tuple(statuses)},
		)

	frappe.db.commit()
