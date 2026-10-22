# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Phase 2 runner: Manufacturing & Procurement simulation for one URY Simulation Run.

Walks one (company, branch, business_date) scope through the real URY
production pipeline, end to end:

    URY Sales Plan                       (created, walked to "Locked for Production")
        -> department Production Plans (submitted; Transfer + Purchase MRs generated)
        -> Store warehouse replenishment (Material Receipt Stock Entries)
        -> Prepare Production          (Transfer Stock Entry + Work Orders + Manufacture Stock Entries)

Everything is delegated to the existing production-plan-automation APIs --
this module invents no BOM parsing, no Production Plan creation and no Work
Order logic of its own. The only writes owned here are the Stock Entries
that replenish the shared Store warehouse so ``prepare_production`` is never
blocked on raw-material shortages (see
``ongoing/uat-simulator-impl/02-manufacturing-runner.md``).

Guards: every public entry point calls
:func:`ury.ury.simulator.guards.assert_uat_simulator_authorized` first.
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import flt, nowdate

from ury.ury.simulator.guards import assert_uat_simulator_authorized
from ury.ury.api.ury_sales_plan import transition_sales_plan
from ury.ury.api.ury_sales_plan_production_plan import (
	PP_DEPARTMENT_FIELD,
	create_or_get_department_production_plans,
)
from ury.ury.api.ury_production_transfer import (
	generate_transfer_material_request_for_production_plan,
)
from ury.ury.api.ury_production_settings import get_store_warehouse
from ury.ury.api.ury_production_readiness import compute_readiness
from ury.ury.api.ury_prepare_production import (
	STATE_COMPLETED,
	_compile_department_bucket,
	prepare_production,
	run_prepare_production_job,
)

SIMULATION_RUN_DOCTYPE = "URY Simulation Run"
SALES_PLAN_DOCTYPE = "URY Sales Plan"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
STOCK_ENTRY_DOCTYPE = "Stock Entry"
ITEM_PRODUCTION_CONFIGURATION = "URY Item Production Configuration"

#: Quantity planned per item when the caller passes no ``target_quantities``.
DEFAULT_TARGET_QTY = 10.0

#: Valuation fallback (per stock UOM) for raw materials with no standard rate.
DEFAULT_VALUATION_RATE = 10.0

#: Sales Plan workflow advance path, in order. Mirrors the forward edges of
#: the "URY Sales Plan" Workflow fixture.
SALES_PLAN_ADVANCE_PATH = ("Proposed", "Submitted for Approval", "Approved", "Locked for Production")

#: Run status written on ``URY Simulation Run`` after a successful pass.
RUN_STATUS_MANUFACTURING_DONE = "Manufacturing Done"
RUN_STATUS_FAILED = "Failed"


def run_manufacturing_simulation(run_doc, items=None, target_quantities=None) -> dict:
	"""Run the full manufacturing & procurement simulation for one run.

	``run_doc`` is either a loaded ``URY Simulation Run`` document or the
	``run_id`` string of one. ``items`` is an optional explicit list of item
	codes to plan; when omitted, items are discovered from the branch's active
	``URY Menu`` (restricted to items that have an active
	``URY Item Production Configuration`` with a BOM, falling back to any
	active configured item if the menu yields fewer than two).
	``target_quantities`` optionally overrides the planned qty per item
	(default :data:`DEFAULT_TARGET_QTY`).

	Steps (each delegated to the production-plan-automation APIs):

	1. Get or create the ``URY Sales Plan`` for (company, branch,
	   business_date) and advance it through the Workflow to
	   "Locked for Production" via :func:`transition_sales_plan`.
	2. Ensure submitted department Production Plans exist (idempotent call to
	   :func:`create_or_get_department_production_plans`); this also raises
	   the Transfer and Purchase Material Requests.
	3. Replenish stock: compile each department bucket
	   (:func:`_compile_department_bucket`), compute readiness
	   (:func:`compute_readiness`), and post one Material Receipt Stock
	   Entry per short raw material so Prepare Production is never blocked.
	   Purchase Material Request rows that are still pending are fulfilled
	   with a further direct receipt into the Store. A final safety pass
	   receives any residual direct-BOM-row requirement into each
	   department warehouse, covering items the compiler's deeper
	   ``raw_material_vector`` explosion does not transfer but the
	   Manufacture Stock Entry still consumes.
	4. Run Prepare Production per department plan; when the synchronous
	   preflight enqueues the background job, execute
	   :func:`run_prepare_production_job` inline so no RQ worker is needed.
	5. Update the run doc (sales plan link + "Manufacturing Done") and
	   commit.

	Returns ``{"sales_plan", "production_plans", "status", "details"}`` on
	success. Any department plan that does not reach
	:data:`STATE_COMPLETED` fails the run: the run doc is committed as
	"Failed" with an error summary, then a ``frappe.ValidationError`` is
	raised so callers (and the Phase 4 coordinator) see the failure.
	"""
	assert_uat_simulator_authorized()

	run_doc = _resolve_run_doc(run_doc)
	company = run_doc.get("company")
	branch = run_doc.get("branch")
	business_date = run_doc.get("business_date")
	if not (company and branch and business_date):
		frappe.throw(
			_("URY Simulation Run {0} must set company, branch and business_date.").format(run_doc.name),
			frappe.ValidationError,
		)

	try:
		return _run(run_doc, items=items, target_quantities=target_quantities)
	except Exception:
		_record_run_failure(run_doc)
		raise


