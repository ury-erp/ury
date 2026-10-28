# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Phase 4 coordinator: daily lifecycle orchestration, cron slot processing
and reporting for the URY UAT data simulator.

Composes the Phase 2 manufacturing runner and the Phase 3 POS runner into a
single daily lifecycle for one (branch, business_date) scope:

    run_daily_simulation()           -- one-shot CLI orchestrator:
        get_or_create_daily_run()    -> single-flight URY Simulation Run
        run_manufacturing_simulation -> sales plan -> production -> stock
        run_pos_simulation           -> open -> slots -> orders -> close
            (or, with auto_close=False, only open + generate slots, leaving
             the run for the cron-driven path)
        generate_run_report()        -> Markdown summary on run.report_markdown

    initiate_morning_simulation()    -- Stage 1 morning initiator (10:00 AM):
                                        for every branch with an active POS
                                        Profile and menu, get_or_create the
                                        day's run, run manufacturing, then open
                                        the POS session and stamp the slot
                                        timetable so the cron hook can drain it.

    process_scheduled_slot()         -- Stage 2 scheduler cron hook (every 10
        min, 10:00-18:59):             claims one leaseable slot per open run
                                        and processes its order. It NEVER
                                        closes the session -- a run whose slots
                                        are all terminal is simply left "Open"
                                        for Stage 3.

    finalize_evening_simulation()    -- Stage 3 evening finalizer (19:00):
                                        for every run of the day still open,
                                        locks out further slot execution,
                                        completes/closes its Production Plans
                                        (MTO-aware gate), closes the POS
                                        session (consolidation + reservation
                                        fulfilment + URY Daily P and L), then
                                        generates the report and marks the run
                                        "Completed".

The cron path exists so a simulated service day unfolds in near-real-time
instead of inside one long CLI call: ``uat-simulate-day --no-auto-close``
opens the session and stamps the slot timetable, then the scheduler works the
slots off one lease at a time. Slot claiming uses a distributed lease
(``leased_until`` + ``lease_owner``) claimed with a conditional UPDATE, so
two overlapping cron workers can never process the same slot twice; a
crashed worker's lease simply expires after 10 minutes and the slot becomes
claimable again (bounded by ``max_attempts``).

The POS pipeline must run under the branch's own simulator cashier user
(``sim.cashier.<branch>@ury.local``, created on demand): ERPNext rejects a
second concurrently open POS session for the same user across profiles, so
one shared cashier would serialize all branches while pre-existing users
(e.g. Administrator) can carry stale open sessions that wedge the per-user
opening check (see ongoing/uat-simulator-impl/03-pos-runner.md, Finding A).
The coordinator therefore switches to the branch cashier before touching
POS state (manufacturing runs as the calling user).

