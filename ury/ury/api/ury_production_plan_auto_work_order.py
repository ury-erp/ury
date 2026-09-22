# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Work Order and Manufacture executor for URY's Production Plan Automation feature.

See ``ongoing/production-plan-automation/PLAN.md``, "Prepare Production, per
department", D16, and the "Agent 7" task section.

Despite its (legacy) module name, this module no longer does anything on
Production Plan submit. The previous ``maybe_create_and_submit_work_orders``
``on_submit`` entry point -- gated behind a setting Wave 0 deleted -- has been
removed outright, along with the four tests that exercised it. Nothing wires
this module up automatically any more (the ``hooks.py`` registration was
already removed in Wave 0); Work Orders are created only through Prepare
Production, by calling :func:`execute_department_targets` below.

## Public entry point

    results = execute_department_targets(production_plan, targets)

``production_plan`` is a single department's ``Production Plan`` (name or
loaded doc). ``targets`` is that department's ``targets`` list -- IN_HOUSE
only, already dependency-ordered -- exactly as
``ury_production_target_compiler.compile_production_targets`` returns it for
one department bucket (``departments[department]["targets"]``). Agent 8's
Prepare Production orchestration re-runs the compiler under its Bin locks
(D17) and passes the resulting bucket straight through; this module never
re-derives a component vector or re-orders targets itself (PLAN.md
coordination rules: "The Work Order hook consumes the compiled component
vector. It must never re-interpret a BOM.").

For each target, in the order given:

1. Create or reuse a Work Order (:func:`get_or_create_work_order`), keyed
   deterministically on ``(production_plan, production_item, bom_no)`` --
   see that function's docstring for why this is retry-safe.
2. Create a Manufacture Stock Entry (:func:`create_manufacture_entry`) for
   whatever quantity remains unproduced (``qty - produced_qty``), through
   ERPNext's own ``work_order.make_stock_entry`` -- never hand-built (see
   ``ury_manufacture_enforcement``). If nothing remains, nothing is created.

Returns one result dict per target:

    {
        "item_code": "BIRYANI-BASE",
        "work_order": "WO-0042",
        "work_order_created": True,           # False if an existing Work Order was reused
        "manufacture_stock_entry": "MFG-STE-0007",  # or None if nothing remained to produce
        "produced_qty": 20.0,                 # Work Order's produced_qty after this call
        "remaining_qty": 0.0,                 # qty - produced_qty after this call
    }

## Failure handling

