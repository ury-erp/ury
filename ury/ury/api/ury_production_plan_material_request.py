# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Purchase Material Requests for a URY Sales Plan's department Production Plans.

Requirements come from ``ury_production_target_compiler`` (already-compiled
department targets) and ``ury_production_readiness`` (already-computed stock
shortages). This module invents no requirement calculation of its own.

## Entry point

    generate_purchase_material_request_for_sales_plan(sales_plan)

Creates **one Purchase Material Request per live department Production Plan**
that still owes Store replenishment -- the same per-plan document shape as
Transfer MRs. The Transfer Material Request path (Store -> Department
Warehouse) lives in ``ury_production_transfer`` and is not touched here.

## Purchase requirement formula

    Total department demand
    - Current department stock
    - Store stock
    - Outstanding incoming supply
    = Purchase requirement

The first three terms are ``ury_production_readiness.compute_readiness``'s
``department_shortage`` and ``store_shortage``. Outstanding incoming supply
is netted here: the sum of ``qty`` on non-cancelled linked Purchase Material
Request rows for that item (see ``_existing_purchase_qty_by_item``).

## Shared Store shortfall, separate documents

Per item, once Store-wide demand exceeds Store stock and outstanding supply,
the delta is split across every contributing department proportional to each
department's ``department_shortage`` (see ``_allocate_purchase_requirement``).
Each department's share becomes rows on **that department's own** Purchase
Material Request. The sum of every plan's rows for an item is exactly the
shared Store shortfall -- never each department's full, unshared need --
which stops two department plans from purchasing the same shortage twice.

## Native per-row traceability (D8)

Every Purchase MR row sets ``Material Request Item.production_plan`` and
``material_request_plan_item``. A ``Material Request Plan Item`` row is
appended onto that Production Plan's ``mr_items`` *before* the Material
Request is created, so ERPNext's ``Material Request.on_submit`` ->
``update_requested_qty_in_production_plan`` credits ``requested_qty`` and
status for free.

Appending to ``mr_items`` on an already-submitted Production Plan (D14) uses
``doc.flags.ignore_validate_update_after_submit = True`` before ``save()``.

Every ``mr_items`` row carries the **Store** Warehouse in ``warehouse`` (where
goods are received for a Purchase). The department destination is carried
through ``production_plan``, never through that field.

## Idempotency (D15)

Each Purchase MR is inserted **and submitted** on creation -- never a draft.
A recalculation that finds the requirement has grown creates a
**supplementary** Material Request for the delta on the affected plan(s),
and never amends or cancels an earlier one. Outstanding supply already
counts every previously-submitted linked Purchase MR row, so an unchanged
picture yields nothing new.

## D19 -- EXTERNAL_RECEIPT demand

``ury_production_readiness`` already folds ``external_receipt_targets`` into
its demand rows; this module never special-cases ``sourcing_mode``.
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from ury.ury.api.ury_production_readiness import compute_readiness
from ury.ury.api.ury_production_settings import get_store_warehouse
from ury.ury.api.ury_production_target_compiler import compile_production_targets
from ury.ury.api.ury_sales_plan_production_plan import (
	PP_DEPARTMENT_FIELD,
	get_live_production_plans,
)

SALES_PLAN_DOCTYPE = "URY Sales Plan"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
MATERIAL_REQUEST_DOCTYPE = "Material Request"
MATERIAL_REQUEST_TYPE_PURCHASE = "Purchase"