Guards: every public entry point calls
:func:`ury.ury.simulator.guards.assert_uat_simulator_authorized` first;
the scheduler hook deliberately uses the non-throwing
:func:`~ury.ury.simulator.guards.is_uat_simulator_enabled` so a disabled
site stays a silent no-op instead of polluting the scheduler error log.
"""

from __future__ import annotations

from datetime import time as dt_time

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, get_datetime, getdate, now_datetime, today

from ury.ury.simulator.guards import (
	TERMINAL_RUN_STATUSES,
	assert_uat_simulator_authorized,
	is_uat_simulator_enabled,
)
from ury.ury.simulator.manufacturing_runner import run_manufacturing_simulation
from ury.ury.simulator.pos_runner import (
	close_or_complete_production_plans_for_run,
	close_pos_session,
	generate_simulation_slots,
	get_or_create_sim_cashier,
	open_pos_session,
	process_slot_order,
	run_pos_simulation,
)

SIMULATION_RUN_DOCTYPE = "URY Simulation Run"
POS_PROFILE_DOCTYPE = "POS Profile"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
MERGE_LOG_DOCTYPE = "POS Invoice Merge Log"
SALES_INVOICE_DOCTYPE = "Sales Invoice"
URY_MENU_DOCTYPE = "URY Menu"

#: Legacy simulator cashier user -- kept for branch-less callers (see
#: :func:`_assume_sim_cashier`). POS sessions themselves always use the
#: per-branch cashier from :func:`get_or_create_sim_cashier`.
SIM_CASHIER_USER = "sim.cashier@ury.local"

#: Run statuses that still have manufacturing work to do (phase 2 states
#: plus the initial "Pending").
MANUFACTURING_PENDING_STATUSES = (
	"Pending",
	"Preparing",
	"Sales Plan Created",
	"Manufacturing In Progress",
)

#: Run statuses the cron slot processor works on.
CRON_ACTIVE_STATUSES = ("POS Open", "Generating Invoices")

#: Run statuses the evening finalizer (Stage 3) works on. "POS Open" /
#: "Generating Invoices" are the in-transaction-window states ("Open");
#: "Closing Failed" runs get a retry. "Transactions Complete" is listed
#: defensively for runs stamped terminal-by-slots by an earlier revision --
#: Stage 2 no longer writes it (it simply leaves the run Open).
FINALIZABLE_RUN_STATUSES = (
	"POS Open",
	"Generating Invoices",
	"Transactions Complete",
	"Closing In Progress",
	"Closing Failed",
)

#: Minutes a claimed slot stays leased before another worker may retry it.
LEASE_MINUTES = 10

#: Legacy closing cutoff (22:00). Stage 2 no longer closes sessions at all --
#: closing happens exclusively in :func:`finalize_evening_simulation` -- but
#: the constant is kept for the CLI backstop and existing imports.
CLOSING_CUTOFF = dt_time(22, 0)


def get_or_create_daily_run(branch, company=None, pos_profile=None, business_date=None):
	"""Return the single ``URY Simulation Run`` for ``(business_date, branch)``,
	creating it when none exists.

	``business_date`` defaults to today. ``company`` and ``pos_profile``
	default to the values configured on the branch's POS Profile. The
	(business_date, branch) scope is single-flight and single-daily:
	1. An existing non-terminal run (any active phase) is returned untouched
	   so a re-invocation resumes the same day instead of forking it.
	2. An already "Completed" run for the day is also returned untouched so
	   a repeat call does not open a second POS session or duplicate the daily run.
	3. Only when no run (or only an aborted/failed run) exists is a fresh run created.
	"""
	assert_uat_simulator_authorized()

	business_date = getdate(business_date or today())
	pos_profile = pos_profile or frappe.db.get_value(POS_PROFILE_DOCTYPE, {"branch": branch}, "name")
	company = company or (frappe.db.get_value(POS_PROFILE_DOCTYPE, pos_profile, "company") if pos_profile else None)
	if not pos_profile or not company:
		frappe.throw(
			_("Could not resolve a POS Profile / Company for branch {0}; pass them explicitly.").format(branch),
			frappe.ValidationError,
		)

	# 1. First preference: return any active, in-flight run
	active = frappe.get_all(
		SIMULATION_RUN_DOCTYPE,
		filters={
			"business_date": business_date,
			"branch": branch,
			"status": ["not in", list(TERMINAL_RUN_STATUSES)],
		},
		fields=["name"],
		order_by="creation asc",
		limit=1,
	)
	if active:
		return frappe.get_doc(SIMULATION_RUN_DOCTYPE, active[0].name)

	# 2. If the day's run is already completed, return it to ensure only one session per day
	completed = frappe.get_all(
		SIMULATION_RUN_DOCTYPE,
		filters={
			"business_date": business_date,
			"branch": branch,
			"status": "Completed",
		},
		fields=["name"],
		order_by="creation desc",
		limit=1,
	)
	if completed:
		return frappe.get_doc(SIMULATION_RUN_DOCTYPE, completed[0].name)

	run_id = "SIM-{}-{}-{}".format(
		str(business_date).replace("-", ""),
		branch,
		frappe.generate_hash(length=4),
	)
	run = frappe.get_doc(
		{
			"doctype": SIMULATION_RUN_DOCTYPE,
			"run_id": run_id,
			"status": "Pending",
			"business_date": business_date,
			"company": company,
			"branch": branch,
			"pos_profile": pos_profile,
		}
	)
	run.insert(ignore_permissions=True)
	frappe.db.commit()
	return run


def run_daily_simulation(
	branch,
	company=None,
	pos_profile=None,
	business_date=None,
	auto_close=True,
	slot_count=12,
) -> dict:
	"""Run (or resume) the full simulated service day for ``branch``.

	Idempotent per (business_date, branch): resuming a run in progress picks
	up at the step its status implies -- manufacturing reruns only while the
	run is still in a manufacturing-pending status (the phase 2 runner is
	itself idempotent), and POS slot generation is a no-op when slots already
	exist. With ``auto_close`` the POS session is closed and consolidated in
	the same call; without it the session is left open with its slot
	timetable for :func:`process_scheduled_slot` to work off via cron.

	Returns a summary dict (run references, manufacturing outcome, POS
	outcome, counters and the Markdown report).
	"""
	assert_uat_simulator_authorized()

	run = get_or_create_daily_run(branch, company, pos_profile, business_date)

	# Manufacturing runs as the calling user (the phase 2 runner performs
	# permission-checked inserts); only the POS pipeline needs the cashier.
	manufacturing = None
	if run.status in MANUFACTURING_PENDING_STATUSES:
		manufacturing = run_manufacturing_simulation(run)

	_assume_sim_cashier(run.branch)

	pos_outcome = None
	if auto_close:
		pos_outcome = run_pos_simulation(run, slot_count=slot_count)
	else:
		open_pos_session(run)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
		generate_simulation_slots(run, count=slot_count)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
		pos_outcome = {
			"run_id": run.name,
			"pos_opening_entry": run.get("pos_opening_entry"),
			"status": run.status,
			"slots": [
				{
					"slot": slot.slot_number,
					"time": str(slot.slot_time),
					"scenario": slot.scenario,
					"status": slot.status,
				}
				for slot in run.slots
			],
		}

	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
	run.report_markdown = generate_run_report(run)
	run.save(ignore_permissions=True)
	frappe.db.commit()

	summary = {
		"run_id": run.name,
		"status": run.status,
		"branch": run.branch,
		"company": run.company,
		"pos_profile": run.pos_profile,
		"business_date": str(run.business_date),
		"sales_plan": run.get("sales_plan"),
		"manufacturing": manufacturing,
		"pos": pos_outcome,
		"counters": {
			"total_invoices": run.get("total_invoices"),
			"total_revenue": flt(run.get("total_revenue")),
			"takeaway_invoices": run.get("takeaway_invoices"),
			"dine_in_invoices": run.get("dine_in_invoices"),
			"delivery_invoices": run.get("delivery_invoices"),
			"aggregator_invoices": run.get("aggregator_invoices"),
		},
		"pos_opening_entry": run.get("pos_opening_entry"),
		"pos_closing_entry": run.get("pos_closing_entry"),
		"consolidated_sales_invoice": run.get("consolidated_sales_invoice"),
		"report_markdown": run.get("report_markdown"),
	}
	return summary


def get_active_simulation_branches() -> list:
	"""Branches eligible for simulation: an enabled ``POS Profile`` AND an
	enabled ``URY Menu`` (a profile without a menu has no sellable items,
	and a menu without a profile has no session to sell through).

	Read-only helper shared by the morning initiator and the CLI; no guard
	call -- discovery is harmless on any site.
	"""
	branches = []
	for profile in frappe.get_all(
		POS_PROFILE_DOCTYPE, filters={"disabled": 0}, fields=["name", "branch"]
	):
		if not profile.branch or profile.branch in branches:
			continue
		if frappe.db.exists(URY_MENU_DOCTYPE, {"branch": profile.branch, "enabled": 1}):
			branches.append(profile.branch)
	return branches


def initiate_morning_simulation(business_date=None, slot_count=12) -> list:
	"""Stage 1 morning initiator (registered on the ``0 10 * * *`` cron):
	open the simulated service day on every active branch.

	For each branch from :func:`get_active_simulation_branches` the day's
	run is fetched single-flight (:func:`get_or_create_daily_run`), pushed
	through manufacturing when still pending, then the branch's POS session
	is opened (as the branch's own cashier) and the slot timetable is
	stamped -- after which the every-10-minutes :func:`process_scheduled_slot`
	(Stage 2) drains the slots and the 19:00
	:func:`finalize_evening_simulation` (Stage 3) closes the session. The
	run is left in its "Open" POS-active status.

	Resumable and isolated: a run already past manufacturing is not re-run,
	an already-open session is reused, slot generation is idempotent, and
	each branch is wrapped in try/except with ``frappe.log_error`` + rollback
	so one broken branch never blocks the others.

	Silent no-op (returns ``[]``) when the simulator is disabled, matching
	:func:`process_scheduled_slot`. Returns one dict per branch::

	    {"branch", "run_id", "status", "business_date",
	     "pos_opening_entry", "slots", "error"?}
	"""
	if not is_uat_simulator_enabled():
		return []

	results = []
	calling_user = frappe.session.user
	for branch in get_active_simulation_branches():
		try:
			results.append(
				_initiate_branch_simulation(branch, business_date, slot_count, calling_user)
			)
		except Exception:
			traceback = frappe.get_traceback()
			frappe.log_error(
				traceback,
				"URY UAT Simulator: daily initiation failed for {0}".format(branch),
			)
			frappe.db.rollback()
			results.append(
				{"branch": branch, "status": "Failed", "error": (traceback or "")[-140:]}
			)
	return results


def initiate_daily_simulation_for_all_branches(business_date=None, slot_count=12) -> list:
	"""Back-compat alias for :func:`initiate_morning_simulation` (Stage 1).

	Older callers and tests import this name; new code should use
	:func:`initiate_morning_simulation`.
	"""
	return initiate_morning_simulation(business_date=business_date, slot_count=slot_count)


def _initiate_branch_simulation(branch, business_date, slot_count, calling_user) -> dict:
	"""Advance one branch's day to the point the cron hook can take over."""
	# Manufacturing is permission-checked (Sales Plan workflow transitions)
	# and must run as the calling user -- a previous branch's
	# ``_assume_sim_cashier`` leaves the session on that branch's cashier,
	# which lacks the workflow roles and would wedge every later branch.
	if frappe.session.user != calling_user:
		frappe.set_user(calling_user)

	run = get_or_create_daily_run(branch=branch, business_date=business_date)

	if run.status == "Completed":
		# Only one POS session per day: if today's run has already completed,
		# do not attempt manufacturing or open a second POS session.
		return {
			"branch": branch,
			"run_id": run.name,
			"status": run.status,
			"business_date": str(run.business_date),
			"pos_opening_entry": run.get("pos_opening_entry"),
			"slots": len(run.get("slots") or []),
		}

	if run.status in MANUFACTURING_PENDING_STATUSES:
		run_manufacturing_simulation(run)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)

	_assume_sim_cashier(branch)
	if run.status == "Manufacturing Done":
		open_pos_session(run)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
		generate_simulation_slots(run, count=slot_count)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)
	elif run.status in CRON_ACTIVE_STATUSES:
		# Resumed run: the session is already open -- just make sure the
		# slot timetable exists (generation is idempotent).
		generate_simulation_slots(run, count=slot_count)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run.name)

	return {
		"branch": branch,
		"run_id": run.name,
		"status": run.status,
		"business_date": str(run.business_date),
		"pos_opening_entry": run.get("pos_opening_entry"),
		"slots": len(run.get("slots") or []),
	}