def _run(run_doc, items=None, target_quantities=None) -> dict:
	company = run_doc.get("company")
	branch = run_doc.get("branch")
	business_date = run_doc.get("business_date")

	if items is None:
		items = _discover_items(branch)
	if not items:
		frappe.throw(
			_("No simulatable items found for branch {0}: none of the active menu items have an "
				"active URY Item Production Configuration with a BOM.").format(branch),
			frappe.ValidationError,
		)
	target_quantities = target_quantities or {}
	items_map = {code: (flt(target_quantities.get(code)) or DEFAULT_TARGET_QTY) for code in items}

	sales_plan, sales_plan_created = _get_or_create_sales_plan(company, branch, business_date, items_map)
	# Persist the link immediately (db_set: no validate, no commit) so a later
	# failure still records which plan this run was working on.
	run_doc.db_set("sales_plan", sales_plan.name, update_modified=False)
	sales_plan = _advance_sales_plan_to_locked(sales_plan)

	production_plans = _ensure_department_production_plans(sales_plan)

	store_warehouse = get_store_warehouse(company)
	if not store_warehouse:
		frappe.throw(
			_("No Store warehouse could be resolved for company {0} (URY Production Settings).").format(company),
			frappe.ValidationError,
		)

	replenishment = _replenish_store(
		sales_plan, production_plans, store_warehouse, company, business_date
	)

	outcomes = _prepare_all_plans(production_plans)

	details = {
		"branch": branch,
		"company": company,
		"business_date": str(business_date),
		"items": items_map,
		"sales_plan_created": sales_plan_created,
		"store_warehouse": store_warehouse,
		"replenishment": replenishment,
		"production_outcomes": outcomes,
	}

	failures = [row for row in outcomes if row["state"] != STATE_COMPLETED]
	run_doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
	run_doc.sales_plan = sales_plan.name
	if failures:
		run_doc.status = RUN_STATUS_FAILED
		run_doc.error_summary = _failure_summary(failures)[:140]
	else:
		run_doc.status = RUN_STATUS_MANUFACTURING_DONE
	run_doc.save(ignore_permissions=True)
	frappe.db.commit()

	if failures:
		frappe.throw(_failure_summary(failures), frappe.ValidationError)

	return {
		"sales_plan": sales_plan.name,
		"production_plans": production_plans,
		"status": "completed",
		"details": details,
	}


def _resolve_run_doc(run_doc):
	if isinstance(run_doc, str):
		run_doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc)
	if run_doc.get("doctype") != SIMULATION_RUN_DOCTYPE:
		frappe.throw(
			_("run_doc must be a URY Simulation Run document or run_id string, got {0}.").format(
				run_doc.get("doctype") if hasattr(run_doc, "get") else type(run_doc)
			),
			frappe.ValidationError,
		)
	return run_doc


def _record_run_failure(run_doc):
	"""Best-effort: stamp the run doc Failed with the traceback, and commit.

	Runs inside the ``except`` of the public entry point, so it must never
	raise -- a failure to record the failure would mask the original error.
	"""
	try:
		doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
		doc.status = RUN_STATUS_FAILED
		doc.error_summary = (frappe.get_traceback() or "")[-140:]
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()


