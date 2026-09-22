# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Prepare Production orchestration for one department Production Plan.

See ``ongoing/production-plan-automation/PLAN.md``, "Prepare Production, per
department", "Shared Store contention", D5, D6, D9, D12, D13, D17, and the
"Agent 8" task section.

## Public surface

    prepare_production(production_plan)              # whitelisted, synchronous preflight + enqueue (D5)
    run_prepare_production_job(production_plan, attempt)  # background job body, never whitelisted
    get_production_state(production_plan)             # whitelisted, read-only
    get_sales_plan_production_states(sales_plan)       # whitelisted, read-only (D12)
    reset_stale_execution(production_plan)             # whitelisted, System Manager only (D17)

## D9 -- this module owns no locking

``execute_store_to_department_transfer`` (Agent 5, ``ury_production_transfer.py``)
is the *only* place Store Bin locks are taken and readiness is re-run under
them. This module calls it and reimplements none of that sequence -- see that
function's own docstring for the full preflight/lock/revalidate/execute
order. Do not add a second lock anywhere in this module; if a change ever
seems to need one, that is a sign the work belongs in Agent 5's module
instead.

## D5 -- two phases, one synchronous and advisory, one in the background

``prepare_production`` runs a synchronous preflight (compile targets, compute
readiness) that performs **no stock, Work Order or manufacturing mutations**.
On blockers it writes them and returns immediately (state ``Awaiting
Materials``, nothing enqueued). On a clean preflight it stamps the execution
tracking fields, enqueues :func:`run_prepare_production_job`, and returns
before that job has done anything. The synchronous preflight is advisory
only -- the real revalidation-under-locks happens inside
``execute_store_to_department_transfer`` when the job calls it (D17).

## Double-click guard

``prepare_production`` takes the same ``frappe.db.get_value(...,
for_update=True)`` row lock Agent 3 uses, and reads the plan's *current*
state under that lock before deciding anything. A first call that reaches
``Processing`` and commits releases the lock; a second, concurrent call
blocks on the lock until then, sees ``Processing`` once it acquires it, and
returns ``{"status": "already_processing"}`` instead of enqueuing a second
job. Two departments preparing concurrently never contend on this lock at
all -- it is per-Production-Plan, one row per department.

## Job identity and staleness (D17)

The job is enqueued with ``job_id`` set to a value generated (and persisted
onto ``custom_ury_execution_job_id``) *before* enqueuing, and with
``enqueue_after_commit=True`` so the job cannot start running before the
``Processing`` state this function just wrote has actually committed. Inside
the job, the very first thing checked is whether ``custom_ury_execution_attempt``
still matches the ``attempt`` the job was enqueued for and the plan is still
``Processing`` -- if either has moved on (a System Manager reset it, or a
newer attempt superseded it), the job is stale and does nothing. This is what
keeps a resurrected/duplicated worker from clobbering a newer attempt's
result.

"Genuinely dead" (for both the job's own stale-job self-check and
:func:`reset_stale_execution`) means
``frappe.utils.background_jobs.is_job_enqueued(job_id)`` is False -- RQ
reports the job as neither queued nor started. Elapsed heartbeat time alone
is never sufficient (D17): both conditions -- heartbeat stale beyond
``production_job_stale_minutes`` *and* the job confirmed dead -- must hold.

## Live progress must not touch ``tabProduction Plan`` mid-job

While the job runs, ERPNext Work Order / Manufacture Stock Entry submit
also updates the same Production Plan row (``ordered_qty``,
``produced_qty``, ``status``). Mid-job ``db.set_value`` + ``db.commit`` on
that row for URY step/heartbeat races those updates under MariaDB
``innodb_snapshot_isolation`` and fails with error 1020.

So D17 live ``step`` / ``heartbeat`` while ``Processing`` are published to
``frappe.cache`` (keyed by plan + attempt). ``get_production_state`` and
stale-reset read the cache first. The Production Plan row is written for
progress only at enqueue (``prepare_production``) and at terminal
``_finish_*`` -- never between transfer start and WO/SE completion.

## Blocked vs. failed