def process_scheduled_slot():
	"""Stage 2 cron hook (``*/10 10-18 * * *``): work one leaseable slot per
	open run.

	Silent no-op when the simulator is disabled or nothing is claimable.
	For each ``URY Simulation Run`` of today in a POS-active status, one slot
	is claimed with a conditional UPDATE (atomic across overlapping cron
	workers) and its order is processed through the real POS pipeline. This
	stage NEVER closes the session: when every slot is terminal it simply
	leaves the run "Open" -- with no claimable slots left, subsequent ticks
	are no-ops -- and the 19:00 :func:`finalize_evening_simulation` performs
	the close. A slot that fails keeps its lease for
	:data:`LEASE_MINUTES`; after the lease expires it is retried until
	``max_attempts``.
	"""
	if not is_uat_simulator_enabled():
		return

	now = now_datetime()
	runs = frappe.get_all(
		SIMULATION_RUN_DOCTYPE,
		filters={
			"business_date": today(),
			"status": ["in", list(CRON_ACTIVE_STATUSES)],
		},
		pluck="name",
	)
	for run_name in runs:
		try:
			_process_one_scheduled_slot(run_name, now)
		except Exception:
			# One broken run must not starve the others; the runners already
			# stamped the failure on the run / slot and committed.
			frappe.log_error(
				frappe.get_traceback(),
				"URY UAT Simulator: scheduled slot processing failed for {}".format(run_name),
			)
			frappe.db.rollback()


