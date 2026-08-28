"""V3-61: Integrate SELECTED batch flows with ERPNext Work Orders.

Scope (deliberately conservative, additive-only, mirrors V3-51/52/53/54/60):

- This module is a pure, read-only ADAPTER/MAPPING layer. It never calls
  `.insert()`, `.save()`, or `.submit()` on any document, and never creates a
  real ERPNext Work Order or Stock Entry. `build_work_order_draft` returns a
  plain dict shaped like a Work Order's key fields -- evidence of what a
  LATER, separately-reviewed task would need to actually post it. Posting is
  explicitly out of scope for this task.
- This module is not imported by, and does not import, any live order/KOT
  execution path. Nothing calls into it today -- it exists to prove batch
  Work Order integration *can* be mapped safely, without being wired into
  anything (same pattern as V3-60's workstation mapping).
- "Selected batch flows only" is structural, not just documented:
  `is_batch_eligible` requires an explicit, caller-supplied opt-in flag
  (representing a future config field this task does not invent or apply)
  AND hard-codes a rejection of `production_policy == "MADE_TO_ORDER"`
  regardless of that flag's value. This is the safeguard for TODO.md's
  "must NOT touch: every-plate Work Order" -- per-order/made-to-order plates
  can never become eligible for Work Order integration through this module,
  no matter what any config flag says. Only batch-produced items (this
  task's working definition: items produced in bulk ahead of demand, i.e.
  GOAL.md's "pre-produced"/PRE_PRODUCED policy family from V3-13/V3-40, such
  as sauces or doughs made in advance -- NOT per-order plates) can opt in,
  and only when a future config explicitly says so.
- `trace_batch_integration` is the "batch integration trace" evidence
  artifact named in TODO.md's Output column: it runs the eligibility check
  and (when eligible) the draft mapping together, and returns a structured
  record of the decision, the draft, and the validation checks performed.
  A static example of this trace's shape is also written to
  `tracks/sa-v3_nxt/outputs/V3-61-batch-integration-trace-example.md`.

Company/BOM lookup reuses the same active-BOM resolution pattern as V3-41's
`ury_bom_compiler.compile_bom_vector` (read-only `frappe.db.get_value` against
`BOM`, filtered by `item`, `is_active`, `docstatus`), so this module never
re-implements or diverges from that BOM-resolution contract.
"""

from __future__ import annotations

import frappe

MADE_TO_ORDER_POLICY = "MADE_TO_ORDER"
PRE_PRODUCED_POLICY = "PRE_PRODUCED"

BOM_DOCTYPE = "BOM"
WORK_ORDER_DOCTYPE = "Work Order"


def is_batch_eligible(item_code: str, production_policy: str, batch_opt_in_flag: bool) -> tuple[bool, str]:
	"""Pure predicate: is `item_code` eligible for Work Order integration?

	Returns `(eligible: bool, reason: str)`. Never raises, never reads or
	writes any document -- takes only the three explicit inputs and decides.

	Structural safeguard (cannot be bypassed by any flag value): an item
	whose `production_policy` is `MADE_TO_ORDER` (per-order, made-to-order
	plate execution -- "every plate") is NEVER eligible, regardless of
	`batch_opt_in_flag`. This directly matches TODO.md's "must NOT touch:
	every-plate Work Order" constraint.

	Beyond that hard rule, eligibility requires an explicit opt-in: this
	function does NOT infer eligibility from `production_policy` alone (e.g.
	it does not assume every `PRE_PRODUCED` item is automatically eligible).
	`batch_opt_in_flag` stands in for a future per-item/per-policy config
	field that does not exist yet on any site; until that field is designed
	and applied, callers must pass the flag explicitly and this module
	invents no implicit default that could silently expand scope.
	"""
	if not item_code:
		return False, "item_code is required"

	policy = (production_policy or "").upper()

	if policy == MADE_TO_ORDER_POLICY:
		return False, (
			"MADE_TO_ORDER items are structurally excluded from Work Order "
			"integration (per-order/every-plate execution is out of scope; "
			"see TODO.md 'must NOT touch: every-plate Work Order')"
		)

	if not batch_opt_in_flag:
		return False, (
			f"item {item_code} (policy={policy or 'UNSET'}) is not opted in "
			"for batch Work Order integration (batch_opt_in_flag is falsy)"
		)

	return True, (
		f"item {item_code} (policy={policy or 'UNSET'}) is explicitly opted in "
		"for batch Work Order integration"
	)