def _failure_summary(failures):
	return "; ".join(
		"{0}: {1} ({2})".format(
			row["production_plan"],
			row["state"],
			row.get("error") or row.get("blockers") or "see custom_ury_production_result",
		)
		for row in failures
	)


# --- item discovery -------------------------------------------------------------


def _active_bom_configs(branch=None):
	"""Active URY Item Production Configuration rows that carry a BOM."""
	filters = {"active": 1}
	if branch:
		filters["branch"] = branch
	configs = frappe.get_all(ITEM_PRODUCTION_CONFIGURATION, filters=filters, fields=["item", "bom"])
	return [row for row in configs if row.get("item") and row.get("bom")]


def _discover_items(branch):
	"""Menu-first discovery of simulatable items for ``branch``.

	1. Items on an enabled branch menu that also have an active production
	   configuration with a BOM.
	2. Fallback when that yields fewer than two: any active configured item
	   with a BOM for the branch.
	3. Last resort: any active configured item with a BOM, regardless of
	   branch (callers should pass explicit ``items`` when this fires).
	"""
	candidates = []
	menus = frappe.get_all("URY Menu", filters={"branch": branch, "enabled": 1}, pluck="name")
	if menus:
		on_menu = set(
			frappe.get_all("URY Menu Item", filters={"parent": ["in", menus], "disabled": 0}, pluck="item")
			or []
		)
		candidates = [row["item"] for row in _active_bom_configs(branch) if row["item"] in on_menu]
	if len(candidates) < 2:
		candidates = [row["item"] for row in _active_bom_configs(branch)]
	if len(candidates) < 2:
		candidates = [row["item"] for row in _active_bom_configs()]

	seen = set()
	ordered = []
	for item in candidates:
		if item not in seen:
			seen.add(item)
			ordered.append(item)
	return ordered


# --- Sales Plan -----------------------------------------------------------------


def _get_or_create_sales_plan(company, branch, business_date, items_map):
	"""Reuse a live submitted plan for the scope, else insert a fresh Draft.

	Returns ``(sales_plan_doc, created)``.
	"""
	existing = frappe.get_all(
		SALES_PLAN_DOCTYPE,
		filters={
			"company": company,
			"branch": branch,
			"plan_date": business_date,
			"docstatus": ["<", 2],
		},
		order_by="modified desc",
		limit_page_length=1,
	)
	if existing:
		existing_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, existing[0].name)
		if existing_doc.docstatus == 1:
			return existing_doc, False

	sales_plan = frappe.get_doc(
		{
			"doctype": SALES_PLAN_DOCTYPE,
			"branch": branch,
			"company": company,
			"plan_date": business_date,
			"items": [{"item_code": code, "qty": qty} for code, qty in items_map.items()],
		}
	)
	sales_plan.insert()
	return sales_plan, True


def _advance_sales_plan_to_locked(sales_plan):
	"""Walk the plan forward through the Workflow to "Locked for Production".

	Each hop goes through :func:`transition_sales_plan` (the real Workflow
	engine), re-reading the doc between hops since ``apply_workflow`` saves
	and, on the "Approved" hop, submits the document.
	"""
	doc = sales_plan
	for target in SALES_PLAN_ADVANCE_PATH:
		doc = frappe.get_doc(SALES_PLAN_DOCTYPE, doc.name)
		if doc.status == "Locked for Production":
			break
		if doc.status == target:
			continue
		doc = transition_sales_plan(doc, target)

	doc = frappe.get_doc(SALES_PLAN_DOCTYPE, doc.name)
	if doc.status != "Locked for Production":
		frappe.throw(
			_("Sales Plan {0} reached {1} instead of Locked for Production.").format(doc.name, doc.status),
			frappe.ValidationError,
		)
	return doc


# --- department Production Plans -------------------------------------------------