def _process_one_scheduled_slot(run_name, now):
	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_name)
	# Each run works as its own branch cashier: the opening entry, invoices
	# and closing of concurrent branch sessions never share a user.
	_assume_sim_cashier(run.branch)
	slot = _find_claimable_slot(run, now)
	if slot:
		claimed = _claim_slot(run, slot, now)
		if claimed:
			try:
				process_slot_order(run, slot.slot_number)
			except Exception:
				# process_slot_order already stamped the slot Failed and
				# committed; the lease stays held until LEASE_MINUTES pass.
				return

	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_name)
	slots = list(run.slots)
	# Stage 2 never closes: a fully-terminal slot table only means the
	# transaction window is over. The run stays "Open" (POS-active status,
	# no claimable slots) until Stage 3 (finalize_evening_simulation, 19:00)
	# locks it and closes the session. _slot_terminal stays as the shared
	# predicate for that finalizer and the tests.
	all_terminal = bool(slots) and all(_slot_terminal(slot) for slot in slots)
	if all_terminal:
		frappe.logger().info(
			"URY UAT Simulator: run {0} has no non-terminal slots left; "
			"leaving it open for the evening finalizer".format(run_name)
		)


def _find_claimable_slot(run, now):
	for slot in run.slots:
		if slot.status == "Pending":
			pass
		elif slot.status == "Failed" and (slot.attempts or 0) < (slot.max_attempts or 0):
			pass
		else:
			continue
		if not slot.leased_until or get_datetime(slot.leased_until) < now:
			return slot
	return None


