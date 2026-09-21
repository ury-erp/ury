# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Open-or-create a Production Plan from an approved URY Sales Plan.

Single locked entry point shared by the "Production Plan" button (Desk and
React Sales Plan UI, never submits) and the auto-create-on-approval path
(``ury_sales_plan_auto_production_plan``, submits when configured).

Source of truth for "which Production Plan belongs to this Sales Plan" is the
reverse link ``Production Plan.custom_ury_sales_plan``; the Sales Plan's own
``custom_ury_production_plan`` is only a convenience pointer to the latest one
(it is ``no_copy`` and so is lost on amend, the reverse link is not).
"""

import frappe
from frappe import _

from ury.ury.api.ury_production_plan_adapter import adapt_sales_plan_to_production_plan

SALES_PLAN = "URY Sales Plan"
SALES_PLAN_LINK_FIELD = "custom_ury_production_plan"
PP_SALES_PLAN_FIELD = "custom_ury_sales_plan"
PP_HASH_FIELD = "custom_ury_snapshot_hash"
ELIGIBLE_STATUSES = ("Approved", "Locked for Production")

PRODUCTION_PLAN_ITEM_FIELDS = (
	"item_code",
	"bom_no",
	"planned_qty",
	"stock_uom",
	"planned_start_date",
	"description",
	"warehouse",
	"custom_ury_department",
)
ADVISORY_KEYS = ("_source", "_unmapped_fields", "_ury_department_index")


def get_live_production_plan(sales_plan):
	"""Newest non-cancelled Production Plan created from ``sales_plan``."""
	rows = frappe.get_all(
		"Production Plan",
		filters={PP_SALES_PLAN_FIELD: sales_plan, "docstatus": ["<", 2]},
		fields=["name", "docstatus", PP_HASH_FIELD],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def build_production_plan_dict(sales_plan_doc):
	adapted = adapt_sales_plan_to_production_plan(sales_plan_doc)
	cleaned = {k: v for k, v in adapted.items() if k not in ADVISORY_KEYS}
	cleaned["doctype"] = "Production Plan"
	cleaned["po_items"] = [
		{field: row.get(field) for field in PRODUCTION_PLAN_ITEM_FIELDS}
		for row in adapted.get("po_items") or []
	]
	cleaned[PP_SALES_PLAN_FIELD] = sales_plan_doc.name
	cleaned[PP_HASH_FIELD] = sales_plan_doc.get("approval_snapshot_hash")
	return cleaned


def preflight_issues(sales_plan_doc, production_plan_dict=None):
	"""Structured, user-facing reasons a Production Plan cannot be created."""
	issues = []
	if sales_plan_doc.get("status") not in ELIGIBLE_STATUSES:
		issues.append(_("Sales Plan must be Approved or Locked for Production."))
		return issues
	pp = production_plan_dict or build_production_plan_dict(sales_plan_doc)
	rows = pp.get("po_items") or []
	if not rows:
		issues.append(_("No plannable items: only pre-produced items go into a Production Plan."))
	for row in rows:
		if not row.get("bom_no"):
			issues.append(_("{0} has no BOM.").format(row.get("item_code")))
	return issues


def create_or_get_production_plan(sales_plan_doc, submit=False):
	"""Return ``(production_plan_name, created)``.

	Takes a row lock on the Sales Plan so concurrent callers (two clicks, or a
	click racing approval) serialise; the second sees the first's plan through
	the reverse link. Never commits -- the request transaction holds the lock.
	The caller is responsible for writing the Sales Plan's own pointer field.
	"""
	# Read a real column with FOR UPDATE (not get_doc, which is cached).
	frappe.db.get_value(SALES_PLAN, sales_plan_doc.name, "name", for_update=True)

	existing = get_live_production_plan(sales_plan_doc.name)
	if existing:
		return existing["name"], False

	plan_dict = build_production_plan_dict(sales_plan_doc)
	issues = preflight_issues(sales_plan_doc, plan_dict)
	if issues:
		frappe.throw("<br>".join(issues), title=_("Cannot create Production Plan"))

	doc = frappe.get_doc(plan_dict)
	doc.insert()
	if submit:
		doc.submit()
	return doc.name, True


@frappe.whitelist()
def get_production_plan_state(sales_plan):
	"""Drive the button: ``none`` | ``live`` | ``stale`` | ``ineligible``
	plus the linked plan and any pre-flight issues. Read-only."""
	frappe.has_permission(SALES_PLAN, "read", sales_plan, throw=True)
	doc = frappe.get_doc(SALES_PLAN, sales_plan)
	can_create = frappe.has_permission("Production Plan", "create")
	if doc.get("status") not in ELIGIBLE_STATUSES:
		return {"state": "ineligible", "can_create": can_create}

	live = get_live_production_plan(sales_plan)
	if live:
		can_open = frappe.has_permission("Production Plan", "read", live["name"])
		stale = bool(live.get(PP_HASH_FIELD)) and live.get(PP_HASH_FIELD) != doc.get("approval_snapshot_hash")
		return {
			"state": "stale" if stale else "live",
			"name": live["name"],
			"docstatus": live["docstatus"],
			"can_open": can_open,
			"can_create": can_create,
		}

	try:
		issues = preflight_issues(doc)
	except Exception:
		frappe.log_error(title="Production Plan pre-flight failed", message=frappe.get_traceback())
		issues = [_("Sales Plan snapshot is not ready for planning.")]
	return {"state": "none", "issues": issues, "can_create": can_create}


@frappe.whitelist(methods=["POST"])
def open_or_create_production_plan(sales_plan):
	"""Open the live Production Plan for ``sales_plan``, or create a DRAFT one.

	Never submits. When the live plan is stale (Sales Plan changed since), the
	UI tells the user to cancel it first; once cancelled this creates a new one.
	"""
	frappe.has_permission(SALES_PLAN, "read", sales_plan, throw=True)
	# Lock first, then load, so status/hash are read under the lock.
	frappe.db.get_value(SALES_PLAN, sales_plan, "name", for_update=True)
	doc = frappe.get_doc(SALES_PLAN, sales_plan)
	if doc.get("status") not in ELIGIBLE_STATUSES or doc.docstatus != 1:
		frappe.throw(_("Sales Plan must be Approved or Locked for Production."))

	existing = get_live_production_plan(sales_plan)
	if existing:
		frappe.has_permission("Production Plan", "read", existing["name"], throw=True)
		return {"name": existing["name"], "created": False, "docstatus": existing["docstatus"]}

	frappe.has_permission("Production Plan", "create", throw=True)
	name, created = create_or_get_production_plan(doc, submit=False)
	frappe.db.set_value(SALES_PLAN, sales_plan, SALES_PLAN_LINK_FIELD, name)
	return {"name": name, "created": created, "docstatus": 0}
