"""Detect draft BOMs whose stored yield% no longer matches the live Item standard.

Background (Track-Item C1): when an Item's `custom_yield_percent` standard
changes, submitted/historical BOMs correctly keep their old (already-baked-in)
values -- that's correct and by design. But `BOM Item.custom_yield_percent`
is a `fetch_from: item_code.custom_yield_percent` field: it is only read at
BOM-save time and then stored statically on the row. So a DRAFT BOM that
hasn't been resaved since the Item's standard changed silently keeps using
the OLD yield% (and therefore a stale back-calculated raw-material qty --
see `ury.ury.hooks.ury_bom.apply_yield_back_calculation`) until someone
happens to resave it. There was previously no way to identify which draft
BOMs are now stale; this module adds that report.

Detection is direct and needs no new field: a draft BOM is stale exactly
when, for any yield-tracked component row, the row's STORED
`custom_yield_percent` differs (beyond float tolerance) from the component
Item's CURRENT LIVE `custom_yield_percent`.

Permission gating matches `ury_cost_variance_attribution.py` /
`ury_yield_variance.py`'s reporting endpoints: `require_manager()` +
`_require_scope(company)`.
"""

import frappe
from frappe import _

from ury.ury.report_api.utils import require_manager


FLOAT_TOLERANCE = 0.001


@frappe.whitelist()
def get_stale_draft_boms(company, limit=200):
	"""Return draft BOMs whose stored component yield% has drifted from the
	component Item's current live yield% standard.

	Args:
		company: Company name (required, scoped -- matches the
			`get_yield_variance` / `get_yield_check_compliance` convention
			of a single required company rather than iterating all
			companies the caller has scope for).
		limit: Maximum number of stale rows to return (default 200, matches
			get_yield_variance convention).

	Returns:
		One dict per stale ROW (a BOM with multiple stale rows appears
		multiple times, once per stale row -- this keeps each entry
		self-contained and avoids nested per-BOM lists for callers that
		just want a flat, sortable/filterable table):
		[
			{
				"bom": "<BOM name>",
				"bom_item": "<the finished/parent item the BOM produces>",
				"company": "<company>",
				"component_item": "<stale component item_code>",
				"row_idx": <BOM Item row idx>,
				"stored_yield_percent": <float, what the BOM row has>,
				"current_yield_percent": <float, the Item's live value>,
				"diff": <float, current - stored>,
			},
			...
		]
	"""
	require_manager()
	_require_scope(company)

	draft_boms = frappe.get_all(
		"BOM",
		filters={"docstatus": 0, "company": company},
		fields=["name", "item as bom_item", "company"],
	)
	if not draft_boms:
		return []

	bom_names = [b["name"] for b in draft_boms]
	bom_by_name = {b["name"]: b for b in draft_boms}

	rows = frappe.get_all(
		"BOM Item",
		filters={"parent": ["in", bom_names], "parenttype": "BOM"},
		fields=["parent", "idx", "item_code", "custom_yield_percent"],
	)
	if not rows:
		return []

	component_codes = {row["item_code"] for row in rows if row.get("item_code")}
	items = frappe.get_all(
		"Item",
		filters={"name": ["in", list(component_codes)]},
		fields=["name", "custom_yield_tracked", "custom_yield_percent"],
	)
	item_by_code = {item["name"]: item for item in items}

	stale = []
	for row in rows:
		item = item_by_code.get(row["item_code"])
		if not item or not item.get("custom_yield_tracked"):
			continue

		stored_percent = row.get("custom_yield_percent") or 0.0
		current_percent = item.get("custom_yield_percent") or 0.0
		diff = current_percent - stored_percent
		if abs(diff) <= FLOAT_TOLERANCE:
			continue

		bom = bom_by_name[row["parent"]]
		stale.append(
			{
				"bom": bom["name"],
				"bom_item": bom["bom_item"],
				"company": bom["company"],
				"component_item": row["item_code"],
				"row_idx": row["idx"],
				"stored_yield_percent": stored_percent,
				"current_yield_percent": current_percent,
				"diff": diff,
			}
		)

	return stale[:limit]


def _require_scope(company):
	"""Fail closed if company scope is missing, matching the established pattern."""
	if not company:
		frappe.throw(_("Company is required"), frappe.ValidationError)