def _ensure_department_production_plans(sales_plan):
	"""Submitted department Production Plans for ``sales_plan``.

	With ``enable_auto_production_plan`` on, the "Locked for Production"
	transition already created and submitted them; this idempotent call only
	fires when none exist (toggle off, or a plan created outside the
	workflow). It also (re)generates the Transfer and Purchase Material
	Requests -- both generators net outstanding supply, so a repeat call
	cannot pile up duplicates.
	"""
	plans = frappe.get_all(
		PRODUCTION_PLAN_DOCTYPE,
		filters={"custom_ury_sales_plan": sales_plan.name, "docstatus": 1},
		pluck="name",
	)
	if plans:
		return plans

	result = create_or_get_department_production_plans(sales_plan, submit=True)
	plans = [row["production_plan"] for row in result.get("production_plans") or []]
	if not plans:
		frappe.throw(
			_("No department Production Plans were created for {0} ({1}).").format(
				sales_plan.name, "; ".join(b.get("message", "") for b in result.get("blockers") or []) or "no departments"
			),
			frappe.ValidationError,
		)
	return plans


# --- Store replenishment ---------------------------------------------------------


def _replenish_store(sales_plan, production_plans, store_warehouse, company, business_date):
	"""Stock the shared Store warehouse with 100% of the required raw materials.

	Compiles every department bucket and runs one readiness pass over all of
	them (a single pass is what makes ``store_shortage`` account for demand
	shared across departments), then posts one Material Receipt Stock Entry
	per short item. Purchase Material Request rows still pending afterwards
	are fulfilled with a further direct receipt, so both the physical stock
	and every raised request line are covered.

	Returns a details dict; never raises on shortages -- it exists to remove
	them.
	"""
	buckets = {}
	compile_blockers = []
	for pp_name in production_plans:
		department = frappe.db.get_value(PRODUCTION_PLAN_DOCTYPE, pp_name, PP_DEPARTMENT_FIELD)
		bucket, blockers = _compile_department_bucket(sales_plan, department)
		compile_blockers.extend(blockers or [])
		buckets[department] = bucket

	readiness = compute_readiness(buckets, store_warehouse=store_warehouse)
	shortage_by_item = {}
	for row in readiness.get("rows") or []:
		shortage = flt(row.get("store_shortage"))
		if shortage > 0:
			shortage_by_item[row["item_code"]] = max(shortage_by_item.get(row["item_code"], 0.0), shortage)

	stocked = {}
	store_receipts = []
	if shortage_by_item:
		receipt = _create_material_receipt(company, store_warehouse, shortage_by_item, business_date)
		store_receipts.append(receipt)
		stocked.update(shortage_by_item)

	purchase_receipt, purchase_fulfilled = _fulfill_purchase_material_requests(
		sales_plan, store_warehouse, stocked, company, business_date
	)
	if purchase_receipt:
		store_receipts.append(purchase_receipt)

	department_receipts = _ensure_department_safety_stock(buckets, company, business_date)
	store_receipts.extend(department_receipts)

	transfer_mrs = _ensure_transfer_material_requests(production_plans)

	return {
		"readiness_blockers": readiness.get("blockers") or [],
		"compile_blockers": compile_blockers,
		"store_shortage": shortage_by_item,
		"stocked": dict(stocked),
		"purchase_fulfilled": purchase_fulfilled,
		"store_receipts": store_receipts,
		"transfer_material_requests": transfer_mrs,
	}


def _ensure_transfer_material_requests(production_plans):
	"""Ensure every department plan has its submitted Transfer Material Request.

	When a Sales Plan is re-simulated or resumed, its department Production
	Plans already exist, bypassing ``create_or_get_department_production_plans``.
	If the department warehouse has shortages (or if an earlier transfer was
	already consumed), ``execute_store_to_department_transfer`` strictly requires
	a submitted Transfer Material Request linked to the plan.

	``generate_transfer_material_request_for_production_plan`` nets outstanding
	transfers and only creates an MR when unallocated department shortage exists,
	so calling it idempotently here is completely safe and leak-free.
	"""
	generated = []
	for pp_name in production_plans:
		try:
			res = generate_transfer_material_request_for_production_plan(pp_name)
			if res and res.get("material_request"):
				generated.append(res["material_request"])
		except Exception as exc:
			frappe.logger().warning(
				f"URY UAT Simulator: supplementary transfer MR generation failed for {pp_name}: {exc}"
			)
	return generated


