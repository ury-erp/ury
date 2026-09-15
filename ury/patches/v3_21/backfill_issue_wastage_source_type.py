"""Backfill `URY Issue Wastage.source_type` for rows that predate the column.

`URY Issue Wastage` gained a `source_type` discriminator when the POS
KOT-cancellation write-off route landed. Every row written before that is, by
definition, an Issue-Authorization-sourced row, but MariaDB fills the new
column with NULL for existing rows rather than with the doctype default.

This matters because those rows decrement issue entitlement. If anything ever
discriminated them with a SQL predicate (`source_type = 'Issue Authorization'`
or `source_type != 'KOT Cancellation'` -- both are false/unknown for NULL),
real approved wastage would silently stop counting and a department's material
budget would quietly grow.

`ury.ury.api.ury_issue_authorization.sum_issue_sourced_wastage()` does NOT
depend on this patch: it discriminates in Python and treats a missing
`source_type` as "Issue Authorization", which is correct on a migrated and an
un-migrated schema alike. This patch exists so Desk list views, standard
filters and reports see a populated discriminator, and so the column is
trustworthy for any future direct query.
"""

import frappe

WASTAGE_DOCTYPE = "URY Issue Wastage"
SOURCE_ISSUE_AUTHORIZATION = "Issue Authorization"


def execute():
	if not frappe.db.exists("DocType", WASTAGE_DOCTYPE):
		return
	if not frappe.db.has_column(WASTAGE_DOCTYPE, "source_type"):
		return

	frappe.db.sql(
		"""
		UPDATE `tabURY Issue Wastage`
		SET source_type = %(source_type)s
		WHERE source_type IS NULL OR source_type = ''
		""",
		{"source_type": SOURCE_ISSUE_AUTHORIZATION},
	)