def _claim_slot(run, slot, now) -> bool:
	"""Atomically lease ``slot``; False when another worker got it first."""
	lease_until = add_to_date(now, minutes=LEASE_MINUTES)
	lease_owner = frappe.generate_hash(length=8)
	frappe.db.sql(
		"""
		UPDATE `tabURY Simulation Slot`
		SET status = 'Processing',
			leased_until = %s,
			lease_owner = %s,
			attempts = attempts + 1
		WHERE parent = %s
		  AND name = %s
		  AND (leased_until IS NULL OR leased_until < %s)
		  AND (status = 'Pending'
		       OR (status = 'Failed' AND attempts < max_attempts))
		""",
		(lease_until, lease_owner, run.name, slot.name, now),
	)
	claimed = frappe.db.sql("SELECT ROW_COUNT()")[0][0]
	frappe.db.commit()
	return bool(claimed)


def _slot_terminal(slot) -> bool:
	if slot.status in ("Completed", "Skipped"):
		return True
	if slot.status == "Failed":
		return (slot.attempts or 0) >= (slot.max_attempts or 0)
	return False


# --- Stage 3: evening finalization ----------------------------------------------


def finalize_evening_simulation(business_date=None) -> list:
	"""Stage 3 evening finalizer (registered on the ``0 19 * * *`` cron).

	For every run of ``business_date`` (default today) still open -- see
	:data:`FINALIZABLE_RUN_STATUSES` -- :func:`_finalize_one_run`:

	1. Locks the run out of further slot execution (moves it to
	   "Closing In Progress", which Stage 2 never picks up).
	2. Completes/closes its Production Plans via
	   :func:`ury.ury.simulator.pos_runner.close_or_complete_production_plans_for_run`
	   (the MTO-aware gate; blocked plans are reported, not fatal).
	3. Closes the POS session via ``close_pos_session`` -- POS Closing
	   Entry, consolidated Sales Invoices, reservation fulfilment and the
	   URY Daily P and L.
	4. Regenerates the run report and leaves the run "Completed"
	   (or "Closing Failed" for a later retry when the close itself fails).

	Resumable and isolated like the morning initiator: each run is wrapped
	in try/except with ``frappe.log_error`` + rollback so one broken run
	never starves the others, and a run already carrying a closing entry is
	reported by ``close_pos_session`` without a second close. Silent no-op
	(returns ``[]``) when the simulator is disabled. Returns one dict per
	run.
	"""
	if not is_uat_simulator_enabled():
		return []

	business_date = getdate(business_date or today())
	results = []
	calling_user = frappe.session.user
	run_names = frappe.get_all(
		SIMULATION_RUN_DOCTYPE,
		filters={
			"business_date": business_date,
			"status": ["in", list(FINALIZABLE_RUN_STATUSES)],
		},
		pluck="name",
	)
	for run_name in run_names:
		try:
			results.append(_finalize_one_run(run_name, calling_user))
		except Exception:
			traceback = frappe.get_traceback()
			frappe.log_error(
				traceback,
				"URY UAT Simulator: evening finalization failed for {0}".format(run_name),
			)
			frappe.db.rollback()
			results.append(
				{"run_id": run_name, "status": "Failed", "error": (traceback or "")[-140:]}
			)
	return results