@frappe.whitelist(methods=["POST"])
def generate_purchase_material_request_for_sales_plan(sales_plan):
	"""Compute and, if anything is owed, create+submit one supplementary
	Purchase Material Request **per** department Production Plan for the
	not-yet-requested portion of ``sales_plan``'s Store shortfall.

	Returns:

		{
		    "sales_plan": "SP-2026-00001",
		    "material_requests": [
		        {
		            "department": "Main Kitchen",
		            "production_plan": "MFG-PP-2026-00001",
		            "material_request": "MAT-MR-2026-00001",
		        },
		        ...
		    ],
		    "rows": [
		        {"item_code": ..., "department": ..., "production_plan": ..., "qty": ...},
		        ...
		    ],
		    "blockers": [...],
		}

	Safe to call repeatedly (see module docstring, "Idempotency").
	"""
	frappe.has_permission(SALES_PLAN_DOCTYPE, "read", sales_plan, throw=True)
	frappe.has_permission(MATERIAL_REQUEST_DOCTYPE, "create", throw=True)

	sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, sales_plan)
	snapshot = sales_plan_doc.get("approval_snapshot")
	if not snapshot:
		frappe.throw(
			_("{0} has no frozen approval snapshot; it must be Approved before Material Requests can be generated.").format(
				sales_plan
			),
			frappe.ValidationError,
		)

	branch = sales_plan_doc.get("branch")
	company = sales_plan_doc.get("company")
	departments, blockers = compile_production_targets(snapshot, branch, company)
	blockers = list(blockers)

	plan_by_department = _live_plan_by_department(sales_plan)

	store_warehouse = get_store_warehouse()
	readiness = compute_readiness(departments, store_warehouse=store_warehouse)
	blockers.extend(readiness["blockers"])

	department_plan_names = [row["name"] for row in plan_by_department.values()]
	outstanding_by_item = _existing_purchase_qty_by_item(department_plan_names)

	allocations = []
	for item_code, rows_for_item in _group_rows_by_item(readiness["rows"]).items():
		outstanding = outstanding_by_item.get(item_code, 0.0)
		for allocation in _allocate_purchase_requirement(rows_for_item, outstanding):
			plan_row = plan_by_department.get(allocation["department"])
			if not plan_row:
				blockers.append(_missing_department_plan_blocker(allocation))
				continue
			allocation["production_plan"] = plan_row["name"]
			allocations.append(allocation)
	# Same raw material on one department plan must be one Purchase row
	# (lemon 0.1 + 0.1 → 0.2).
	allocations = _consolidate_allocations_by_item_and_plan(allocations)

	if not allocations:
		return {"sales_plan": sales_plan, "material_requests": [], "rows": [], "blockers": blockers}

	if not store_warehouse:
		blockers.append(
			{
				"type": "store_warehouse_not_configured",
				"message": _(
					"URY Production Settings: Store Warehouse is not configured. "
					"The Purchase requirement is known but the Material Request cannot be created."
				),
			}
		)
		return {"sales_plan": sales_plan, "material_requests": [], "rows": [], "blockers": blockers}

	_append_mr_items_and_assign_names(allocations, store_warehouse)

	material_requests = []
	for plan_name, plan_allocations in _group_allocations_by_plan(allocations).items():
		mr_name = _create_and_submit_purchase_material_request(
			company=company, store_warehouse=store_warehouse, allocations=plan_allocations
		)
		material_requests.append(
			{
				"department": plan_allocations[0]["department"],
				"production_plan": plan_name,
				"material_request": mr_name,
			}
		)

	rows = [
		{
			"item_code": allocation["item_code"],
			"department": allocation["department"],
			"production_plan": allocation["production_plan"],
			"qty": allocation["qty"],
		}
		for allocation in allocations
	]
	return {
		"sales_plan": sales_plan,
		"material_requests": material_requests,
		"rows": rows,
		"blockers": blockers,
	}


# --- department plan resolution ----------------------------------------------


def _live_plan_by_department(sales_plan):
	"""The newest non-cancelled Production Plan per department for
	``sales_plan``, keyed by department. ``get_live_production_plans`` is
	already newest-first, so the first row seen per department is kept.
	"""
	plan_by_department = {}
	for row in get_live_production_plans(sales_plan):
		department = row.get(PP_DEPARTMENT_FIELD)
		if department not in plan_by_department:
			plan_by_department[department] = row
	return plan_by_department


# --- requirement grouping and allocation --------------------------------------


def _group_rows_by_item(rows):
	by_item = {}
	for row in rows:
		by_item.setdefault(row["item_code"], []).append(row)
	return by_item


def _group_allocations_by_plan(allocations):
	by_plan = {}
	for allocation in allocations:
		by_plan.setdefault(allocation["production_plan"], []).append(allocation)
	return by_plan


def _consolidate_allocations_by_item_and_plan(allocations):
	"""Merge allocations that share ``(item_code, production_plan)`` by summing qty.

	Defensive: readiness already aggregates within a department, but a
	Purchase Material Request must never show two rows for the same raw
	material on the same department plan (e.g. lemon 0.1 + 0.1 → one 0.2).
	"""
	merged = {}
	order = []
	for allocation in allocations:
		key = (allocation["item_code"], allocation["production_plan"])
		existing = merged.get(key)
		if existing:
			existing["qty"] = flt(existing["qty"]) + flt(allocation["qty"])
			continue
		merged[key] = dict(allocation)
		order.append(key)
	return [merged[key] for key in order]


