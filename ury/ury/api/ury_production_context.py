"""Single authoritative resolver for branch-scoped item production context."""

import frappe

from ury.ury.api.ury_production_validation import normalize_production_policy


DOCTYPE = "URY Item Production Configuration"


def resolve_production_context(item, branch, company=None, department=None):
	"""Return one active, branch-scoped production context or ``None``."""
	if not item or not branch:
		return None

	filters = {"item": item, "branch": branch, "active": 1}
	if department:
		filters["department"] = department

	rows = frappe.get_all(
		DOCTYPE,
		fields=[
			"name", "item", "branch", "department", "production_unit",
			"production_policy", "bom", "direct_retail_warehouse",
			"controlled_by_sales_plan", "allow_over_plan_sale", "availability_mode",
		],
		filters=filters,
		limit=2,
	)
	if len(rows) != 1:
		return None

	row = frappe._dict(rows[0])
	row.production_policy = normalize_production_policy(row.get("production_policy"))
	if not row.production_policy:
		return None
	# Finished goods for pre-produced/direct-retail items are held in the
	# explicitly configured retail warehouse. MTO issues components from the
	# production unit's warehouse (with the department warehouse as a narrow
	# fallback for older configurations).
	if row.production_policy in ("PRE_PRODUCED", "DIRECT_RETAIL"):
		row.warehouse = row.get("direct_retail_warehouse")
	else:
		row.warehouse = frappe.db.get_value(
			"URY Production Unit", row.get("production_unit"), "warehouse"
		) or frappe.db.get_value(
			"URY Production Department", row.get("department"), "department_warehouse"
		)
	# Derived from the linked records' own `enabled` field -- neither
	# `production_unit_disabled` nor `department_disabled` is a real column
	# on this doctype, so they cannot come from the `frappe.get_all` row.
	# Absence of a linked production_unit/department is not itself a
	# disabled state -- e.g. PRE_PRODUCED/DIRECT_RETAIL rows have no
	# production_unit at all.
	if row.get("production_unit"):
		row.production_unit_disabled = (
			0
			if frappe.db.get_value("URY Production Unit", row.get("production_unit"), "enabled")
			else 1
		)
	else:
		row.production_unit_disabled = 0
	if row.get("department"):
		row.department_disabled = (
			0
			if frappe.db.get_value("URY Production Department", row.get("department"), "enabled")
			else 1
		)
	else:
		row.department_disabled = 0
	row.company = frappe.db.get_value("Branch", branch, "company")
	if company and row.company and company != row.company:
		return None
	return row
