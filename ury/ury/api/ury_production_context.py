"""Single authoritative resolver for branch-scoped item production context."""

import frappe

from ury.ury.api.ury_production_validation import normalize_production_policy


DOCTYPE = "URY Item Production Configuration"
BIN_DOCTYPE = "Bin"


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


@frappe.whitelist()
def check_bom_components_stocked(item=None, branch=None, company=None, department=None, bom=None):
	"""Read-only diagnostic for the IPC form (Item 4 / G-13, §5.2 B-2).

	For the item's resolved MADE_TO_ORDER production context, explode `bom`
	(or the context's own `bom` when not supplied -- the form may be showing
	an unsaved `bom` value the DB row doesn't have yet) and report, for each
	leaf component, whether it has a `Bin` row in the resolved warehouse and
	that Bin's `actual_qty`. This never throws on zero/missing stock -- stock
	may legitimately be zero before the first transfer -- it only informs the
	client-side warning banner.

	Returns ``{"warehouse": ..., "components": [{"item_code", "warehouse",
	"has_bin", "actual_qty"}, ...]}``, or ``{"warehouse": None, "components":
	[]}`` if the context/BOM cannot be resolved (e.g. new/incomplete doc).
	"""
	from ury.ury.api.ury_bom_compiler import compile_bom_vector

	if not item or not branch:
		return {"warehouse": None, "components": []}

	context = resolve_production_context(item, branch, company=company, department=department)
	if not context or context.production_policy != "MADE_TO_ORDER":
		return {"warehouse": None, "components": []}

	warehouse = context.get("warehouse")
	if not warehouse:
		return {"warehouse": None, "components": []}

	# `compile_bom_vector` resolves the item's own active/default BOM for
	# (item, company) -- it has no per-call BOM override -- so an explicit
	# `bom` argument here only gates whether we attempt the explosion at all
	# (an unsaved IPC with no bom picked yet has nothing to explode).
	if not (bom or context.get("bom")):
		return {"warehouse": warehouse, "components": []}

	try:
		vector = compile_bom_vector(item, 1, context.company)
	except frappe.ValidationError:
		return {"warehouse": warehouse, "components": []}

	component_items = sorted({row["component_item"] for row in vector["components"]})
	if not component_items:
		return {"warehouse": warehouse, "components": []}

	bins = {
		row.item_code: row.actual_qty
		for row in frappe.get_all(
			BIN_DOCTYPE,
			filters={"item_code": ["in", component_items], "warehouse": warehouse},
			fields=["item_code", "actual_qty"],
		)
	}

	components = [
		{
			"item_code": component_item,
			"warehouse": warehouse,
			"has_bin": component_item in bins and (bins[component_item] or 0) > 0,
			"actual_qty": bins.get(component_item, 0) or 0,
		}
		for component_item in component_items
	]

	return {"warehouse": warehouse, "components": components}
