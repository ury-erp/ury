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
	row.warehouse = row.get("direct_retail_warehouse")
	row.company = frappe.db.get_value("Branch", branch, "company")
	if company and row.company and company != row.company:
		return None
	return row
