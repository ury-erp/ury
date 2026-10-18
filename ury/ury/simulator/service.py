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

    process_scheduled_slot()         -- scheduler cron hook (every 5 min):
        claims one leaseable slot per open run, processes its order, and
        closes the session when every slot is terminal or the 20:00 closing
        cutoff has passed.

The cron path exists so a simulated service day unfolds in near-real-time
instead of inside one long CLI call: ``uat-simulate-day --no-auto-close``
opens the session and stamps the slot timetable, then the scheduler works the
slots off one lease at a time. Slot claiming uses a distributed lease
(``leased_until`` + ``lease_owner``) claimed with a conditional UPDATE, so
two overlapping cron workers can never process the same slot twice; a
crashed worker's lease simply expires after 10 minutes and the slot becomes
claimable again (bounded by ``max_attempts``).

The POS pipeline must run under the dedicated simulator cashier user
(``sim.cashier@ury.local``): stale foreign open sessions wedge the per-user
opening check for pre-existing users (see ongoing/uat-simulator-impl/
03-pos-runner.md, Finding A), so the coordinator switches to the cashier
before touching POS state (manufacturing runs as the calling user).

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
	close_pos_session,
	generate_simulation_slots,
	open_pos_session,
	process_slot_order,
	run_pos_simulation,
)

SIMULATION_RUN_DOCTYPE = "URY Simulation Run"
POS_PROFILE_DOCTYPE = "POS Profile"
PRODUCTION_PLAN_DOCTYPE = "Production Plan"
MERGE_LOG_DOCTYPE = "POS Invoice Merge Log"
SALES_INVOICE_DOCTYPE = "Sales Invoice"

#: Simulator cashier user -- see module docstring (Finding A, phase 3).
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

#: Minutes a claimed slot stays leased before another worker may retry it.
LEASE_MINUTES = 10

#: Closing cutoff: sessions left open past this local time are closed by the
#: next cron tick even when slots remain unprocessed.
CLOSING_CUTOFF = dt_time(20, 0)


def get_or_create_daily_run(branch, company=None, pos_profile=None, business_date=None):
	"""Return the single non-terminal ``URY Simulation Run`` for
	``(business_date, branch)``, creating it when none exists.

	``business_date`` defaults to today. ``company`` and ``pos_profile``
	default to the values configured on the branch's POS Profile. The
	(business_date, branch) scope is single-flight: an existing non-terminal
	run (any phase) is returned untouched so a re-invocation resumes the
	same day instead of forking it. Terminal runs (Failed / Closing Failed /
	Completed) never block a fresh run.
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

	existing = frappe.get_all(
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
	if existing:
		return frappe.get_doc(SIMULATION_RUN_DOCTYPE, existing[0].name)

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

	_assume_sim_cashier()

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


def process_scheduled_slot():
	"""Cron hook (every 5 minutes): work one leaseable slot per open run.

	Silent no-op when the simulator is disabled or nothing is claimable.
	For each ``URY Simulation Run`` of today in a POS-active status, one slot
	is claimed with a conditional UPDATE (atomic across overlapping cron
	workers), its order is processed through the real POS pipeline, and the
	session is closed -- with the report generated -- once every slot is
	terminal or the 20:00 closing cutoff has passed. A slot that fails keeps
	its lease for :data:`LEASE_MINUTES`; after the lease expires it is
	retried until ``max_attempts``.
	"""
	if not is_uat_simulator_enabled():
		return
	_assume_sim_cashier()

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
	all_terminal = bool(slots) and all(_slot_terminal(slot) for slot in slots)
	past_cutoff = get_datetime(now).time() >= CLOSING_CUTOFF
	if all_terminal or past_cutoff:
		close_result = close_pos_session(run)
		run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_name)
		run.report_markdown = generate_run_report(run)
		run.save(ignore_permissions=True)
		frappe.db.commit()
		frappe.logger().info(
			"URY UAT Simulator: closed run {0} ({1} invoices, consolidated SI {2})".format(
				run_name,
				close_result.get("closing_invoice_count"),
				close_result.get("consolidated_sales_invoice"),
			)
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


def _assume_sim_cashier():
	"""Run POS pipeline steps as the dedicated simulator cashier user.

	Required: pre-existing users (e.g. Administrator) can carry stale open
	POS sessions that wedge the per-user opening check (phase 3, Finding A).
	"""
	if frappe.session.user == SIM_CASHIER_USER:
		return
	if not frappe.db.exists("User", SIM_CASHIER_USER):
		frappe.throw(
			_("URY UAT Simulator cashier user {0} does not exist on this site.").format(SIM_CASHIER_USER),
			frappe.ValidationError,
		)
	frappe.set_user(SIM_CASHIER_USER)