Nothing in this module is caught and logged. This is user-invoked work
reached through Prepare Production (D5/D17) -- any failure (a blocked
dependency, a Work Order whose persisted ``required_items`` do not match the
compiled vector, ERPNext's own validation) propagates as a raised exception
so the caller can surface an actionable message, instead of being swallowed
into ``frappe.log_error`` the way the removed ``on_submit`` hook did.

## Ownership boundary with Agent 6's hook module

This module *builds* Work Orders (D16): it creates the draft, calls
``ury_work_order_hooks.apply_ury_warehouse_policy`` and
``apply_ury_required_items`` directly, then inserts and submits. It does not
rely on the ``Work Order`` ``validate`` doc_event hook to construct anything
-- that hook remains a gated safeguard for a hand-desk-created/edited Work
Order only (see that module's docstring, D16).

**Correction found during implementation, reported rather than worked
around silently (see PLAN.md's request to flag contradictions found while
building this).** D16, read literally, says calling
``apply_ury_required_items`` once while constructing a fresh draft is
"simpler and unconditional (no gate needed on a brand new, never-saved
draft)". That is not quite the whole story: ERPNext's own ``WorkOrder.validate()``
unconditionally calls ``set_required_items(reset_only_qty=True)`` whenever
``required_items`` is already populated and
``Manufacturing Settings.allow_editing_of_items_and_quantities_in_work_order``
is off (the default on this site) -- on *every* save/submit cycle, including
the one triggered by ``submit()`` itself. That reset only touches rows whose
``item_code`` also appears in a naive *single-level* BOM explosion, and only
ever *shrinks* a row's ``required_qty`` back to that single-level value. For
almost every component this is a no-op (the single-level value already
matches D1's own first-level accounting), but for an item that the compiler's
selective explosion accumulates from *two* sources within one target's BOM --
once as a direct line item, again nested through a pass-through unstocked
intermediate (see the compiler's own "Aggregation" docstring) -- the reset
would silently discard the nested contribution. Because ``submit()`` flips
``docstatus`` to 1 *before* running ``validate()``, Agent 6's own D16 gate
(``docstatus == 0``) is closed by the time this could be fixed through the
hook's ``flags.ury_component_vector`` extension point, so that extension
point cannot close this gap either.

Rather than fight ERPNext's own validate() ordering with a
``flags.ignore_validate`` escape hatch (which would also skip real
validation this module has no business skipping), this module re-applies the
warehouse policy and component vector after every state-changing call
(insert, and again after submit) and then calls
:func:`_verify_component_vector`, which fails loudly
(``WorkOrderExecutionError``) if the persisted ``required_items`` no longer
match the compiled vector. This satisfies PLAN.md's Agent 7 instruction to
"fail closed and report rather than guessing": a Work Order whose vector was
clobbered never reaches submit silently -- it throws instead, naming the
Work Order and the mismatched item. This has not been observed to trigger
against any real BOM in this codebase's test fixtures; it is a safety net
for the scenario above, not a routine code path.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt

from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry as _wo_make_stock_entry

from ury.ury.api.ury_work_order_hooks import (
	apply_ury_required_items,
	apply_ury_warehouse_policy,
)


WORK_ORDER_DOCTYPE = "Work Order"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"

MANUFACTURE_PURPOSE = "Manufacture"
SOURCING_IN_HOUSE = "IN_HOUSE"

#: Floating point tolerance for quantity comparisons (Float precision noise,
#: never a real discrepancy).
_QTY_EPSILON = 1e-6


class WorkOrderExecutionError(frappe.ValidationError):
	"""Raised for any failure building/submitting Work Orders or Manufacture
	Stock Entries for a department's compiled targets. A plain
	``frappe.ValidationError`` subclass -- never caught here, always left to
	propagate to the caller (PLAN.md's Agent 7 task section: "Surface
	user-invoked failures instead of swallowing them into the error log")."""


# --- public entry point ------------------------------------------------------


def execute_department_targets(production_plan, targets):
	"""Create/reuse Work Orders and post Manufacture entries for one
	department's compiled IN_HOUSE ``targets``, in the order given.

	``targets`` must already be dependency-ordered (as
	``compile_production_targets`` returns them) and must be the IN_HOUSE
	``targets`` list only -- never ``external_receipt_targets`` (this
	function fails closed, via :class:`WorkOrderExecutionError`, if any
	target's ``sourcing_mode`` is not IN_HOUSE, or if a target's own
	``depends_on`` has not already been satisfied earlier in this same
	call or by an earlier, already-fully-produced execution).

	Returns one result dict per target, in the same order -- see the module
	docstring for its exact shape.
	"""
	production_plan_doc = _resolve_production_plan_doc(production_plan)
	produced_item_codes = set()
	results = []

	for target in targets:
		_ensure_in_house(target)
		_ensure_dependencies_satisfied(production_plan_doc.name, target, produced_item_codes)

		work_order, created = get_or_create_work_order(production_plan_doc, target)
		stock_entry_name = create_manufacture_entry(work_order.name)

		qty, produced_qty = frappe.db.get_value(
			WORK_ORDER_DOCTYPE, work_order.name, ["qty", "produced_qty"]
		)
		results.append(
			{
				"item_code": target["item_code"],
				"work_order": work_order.name,
				"work_order_created": created,
				"manufacture_stock_entry": stock_entry_name,
				"produced_qty": flt(produced_qty),
				"remaining_qty": flt(qty) - flt(produced_qty),
			}
		)
		produced_item_codes.add(target["item_code"])

	return results


# --- Work Order create-or-reuse ----------------------------------------------


def find_existing_work_order(production_plan_name, item_code, bom_no):
	"""Look up an existing, non-cancelled Work Order for
	``(production_plan_name, item_code, bom_no)`` -- the deterministic key a
	retry of :func:`execute_department_targets` reuses instead of
	duplicating. This is exactly the ``(department, item_code, bom_no,
	warehouse)`` key the target compiler aggregates demand under (the
	Production Plan already pins one department and one Department
	Warehouse -- PLAN.md "One Production Plan per department" -- so
	``production_plan`` alone stands in for ``department``/``warehouse``
	here).

	Returns the Work Order's name, or ``None`` if none exists yet. Fails
	closed (:class:`WorkOrderExecutionError`) if more than one non-cancelled
	Work Order matches -- this key is supposed to be unique per target, and
	more than one match means something upstream (a bypass of this module,
	or a data problem) created a duplicate; this module refuses to silently
	pick one.
	"""
	rows = frappe.get_all(
		WORK_ORDER_DOCTYPE,
		filters={
			"production_plan": production_plan_name,
			"production_item": item_code,
			"bom_no": bom_no,
			"docstatus": ["<", 2],
		},
		fields=["name", "docstatus"],
		order_by="creation asc",
		limit=2,
	)
	if len(rows) > 1:
		frappe.throw(
			_(
				"Found more than one non-cancelled Work Order for {0} / {1} on Production "
				"Plan {2} ({3}); refusing to guess which one to reuse."
			).format(item_code, bom_no, production_plan_name, [row["name"] for row in rows]),
			WorkOrderExecutionError,
		)
	return rows[0]["name"] if rows else None


def get_or_create_work_order(production_plan_doc, target):
	"""Return ``(work_order_doc, created)`` for ``target``, creating a new
	Work Order only if none already exists for its deterministic key (see
	:func:`find_existing_work_order`).

	- An existing **submitted** Work Order is reused exactly as-is --
	  ``required_items`` is never rewritten once real stock movements may
	  have posted against it (D16's own gate, honoured here by simply never
	  touching a submitted Work Order's rows at all).
	- An existing **draft** Work Order (a previous call created it but
	  crashed before submit) is finished: policy and vector are re-applied
	  and it is submitted now, rather than creating a second one.
	- No existing Work Order creates a brand new one via
	  :func:`_create_work_order`.
	"""
	existing_name = find_existing_work_order(
		production_plan_doc.name, target["item_code"], target["bom_no"]
	)
	if not existing_name:
		return _create_work_order(production_plan_doc, target), True

	work_order = frappe.get_doc(WORK_ORDER_DOCTYPE, existing_name)
	if work_order.docstatus == 1:
		return work_order, False

	# docstatus == 0: a stray draft left behind by an interrupted earlier
	# attempt. Finish building it exactly as a brand new one would be.
	_link_work_order_to_plan_item(work_order, production_plan_doc, target)
	_apply_ury_policy_and_vector(work_order, production_plan_doc, target)
	work_order.save()
	_verify_component_vector(work_order, target["component_vector"])
	work_order.submit()
	_verify_component_vector(work_order, target["component_vector"])
	return work_order, False


def _create_work_order(production_plan_doc, target):
	"""Build, insert and submit a brand new Work Order for ``target`` (D16:
	the executor owns construction). See the module docstring's "Ownership
	boundary" section for why :func:`_verify_component_vector` is called
	after both insert and submit."""
	work_order = frappe.new_doc(WORK_ORDER_DOCTYPE)
	work_order.production_plan = production_plan_doc.name
	work_order.production_item = target["item_code"]
	work_order.bom_no = target["bom_no"]
	work_order.qty = flt(target["required_qty"])
	work_order.company = production_plan_doc.get("company")
	# D2: URY never explodes multi-level in the Work Order either -- the
	# compiled component_vector IS the selective explosion, single level
	# from the Work Order's own perspective (a nested PRE_PRODUCED
	# sub-assembly already appears as its own item, never exploded further).
	work_order.use_multi_level_bom = 0
	# ERPNext only rolls ordered_qty / produced_qty / status onto the
	# Production Plan when production_plan_item is set (see Work Order
	# update_ordered_qty / update_production_plan_status).
	_link_work_order_to_plan_item(work_order, production_plan_doc, target)

	_apply_ury_policy_and_vector(work_order, production_plan_doc, target)
	work_order.insert(ignore_permissions=False)
	_verify_component_vector(work_order, target["component_vector"])
	work_order.submit()
	_verify_component_vector(work_order, target["component_vector"])
	return work_order


def _link_work_order_to_plan_item(work_order, production_plan_doc, target):
	"""Point the Work Order at the matching ``po_items`` row (ERPNext's
	``production_plan_item``). Without this, Desk keeps showing the plan as
	Not Started even after Manufacture Stock Entries complete."""
	if work_order.get("production_plan_item"):
		return
	work_order.production_plan_item = _resolve_production_plan_item(production_plan_doc, target)


def _resolve_production_plan_item(production_plan_doc, target):
	"""Return the Production Plan Item name for ``target``, matching ERPNext's
	``get_production_items`` → ``production_plan_item: d.name`` wiring."""
	item_code = target["item_code"]
	bom_no = target.get("bom_no")
	rows = list(production_plan_doc.get("po_items") or [])
	matches = [row for row in rows if row.item_code == item_code]
	if bom_no:
		exact = [row for row in matches if row.get("bom_no") == bom_no]
		if exact:
			matches = exact
	if len(matches) == 1:
		return matches[0].name
	frappe.throw(
		_(
			"Cannot link Work Order for {0} to Production Plan {1}: expected exactly one "
			"Assembly Item row matching item/BOM, found {2}."
		).format(item_code, production_plan_doc.name, len(matches)),
		exc=WorkOrderExecutionError,
	)


def _apply_ury_policy_and_vector(work_order, production_plan_doc, target):
	apply_ury_warehouse_policy(work_order, production_plan_doc)
	apply_ury_required_items(work_order, target["component_vector"])

def _verify_component_vector(work_order, component_vector):
	"""Fail loudly if ``work_order.required_items``, as actually persisted,
	no longer matches ``component_vector``. See the module docstring's
	"Ownership boundary" section for exactly what could cause this."""
	expected = _aggregate_qty_by_item(component_vector)
	actual = _aggregate_qty_by_item(
		[
			{"item_code": row.item_code, "required_qty": row.required_qty}
			for row in work_order.get("required_items") or []
		]
	)

	if set(expected.keys()) != set(actual.keys()):
		frappe.throw(
			_(
				"Work Order {0}'s required items ({1}) no longer match its compiled "
				"component vector ({2}). Refusing to continue rather than risk "
				"mis-consuming stock."
			).format(work_order.name or "(unsaved)", sorted(actual.keys()), sorted(expected.keys())),
			WorkOrderExecutionError,
		)

	for item_code, expected_qty in expected.items():
		actual_qty = actual[item_code]
		if abs(flt(expected_qty) - flt(actual_qty)) > _QTY_EPSILON:
			frappe.throw(
				_(
					"Work Order {0}'s required quantity for {1} ({2}) no longer matches "
					"its compiled component vector ({3}). Refusing to continue rather than "
					"risk mis-consuming stock."
				).format(work_order.name or "(unsaved)", item_code, actual_qty, expected_qty),
				WorkOrderExecutionError,
			)


def _aggregate_qty_by_item(component_vector):
	totals = {}
	for component in component_vector:
		item_code = component["item_code"]
		totals[item_code] = flt(totals.get(item_code, 0)) + flt(component["required_qty"])
	return totals


# --- Manufacture Stock Entry --------------------------------------------------


def create_manufacture_entry(work_order_name):
	"""Create and submit a Manufacture Stock Entry for whatever quantity of
	``work_order_name`` remains unproduced (``qty - produced_qty``), through
	ERPNext's own ``work_order.make_stock_entry`` -- never hand-built (see
	``ury_manufacture_enforcement.validate_manufacture_requires_work_order``,
	which rejects any Manufacture Stock Entry for a PRE_PRODUCED/IN_HOUSE
	item not linked to a submitted Work Order this way).

	Returns the new Stock Entry's name, or ``None`` if nothing remains to
	produce -- a repeated call against an already-fully-produced Work Order
	creates nothing, so repeated execution never manufactures twice.
	"""
	remaining_qty = _remaining_qty(work_order_name)
	if remaining_qty <= _QTY_EPSILON:
		return None

	stock_entry_dict = _wo_make_stock_entry(work_order_name, purpose=MANUFACTURE_PURPOSE, qty=remaining_qty)
	stock_entry = frappe.get_doc(stock_entry_dict)
	stock_entry.insert(ignore_permissions=False)
	stock_entry.submit()
	return stock_entry.name


def _remaining_qty(work_order_name):
	qty, produced_qty = frappe.db.get_value(WORK_ORDER_DOCTYPE, work_order_name, ["qty", "produced_qty"])
	return flt(qty) - flt(produced_qty)


# --- target validation --------------------------------------------------------


def _ensure_in_house(target):
	sourcing_mode = (target.get("sourcing_mode") or "").upper()
	if sourcing_mode != SOURCING_IN_HOUSE:
		frappe.throw(
			_(
				"{0} has sourcing_mode {1}; only IN_HOUSE targets are built as Work "
				"Orders. Pass a department bucket's `targets`, never its "
				"`external_receipt_targets`."
			).format(target.get("item_code"), sourcing_mode or "UNSET"),
			WorkOrderExecutionError,
		)


def _ensure_dependencies_satisfied(production_plan_name, target, produced_item_codes):
	"""Fail closed if any of ``target``'s ``depends_on`` item codes have not
	already been produced -- either earlier in this same call
	(``produced_item_codes``) or by a fully-completed earlier execution
	(an existing submitted Work Order with nothing remaining). Protects
	against a caller that reorders or partially replays ``targets`` in a
	way that would submit a consumer before its dependency."""
	for dep_item_code in target.get("depends_on") or []:
		if dep_item_code in produced_item_codes:
			continue
		if _dependency_already_fully_produced(production_plan_name, dep_item_code):
			continue
		frappe.throw(
			_(
				"{0} depends on {1}, which has not been produced yet. Targets must be "
				"submitted in the dependency order the target compiler already produced "
				"them in."
			).format(target.get("item_code"), dep_item_code),
			WorkOrderExecutionError,
		)


def _dependency_already_fully_produced(production_plan_name, item_code):
	rows = frappe.get_all(
		WORK_ORDER_DOCTYPE,
		filters={"production_plan": production_plan_name, "production_item": item_code, "docstatus": 1},
		fields=["qty", "produced_qty"],
		order_by="creation desc",
		limit=1,
	)
	if not rows:
		return False
	row = rows[0]
	return flt(row["qty"]) - flt(row["produced_qty"]) <= _QTY_EPSILON


def _resolve_production_plan_doc(production_plan):
	if isinstance(production_plan, str):
		return frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan)
	return production_plan