A blocker discovered by the job (Store stock consumed by a concurrent
department between preflight and lock acquisition, a missing Transfer MR, a
compiler blocker) is not a crash: the plan returns to ``Awaiting Materials``
with the blockers recorded, exactly like the synchronous preflight's own
blocked path, so a manager can act on them and retry. An actual exception
(a Work Order's persisted vector no longer matching what was compiled, an
ERPNext validation failure, anything :mod:`ury_production_plan_auto_work_order`
or :mod:`ury_production_transfer` raises rather than returns) is recorded to
``custom_ury_production_result`` with the terminal state ``Production
Failed`` and then re-raised, so it still reaches the worker's own error log
-- see PLAN.md's coordination rule: "the background job records failure in
``custom_ury_production_result`` and sets ``Production Failed``."
"""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now_datetime, time_diff_in_seconds
from frappe.utils.background_jobs import is_job_enqueued

from ury.ury.api.ury_production_plan_auto_work_order import execute_department_targets
from ury.ury.api.ury_production_readiness import compute_readiness
from ury.ury.api.ury_production_settings import get_store_warehouse, production_job_stale_minutes
from ury.ury.api.ury_production_target_compiler import compile_production_targets
from ury.ury.api.ury_production_transfer import execute_store_to_department_transfer
from ury.ury.api.ury_sales_plan_production_plan import (
	PP_DEPARTMENT_FIELD,
	PP_SALES_PLAN_FIELD,
	get_production_plan_states,
)

PRODUCTION_PLAN_DOCTYPE = "Production Plan"
SALES_PLAN_DOCTYPE = "URY Sales Plan"

#: ``custom_ury_production_state`` values (Wave 0 custom field, see
#: ``setup_customizations.get_custom_fields``'s Select options -- kept here
#: as the single set of string constants everything in this module compares
#: against).
STATE_AWAITING_MATERIALS = "Awaiting Materials"
STATE_READY = "Ready for Production"
STATE_PROCESSING = "Processing"
STATE_COMPLETED = "Production Completed"
STATE_FAILED = "Production Failed"

#: D12 -- the ``execution_state`` axis the frontend consumes, distinct from
#: ``link_state``. Never merge these (see module docstring and D12).
EXECUTION_STATE_BY_PRODUCTION_STATE = {
	STATE_AWAITING_MATERIALS: "awaiting_materials",
	STATE_READY: "ready",
	STATE_PROCESSING: "processing",
	STATE_COMPLETED: "completed",
	STATE_FAILED: "failed",
}

FIELD_RESULT = "custom_ury_production_result"
FIELD_STARTED_AT = "custom_ury_production_started_at"
FIELD_JOB_ID = "custom_ury_execution_job_id"
FIELD_ATTEMPT = "custom_ury_execution_attempt"
FIELD_HEARTBEAT = "custom_ury_execution_heartbeat"
FIELD_STEP = "custom_ury_execution_step"
FIELD_STATE = "custom_ury_production_state"

JOB_METHOD = "ury.ury.api.ury_prepare_production.run_prepare_production_job"
JOB_QUEUE = "long"

STEP_QUEUED = "queued"
STEP_TRANSFERRING_STOCK = "transferring_stock"
STEP_BUILDING_WORK_ORDERS = "building_work_orders"
STEP_COMPLETED = "completed"
STEP_BLOCKED = "blocked"
STEP_FAILED = "failed"
STEP_RESET = "reset"

#: Cache key for live step/heartbeat while Processing. Must not share the
#: Production Plan row with ERPNext's WO/Manufacture updates (see module docstring).
PROGRESS_CACHE_KEY_PREFIX = "ury:pp:exec"


# --- 1. Synchronous preflight + enqueue (D5) ----------------------------------


@frappe.whitelist(methods=["POST"])
def prepare_production(production_plan):
	"""Whitelisted entry point for one department's "Prepare Production"
	action.

	Validates permissions, URY linkage and submitted status, then runs the
	full preflight synchronously (compile targets, compute readiness) with
	**no stock, Work Order or manufacturing mutation** (D5). On blockers,
	writes them and returns with state ``Awaiting Materials``. On a clean
	preflight, stamps the execution tracking fields, enqueues the background
	job, and returns -- see module docstring for the double-click guard and
	job-identity details.

	Returns one of:

		{"status": "blocked", "production_plan": ..., "state": "Awaiting Materials", "blockers": [...]}
		{"status": "processing", "production_plan": ..., "state": "Processing", "job_id": ..., "attempt": ...}
		{"status": "already_processing", "production_plan": ..., "state": "Processing"}
	"""
	frappe.has_permission(PRODUCTION_PLAN_DOCTYPE, "write", production_plan, throw=True)

	locked = frappe.db.get_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		["docstatus", PP_SALES_PLAN_FIELD, PP_DEPARTMENT_FIELD, FIELD_STATE],
		for_update=True,
		as_dict=True,
	)
	if not locked:
		frappe.throw(_("{0} does not exist.").format(production_plan), frappe.DoesNotExistError)
	if not locked.get(PP_SALES_PLAN_FIELD):
		frappe.throw(
			_("{0} has no linked URY Sales Plan; it is not a department production plan.").format(production_plan),
			frappe.ValidationError,
		)
	if cint(locked.get("docstatus")) != 1:
		frappe.throw(
			_("{0} must be a submitted Production Plan before Prepare Production can run.").format(production_plan),
			frappe.ValidationError,
		)
	if locked.get(FIELD_STATE) == STATE_PROCESSING:
		# Double-click guard: the row lock above serialised us behind the
		# call that put this plan into Processing; nothing new to enqueue.
		return {"status": "already_processing", "production_plan": production_plan, "state": STATE_PROCESSING}

	plan_doc = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan)
	sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, plan_doc.get(PP_SALES_PLAN_FIELD))
	department = plan_doc.get(PP_DEPARTMENT_FIELD)

	bucket, compile_blockers = _compile_department_bucket(sales_plan_doc, department)
	readiness = compute_readiness({department: bucket}, store_warehouse=get_store_warehouse())

	blockers = list(compile_blockers) + list(readiness["blockers"])
	blockers += [_store_shortage_blocker(row) for row in readiness["rows"] if row["store_shortage"] > 0]

	if blockers:
		_write_blocked_state(plan_doc, blockers, stage="preflight")
		return {
			"status": "blocked",
			"production_plan": production_plan,
			"state": STATE_AWAITING_MATERIALS,
			"blockers": blockers,
		}

	job_id = frappe.generate_hash(length=20)
	attempt = cint(plan_doc.get(FIELD_ATTEMPT)) + 1

	plan_doc.set(FIELD_STATE, STATE_PROCESSING)
	plan_doc.set(FIELD_ATTEMPT, attempt)
	plan_doc.set(FIELD_STARTED_AT, now_datetime())
	plan_doc.set(FIELD_JOB_ID, job_id)
	plan_doc.set(FIELD_HEARTBEAT, now_datetime())
	plan_doc.set(FIELD_STEP, STEP_QUEUED)
	plan_doc.set(FIELD_RESULT, json.dumps({"status": "queued", "blockers": []}))
	# Same idiom Agent 5 uses to persist onto a submitted Production Plan's
	# own custom fields.
	plan_doc.flags.ignore_validate_update_after_submit = True
	plan_doc.save(ignore_permissions=True)
	_publish_live_progress(production_plan, attempt, STEP_QUEUED)

	frappe.enqueue(
		JOB_METHOD,
		queue=JOB_QUEUE,
		job_id=job_id,
		enqueue_after_commit=True,
		production_plan=production_plan,
		attempt=attempt,
	)

	return {
		"status": "processing",
		"production_plan": production_plan,
		"state": STATE_PROCESSING,
		"job_id": job_id,
		"attempt": attempt,
	}


def _compile_department_bucket(sales_plan_doc, department):
	"""One department's compiled bucket, recompiled fresh on every call --
	the same self-contained pattern ``ury_production_transfer`` uses, so
	this module never caches a target collection past the request/job step
	that computed it."""
	snapshot = sales_plan_doc.get("approval_snapshot")
	if not snapshot:
		frappe.throw(
			_("{0} has no frozen approval snapshot; it must be Approved before Prepare Production can run.").format(
				sales_plan_doc.name
			),
			frappe.ValidationError,
		)
	branch = sales_plan_doc.get("branch")
	company = sales_plan_doc.get("company")
	departments, blockers = compile_production_targets(snapshot, branch, company)
	bucket = departments.get(department) or {"warehouse": None, "targets": [], "external_receipt_targets": []}
	return bucket, blockers


def _write_blocked_state(plan_doc, blockers, stage):
	result = {"status": "blocked", "stage": stage, "blockers": blockers, "checked_at": str(now_datetime())}
	plan_doc.set(FIELD_STATE, STATE_AWAITING_MATERIALS)
	plan_doc.set(FIELD_RESULT, json.dumps(result, default=str))
	plan_doc.set(FIELD_STEP, STEP_BLOCKED)
	plan_doc.flags.ignore_validate_update_after_submit = True
	plan_doc.save(ignore_permissions=True)


def _store_shortage_blocker(row):
	return {
		"type": "store_shortage",
		"item_code": row["item_code"],
		"department": row["department"],
		"shortage": row["store_shortage"],
		"message": _("Insufficient Store stock for {0}: short by {1} {2}.").format(
			row["item_code"], row["store_shortage"], row.get("stock_uom") or ""
		),
	}


# --- 2. Background job (D17) ---------------------------------------------------


def run_prepare_production_job(production_plan, attempt):
	"""Background job body. Never whitelisted -- reached only through
	:func:`frappe.enqueue` from :func:`prepare_production`.

	1. Self-check: abort silently if this attempt has been superseded (a
	   newer ``prepare_production`` call, or a System Manager reset) --
	   never clobber a newer attempt's state.
	2. Call :func:`ury_production_transfer.execute_store_to_department_transfer`,
	   which owns the whole Bin-lock/revalidate/transfer sequence (D9, D17).
	   Any blocker it returns aborts here, before Work Orders, with the plan
	   returned to ``Awaiting Materials``.
	3. Recompile this department's targets one more time (fresh, per the
	   "never cache" rule) and call
	   :func:`ury_production_plan_auto_work_order.execute_department_targets`.
	4. Persist a result summary and the terminal state.

	Live step/heartbeat while running go to :func:`_publish_live_progress`
	(cache only) -- never mid-job writes/commits on the Production Plan row.
	See module docstring.

	Any exception raised by step 2 or 3 is recorded to
	``custom_ury_production_result`` with state ``Production Failed`` and
	then re-raised, so it still surfaces in the worker's own error log.
	"""
	attempt = cint(attempt)
	plan_doc = frappe.get_doc(PRODUCTION_PLAN_DOCTYPE, production_plan)

	if cint(plan_doc.get(FIELD_ATTEMPT)) != attempt or plan_doc.get(FIELD_STATE) != STATE_PROCESSING:
		# Stale job: a newer attempt or a reset has already moved this plan
		# on. Doing nothing here is the point (see module docstring).
		return

	sales_plan = plan_doc.get(PP_SALES_PLAN_FIELD)
	department = plan_doc.get(PP_DEPARTMENT_FIELD)

	try:
		_publish_live_progress(production_plan, attempt, STEP_TRANSFERRING_STOCK)
		transfer_result = execute_store_to_department_transfer(production_plan)
		if transfer_result["blockers"]:
			_finish_blocked(production_plan, transfer_result["blockers"], stage="transfer", attempt=attempt)
			return

		_publish_live_progress(production_plan, attempt, STEP_BUILDING_WORK_ORDERS)
		sales_plan_doc = frappe.get_doc(SALES_PLAN_DOCTYPE, sales_plan)
		bucket, compile_blockers = _compile_department_bucket(sales_plan_doc, department)
		if compile_blockers:
			_finish_blocked(production_plan, compile_blockers, stage="compile", attempt=attempt)
			return

		# Pass the plan name, not a doc held across the mutation phase --
		# execute_department_targets reloads what it needs.
		target_results = execute_department_targets(production_plan, bucket["targets"])

		_finish_completed(production_plan, transfer_result, target_results, attempt=attempt)
	except Exception as exc:  # noqa: BLE001 -- deliberately broad, see docstring
		_finish_failed(production_plan, exc, attempt=attempt)
		raise


def _progress_cache_key(production_plan, attempt):
	return f"{PROGRESS_CACHE_KEY_PREFIX}:{production_plan}:{cint(attempt)}"


def _progress_cache_ttl_seconds():
	# Keep live progress at least as long as the stale threshold, with headroom.
	return max(cint(production_job_stale_minutes()) * 60 * 2, 3600)


def _publish_live_progress(production_plan, attempt, step):
	"""D17 live step/heartbeat for UI polling -- cache only, never the PP row."""
	frappe.cache.set_value(
		_progress_cache_key(production_plan, attempt),
		{"step": step, "heartbeat": str(now_datetime())},
		expires_in_sec=_progress_cache_ttl_seconds(),
	)


def _read_live_progress(production_plan, attempt):
	if attempt is None:
		return None
	return frappe.cache.get_value(_progress_cache_key(production_plan, attempt))


def _clear_live_progress(production_plan, attempt):
	if attempt is None:
		return
	frappe.cache.delete_value(_progress_cache_key(production_plan, attempt))


def _finish_blocked(production_plan, blockers, stage, attempt=None):
	result = {"status": "blocked", "stage": stage, "blockers": blockers, "finished_at": str(now_datetime())}
	frappe.db.set_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		{
			FIELD_STATE: STATE_AWAITING_MATERIALS,
			FIELD_RESULT: json.dumps(result, default=str),
			FIELD_STEP: STEP_BLOCKED,
			FIELD_HEARTBEAT: now_datetime(),
		},
		update_modified=False,
	)
	_clear_live_progress(production_plan, attempt if attempt is not None else _db_attempt(production_plan))
	frappe.db.commit()


def _finish_completed(production_plan, transfer_result, target_results, attempt=None):
	result = {
		"status": "completed",
		"stock_entries": transfer_result.get("stock_entries", []),
		"work_orders": [row["work_order"] for row in target_results],
		"manufacture_stock_entries": [
			row["manufacture_stock_entry"] for row in target_results if row.get("manufacture_stock_entry")
		],
		"targets": target_results,
		"finished_at": str(now_datetime()),
	}
	frappe.db.set_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		{
			FIELD_STATE: STATE_COMPLETED,
			FIELD_RESULT: json.dumps(result, default=str),
			FIELD_STEP: STEP_COMPLETED,
			FIELD_HEARTBEAT: now_datetime(),
		},
		update_modified=False,
	)
	_clear_live_progress(production_plan, attempt if attempt is not None else _db_attempt(production_plan))
	frappe.db.commit()


def _finish_failed(production_plan, exc, attempt=None):
	result = {"status": "failed", "error": str(exc), "finished_at": str(now_datetime())}
	frappe.db.set_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		{
			FIELD_STATE: STATE_FAILED,
			FIELD_RESULT: json.dumps(result, default=str),
			FIELD_STEP: STEP_FAILED,
			FIELD_HEARTBEAT: now_datetime(),
		},
		update_modified=False,
	)
	_clear_live_progress(production_plan, attempt if attempt is not None else _db_attempt(production_plan))
	frappe.db.commit()


def _db_attempt(production_plan):
	return frappe.db.get_value(PRODUCTION_PLAN_DOCTYPE, production_plan, FIELD_ATTEMPT)


# --- 3. Read-only state API (D12) -----------------------------------------------


@frappe.whitelist()
def get_production_state(production_plan):
	"""Read-only state for one department Production Plan, for the desk UI's
	polling and for Agent 9's frontend.

	Returns:

		{
		    "production_plan": "MFG-PP-2026-00001",
		    "department": "Main Kitchen",
		    "docstatus": 1,
		    "production_state": "Processing",        # raw custom_ury_production_state value
		    "execution_state": "processing",          # D12 axis -- see EXECUTION_STATE_BY_PRODUCTION_STATE
		    "blockers": [...],                        # from the most recent result, [] if none
		    "result": {...} or None,                  # decoded custom_ury_production_result
		    "started_at": "...", "heartbeat": "...", "step": "...",
		    "attempt": 2, "job_id": "...",
		    "heartbeat_stale": False,
		    "job_running": True,
		    "can_reset": False,                       # True only under D17's full condition, System Manager only
		}
	"""
	frappe.has_permission(PRODUCTION_PLAN_DOCTYPE, "read", production_plan, throw=True)

	row = frappe.db.get_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		[
			"docstatus",
			"status",
			PP_DEPARTMENT_FIELD,
			FIELD_STATE,
			FIELD_RESULT,
			FIELD_STARTED_AT,
			FIELD_JOB_ID,
			FIELD_ATTEMPT,
			FIELD_HEARTBEAT,
			FIELD_STEP,
		],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("{0} does not exist.").format(production_plan), frappe.DoesNotExistError)

	result = _decode_result(row.get(FIELD_RESULT))
	heartbeat = row.get(FIELD_HEARTBEAT)
	step = row.get(FIELD_STEP)
	# While Processing, live progress is cache-backed (see module docstring).
	if row.get(FIELD_STATE) == STATE_PROCESSING:
		live = _read_live_progress(production_plan, row.get(FIELD_ATTEMPT))
		if live:
			heartbeat = live.get("heartbeat") or heartbeat
			step = live.get("step") or step

	heartbeat_stale = _is_heartbeat_stale(heartbeat)
	job_running = bool(row.get(FIELD_JOB_ID)) and is_job_enqueued(row[FIELD_JOB_ID])
	can_reset = (
		row.get(FIELD_STATE) == STATE_PROCESSING
		and heartbeat_stale
		and not job_running
		and "System Manager" in frappe.get_roles()
	)

	return {
		"production_plan": production_plan,
		"department": row.get(PP_DEPARTMENT_FIELD),
		"docstatus": row.get("docstatus"),
		"status": row.get("status"),
		"production_state": row.get(FIELD_STATE),
		"execution_state": EXECUTION_STATE_BY_PRODUCTION_STATE.get(row.get(FIELD_STATE), "awaiting_materials"),
		"blockers": (result or {}).get("blockers", []),
		"result": result,
		"started_at": row.get(FIELD_STARTED_AT),
		"heartbeat": heartbeat,
		"step": step,
		"attempt": row.get(FIELD_ATTEMPT),
		"job_id": row.get(FIELD_JOB_ID),
		"heartbeat_stale": heartbeat_stale,
		"job_running": job_running,
		"can_reset": can_reset,
	}


@frappe.whitelist()
def get_sales_plan_production_states(sales_plan):
	"""Read-only per-department state for every live Production Plan under
	``sales_plan``, for the Sales Plan page's department grouping (D12).

	Built on top of Agent 3's ``get_production_plan_states`` (link-state
	axis: today's ``none``/``live``/``stale`` semantics, including the
	``custom_ury_snapshot_hash`` staleness comparison), enriched here with
	the *separate* ``execution_state`` axis and the most recent blockers --
	D12 requires both, never merged.

	Returns:

		{
		    "sales_plan": "SP-2026-00001",
		    "status": "Locked for Production",
		    "eligible": True,     # can Production Plans exist for this Sales Plan status at all
		    "can_create": True,   # current user's create permission
		    "production_plans": [
		        {
		            "department": "Main Kitchen",
		            "production_plan": "MFG-PP-2026-00001",
		            "docstatus": 1,
		            "status": "Not Started",          # ERPNext Production Plan.status
		            "link_state": "live",             # "live" | "stale" (D12 axis 1 -- see note below)
		            "execution_state": "processing",  # D12 axis 2
		            "can_open": True,
		            "blockers": [...],
		        },
		        ...
		    ],
		}

	Note on ``link_state``: this only ever lists departments that *have* a
	live (non-cancelled) Production Plan, exactly as
	``get_production_plan_states`` does, so its ``link_state`` is only ever
	``"live"`` or ``"stale"`` here. A department with no plan at all
	(``link_state: "none"``) or one belonging to a Sales Plan whose status
	does not permit Production Plans (``link_state: "ineligible"``) is never
	invented here without walking every department a Sales Plan *could*
	produce, which needs the target compiler, not just a Production Plan
	listing -- Agent 9's frontend already enumerates every department from
	its own ``groupedItems`` and can derive ``"none"``/``"ineligible"`` for
	any department missing from this list, using the top-level ``eligible``
	flag returned here.
	"""
	frappe.has_permission(SALES_PLAN_DOCTYPE, "read", sales_plan, throw=True)

	base = get_production_plan_states(sales_plan)

	names = [row["name"] for row in base["production_plans"]]
	results_by_name = {}
	if names:
		for row in frappe.get_all(
			PRODUCTION_PLAN_DOCTYPE, filters={"name": ["in", names]}, fields=["name", FIELD_RESULT]
		):
			results_by_name[row["name"]] = _decode_result(row.get(FIELD_RESULT))

	production_plans = []
	for row in base["production_plans"]:
		result = results_by_name.get(row["name"])
		# get_production_plan_states already maps custom_ury_department ->
		# "department" and the plan name -> "name". Reading PP_DEPARTMENT_FIELD
		# here would always be None, so the Sales Plan UI could never match a
		# department header to its Production Plan and the Open button never
		# appeared after Lock for Production.
		production_plans.append(
			{
				"department": row.get("department"),
				"production_plan": row["name"],
				"docstatus": row["docstatus"],
				"status": row.get("status"),
				"link_state": row["link_state"],
				"execution_state": EXECUTION_STATE_BY_PRODUCTION_STATE.get(
					row.get("production_state"), "awaiting_materials"
				),
				"can_open": row["can_open"],
				"blockers": (result or {}).get("blockers", []),
			}
		)

	return {
		"sales_plan": sales_plan,
		"status": base["status"],
		"eligible": base["eligible"],
		"can_create": base["can_create"],
		"production_plans": production_plans,
	}


def _decode_result(value):
	if not value:
		return None
	try:
		return json.loads(value)
	except (TypeError, ValueError):
		return {"raw": value}


def _is_heartbeat_stale(heartbeat):
	if not heartbeat:
		return True
	elapsed_minutes = time_diff_in_seconds(now_datetime(), get_datetime(heartbeat)) / 60.0
	return elapsed_minutes > production_job_stale_minutes()


# --- 4. Stale recovery, System Manager only (D17) -------------------------------


@frappe.whitelist(methods=["POST"])
def reset_stale_execution(production_plan):
	"""Reset a stuck ``Processing`` plan back to ``Awaiting Materials`` so it
	can be retried, restricted to System Manager and to the full D17
	condition: heartbeat stale beyond ``production_job_stale_minutes`` **and**
	the recorded job confirmed no longer queued or running. Elapsed time
	alone is never sufficient -- a plan whose job is still alive is refused
	however old its heartbeat looks.

	Does not touch ``custom_ury_execution_attempt``: the next
	``prepare_production`` call increments it, so a resumed job for this
	newly-reset attempt can never be confused with the dead one (see
	:func:`run_prepare_production_job`'s own stale-job self-check).
	"""
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only a System Manager can reset a stale Prepare Production execution."), frappe.PermissionError)
	frappe.has_permission(PRODUCTION_PLAN_DOCTYPE, "write", production_plan, throw=True)

	row = frappe.db.get_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		[FIELD_STATE, FIELD_HEARTBEAT, FIELD_JOB_ID, FIELD_ATTEMPT],
		for_update=True,
		as_dict=True,
	)
	if not row:
		frappe.throw(_("{0} does not exist.").format(production_plan), frappe.DoesNotExistError)
	if row.get(FIELD_STATE) != STATE_PROCESSING:
		frappe.throw(_("{0} is not Processing; there is nothing to reset.").format(production_plan))

	heartbeat = row.get(FIELD_HEARTBEAT)
	live = _read_live_progress(production_plan, row.get(FIELD_ATTEMPT))
	if live and live.get("heartbeat"):
		heartbeat = live["heartbeat"]

	if not _is_heartbeat_stale(heartbeat):
		frappe.throw(
			_("{0}'s heartbeat is not yet stale; the job may still be alive. Wait before resetting.").format(
				production_plan
			)
		)
	job_id = row.get(FIELD_JOB_ID)
	if job_id and is_job_enqueued(job_id):
		frappe.throw(
			_(
				"{0}'s recorded job is still queued or running. It cannot be reset while alive, "
				"however old its heartbeat looks."
			).format(production_plan)
		)

	result = {
		"status": "reset",
		"reset_by": frappe.session.user,
		"reset_at": str(now_datetime()),
		"previous_job_id": job_id,
	}
	frappe.db.set_value(
		PRODUCTION_PLAN_DOCTYPE,
		production_plan,
		{
			FIELD_STATE: STATE_AWAITING_MATERIALS,
			FIELD_STEP: STEP_RESET,
			FIELD_RESULT: json.dumps(result, default=str),
		},
	)
	_clear_live_progress(production_plan, row.get(FIELD_ATTEMPT))
	return {"production_plan": production_plan, "state": STATE_AWAITING_MATERIALS}