def _finalize_one_run(run_name, calling_user) -> dict:
	"""Finalize a single run: see :func:`finalize_evening_simulation`."""
	if frappe.session.user != calling_user:
		frappe.set_user(calling_user)
	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_name)

	# 1. Lock out further slot execution: "Closing In Progress" is not a
	#    cron-active status, so the Stage 2 hook skips this run from now on.
	if run.status in ("POS Open", "Generating Invoices", "Transactions Complete"):
		run.status = "Closing In Progress"
		run.save(ignore_permissions=True)
		frappe.db.commit()

	# 2. Production Plan closure gate, as the calling user (manufacturing
	#    permissions): MTO-aware completion of every plan of the run's
	#    Sales Plan. Blocked plans are logged inside and reported back.
	production_plans = close_or_complete_production_plans_for_run(run)

	# 3. POS closing + consolidation + reservation fulfilment + Daily P&L,
	#    as the branch's own cashier (session ownership is per user).
	pos_outcome = None
	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_name)
	if run.get("pos_opening_entry") and not run.get("pos_closing_entry"):
		_assume_sim_cashier(run.branch)
		pos_outcome = close_pos_session(run)

	# 4. Report + terminal stamp. close_pos_session already set "Completed"
	#    or "Closing Failed"; keep whatever it stamped.
	if frappe.session.user != calling_user:
		frappe.set_user(calling_user)
	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_name)
	run.report_markdown = generate_run_report(run)
	run.save(ignore_permissions=True)
	frappe.db.commit()

	return {
		"run_id": run_name,
		"status": run.status,
		"branch": run.branch,
		"production_plans": production_plans,
		"pos_closing_entry": run.get("pos_closing_entry"),
		"pos": pos_outcome,
	}


def generate_run_report(run_doc) -> str:
	"""Markdown summary of one run for ``run.report_markdown``.

	Covers the run header, the manufacturing phase (sales plan, production
	plans, planned/produced item counts), the invoice counters by scenario,
	the POS session lifecycle (opening / closing / consolidated Sales
	Invoices) and the full slot table.
	"""
	assert_uat_simulator_authorized()

	run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name) if isinstance(run_doc, str) else run_doc
	if run.get("doctype") != SIMULATION_RUN_DOCTYPE:
		frappe.throw(
			_("run_doc must be a URY Simulation Run document or run_id string, got {0}.").format(
				run.get("doctype") if hasattr(run, "get") else type(run)
			),
			frappe.ValidationError,
		)

	plans = _production_plan_summary(run.get("sales_plan"))
	consolidated = _consolidated_sales_invoices(run)
	currency = frappe.db.get_value("Company", run.company, "default_currency") or ""

	lines = []
	lines.append("# URY UAT Simulation Report")
	lines.append("")
	lines.append("## Run")
	lines.append("")
	lines.append("| Field | Value |")
	lines.append("|---|---|")
	lines.append("| Run ID | {} |".format(run.name))
	lines.append("| Status | {} |".format(run.status))
	lines.append("| Branch | {} |".format(run.branch))
	lines.append("| Company | {} |".format(run.company))
	lines.append("| POS Profile | {} |".format(run.pos_profile))
	lines.append("| Business Date | {} |".format(run.business_date))
	lines.append("| Started At | {} |".format(run.get("started_at") or "-"))
	lines.append("| Completed At | {} |".format(run.get("completed_at") or "-"))
	if run.get("error_summary"):
		lines.append("| Error Summary | {} |".format(run.get("error_summary")))
	lines.append("")

	lines.append("## Manufacturing")
	lines.append("")
	if run.get("sales_plan"):
		lines.append("- Sales Plan: {}".format(run.get("sales_plan")))
	else:
		lines.append("- Sales Plan: -")
	if plans["names"]:
		for name in plans["names"]:
			lines.append("- Production Plan: {}".format(name))
		lines.append(
			"- Planned items: {0} (planned qty {1:g}, produced qty {2:g})".format(
				plans["item_count"], plans["planned_qty"], plans["produced_qty"]
			)
		)
	else:
		lines.append("- Production Plans: none")
	lines.append("")

	lines.append("## Invoices")
	lines.append("")
	lines.append("- Total revenue: {0} {1}".format(flt(run.get("total_revenue")), currency).rstrip())
	lines.append("- Total invoices: {}".format(run.get("total_invoices") or 0))
	lines.append("- Takeaway: {}".format(run.get("takeaway_invoices") or 0))
	lines.append("- Dine-in: {}".format(run.get("dine_in_invoices") or 0))
	lines.append("- Delivery: {}".format(run.get("delivery_invoices") or 0))
	lines.append("- Aggregator: {}".format(run.get("aggregator_invoices") or 0))
	lines.append("")

	lines.append("## POS Session & Closing")
	lines.append("")
	lines.append("- Opening Entry: {}".format(run.get("pos_opening_entry") or "-"))
	lines.append("- Closing Entry: {}".format(run.get("pos_closing_entry") or "-"))
	if consolidated:
		for name, grand_total in consolidated:
			lines.append("- Consolidated Sales Invoice: {0} ({1} {2})".format(name, flt(grand_total), currency).rstrip())
	else:
		lines.append("- Consolidated Sales Invoice: -")
	lines.append("")

	lines.append("## Slots")
	lines.append("")
	if run.get("slots"):
		lines.append("| # | Time | Scenario | Status | Invoice | Amount |")
		lines.append("|---|---|---|---|---|---|")
		for slot in sorted(run.slots, key=lambda s: s.slot_number or 0):
			lines.append(
				"| {0} | {1} | {2} | {3} | {4} | {5} |".format(
					slot.slot_number,
					slot.slot_time,
					slot.scenario or "-",
					slot.status,
					slot.get("invoice") or "-",
					flt(slot.get("amount")),
				)
			)
	else:
		lines.append("No slots generated.")
	lines.append("")
	return "\n".join(lines)