def build_work_order_draft(
	item_code: str,
	qty: float,
	company: str,
	warehouse: str,
	workstation: str | None = None,
) -> dict:
	"""Pure, read-only mapping to a Work Order-shaped draft dict.

	Looks up the item's active BOM (read-only, same resolution contract as
	V3-41's `_resolve_active_bom`) and returns a plain dict using the real
	ERPNext Work Order field names (`erpnext/manufacturing/doctype/work_order/
	work_order.json`): `production_item`, `bom_no`, `qty`, `company`,
	`fg_warehouse`, `wip_warehouse`, `planned_start_date`, and (when supplied)
	`workstation`.

	NEVER calls `frappe.get_doc(...).insert()/.save()/.submit()`, never
	writes via `frappe.db.set_value`, and never creates a `Work Order` or
	`Stock Entry` document -- this function only reads (`frappe.db.get_value`
	against `BOM`) and returns a dict literal. `warehouse` is used for both
	`fg_warehouse` and `wip_warehouse` in this conservative draft (a later,
	separately-reviewed task may split these); `planned_start_date` is left
	as `None` -- a placeholder for the caller/scheduler to fill in, since
	this module has no scheduling authority.
	"""
	if qty is None or qty <= 0:
		frappe.throw(frappe._("Quantity must be greater than zero"), frappe.ValidationError)

	bom_no = _resolve_active_bom(item_code, company)

	draft = {
		"doctype": WORK_ORDER_DOCTYPE,
		"production_item": item_code,
		"bom_no": bom_no,
		"qty": qty,
		"company": company,
		"fg_warehouse": warehouse,
		"wip_warehouse": warehouse,
		"planned_start_date": None,
	}
	if workstation:
		draft["workstation"] = workstation

	return draft


def trace_batch_integration(item_code: str, qty: float, company: str, warehouse: str) -> dict:
	"""Run eligibility + draft mapping together and return a structured trace.

	This is the "batch integration trace" evidence artifact TODO.md's Output
	column names for V3-61. It does not accept `production_policy` or
	`batch_opt_in_flag` directly on its own signature; instead it looks them
	up via `frappe.db.get_value` from `Item.ury_production_policy` (the
	V3-13/V3-40 policy field) and `Item.ury_batch_wo_opt_in` (a PROPOSED
	future flag field, checked defensively -- see `_field_exists` below --
	so this trace degrades gracefully rather than erroring on any site where
	that field has not been applied, same non-breaking pattern as V3-60).

	Returns:
		{
			"item_code": ..., "qty": ..., "company": ..., "warehouse": ...,
			"production_policy": ...,
			"batch_opt_in_flag": ...,
			"eligible": bool,
			"reason": str,
			"draft": dict | None,   # None when not eligible
			"checks": [str, ...],   # ordered list of validation checks performed
		}

	Never mutates anything: only reads via `frappe.db.get_value` and calls
	the pure functions above.
	"""
	checks = []

	production_policy = frappe.db.get_value(_item_doctype(), item_code, "ury_production_policy")
	checks.append(f"read production_policy for {item_code}: {production_policy!r}")

	batch_opt_in_flag = False
	if _field_exists(_item_doctype(), "ury_batch_wo_opt_in"):
		batch_opt_in_flag = bool(frappe.db.get_value(_item_doctype(), item_code, "ury_batch_wo_opt_in"))
		checks.append(f"read ury_batch_wo_opt_in for {item_code}: {batch_opt_in_flag!r}")
	else:
		checks.append(
			"ury_batch_wo_opt_in field not applied on this site; treated as opt_in=False "
			"(fails closed, never defaults to eligible)"
		)

	eligible, reason = is_batch_eligible(item_code, production_policy, batch_opt_in_flag)
	checks.append(f"is_batch_eligible -> eligible={eligible}, reason={reason!r}")

	draft = None
	if eligible:
		draft = build_work_order_draft(item_code, qty, company, warehouse)
		checks.append("build_work_order_draft -> produced read-only draft dict (no doc created)")
	else:
		checks.append("build_work_order_draft skipped (item not eligible)")

	return {
		"item_code": item_code,
		"qty": qty,
		"company": company,
		"warehouse": warehouse,
		"production_policy": production_policy,
		"batch_opt_in_flag": batch_opt_in_flag,
		"eligible": eligible,
		"reason": reason,
		"draft": draft,
		"checks": checks,
	}


# --- internal helpers -------------------------------------------------------


def _item_doctype() -> str:
	return "Item"


def _field_exists(doctype: str, fieldname: str) -> bool:
	"""Defensive existence check for not-yet-applied proposed fields, same
	pattern as V3-51/52/53/60: never assume a field exists, always check the
	live meta first so this module degrades to a safe (non-eligible) default
	instead of raising on a site where the proposed field is absent."""
	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		return False
	return bool(meta.has_field(fieldname))


def _resolve_active_bom(item_code: str, company: str | None) -> str:
	filters = {"item": item_code, "is_active": 1, "docstatus": 1}
	if company:
		filters["company"] = company

	bom_no = frappe.db.get_value(
		BOM_DOCTYPE, {**filters, "is_default": 1}, "name", order_by="modified desc"
	)
	if not bom_no:
		bom_no = frappe.db.get_value(BOM_DOCTYPE, filters, "name", order_by="modified desc")

	if not bom_no:
		frappe.throw(
			frappe._("No active BOM found for item {0}{1}").format(
				item_code, frappe._(" in company {0}").format(company) if company else ""
			),
			frappe.ValidationError,
		)

	return bom_no