def _allocate_purchase_requirement(rows_for_item, outstanding_qty):
	"""Split one item's not-yet-requested Purchase requirement across the
	departments that contributed to it.

	``rows_for_item`` are ``ury_production_readiness`` rows for one
	``item_code`` (one per contributing department); every row carries the
	same ``store_shortage``. The requirement is

	    max(0, store_shortage - outstanding_qty)

	Otherwise the requirement is split proportional to each department's own
	``department_shortage``, with the last contributing department absorbing
	any float remainder so the allocations always sum to exactly the
	requirement. Each department's share lands on that plan's own Purchase MR.
	"""
	if not rows_for_item:
		return []

	store_shortage = rows_for_item[0]["store_shortage"]
	requirement = max(0.0, flt(store_shortage) - flt(outstanding_qty))
	if requirement <= 0:
		return []

	contributing = [row for row in rows_for_item if row["department_shortage"] > 0]
	total_department_shortage = sum(row["department_shortage"] for row in contributing)
	if total_department_shortage <= 0:
		return []

	allocations = []
	remaining = requirement
	for index, row in enumerate(contributing):
		is_last = index == len(contributing) - 1
		if is_last:
			qty = remaining
		else:
			share = row["department_shortage"] / total_department_shortage
			qty = flt(requirement * share)
			remaining -= qty
		if qty <= 0:
			continue
		allocations.append(
			{
				"item_code": row["item_code"],
				"department": row["department"],
				"department_warehouse": row["department_warehouse"],
				"stock_uom": row["stock_uom"],
				"qty": qty,
			}
		)
	return allocations


# --- outstanding incoming supply (D15 netting) --------------------------------


def _existing_purchase_qty_by_item(department_plan_names):
	"""Sum of ``qty`` already sitting on non-cancelled Purchase Material
	Request rows linked (via ``production_plan``) to any of
	``department_plan_names``, grouped by ``item_code``.

	Restricted to ``material_request_type = 'Purchase'`` -- Transfer MR rows
	on the same plans must not net off Purchase quantity.
	"""
	if not department_plan_names:
		return {}

	rows = frappe.db.sql(
		"""
		select mri.item_code as item_code, sum(mri.qty) as qty
		from `tabMaterial Request Item` mri
		inner join `tabMaterial Request` mr on mr.name = mri.parent
		where mri.production_plan in %(plans)s
		  and mr.material_request_type = %(material_request_type)s
		  and mr.docstatus = 1
		group by mri.item_code
		""",
		{"plans": tuple(department_plan_names), "material_request_type": MATERIAL_REQUEST_TYPE_PURCHASE},
		as_dict=True,
	)
	return {row["item_code"]: flt(row["qty"]) for row in rows}


# --- writes: mr_items + one Purchase MR per plan ------------------------------


def _append_mr_items_and_assign_names(allocations, store_warehouse):
	"""Append one ``Material Request Plan Item`` row per allocation onto its
	department Production Plan's ``mr_items``, and write the assigned child
	row name back onto the allocation as ``material_request_plan_item``.

	``mr_items.warehouse`` is the Store Warehouse (Purchase receive location).
	One save per Production Plan touched.
	"""
	for plan_name, plan_allocations in _group_allocations_by_plan(allocations).items():
		plan_doc = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, plan_name)
		child_rows = [
			plan_doc.append(
				"mr_items",
				{
					"item_code": allocation["item_code"],
					"warehouse": store_warehouse,
					"material_request_type": MATERIAL_REQUEST_TYPE_PURCHASE,
					"quantity": allocation["qty"],
					"uom": allocation["stock_uom"],
					"schedule_date": nowdate(),
				},
			)
			for allocation in plan_allocations
		]
		# D14: a department plan may already be submitted.
		plan_doc.flags.ignore_validate_update_after_submit = True
		plan_doc.save(ignore_permissions=True)
		for allocation, child_row in zip(plan_allocations, child_rows):
			allocation["material_request_plan_item"] = child_row.name


def _create_and_submit_purchase_material_request(company, store_warehouse, allocations):
	"""Create+submit one Purchase MR for a single Production Plan's allocations."""
	items = [
		{
			"item_code": allocation["item_code"],
			"qty": allocation["qty"],
			"uom": allocation["stock_uom"],
			"warehouse": store_warehouse,
			"schedule_date": nowdate(),
			"production_plan": allocation["production_plan"],
			"material_request_plan_item": allocation["material_request_plan_item"],
		}
		for allocation in allocations
	]
	doc = frappe.get_doc(
		{
			"doctype": MATERIAL_REQUEST_DOCTYPE,
			"material_request_type": MATERIAL_REQUEST_TYPE_PURCHASE,
			"company": company,
			"transaction_date": nowdate(),
			"items": items,
		}
	)
	doc.insert(ignore_permissions=True)
	# D15: submitted, never left as a draft.
	doc.submit()
	return doc.name


# --- blockers -----------------------------------------------------------------


def _missing_department_plan_blocker(allocation):
	return {
		"type": "department_plan_missing_for_purchase_request",
		"item_code": allocation["item_code"],
		"department": allocation["department"],
		"message": _(
			"{0} has Purchase requirement for {1} but no live Production Plan for that "
			"department; create the department Production Plans before Purchase Material "
			"Requests can be generated."
		).format(allocation["department"], allocation["item_code"]),
	}
