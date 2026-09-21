"""Rename URY Driver.last_seen_at to position_updated_at.

Frappe's `set_optional_columns` drops any requested field whose name merely
*contains* one of its optional columns, and `_seen` is one of them — so
`last_seen_at` came back empty from every `get_all` while raw SQL had the
value. The field is a day's worth of ephemeral position data, so this renames
it and lets the old column go rather than migrating anything.
"""

import frappe


def execute():
	if not frappe.db.table_exists("URY Driver"):
		return
	if not frappe.db.has_column("URY Driver", "last_seen_at"):
		return

	if frappe.db.has_column("URY Driver", "position_updated_at"):
		# Schema sync already added the new column; the old one holds at most
		# a few hours of positions that the daily cleanup would erase anyway.
		frappe.db.sql_ddl("ALTER TABLE `tabURY Driver` DROP COLUMN `last_seen_at`")
		return

	frappe.db.sql_ddl(
		"ALTER TABLE `tabURY Driver` CHANGE `last_seen_at` `position_updated_at` DATETIME(6)"
	)
