# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Consolidated Purchase Material Request for a URY Sales Plan.

Rewrite. The previous version of this module re-derived BOM requirements
itself (``compile_bom_vector``) and produced both a Purchase and a Transfer
Material Request per Production Plan. Per
``ongoing/production-plan-automation/PLAN.md`` ("Material Requests", "Agent
4"), that duplication is gone:

- Requirements come from ``ury_production_target_compiler`` (already-compiled
  department targets, never re-derived here) and
  ``ury_production_readiness`` (already-computed stock shortages, never
  re-derived here either -- this module invents no requirement calculation
  of its own, per the coordination rules).
- This module owns exactly one document: the **consolidated Purchase
  Material Request, at Sales Plan level**. The per-department Transfer
  Material Request (Store -> Department Warehouse) is a different agent's
  file (Agent 5) and is not touched here.

## Entry point

    generate_purchase_material_request_for_sales_plan(sales_plan)

## Purchase requirement formula (PLAN.md, "Material Requests")

    Total department demand
    - Current department stock
    - Store stock
    - Outstanding incoming supply
    = Purchase requirement

The first three terms are exactly ``ury_production_readiness.compute_readiness``'s
``department_shortage`` (demand after department stock) and ``store_shortage``
(after department AND store stock, shared across every department
contributing to one item -- see that module's docstring for why duplicate
Store shortage reporting across departments cannot happen). The fourth term,
"Outstanding incoming supply", is netted off *here*: it is the sum of
``qty`` already sitting on non-cancelled linked Purchase Material Request
rows for that item (see ``_existing_purchase_qty_by_item``) -- i.e. demand
this Sales Plan has already asked to be purchased, whether or not a
Purchase Order has been raised against it yet.

## One consolidated Purchase MR (D8, "Shared Store contention")

Per item, once Store-wide demand exceeds Store's own stock and outstanding
supply, the delta is split across every department that contributed to that
item's demand, proportional to each department's own ``department_shortage``
share (see ``_allocate_purchase_requirement``). Each department's share
becomes its own row on the **same** consolidated Material Request document,
carrying that department's ``production_plan`` link. The sum of every
department's rows for an item is exactly the shared Store shortfall for that
item -- never each department's full, unshared need -- which is what stops
two department plans from ever raising duplicate Purchase rows against one
Store shortage.

## Native per-row traceability (D8)

Every Purchase MR row sets ``Material Request Item.production_plan`` (the
originating department Production Plan) and ``material_request_plan_item``
(the row name of a ``Material Request Plan Item`` this module appends onto
that same Production Plan's own ``mr_items`` table, *before* the Material
Request is created). Both are native ERPNext fields; no new link field is
invented. Populating ``mr_items`` before creating the linking Material
Request is deliberate: ERPNext's own ``Material Request.on_submit`` ->
``update_requested_qty_in_production_plan`` reads exactly those two fields
back off the just-submitted Material Request Item rows and writes
``requested_qty`` onto the ``mr_items`` row itself, and recomputes the
Production Plan's native ``status`` (-> "Material Requested") for free --
this module never sets ``requested_qty`` or ``status`` itself.

Appending to ``mr_items`` on an already-submitted Production Plan (D14: a
department plan is submitted immediately when
``enable_auto_production_plan`` is on) uses
``doc.flags.ignore_validate_update_after_submit = True`` before ``save()``,
the same sanctioned Frappe pattern used throughout ERPNext itself (e.g.
``erpnext/manufacturing/doctype/bom/bom.py``,
``erpnext/accounts/doctype/sales_invoice/sales_invoice.py``) for a
controlled, known-safe table update on a submitted document; it is not a
permission bypass, only the "no field changes after submit" guard for this
one call.

Every ``mr_items`` row this module appends carries the **Store** Warehouse
in its own ``warehouse`` field, not the department warehouse -- see
``_append_mr_items_and_assign_names`` for why: ERPNext's native
``Production Plan.make_material_request`` reads that field straight onto
the Material Request Item it generates, so the field means "where the
requested material is received", which is Store, exactly like the Purchase
MR Item row's own ``warehouse``. The department destination is carried
entirely through ``production_plan``, never through this field.

## Idempotency (D15)

The consolidated Purchase MR is inserted **and submitted** on creation --
never a draft. A submitted Material Request cannot take new rows, so a
recalculation that finds the requirement has grown creates a
**supplementary** Material Request for the delta, linked to the same
department plans, and never amends or cancels the earlier one. This falls
out naturally from the formula above: "Outstanding incoming supply" already
counts every previously-submitted linked Purchase MR row for that item, so
a repeated call with an unchanged picture computes a zero delta (nothing
created), and a call after the requirement rose computes exactly the delta
(a new, additional MR). Over-coverage (outstanding supply already exceeds
the freshly computed requirement) is left alone -- this module never
touches an existing Material Request.

## D19 -- EXTERNAL_RECEIPT demand

``ury_production_readiness`` already folds every ``external_receipt_targets``
entry into its demand rows (see that module's docstring); this module reads
its rows exactly like any other demand row and never special-cases
``sourcing_mode``. EXTERNAL_RECEIPT demand therefore reaches the Purchase
requirement the same way every other shortage does, with no extra code here
-- see ``test_ury_production_plan_material_request.py`` for a scenario that
asserts this explicitly.
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
	Purchase Material Request covering the not-yet-requested portion of
	``sales_plan``'s aggregate raw-material shortfall.

	Returns:

		{
		    "sales_plan": "SP-2026-00001",
		    "material_request": "MAT-MR-2026-00001",   # or None if fully covered already
		    "rows": [
		        {"item_code": ..., "department": ..., "production_plan": ..., "qty": ...},
		        ...
		    ],
		    "blockers": [...],   # target-compiler + readiness-engine blockers,
		                          # plus this module's own (missing department
		                          # plan for an allocated item)
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

	if not allocations:
		return {"sales_plan": sales_plan, "material_request": None, "rows": [], "blockers": blockers}

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
		return {"sales_plan": sales_plan, "material_request": None, "rows": [], "blockers": blockers}

	_append_mr_items_and_assign_names(allocations, store_warehouse)
	mr_name = _create_and_submit_purchase_material_request(
		company=company, store_warehouse=store_warehouse, allocations=allocations
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
	return {"sales_plan": sales_plan, "material_request": mr_name, "rows": rows, "blockers": blockers}


# --- department plan resolution ----------------------------------------------


def _live_plan_by_department(sales_plan):
	"""The newest non-cancelled Production Plan per department for
	``sales_plan``, keyed by department. ``get_live_production_plans`` is
	already newest-first (see ``ury_sales_plan_production_plan``), so the
	first row seen per department is kept and any older, superseded
	generation for the same department is ignored -- a Purchase MR row is
	only ever linked to the live plan for its department.
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


def _allocate_purchase_requirement(rows_for_item, outstanding_qty):
	"""Split one item's not-yet-requested Purchase requirement across the
	departments that contributed to it.

	``rows_for_item`` are ``ury_production_readiness`` rows for one
	``item_code`` (one per contributing department); every row carries the
	same ``store_shortage`` (see that module's docstring). The requirement is

	    max(0, store_shortage - outstanding_qty)

	Zero contributing departments, or a requirement of zero or less
	(fully covered by existing linked Purchase MR rows -- D15's
	"over-coverage is left alone"), yields no allocation at all.

	Otherwise the requirement is split proportional to each department's own
	``department_shortage`` -- its share of what actually drove the Store
	shortfall for this item -- with the last contributing department
	absorbing any float remainder so the allocations always sum to exactly
	the requirement (never more, which is what stops duplicate Purchase rows
	against one Store shortage; never less, which would silently under-count
	part of the requirement).

	This split exists **only** for D8 per-row traceability -- crediting the
	right department Production Plan's ``requested_qty`` with the right
	share. It has no physical consequence: every allocation's goods land in
	the same Store Warehouse regardless of which department it is credited
	to (see ``_append_mr_items_and_assign_names`` and
	``_create_and_submit_purchase_material_request``, both of which use the
	Store Warehouse, never a department warehouse, for the actual
	``warehouse`` field). Proportional-to-``department_shortage`` is a
	recorded decision, not merely an assumption, but it is a traceability
	policy, not a stock-allocation policy -- nobody should read a physical
	"this department gets first claim on Store stock" meaning into it.
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

	Deliberately restricted to ``material_request_type = 'Purchase'`` --
	``production_plan`` is also set by Agent 5's Transfer Material Request
	rows on the very same Production Plans, and netting those off here would
	silently under-request Purchase quantity by whatever Agent 5 already
	requested for an unrelated purpose.
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


# --- writes: mr_items + the consolidated Purchase MR --------------------------


def _append_mr_items_and_assign_names(allocations, store_warehouse):
	"""Append one ``Material Request Plan Item`` row per allocation onto its
	department Production Plan's own ``mr_items`` table, and write the
	assigned child row name back onto the allocation dict as
	``material_request_plan_item`` for the Purchase MR row that references it.

	``mr_items.warehouse`` is set to ``store_warehouse``, never the
	department warehouse, even though physically it is the *department* that
	ultimately needs the material. This is not a modelling choice this
	module is free to make: ERPNext's own
	``erpnext.manufacturing.doctype.production_plan.production_plan.Production
	Plan.make_material_request`` -- the native "Create Material Request"
	button -- reads ``mr_items.warehouse`` straight onto the generated
	Material Request Item's own ``warehouse``::

	    "warehouse": item.warehouse,

	If this row said the department warehouse instead, that native button
	(unwired today, but reading the same field) would generate a Purchase MR
	that receives goods into the department warehouse, bypassing Store
	entirely and inverting the Store-to-Department model this whole feature
	is built on. Setting it to Store here keeps the field meaning the same
	thing to native ERPNext code and to URY code reading the same row. The
	department destination is not lost -- it is still recoverable through
	this row's parent Production Plan (the ``production_plan`` link on the
	Purchase MR Item row it corresponds to), which is what that field exists
	for.

	One save per Production Plan touched, even when it receives several
	allocations (several raw materials, or several supplementary rows in one
	call) -- never one save per row.
	"""
	allocations_by_plan = {}
	for allocation in allocations:
		allocations_by_plan.setdefault(allocation["production_plan"], []).append(allocation)

	for plan_name, plan_allocations in allocations_by_plan.items():
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
		# D14: a department plan may already be submitted. Appending a row to
		# mr_items on a submitted document needs this flag -- see module
		# docstring for why that is safe here and precedented in ERPNext.
		plan_doc.flags.ignore_validate_update_after_submit = True
		plan_doc.save(ignore_permissions=True)
		for allocation, child_row in zip(plan_allocations, child_rows):
			allocation["material_request_plan_item"] = child_row.name


def _create_and_submit_purchase_material_request(company, store_warehouse, allocations):
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
