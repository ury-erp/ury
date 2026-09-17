"""Add a composite index on `URY Stock Reservation` for availability checks.

`ury_reservation_service._active_reservation_qty` / `_RESERVATION_SUM_SQL` and
`ury_inventory_projection.get_active_reservation_qty` both filter on
`component_item`, `warehouse`, `company`, `status` together on every
menu-display and order-acceptance availability check. The doctype only had a
single-column index on `component_item`, so MySQL had to scan every
reservation row for that item and filter the rest in memory. This adds the
matching composite index so the lookup is a single index range scan.

No caching is introduced here: the order-acceptance path must stay
transactionally live (see PLAN.md for this track), so the fix is purely at
the index level.
"""

import frappe

DOCTYPE = "URY Stock Reservation"
TABLE = "tabURY Stock Reservation"
INDEX_NAME = "component_item_warehouse_company_status_index"
COLUMNS = ["component_item", "warehouse", "company", "status"]


def execute():
	if not frappe.db.exists("DocType", DOCTYPE):
		return
	if not all(frappe.db.has_column(DOCTYPE, column) for column in COLUMNS):
		return

	existing = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM information_schema.statistics
		WHERE table_schema = DATABASE()
		  AND table_name = %(table)s
		  AND index_name = %(index_name)s
		""",
		{"table": TABLE, "index_name": INDEX_NAME},
	)[0][0]
	if existing:
		return

	frappe.db.sql(
		f"""
		ALTER TABLE `{TABLE}`
		ADD INDEX `{INDEX_NAME}` (`component_item`, `warehouse`, `company`, `status`)
		"""
	)
	frappe.db.commit()