def _ensure_department_safety_stock(buckets, company, business_date):
	"""Stock each department warehouse with the direct rows of every target's
	own BOM, so the Manufacture Stock Entry ERPNext builds for a target's
	Work Order (one BOM level deep, via ``work_order.make_stock_entry``) never
	meets an absent or never-valued item.

	Why this is needed: the URY target compiler's ``raw_material_vector``
	explodes further than one level when a component happens to carry its own
	BOM (a "phantom" BOM on e.g. a spice mix), so readiness/transfer covers
	the exploded components while the manufacture entry still consumes the
	intermediate itself. Items that are themselves production targets of the
	same bucket are skipped -- their own Work Order manufactures them in
	dependency order. Availability is read per department warehouse and only
	the residual is received.

	Returns the list of created Stock Entry names.
	"""
	receipts = []
	# 1. Aggregate total direct requirement across all buckets grouped by (warehouse, item_code).
	# This ensures branches where multiple departments share the same department warehouse
	# (e.g. Kitchen and Salad both using 'Kitchen Salalah - UO') do not evaluate the same
	# Bin balance independently and under-replenish shared ingredients.
	required_by_warehouse = {}
	for department, bucket in buckets.items():
		department_warehouse = bucket.get("warehouse")
		if not department_warehouse:
			continue
		if department_warehouse not in required_by_warehouse:
			required_by_warehouse[department_warehouse] = {}

		produced_items = {t.get("item_code") for t in bucket.get("targets") or []}
		for target in bucket.get("targets") or []:
			bom_no = target.get("bom_no")
			if not bom_no or target.get("skip_work_order"):
				continue
			target_qty = flt(target.get("required_qty"))
			if target_qty <= 0:
				continue
			for row in _bom_direct_rows(bom_no):
				item_code = row["item_code"]
				if not item_code or item_code in produced_items:
					continue
				item_req = flt(row.get("stock_qty") or row.get("qty")) * target_qty
				required_by_warehouse[department_warehouse][item_code] = (
					required_by_warehouse[department_warehouse].get(item_code, 0.0) + item_req
				)

	# 2. For each warehouse and item, calculate the shortage against current Bin stock.
	for department_warehouse, required_items in required_by_warehouse.items():
		to_stock = {}
		for item_code, qty in required_items.items():
			available = flt(
				frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": department_warehouse}, "actual_qty")
			)
			shortage = qty - available
			# Skip float dust (BOM arithmetic routinely leaves ~1e-16
			# residues) and floor genuine smalls at 0.01 stock UOM -- the
			# site runs float_precision 2, so anything smaller would round
			# the Stock Entry row's transfer qty to zero and be rejected.
			if shortage > 1e-6:
				to_stock[item_code] = max(0.01, flt(shortage, 2))
		if to_stock:
			receipts.append(_create_material_receipt(company, department_warehouse, to_stock, business_date))
	return receipts


def _bom_direct_rows(bom_no):
	"""The direct component rows of one BOM (Frappe document read, no parsing)."""
	bom = frappe.get_doc("BOM", bom_no)
	return [
		{"item_code": row.item_code, "qty": row.qty, "stock_qty": row.stock_qty}
		for row in bom.items
		if row.item_code
	]


def _create_material_receipt(company, store_warehouse, item_qty_map, business_date):
	"""One submitted Stock Entry (purpose "Material Receipt") into the Store.

	``basic_rate`` (not ``valuation_rate``, which is read-only on Stock Entry
	Item) carries the incoming rate: ERPNext only falls back to a valuation
	lookup when it is unset, which is exactly what must not happen for raw
	materials that have never been received. Rate comes from the Item's
	standard rate, with :data:`DEFAULT_VALUATION_RATE` as fallback.
	"""
	items = []
	for item_code, qty in item_qty_map.items():
		stock_uom = frappe.db.get_value("Item", item_code, "stock_uom")
		basic_rate = flt(frappe.db.get_value("Item", item_code, "standard_rate")) or DEFAULT_VALUATION_RATE
		items.append(
			{
				"item_code": item_code,
				"qty": flt(qty),
				"uom": stock_uom,
				"stock_uom": stock_uom,
				"basic_rate": basic_rate,
			}
		)

	stock_entry = frappe.get_doc(
		{
			"doctype": STOCK_ENTRY_DOCTYPE,
			"purpose": "Material Receipt",
			"stock_entry_type": "Material Receipt",
			"company": company,
			"posting_date": business_date or nowdate(),
			"to_warehouse": store_warehouse,
			"items": items,
		}
	)
	stock_entry.insert(ignore_permissions=True)
	try:
		stock_entry.submit()
	except Exception:
		# Never leave a draft receipt behind: a half-created Stock Entry would
		# be picked up by nothing and only confuse a later manual review.
		frappe.delete_doc(STOCK_ENTRY_DOCTYPE, stock_entry.name, force=True)
		raise
	return stock_entry.name