def _production_plan_summary(sales_plan):
	"""Production Plans and item quantities linked to ``sales_plan``."""
	empty = {"names": [], "item_count": 0, "planned_qty": 0.0, "produced_qty": 0.0}
	if not sales_plan:
		return empty
	names = frappe.get_all(
		PRODUCTION_PLAN_DOCTYPE,
		filters={"custom_ury_sales_plan": sales_plan, "docstatus": 1},
		pluck="name",
	)
	if not names:
		return empty
	items = frappe.get_all(
		"Production Plan Item",
		filters={"parent": ["in", names]},
		fields=["item_code", "planned_qty", "produced_qty"],
	)
	return {
		"names": names,
		"item_count": len({row.item_code for row in items}),
		"planned_qty": sum(flt(row.planned_qty) for row in items),
		"produced_qty": sum(flt(row.produced_qty) for row in items),
	}


def _consolidated_sales_invoices(run):
	"""(name, grand_total) of every consolidated Sales Invoice of the run's
	session, largest first -- see pos_runner for why the merge log backlink
	is the reliable key."""
	if not run.get("pos_closing_entry"):
		return []
	names = []
	for row in frappe.get_all(
		MERGE_LOG_DOCTYPE,
		filters={"pos_closing_entry": run.pos_closing_entry, "docstatus": 1},
		fields=["consolidated_invoice"],
	):
		if row.consolidated_invoice and row.consolidated_invoice not in names:
			names.append(row.consolidated_invoice)
	rows = [
		(name, flt(frappe.db.get_value(SALES_INVOICE_DOCTYPE, name, "grand_total"))) for name in names
	]
	rows.sort(key=lambda r: r[1], reverse=True)
	return rows


def _assume_sim_cashier(branch=None):
	"""Run POS pipeline steps as the branch's simulator cashier user.

	With ``branch``, the per-branch cashier (created on demand by
	:func:`get_or_create_sim_cashier`) is assumed -- required so concurrent
	branches do not collide on ERPNext's per-user open-session check.
	Branch-less callers keep the legacy ``sim.cashier@ury.local`` user, which
	must already exist on the site.
	"""
	cashier = get_or_create_sim_cashier(branch) if branch else SIM_CASHIER_USER
	if frappe.session.user == cashier:
		return
	if not frappe.db.exists("User", cashier):
		frappe.throw(
			_("URY UAT Simulator cashier user {0} does not exist on this site.").format(cashier),
			frappe.ValidationError,
		)
	frappe.set_user(cashier)
