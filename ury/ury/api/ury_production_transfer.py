# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Department Transfer Material Request and Store-to-Department stock
transfer execution for the URY Production Plan Automation feature.

Two responsibilities, both scoped to **one department Production Plan** (per
``ongoing/production-plan-automation/PLAN.md``, "Material Requests" --
"Transfer MR, at department Production Plan level", and the "Agent 5"
task section):

1. ``generate_transfer_material_request_for_production_plan`` -- create and
   submit a Material Transfer Material Request, Store Warehouse to the
   plan's Department Warehouse, for that department's not-yet-requested
   shortage.
2. ``execute_store_to_department_transfer`` -- under Store Bin locks (D9),
   revalidate (D17) and map the plan's already-submitted Transfer MR(s) to
   Material Transfer Stock Entries using ERPNext's own
   ``material_request.make_stock_entry`` (never a hand-built entry).

Neither function re-derives a BOM or a stock quantity of its own. Both read
``ury_production_target_compiler.compile_production_targets`` (structural
requirement) and ``ury_production_readiness.compute_readiness`` (stock
picture) exactly the way Agent 4's Purchase MR module does, restricted here
to a single department's bucket -- the shape
``ury_production_readiness`` documents itself as what "Agent 5/8 need when
revalidating one department under Bin locks" (D17).

## Quantity (task spec, not independently re-derived)

