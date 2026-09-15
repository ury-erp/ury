"""T2 (sa-pos-stock-phase2): migrate the retired site-wide
`URY Feature Flags.pos_stock_authority_v2` Single flag into the new
per-branch, per-concern `URY Branch Stock Policy` doctype (T1 / I-1).

Read `ury.ury.api.ury_stock_policy` and `ury.ury.api.ury_feature_flags`
before changing anything here -- both document the full rationale for the
tier model and why the old flag is now a deprecated shim.

WHAT THIS DOES: on any site where the old flag was `1`, that meant Tier 2
was fully, unconditionally active for every branch -- there was no
per-branch or per-gate distinction under the old model. To preserve that
exact behaviour across the upgrade (so no site silently reverts to Tier 1
just because the storage moved), this patch creates one `URY Branch Stock
Policy` row per `Branch` with all three gates
(`reservation_control_enabled`, `realtime_production_posting_enabled`,
`closing_reconciliation_enabled`) set to 1 -- the only combination that is
a faithful translation of "the old flag was on".

If the old flag is `0`, or the old `URY Feature Flags` doctype/table/field
doesn't exist at all (fresh install, or a site that already migrated and
had its Single row's storage removed), this patch is a strict no-op.

IDEMPOTENT: guarded by `frappe.db.exists` per branch (branch is `unique`
per T1's schema, via `autoname: field:branch`), so re-running never creates
duplicates and never errors.

SAFE ON FRESH INSTALL: guarded by `frappe.db.exists("DocType", ...)` /
a `DocField` existence check on the OLD doctype/field -- **not**
`frappe.db.table_exists`, which is the wrong check for a Single. A Single
doctype's values live in the shared `tabSingles` table (rows keyed by
`(doctype, field)`), never in a physical `tab<DocType>` table of its own,
so `table_exists("URY Feature Flags")` returns `False` unconditionally
regardless of whether the doctype exists or the flag was ever set -- an
earlier version of this patch used exactly that check and was silently a
complete no-op on every site, discovered via live-bench verification
(see tracks/sa-pos-stock-phase2/LIVE_VERIFICATION.md). The correct
existence check for a Single is on the DocType/DocField metadata, not the
storage table.

Must run after `URY Branch Stock Policy` itself exists. T1 reports the
doctype is installable directly via `bench migrate`'s doctype sync (no
patch needed for the doctype creation itself), and doctype sync always
runs before `post_model_sync` patches such as this one, so no explicit
`frappe.db.table_exists` guard on the NEW doctype is required -- but one is
included anyway as defense in depth, matching this module's own
fail-closed philosophy: if the new table somehow isn't there yet, do
nothing rather than raise.
"""

import frappe
from frappe.utils import now

OLD_FLAG_DOCTYPE = "URY Feature Flags"
OLD_FLAG_FIELD = "pos_stock_authority_v2"
NEW_POLICY_DOCTYPE = "URY Branch Stock Policy"


def execute():
	if not frappe.db.table_exists(NEW_POLICY_DOCTYPE):
		# Doctype sync should always have created this before post_model_sync
		# patches run. Fail closed (do nothing) rather than raise if it
		# somehow hasn't.
		return

	if not frappe.db.exists("DocType", OLD_FLAG_DOCTYPE):
		# The retired doctype has been removed entirely (or never existed on
		# a fresh install) -- nothing to migrate.
		return
	if not frappe.db.exists("DocField", {"parent": OLD_FLAG_DOCTYPE, "fieldname": OLD_FLAG_FIELD}):
		# The doctype survived but the specific field was dropped from it --
		# same as above, nothing to read.
		return

	try:
		old_flag_value = frappe.db.get_single_value(OLD_FLAG_DOCTYPE, OLD_FLAG_FIELD)
	except Exception:
		# Belt-and-braces: any unexpected error reading a Single's stored
		# value (e.g. a malformed tabSingles row) fails closed to "nothing to
		# migrate" rather than aborting the whole migrate run.
		frappe.log_error(
			frappe.get_traceback(),
			"migrate_stock_authority_flag_to_branch_policy: could not read old flag value",
		)
		return
	if not old_flag_value:
		return

	branches = frappe.get_all("Branch", pluck="name")
	if not branches:
		return

	migrated = 0
	timestamp = now()
	for branch in branches:
		if frappe.db.exists(NEW_POLICY_DOCTYPE, {"branch": branch}):
			# Already migrated (or an operator already created a row for
			# this branch out of band) -- never overwrite an existing row.
			continue

		doc = frappe.new_doc(NEW_POLICY_DOCTYPE)
		doc.branch = branch
		doc.reservation_control_enabled = 1
		doc.realtime_production_posting_enabled = 1
		doc.closing_reconciliation_enabled = 1
		doc.enabled_by = "Administrator"
		doc.enabled_on = timestamp
		doc.insert(ignore_permissions=True)
		migrated += 1

	frappe.db.commit()

	frappe.logger("ury_stock_policy").info(
		"migrate_stock_authority_flag_to_branch_policy: old site-wide "
		"pos_stock_authority_v2 flag was enabled; created %s URY Branch "
		"Stock Policy row(s) (all gates on) out of %s total branch(es).",
		migrated,
		len(branches),
	)