def _fulfill_purchase_material_requests(sales_plan, store_warehouse, stocked, company, business_date):
	"""Top up the Store for any still-pending Purchase MR rows.

	``stocked`` carries the quantities already received in this pass; only
	the residual pending qty is received, so the two paths never double-stock
	an item. Returns ``(receipt_name_or_None, {item: qty_fulfilled})``.
	"""
	rows = frappe.db.sql(
		"""
		select mri.item_code as item_code, mri.qty as qty, mri.ordered_qty as ordered_qty
		from `tabMaterial Request Item` mri
		inner join `tabMaterial Request` mr on mr.name = mri.parent
		inner join `tabProduction Plan` pp on pp.name = mri.production_plan
		where pp.custom_ury_sales_plan = %s
		  and mr.material_request_type = 'Purchase'
		  and mr.docstatus = 1
		""",
		sales_plan.name,
		as_dict=True,
	)
	pending = {}
	for row in rows:
		remaining = flt(row.qty) - flt(row.ordered_qty)
		if remaining > 0:
			pending[row.item_code] = pending.get(row.item_code, 0.0) + remaining

	to_stock = {}
	for item_code, qty in pending.items():
		residual = qty - flt(stocked.get(item_code))
		if residual > 0:
			to_stock[item_code] = residual
	if not to_stock:
		return None, {}

	receipt = _create_material_receipt(company, store_warehouse, to_stock, business_date)
	for item_code, qty in to_stock.items():
		stocked[item_code] = flt(stocked.get(item_code)) + qty
	return receipt, to_stock


# --- Prepare Production ------------------------------------------------------------


def _prepare_all_plans(production_plans):
	"""Run Prepare Production for every department plan, synchronously.

	``prepare_production`` performs the advisory preflight and enqueues the
	background job; when it reports ``processing`` the job body is executed
	inline here (:func:`run_prepare_production_job`) so the simulation does
	not depend on RQ workers. The enqueued-after-commit duplicate, should a
	worker ever pick it up, self-aborts on the job's own stale-attempt check
	(state is no longer "Processing" by then).

	One department's failure never aborts the others: the job records
	"Production Failed" on the plan itself before re-raising, and any
	exception that escapes even that is captured into the outcome, so the
	caller can aggregate per-department results and fail the run at the end.
	"""
	outcomes = []
	for pp_name in production_plans:
		prepare_status = None
		try:
			res = prepare_production(pp_name)
			prepare_status = res.get("status")
			if prepare_status == "processing":
				run_prepare_production_job(pp_name, res["attempt"])
		except Exception as exc:  # noqa: BLE001 -- recorded into the outcome, see docstring
			outcomes.append(_outcome(pp_name, prepare_status, error=str(exc)))
			continue

		outcomes.append(_outcome(pp_name, prepare_status))
	return outcomes


def _outcome(pp_name, prepare_status, error=None):
	pp_doc = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, pp_name)
	state = pp_doc.get("custom_ury_production_state")
	result = _decode_result(pp_doc.get("custom_ury_production_result"))
	outcome = {
		"production_plan": pp_name,
		"department": pp_doc.get(PP_DEPARTMENT_FIELD),
		"state": state,
		"prepare_status": prepare_status,
		"work_orders": (result or {}).get("work_orders", []),
		"manufacture_stock_entries": (result or {}).get("manufacture_stock_entries", []),
		"transfer_stock_entries": (result or {}).get("stock_entries", []),
		"blockers": (result or {}).get("blockers", []),
	}
	if state != STATE_COMPLETED or error:
		outcome["error"] = error or (result or {}).get("error")
	return outcome


def _decode_result(value):
	if not value:
		return None
	try:
		return json.loads(value)
	except (TypeError, ValueError):
		return {"raw": value}