The Transfer MR quantity for an item is that department's
``department_shortage`` (demand after netting the department's own stock),
never ``store_shortage`` -- unlike Purchase MRs (which net against shared
Store shortfall), a Transfer MR is a request to move stock that Store is
assumed to have; whether Store actually has it is a question for
*execution* time (Bin locks + revalidation below), not creation time.

## D8 -- native per-row traceability

Every Transfer MR row sets ``Material Request Item.production_plan`` and
``material_request_plan_item``, and a ``Material Request Plan Item`` row is
appended onto the department plan's own ``mr_items`` *before* the Material
Request is created -- identical mechanism to Agent 4's Purchase MR, mirrored
here rather than reinvented. The ``mr_items`` row's ``warehouse`` is the
**Department** Warehouse here (a Transfer's destination), not the Store
Warehouse Agent 4 uses for a Purchase row's destination -- each
``material_request_type`` gets its own correct "for" warehouse on that
native field.

## D15 -- submitted, never a draft; supplementary on growth

Inserted and submitted immediately. ``_existing_transfer_qty_by_item`` nets
off qty already sitting on non-cancelled linked Transfer MR rows for this
plan (restricted to ``material_request_type = 'Material Transfer'`` -- the
same plan also carries Purchase MR rows via ``production_plan``, and netting
those off here would silently under-request Transfer quantity). A repeated
call with an unchanged picture computes a zero delta and creates nothing; a
call after the requirement grew creates a supplementary MR for the delta
only. Over-coverage is left alone.

## D9 / D17 -- Bin locks and revalidation under them

``execute_store_to_department_transfer`` preflights (advisory, no lock), then
-- if the department's own items still need Store stock -- locks exactly
those Store Bin rows, sorted ascending by ``item_code`` (only one Store
Warehouse exists, so ``(item_code, warehouse)`` collapses to ``item_code``;
``_lock_store_bins`` still carries the warehouse in the tuple it returns, for
a future multi-store-warehouse world and so a test can assert both parts of
the key), in one pass, before any write. A Bin row that does not exist is
never created just to lock it -- absence is read straight through as
zero-stock, the same as the readiness engine's own ``_bin_actual_qty``. Once
every lock is held, the full readiness calculation is re-run for this
department; if the picture changed (a concurrent department consumed the
Store stock this one was counting on), the function aborts with blockers
having created nothing at all -- no Stock Entry, no write of any kind.

## Reuse / skip already-transferred quantity

Deliberately **not** hand-tracked. ``erpnext...material_request.make_stock_entry``
maps a submitted Material Request to a Stock Entry through ``get_mapped_doc``,
whose own per-row ``condition`` (``ordered_qty < stock_qty``) and
``update_item`` postprocess (``qty = stock_qty - ordered_qty``) already skip
fully-transferred rows and compute exactly the remaining quantity for a
partially-transferred one. ``ordered_qty`` itself is kept current by
ERPNext's own ``Stock Entry`` ``on_submit``/``on_cancel`` hook
(``material_request.update_completed_and_requested_qty``), which fires
automatically because the mapped Stock Entry Detail rows carry
``material_request`` / ``material_request_item`` back to their source. A
retry that finds a Material Request already fully mapped gets an empty
``items`` table back from the mapper and creates no Stock Entry for it --
this module reads that as "nothing left to transfer", not as an error.

## Zero hand-built Stock Entries

``_execute_transfer_material_request`` only ever calls the imported
``make_stock_entry`` and then ``insert``/``submit`` on what it returns. This
satisfies ``ury_manufacture_enforcement``-adjacent expectations elsewhere in
the app that a Stock Entry linked to a Material Request came from the
native mapper, and it is what keeps Material Request progress
(``per_ordered``, status) updating for free.
"""

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from erpnext.stock.doctype.material_request.material_request import (
	make_stock_entry as erpnext_make_stock_entry,
)

from ury.ury.api.ury_production_readiness import compute_readiness, store_shortage_blocker
from ury.ury.api.ury_production_settings import get_store_warehouse
from ury.ury.api.ury_production_target_compiler import compile_production_targets
from ury.ury.api.ury_sales_plan_production_plan import (
	PP_DEPARTMENT_FIELD,
	PP_DEPARTMENT_WAREHOUSE_FIELD,
	PP_SALES_PLAN_FIELD,
)

SALES_PLAN_DOCTYPE = "URY Sales Plan"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
MATERIAL_REQUEST_DOCTYPE = "Material Request"
STOCK_ENTRY_DOCTYPE = "Stock Entry"
BIN_DOCTYPE = "Bin"
MATERIAL_REQUEST_TYPE_TRANSFER = "Material Transfer"


# --- 1. Transfer Material Request, one per department plan -------------------


@frappe.whitelist(methods=["POST"])
def generate_transfer_material_request_for_production_plan(production_plan):
	"""Compute and, if anything is owed, create+submit one supplementary
	Material Transfer Material Request (Store -> this plan's Department
	Warehouse) covering the not-yet-requested portion of this department's
	shortage.

	Returns:

		{
		    "production_plan": "MFG-PP-2026-00001",
		    "material_request": "MAT-MR-2026-00002",   # or None if fully covered already
		    "rows": [{"item_code": ..., "qty": ...}, ...],
		    "blockers": [...],
		}

	Safe to call repeatedly (see module docstring, "D15").
	"""
	frappe.has_permission(PRODUCTION_PLAN_DOCTYPE, "read", production_plan, throw=True)
	frappe.has_permission(MATERIAL_REQUEST_DOCTYPE, "create", throw=True)

	plan_doc = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan)
	sales_plan = plan_doc.get(PP_SALES_PLAN_FIELD)
	if not sales_plan:
		frappe.throw(
			_("{0} has no linked URY Sales Plan; it is not a department production plan.").format(production_plan),
			frappe.ValidationError,
		)
	department = plan_doc.get(PP_DEPARTMENT_FIELD)
	department_warehouse = plan_doc.get(PP_DEPARTMENT_WAREHOUSE_FIELD)

	sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, sales_plan)
	bucket, blockers = _compile_department_bucket(sales_plan_doc, department)
	blockers = list(blockers)

	store_warehouse = get_store_warehouse()
	readiness = compute_readiness({department: bucket}, store_warehouse=store_warehouse)
	blockers.extend(readiness["blockers"])

	outstanding_by_item = _existing_transfer_qty_by_item([production_plan])

	allocations = []
	for row in readiness["rows"]:
		requirement = max(0.0, flt(row["department_shortage"]) - outstanding_by_item.get(row["item_code"], 0.0))
		if requirement <= 0:
			continue
		allocations.append({
			"item_code": row["item_code"],
			"stock_uom": row["stock_uom"],
			"qty": requirement,
		})
	# Same raw material shared by multiple finished goods in this department
	# must become one Transfer MR row with summed qty (e.g. lemon 0.1 + 0.1 → 0.2).
	allocations = _consolidate_allocations_by_item_code(allocations)

	if not allocations:
		return {"production_plan": production_plan, "material_request": None, "rows": [], "blockers": blockers}

	if not store_warehouse:
		blockers.append(_store_warehouse_not_configured_blocker())
		return {"production_plan": production_plan, "material_request": None, "rows": [], "blockers": blockers}

	_append_mr_items_and_assign_names(plan_doc, allocations, department_warehouse)
	mr_name = _create_and_submit_transfer_material_request(
		company=sales_plan_doc.get("company"),
		store_warehouse=store_warehouse,
		department_warehouse=department_warehouse,
		production_plan=production_plan,
		allocations=allocations,
	)

	rows = [{"item_code": allocation["item_code"], "qty": allocation["qty"]} for allocation in allocations]
	return {"production_plan": production_plan, "material_request": mr_name, "rows": rows, "blockers": blockers}


def _compile_department_bucket(sales_plan_doc, department):
	"""One department's compiled bucket, in the one-entry-dict shape both
	``compute_readiness`` and this module's callers need (see that module's
	docstring). Recompiled fresh on every call -- cheap, read-only, and the
	only way ``execute_store_to_department_transfer`` can revalidate under
	Bin locks (D17) against the current snapshot rather than a stale one."""
	snapshot = sales_plan_doc.get("approval_snapshot")
	if not snapshot:
		frappe.throw(
			_("{0} has no frozen approval snapshot; it must be Approved before Transfer Material Requests can be generated.").format(
				sales_plan_doc.name
			),
			frappe.ValidationError,
		)
	branch = sales_plan_doc.get("branch")
	company = sales_plan_doc.get("company")
	departments, blockers = compile_production_targets(snapshot, branch, company)
	bucket = departments.get(department) or {
		"warehouse": None,
		"targets": [],
		"external_receipt_targets": [],
		"raw_material_demand": [],
	}
	return bucket, blockers


def _existing_transfer_qty_by_item(production_plan_names):
	"""Sum of ``qty`` already sitting on non-cancelled Material Transfer
	Material Request rows linked (via ``production_plan``) to any of
	``production_plan_names``, grouped by ``item_code``.

	Restricted to ``material_request_type = 'Material Transfer'`` -- the same
	department plan also carries Purchase MR rows (Agent 4) via the same
	``production_plan`` field, and netting those off here would silently
	under-request Transfer quantity."""
	if not production_plan_names:
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
		{"plans": tuple(production_plan_names), "material_request_type": MATERIAL_REQUEST_TYPE_TRANSFER},
		as_dict=True,
	)
	return {row["item_code"]: flt(row["qty"]) for row in rows}


def _consolidate_allocations_by_item_code(allocations):
	"""Merge allocations that share ``item_code`` by summing ``qty``.

	Readiness already aggregates by ``(department, item_code)``; this is a
	defensive last step so a Transfer Material Request never carries two
	rows for the same raw material (e.g. lemon 0.1 kg from two finished
	goods) instead of one row at the combined quantity.
	"""
	merged = {}
	order = []
	for allocation in allocations:
		item_code = allocation["item_code"]
		existing = merged.get(item_code)
		if existing:
			existing["qty"] = flt(existing["qty"]) + flt(allocation["qty"])
			continue
		merged[item_code] = dict(allocation)
		order.append(item_code)
	return [merged[item_code] for item_code in order]


def _append_mr_items_and_assign_names(plan_doc, allocations, department_warehouse):
	"""Append one ``Material Request Plan Item`` row per allocation onto
	``plan_doc.mr_items``, and write the assigned child row name back onto
	the allocation dict as ``material_request_plan_item``. One save, even
	for several allocations in one call."""
	child_rows = [
		plan_doc.append(
			"mr_items",
			{
				"item_code": allocation["item_code"],
				"warehouse": department_warehouse,
				"material_request_type": MATERIAL_REQUEST_TYPE_TRANSFER,
				"quantity": allocation["qty"],
				"uom": allocation["stock_uom"],
				"schedule_date": nowdate(),
			},
		)
		for allocation in allocations
	]
	# D14: a department plan may already be submitted (Agent 4's module docstring
	# explains why this flag is safe and precedented here).
	plan_doc.flags.ignore_validate_update_after_submit = True
	plan_doc.save(ignore_permissions=True)
	for allocation, child_row in zip(allocations, child_rows):
		allocation["material_request_plan_item"] = child_row.name


def _create_and_submit_transfer_material_request(company, store_warehouse, department_warehouse, production_plan, allocations):
	items = [
		{
			"item_code": allocation["item_code"],
			"qty": allocation["qty"],
			"uom": allocation["stock_uom"],
			"warehouse": department_warehouse,
			"from_warehouse": store_warehouse,
			"schedule_date": nowdate(),
			"production_plan": production_plan,
			"material_request_plan_item": allocation["material_request_plan_item"],
		}
		for allocation in allocations
	]
	doc = frappe.get_doc(
		{
			"doctype": MATERIAL_REQUEST_DOCTYPE,
			"material_request_type": MATERIAL_REQUEST_TYPE_TRANSFER,
			"company": company,
			"transaction_date": nowdate(),
			"set_from_warehouse": store_warehouse,
			"set_warehouse": department_warehouse,
			"items": items,
		}
	)
	doc.insert(ignore_permissions=True)
	# D15: submitted, never left as a draft.
	doc.submit()
	return doc.name


# --- 2. Store -> Department stock transfer execution --------------------------


@frappe.whitelist(methods=["POST"])
def execute_store_to_department_transfer(production_plan):
	"""Move Store stock into ``production_plan``'s Department Warehouse by
	mapping its already-submitted Transfer Material Request(s) to Material
	Transfer Stock Entries.

	Order of operations (see module docstring for the reasoning behind each):

	1. Preflight this department's aggregate Store requirement -- no lock, no
	   write. A shortage here blocks everything below and nothing is created.
	2. Lock exactly the Store Bin rows this department still needs, sorted
	   ascending by ``item_code`` (D9), before any write.
	3. Re-run the full readiness calculation for this department under those
	   locks (D17). A picture that changed since step 1 aborts here, still
	   before any write.
	4. Only now: map every linked, submitted, non-cancelled Transfer Material
	   Request to a Stock Entry via ERPNext's own mapper, insert, submit.

	Returns:

		{
		    "production_plan": "MFG-PP-2026-00001",
		    "stock_entries": ["MAT-STE-2026-00003", ...],
		    "blockers": [...],
		    "locked_bins": [("RICE", "Store WH - U"), ...],   # empty if aborted before locking
		}
	"""
	frappe.has_permission(PRODUCTION_PLAN_DOCTYPE, "read", production_plan, throw=True)
	frappe.has_permission(STOCK_ENTRY_DOCTYPE, "create", throw=True)

	plan_doc = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan)
	if plan_doc.docstatus != 1:
		frappe.throw(
			_("{0} must be a submitted Production Plan before Store stock can be transferred into it.").format(production_plan),
			frappe.ValidationError,
		)
	sales_plan = plan_doc.get(PP_SALES_PLAN_FIELD)
	if not sales_plan:
		frappe.throw(
			_("{0} has no linked URY Sales Plan; it is not a department production plan.").format(production_plan),
			frappe.ValidationError,
		)
	department = plan_doc.get(PP_DEPARTMENT_FIELD)

	sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, sales_plan)

	store_warehouse = get_store_warehouse()
	if not store_warehouse:
		return {
			"production_plan": production_plan,
			"stock_entries": [],
			"blockers": [_store_warehouse_not_configured_blocker()],
			"locked_bins": [],
		}

	# 1. Preflight -- advisory, no lock, no write (D17: never sufficient on
	# its own, but still worth doing first so an already-known shortage never
	# pays for a lock it will not use).
	blockers, rows = _run_readiness(sales_plan_doc, department, store_warehouse)
	shortage_rows = [row for row in rows if row["store_shortage"] > 0]
	if shortage_rows:
		return {
			"production_plan": production_plan,
			"stock_entries": [],
			"blockers": blockers + [store_shortage_blocker(row) for row in shortage_rows],
			"locked_bins": [],
		}

	item_codes = sorted({row["item_code"] for row in rows if row["department_shortage"] > 0})
	if not item_codes:
		return {"production_plan": production_plan, "stock_entries": [], "blockers": blockers, "locked_bins": []}

	# 2. Lock, sorted ascending, before any write (D9).
	locked_bins = _lock_store_bins(store_warehouse, item_codes)

	# 3. Revalidate under the locks (D17). A picture that changed since step 1
	# aborts here, still before any write.
	blockers, rows = _run_readiness(sales_plan_doc, department, store_warehouse)
	shortage_rows = [row for row in rows if row["store_shortage"] > 0]
	if shortage_rows:
		return {
			"production_plan": production_plan,
			"stock_entries": [],
			"blockers": blockers + [store_shortage_blocker(row) for row in shortage_rows],
			"locked_bins": locked_bins,
		}

	# 4. Only now: create anything.
	transfer_mrs = _linked_transfer_material_requests(production_plan)
	if not transfer_mrs:
		return {
			"production_plan": production_plan,
			"stock_entries": [],
			"blockers": blockers + [_transfer_material_request_missing_blocker(production_plan)],
			"locked_bins": locked_bins,
		}

	stock_entries = [
		name
		for name in (_execute_transfer_material_request(mr_name) for mr_name in transfer_mrs)
		if name
	]

	return {
		"production_plan": production_plan,
		"stock_entries": stock_entries,
		"blockers": blockers,
		"locked_bins": locked_bins,
	}


def _run_readiness(sales_plan_doc, department, store_warehouse):
	"""Compile + compute readiness for one department, right now. Returns
	``(blockers, rows)`` -- ``blockers`` is everything the compiler and
	readiness layers reported; ``rows`` is the readiness engine's per-item
	rows for this department (see that module's docstring for their shape).

	Called twice by the executor -- once before locking, once under the
	locks (D17) -- so nothing about this helper may cache anything across
	calls; each call recompiles and re-reads Bin stock fresh."""
	bucket, blockers = _compile_department_bucket(sales_plan_doc, department)
	blockers = list(blockers)
	readiness = compute_readiness({department: bucket}, store_warehouse=store_warehouse)
	blockers.extend(readiness["blockers"])
	return blockers, readiness["rows"]


def _lock_store_bins(store_warehouse, item_codes, on_lock=None):
	"""Lock Store Bin rows for ``item_codes`` in ``(item_code, warehouse)``
	ascending order (D9), in one pass, before any write.

	A Bin row that does not exist is never created just to lock it -- its
	absence is read straight through by the readiness engine's own
	``_bin_actual_qty`` as zero stock, which is what turns it into a shortage
	blocker rather than a phantom row.

	``on_lock`` is an optional callback invoked with each ``(item_code,
	warehouse)`` key immediately before that row is locked -- the sanctioned
	way for a test to record and assert the exact locking sequence without
	reaching into ``frappe.db.sql`` call args.
	"""
	locked = []
	for item_code in sorted(set(item_codes)):
		key = (item_code, store_warehouse)
		if on_lock:
			on_lock(key)
		frappe.db.sql(
			"select name from `tabBin` where item_code=%s and warehouse=%s for update",
			(item_code, store_warehouse),
		)
		locked.append(key)
	return locked


def _linked_transfer_material_requests(production_plan):
	"""Every non-cancelled, submitted Material Transfer Material Request
	holding at least one row linked (via ``production_plan``) to
	``production_plan``, oldest first -- a department can accumulate more
	than one across supplementary requests (D15)."""
	rows = frappe.db.sql(
		"""
		select distinct mr.name as name, mr.creation as creation
		from `tabMaterial Request Item` mri
		inner join `tabMaterial Request` mr on mr.name = mri.parent
		where mri.production_plan = %(production_plan)s
		  and mr.material_request_type = %(material_request_type)s
		  and mr.docstatus = 1
		order by mr.creation asc
		""",
		{"production_plan": production_plan, "material_request_type": MATERIAL_REQUEST_TYPE_TRANSFER},
		as_dict=True,
	)
	return [row["name"] for row in rows]


def _execute_transfer_material_request(material_request):
	"""Map one submitted Transfer Material Request to a Material Transfer
	Stock Entry via ERPNext's own mapper, insert and submit it.

	Returns the new Stock Entry's name, or ``None`` when the mapper hands
	back no rows at all -- every row on this Material Request is already
	fully transferred (``ordered_qty == stock_qty``), so there is nothing
	left to move and nothing is created. This is the "reuse or skip" and
	"retrying never transfers twice" behaviour, entirely native (see module
	docstring)."""
	mapped = erpnext_make_stock_entry(material_request)
	if not mapped or not mapped.get("items"):
		return None
	mapped.insert(ignore_permissions=True)
	mapped.submit()
	return mapped.name


# --- blockers -----------------------------------------------------------------


def _store_warehouse_not_configured_blocker():
	return {
		"type": "store_warehouse_not_configured",
		"message": _(
			"URY Production Settings: Store Warehouse is not configured. Store stock cannot be "
			"read or transferred until it is."
		),
	}


def _transfer_material_request_missing_blocker(production_plan):
	return {
		"type": "transfer_material_request_missing",
		"production_plan": production_plan,
		"message": _(
			"{0} has no submitted Material Transfer Material Request; generate one before Store "
			"stock can be transferred into this department."
		).format(production_plan),
	}
