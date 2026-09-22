# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Create and read the per-department Production Plans for a Sales Plan.

Revision: PLAN.md "One Production Plan per department" replaces the earlier
one-Production-Plan-per-Sales-Plan design. A Sales Plan now owns zero or more
Production Plans, one per non-empty Production Department, each carrying its
own department, department warehouse and execution state.

Single locked entry point, shared by:

- the manual "Create Production Plans" action (Desk and React Sales Plan UI),
  used when ``enable_auto_production_plan`` is off;
- the automatic creation on the ``Locked for Production`` transition
  (``ury_sales_plan_auto_production_plan.create_production_plans_on_lock``),
  used when the toggle is on.

Source of truth for "which Production Plans belong to this Sales Plan" is the
reverse link ``Production Plan.custom_ury_sales_plan`` (one Sales Plan to many
Production Plans). ``URY Sales Plan.custom_ury_production_plan`` is deprecated
(D11): it held a single pointer, which cannot represent "one of several", and
this module never reads or writes it any more.

Idempotency identity (see PLAN.md "Idempotency identity"):

    Sales Plan + Department + Approval Snapshot Hash

``create_or_get_department_production_plans`` locks the Sales Plan row for
the whole creation loop, so two concurrent callers (a double click, or a
manual click racing the Lock transition) cannot create two Production Plans
for the same department: the second caller blocks on the row lock until the
first's transaction commits, then sees the first's plans through the reverse
link and creates nothing new for any department the first already covered.
"""

import frappe
from frappe import _
from frappe.utils import nowdate

from ury.ury.api.ury_production_target_compiler import compile_production_targets

SALES_PLAN = "URY Sales Plan"
PRODUCTION_PLAN = "Production Plan"

PP_SALES_PLAN_FIELD = "custom_ury_sales_plan"
PP_HASH_FIELD = "custom_ury_snapshot_hash"
PP_DEPARTMENT_FIELD = "custom_ury_department"
PP_DEPARTMENT_WAREHOUSE_FIELD = "custom_ury_department_warehouse"
PP_STATE_FIELD = "custom_ury_production_state"

#: Only "Locked for Production" carries live department Production Plans
#: (D14) -- creation moved off the "Approved" transition, so an Approved plan
#: never has any.
ELIGIBLE_STATUSES = ("Locked for Production",)

#: Initial state for every freshly-created department plan. The readiness
#: engine (a later agent) is what actually decides "Awaiting Materials" vs
#: "Ready for Production" once stock is checked; this is just the safe,
#: not-yet-evaluated starting point.
STATE_AWAITING_MATERIALS = "Awaiting Materials"

#: Fields copied from a compiled target (see
#: ury_production_target_compiler.compile_production_targets) onto a
#: Production Plan Item row. ``include_exploded_items`` is set to 0
#: unconditionally below, never copied from a target -- D2.
_PRODUCTION_PLAN_ITEM_FIELDS = ("item_code", "bom_no", "stock_uom", "warehouse")


def get_live_production_plans(sales_plan):
	"""Every non-cancelled Production Plan created from ``sales_plan``.

	One row per department under normal operation, but this can legitimately
	return more than one row for the same department if the Sales Plan was
	returned to Draft and re-approved/re-locked with a changed snapshot --
	each (department, snapshot hash) pair is its own identity (see module
	docstring), so an older generation's plan is not implicitly superseded.
	Newest first.
	"""
	return frappe.get_all(
		PRODUCTION_PLAN,
		filters={PP_SALES_PLAN_FIELD: sales_plan, "docstatus": ["<", 2]},
		fields=["name", "docstatus", "status", PP_DEPARTMENT_FIELD, PP_HASH_FIELD, PP_STATE_FIELD],
		order_by="creation desc",
	)


def get_department_production_plan(sales_plan, department):
	"""The newest non-cancelled Production Plan for ``(sales_plan, department)``,
	or ``None``."""
	rows = frappe.get_all(
		PRODUCTION_PLAN,
		filters={
			PP_SALES_PLAN_FIELD: sales_plan,
			PP_DEPARTMENT_FIELD: department,
			"docstatus": ["<", 2],
		},
		fields=["name", "docstatus", "status", PP_DEPARTMENT_FIELD, PP_HASH_FIELD, PP_STATE_FIELD],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def _target_to_production_plan_item(target, plan_date):
	row = {field: target.get(field) for field in _PRODUCTION_PLAN_ITEM_FIELDS}
	row["planned_qty"] = target.get("required_qty")
	row["planned_start_date"] = plan_date
	row["description"] = None
	row[PP_DEPARTMENT_FIELD] = target.get("department")
	# D2 / the wiring point Agent 2 flagged: without this, ERPNext explodes
	# every pre-produced sub-assembly in the vector into raw materials, and
	# the whole selective-explosion design (component_vector already IS the
	# exploded, selective vector -- see the compiler's docstring) fails
	# silently.
	row["include_exploded_items"] = 0
	return row


def _build_department_plan_dict(sales_plan_doc, department, bucket, snapshot_hash):
	warehouse = bucket.get("warehouse")
	plan_date = sales_plan_doc.get("plan_date")
	po_items = [
		_target_to_production_plan_item(target, plan_date) for target in (bucket.get("targets") or [])
	]
	return {
		"doctype": PRODUCTION_PLAN,
		"company": sales_plan_doc.get("company"),
		"posting_date": nowdate(),
		PP_DEPARTMENT_FIELD: department,
		PP_DEPARTMENT_WAREHOUSE_FIELD: warehouse,
		PP_SALES_PLAN_FIELD: sales_plan_doc.name,
		PP_HASH_FIELD: snapshot_hash,
		PP_STATE_FIELD: STATE_AWAITING_MATERIALS,
		"po_items": po_items,
	}


def create_or_get_department_production_plans(sales_plan_doc, submit=False):
	"""Create (or return) one Production Plan per non-empty department.

	Returns:

		{
		    "sales_plan": "SP-2026-00001",
		    "production_plans": [
		        {
		            "department": "Main Kitchen",
		            "production_plan": "MFG-PP-2026-00001",
		            "state": "Awaiting Materials",
		            "created": True,
		        },
		        ...
		    ],
		    "blockers": [...],   # see compile_production_targets; never blocks
		                          # OTHER departments, reported for visibility only
		}

	Takes a row lock on the Sales Plan (``FOR UPDATE``, not ``get_doc`` which
	is cached) for the whole loop below, so concurrent callers serialise: the
	second sees every department the first created, through the reverse
	link, once the first's transaction commits. Never commits itself -- the
	caller's own request transaction holds the lock and persists the insert.

	Idempotent per department on ``(sales_plan, department, snapshot hash)``:
	a department whose live plan already carries the Sales Plan's current
	``approval_snapshot_hash`` is left alone and reported with
	``created: False``. A department with no compiled targets, no
	EXTERNAL_RECEIPT demand and no raw_material_demand at all (nothing to
	produce, receive or buy for it) gets no plan. A department whose only
	demand is a MADE_TO_ORDER item's raw materials still gets one, with no
	po_items, purely so that demand has a Production Plan to attach its
	Material Request rows to (D8).
	"""
	# Read a real column with FOR UPDATE (not get_doc, which is cached).
	frappe.db.get_value(SALES_PLAN, sales_plan_doc.name, "name", for_update=True)

	snapshot = sales_plan_doc.get("approval_snapshot")
	if not snapshot:
		frappe.throw(
			_("{0} has no frozen approval snapshot; it must be Approved before Production Plans can be created.").format(
				sales_plan_doc.name
			),
			frappe.ValidationError,
		)

	branch = sales_plan_doc.get("branch")
	company = sales_plan_doc.get("company")
	departments, blockers = compile_production_targets(snapshot, branch, company)

	snapshot_hash = sales_plan_doc.get("approval_snapshot_hash")
	existing_by_department = {row[PP_DEPARTMENT_FIELD]: row for row in get_live_production_plans(sales_plan_doc.name)}

	results = []
	for department, bucket in departments.items():
		if not (
			bucket.get("targets")
			or bucket.get("external_receipt_targets")
			or bucket.get("raw_material_demand")
		):
			# Genuinely empty -- nothing to produce, receive or buy for this
			# department. A department is NOT empty just because it has no
			# target: one whose menu items are all MADE_TO_ORDER with no
			# PRE_PRODUCED stop point anywhere still has raw_material_demand,
			# and that demand needs this department's own plan to attach its
			# Purchase/Transfer Material Request rows to (D8) even though the
			# plan itself will carry no po_items and never run a Work Order.
			continue

		existing = existing_by_department.get(department)
		if existing and existing.get(PP_HASH_FIELD) == snapshot_hash:
			results.append({
				"department": department,
				"production_plan": existing["name"],
				"state": existing.get(PP_STATE_FIELD),
				"created": False,
			})
			continue

		plan_dict = _build_department_plan_dict(sales_plan_doc, department, bucket, snapshot_hash)
		doc = frappe.get_doc(plan_dict)
		doc.insert()
		if submit:
			doc.submit()
		results.append({
			"department": department,
			"production_plan": doc.name,
			"state": doc.get(PP_STATE_FIELD),
			"created": True,
		})

	material_requests = _generate_material_requests(sales_plan_doc.name, results)

	return {
		"sales_plan": sales_plan_doc.name,
		"production_plans": results,
		"blockers": blockers,
		"material_requests": material_requests,
	}


def _generate_material_requests(sales_plan, results):
	"""Raise the Purchase and Transfer requests for the plans just created.

	Without this the workflow has no procurement step at all: plans exist,
	nothing requests materials, and Prepare Production later finds no
	submitted Transfer request to map, so it transfers nothing and reports no
	blocker while doing it.

	Generation belongs here rather than inside Prepare Production because the
	manager is meant to review these requests and finish procurement *before*
	reaching for the production button, not after being turned away by it.

	Both generators are idempotent (D15): a repeat call nets the current
	picture against what is already requested and creates only the delta, so
	running this on every creation call cannot pile up duplicates.

	Failures here never abort plan creation. The plans are already correct and
	useful on their own, and a request can be regenerated; losing the lock
	transition over a procurement hiccup would be a worse trade. Anything that
	goes wrong is returned to the caller and logged.
	"""
	from ury.ury.api.ury_production_plan_material_request import (
		generate_purchase_material_request_for_sales_plan,
	)
	from ury.ury.api.ury_production_transfer import (
		generate_transfer_material_request_for_production_plan,
	)

	generated = {"purchases": [], "transfers": [], "errors": []}

	for row in results:
		try:
			transfer = generate_transfer_material_request_for_production_plan(row["production_plan"])
		except Exception as exc:
			frappe.log_error(
				title="URY transfer Material Request generation failed",
				message=frappe.get_traceback(),
			)
			generated["errors"].append(
				{"department": row["department"], "type": "transfer", "message": str(exc)}
			)
			continue
		if transfer.get("material_request"):
			generated["transfers"].append(
				{"department": row["department"], "material_request": transfer["material_request"]}
			)

	try:
		purchase = generate_purchase_material_request_for_sales_plan(sales_plan)
	except Exception as exc:
		frappe.log_error(
			title="URY purchase Material Request generation failed",
			message=frappe.get_traceback(),
		)
		generated["errors"].append({"type": "purchase", "message": str(exc)})
	else:
		generated["purchases"] = list(purchase.get("material_requests") or [])

	return generated


@frappe.whitelist()
def get_production_plan_states(sales_plan):
	"""Drive the Sales Plan UI's per-department Production Plan panel.

	Read-only. Response shape:

		{
		    "sales_plan": "SP-2026-00001",
		    "status": "Locked for Production",
		    "eligible": True,          # can plans exist/be created for this status
		    "can_create": True,        # current user's create permission
		    "production_plans": [
		        {
		            "department": "Main Kitchen",
		            "name": "MFG-PP-2026-00001",
		            "docstatus": 1,
		            "status": "Not Started",
		            "production_state": "Awaiting Materials",
		            "link_state": "live",   # "live" | "stale"
		            "can_open": True,
		        },
		        ...
		    ],
		}

	``link_state`` is "stale" when the plan's own ``custom_ury_snapshot_hash``
	no longer matches the Sales Plan's current ``approval_snapshot_hash`` --
	i.e. the Sales Plan changed (and was re-locked, or is pending re-lock)
	since that department's plan was created. This is D12's ``link_state``
	axis; ``production_state`` is D12's separate ``execution_state`` axis,
	read verbatim off each plan and never merged with ``link_state``.
	``status`` is ERPNext's own Production Plan status (auto-updated as
	Material Requests / Work Orders / Stock Entries progress).
	"""
	frappe.has_permission(SALES_PLAN, "read", sales_plan, throw=True)
	doc = frappe.get_doc(SALES_PLAN, sales_plan)
	can_create = frappe.has_permission(PRODUCTION_PLAN, "create")
	eligible = doc.get("status") in ELIGIBLE_STATUSES

	plans = []
	for row in get_live_production_plans(sales_plan):
		stale = bool(row.get(PP_HASH_FIELD)) and row.get(PP_HASH_FIELD) != doc.get("approval_snapshot_hash")
		plans.append({
			"department": row.get(PP_DEPARTMENT_FIELD),
			"name": row["name"],
			"docstatus": row["docstatus"],
			"status": row.get("status"),
			"production_state": row.get(PP_STATE_FIELD),
			"link_state": "stale" if stale else "live",
			"can_open": frappe.has_permission(PRODUCTION_PLAN, "read", row["name"]),
		})

	return {
		"sales_plan": sales_plan,
		"status": doc.get("status"),
		"eligible": eligible,
		"can_create": can_create,
		"production_plans": plans,
	}


@frappe.whitelist(methods=["POST"])
def create_department_production_plans(sales_plan):
	"""Manual "Create Production Plans" action for the Sales Plan UI.

	Only usable once the Sales Plan is ``Locked for Production`` (D14 -- the
	same transition that drives the automatic path when
	``enable_auto_production_plan`` is on). Calls the same locked, idempotent
	``create_or_get_department_production_plans`` the automatic path calls,
	with ``submit=True`` so each department plan is submitted immediately
	and Prepare Production can run without a Desk submit step. Idempotent:
	never double-creates for a department that already has a live current plan.

	Returns the same shape as ``create_or_get_department_production_plans``
	-- see its docstring.
	"""
	frappe.has_permission(SALES_PLAN, "read", sales_plan, throw=True)
	frappe.has_permission(PRODUCTION_PLAN, "create", throw=True)
	doc = frappe.get_doc(SALES_PLAN, sales_plan)
	if doc.get("status") not in ELIGIBLE_STATUSES:
		frappe.throw(_("{0} must be Locked for Production before Production Plans can be created.").format(sales_plan))
	return create_or_get_department_production_plans(doc, submit=True)


@frappe.whitelist()
def open_department_production_plan(sales_plan, department):
	"""Look up the live Production Plan for one department, for the UI's
	per-department "Open" link. Never creates -- use
	``create_department_production_plans`` first.

	Returns ``{"name": ..., "docstatus": ..., "department": ...}``. Throws if
	no live plan exists for that department.
	"""
	frappe.has_permission(SALES_PLAN, "read", sales_plan, throw=True)
	plan = get_department_production_plan(sales_plan, department)
	if not plan:
		frappe.throw(_("No Production Plan found for {0} / {1}.").format(sales_plan, department))
	frappe.has_permission(PRODUCTION_PLAN, "read", plan["name"], throw=True)
	return {"name": plan["name"], "docstatus": plan["docstatus"], "department": department}
