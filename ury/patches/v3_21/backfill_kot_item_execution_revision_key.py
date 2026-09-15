"""Backfill `URY KOT Item Execution.revision_key` for rows seeded before it existed.

`revision_key` is the new, dedicated identity for "which version of this
order line" -- separate from `idempotency_key`, which is a per-RPC replay
token that the client regenerates for every call and that `_transition`
rewrites on every state change. The G-07 stale-posting gate at POS Invoice
submit (`ury_feature_flags._verify_item_execution_intent`) used to compare
the READY-time copy of `idempotency_key` frozen onto the posting intent
against the row's current one, which after a SERVE could never match: every
normally served made-to-order item was falsely reported as a stale
production posting and the bill could not be settled.

`bench migrate` adds the column, but it lands NULL on existing rows. For an
in-flight order that already has a POSTED intent, leaving it NULL would mean
the intent carries the old `idempotency_key`-derived `accepted_revision`
while the row carries nothing -- so this patch seeds each row with the value
its own latest intent was frozen against, which restores the invariant
("intent revision == row revision") for exactly the orders that are still
open at upgrade time. Rows with no intent fall back to their
`idempotency_key`, which is a stable, already-persisted value and is what a
fresh seed would have produced before this change.

Rows created after this change get their `revision_key` at insert time
(`URYKOTItemExecution.before_insert` and `seed_kot_item_executions`), so this
patch only ever has work to do once.
"""

import frappe

EXECUTION_DOCTYPE = "URY KOT Item Execution"
INTENT_DOCTYPE = "URY Fulfilment Posting Intent"


def execute():
	if not frappe.db.exists("DocType", EXECUTION_DOCTYPE):
		return
	if not frappe.db.has_column(EXECUTION_DOCTYPE, "revision_key"):
		# Column not synced yet (e.g. a partial migrate); nothing safe to do.
		return

	rows = frappe.db.sql(
		f"""
		SELECT name, kot_item, idempotency_key
		FROM `tab{EXECUTION_DOCTYPE}`
		WHERE revision_key IS NULL OR revision_key = ''
		""",
		as_dict=True,
	)
	if not rows:
		return

	has_intents = frappe.db.exists("DocType", INTENT_DOCTYPE)

	for row in rows:
		revision = None
		if has_intents and row.get("kot_item"):
			intent = frappe.get_all(
				INTENT_DOCTYPE,
				filters={"kot_item": row["kot_item"]},
				fields=["accepted_revision"],
				order_by="creation desc",
				limit=1,
			)
			if intent:
				revision = intent[0].get("accepted_revision")
		revision = revision or row.get("idempotency_key") or frappe.generate_hash(length=32)
		frappe.db.set_value(
			EXECUTION_DOCTYPE, row["name"], "revision_key", revision, update_modified=False
		)

	frappe.db.commit()
