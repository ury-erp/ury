# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Phase 3 runner: POS session simulation for one URY Simulation Run.

Walks one (company, branch, business_date) scope through the real ERPNext /
URY point-of-sale pipeline, end to end:

    POS Opening Entry   (submitted; cash float per profile payment mode)
        -> POS Invoices (one per simulation slot: Takeaway / Dine-in /
                         Delivery / Aggregator), submitted and paid
        -> POS Closing Entry (payment reconciliation matched to expected,
                         submitted)
        -> consolidated Sales Invoice (is_consolidated = 1, update_stock = 1
                         -- the session's single stock deduction, posted when
                         the closing entry submits)

Invoice shape follows `ury/ury/dev_seed/historical_sales.py`, which copied it
from the real order flow (`sync_order` / `price_items_for_invoice` in
`ury/ury/doctype/ury_order/ury_order.py`): `is_pos = 1`, `set_posting_time = 1`
with `posting_date = business_date`, `update_stock = 0`, item rows priced from
`Item Price`, a single payments row covering the full total, and a fresh
`frappe.get_doc` reload before submit (the `calculate_and_set_times` hook in
`ury_pos_invoice.py` breaks on the string `creation` of an in-memory doc).
Dine-in invoices are marked `invoice_printed = 1` before submit -- the
`validate_invoice_print` gate is a real business rule, not something to bypass.

Two deliberate deviations from a naive reading of the flow, both forced by
verified site behavior (see `ongoing/uat-simulator-impl/03-pos-runner.md`):

1. Session reuse is staleness-guarded, and stale sessions are cleaned up.
   Only a POS Opening Entry whose `period_start_date` falls on the run's
   `business_date` is reused. Older "Open" entries for the profile are
   abandoned foreign sessions: ERPNext `check_open_pos_exists` blocks ANY
   new opening on the profile while one exists, so `open_pos_session`
   cancels them first (their unconsolidated POS Invoices, which carry the
   stock reservations, are cancelled first so ERPNext's
   `check_poe_is_cancellable` passes) and only then creates the fresh
   session.
2. Slot times are anchored to the opening entry's `period_start_date`, not a
   fixed clock time. `make_closing_entry_from_opening` collects invoices by
   TIMESTAMP(posting_date, posting_time) inside [period_start, period_end],
   so any slot time outside that window would silently produce an empty
   closing. Anchoring guarantees every simulated invoice lands in its own
   session window. This also pins the supported scope: the run's
   `business_date` must be the day the session is opened. And because the
   runner processes a slot in seconds while slots are spaced minutes apart,
   the invoice posting time is clamped to "now" -- a slot is posted when it
   is actually processed, never in the future (future timestamps would fall
   outside [period_start, period_end] again at closing time).

Consolidation queuing: with >= 10 invoices ERPNext "enqueues" the merge job,
but `enqueue_job` passes `now=frappe.conf.developer_mode`, so on a developer
site the consolidation runs synchronously inside `closing.submit()` and the
closing status is already "Submitted" on return. The queued branch is still
handled defensively by running `create_merge_logs` inline.

Guards: every public entry point calls
:func:`ury.ury.simulator.guards.assert_uat_simulator_authorized` first.

Cashiers: every session is owned by a per-branch simulator cashier
(``sim.cashier.<branch>@ury.local``, see :func:`get_or_create_sim_cashier`).
ERPNext's ``check_user_already_assigned`` rejects a second concurrently
open session for the SAME user on any profile, so one shared cashier would
serialize all branches; one cashier per branch lets every branch hold its
own open session (see ongoing/multi-company-simulator-audit/02-triage.md,
ISSUE-3).
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import flt, get_datetime, get_time, getdate, now_datetime, nowdate, today

from ury.ury.simulator.guards import assert_uat_simulator_authorized

SIMULATION_RUN_DOCTYPE = "URY Simulation Run"
POS_OPENING_DOCTYPE = "POS Opening Entry"
POS_CLOSING_DOCTYPE = "POS Closing Entry"
POS_INVOICE_DOCTYPE = "POS Invoice"
POS_PROFILE_DOCTYPE = "POS Profile"
SALES_INVOICE_DOCTYPE = "Sales Invoice"
MERGE_LOG_DOCTYPE = "POS Invoice Merge Log"

#: Slot scenario cycle -- matches the URY Simulation Slot "scenario" options.
SCENARIO_CYCLE = ("Takeaway", "Dine-in", "Delivery", "Aggregator")

#: Mapping of slot scenario -> POS Invoice order_type. "Aggregators" is only
#: used when the branch actually has Aggregator Settings; otherwise the slot
#: degrades to a takeaway order (recorded in the slot result).
SCENARIO_ORDER_TYPE = {
	"Takeaway": "Take Away",
	"Dine-in": "Dine In",
	"Delivery": "Delivery",
	"Aggregator": "Aggregators",
}

#: Scenario -> counter field on the run doc.
SCENARIO_COUNTER_FIELD = {
	"Takeaway": "takeaway_invoices",
	"Dine-in": "dine_in_invoices",
	"Delivery": "delivery_invoices",
	"Aggregator": "aggregator_invoices",
}

#: Minutes between consecutive slot times.
SLOT_INTERVAL_MINUTES = 5

#: Qty per item line, cycled deterministically by slot number (1 or 2).
MAX_LINE_QTY = 2

#: Run statuses written by this runner.
RUN_STATUS_POS_OPEN = "POS Open"
RUN_STATUS_GENERATING = "Generating Invoices"
RUN_STATUS_COMPLETED = "Completed"
RUN_STATUS_FAILED = "Failed"
RUN_STATUS_CLOSING_FAILED = "Closing Failed"


def get_or_create_sim_cashier(branch: str) -> str:
    """Return the dedicated simulator cashier user for ``branch``.

    One cashier per branch (``sim.cashier.<scrubbed branch>@ury.local`` --
    e.g. ``sim.cashier.ury@ury.local``, ``sim.cashier.ury_barsha@ury.local``,
    ``sim.cashier.golden_fork_jumeirah@ury.local``) keeps ERPNext's per-user
    open-session check from colliding when several branch sessions are open
    concurrently. The user is created on first use as an enabled System
    User with the ``URY Cashier`` and ``System Manager`` roles, and created
    users are reused forever after (idempotent).
    """
    assert_uat_simulator_authorized()

    email = "sim.cashier.{0}@ury.local".format(frappe.scrub(branch or ""))
    if frappe.db.exists("User", email):
        return email

    user = frappe.get_doc(
        {
            "doctype": "User",
            "email": email,
            "first_name": "Sim Cashier {0}".format(branch),
            "user_type": "System User",
            "enabled": 1,
            "send_welcome_email": 0,
        }
    )
    user.insert(ignore_permissions=True)
    user.add_roles("URY Cashier", "System Manager")
    frappe.db.commit()
    return email


def open_pos_session(run_doc, opening_amount: float = 500.0) -> str:
	"""Open (or reuse) the POS session for ``run_doc`` and link it.

	``run_doc`` is either a loaded ``URY Simulation Run`` document or the
	``run_id`` string of one. The session runs as the branch's own simulator
	cashier (created on first use, see :func:`get_or_create_sim_cashier`).
	Abandoned prior-day open sessions on the profile are cancelled first
	(see :func:`cancel_stale_open_sessions`) -- ERPNext blocks any new
	opening on a profile while another entry is Open. An existing open
	``POS Opening Entry`` is reused only when it was opened on the run's
	``business_date``; otherwise a new entry is created for the branch
	cashier, with ``balance_details`` seeded from the POS Profile's payment
	modes (``opening_amount`` on the default Cash-like mode, 0 elsewhere),
	and submitted.

	Sets ``run_doc.pos_opening_entry`` and ``status = "POS Open"`` (plus
	``started_at`` on first open), saves and commits. Returns the opening
	entry name.
	"""
	assert_uat_simulator_authorized()

	run_doc = _resolve_run_doc(run_doc)
	pos_profile = run_doc.get("pos_profile")
	company = run_doc.get("company")
	business_date = getdate(run_doc.get("business_date"))
	if not (pos_profile and company and business_date):
		frappe.throw(
			_("URY Simulation Run {0} must set company, branch, business_date and pos_profile.").format(
				run_doc.name
			),
			frappe.ValidationError,
		)

	# The session belongs to the branch's own cashier: ERPNext rejects a
	# second concurrently open session for the same user on any profile.
	cashier = get_or_create_sim_cashier(run_doc.branch)
	if frappe.session.user != cashier:
		frappe.set_user(cashier)

	# Abandoned prior-day sessions on this profile would wedge the fresh
	# opening (check_open_pos_exists blocks per profile, any user).
	cancel_stale_open_sessions(pos_profile, business_date)

	existing_name = _find_reusable_opening(pos_profile, company, business_date, run_doc)
	if existing_name:
		opening = frappe.get_doc(POS_OPENING_DOCTYPE, existing_name)
	else:
		opening = _create_opening_entry(pos_profile, company, opening_amount, user=cashier)

	# The session window must live on the business date: simulated invoices
	# carry posting_date = business_date, and their TIMESTAMP(posting_date,
	# posting_time) must fall inside [period_start, period_end] for the
	# closing entry to collect them.
	if getdate(opening.period_start_date) != business_date:
		frappe.throw(
			_(
				"POS session {0} for run {1} was opened on {2}, but the run's business_date is {3}. "
				"The UAT simulator opens sessions on the business date itself, so simulated invoices "
				"land inside the session window -- set business_date to {2} or start a new run."
			).format(opening.name, run_doc.name, getdate(opening.period_start_date), business_date),
			frappe.ValidationError,
		)

	run_doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
	run_doc.pos_opening_entry = opening.name
	run_doc.status = RUN_STATUS_POS_OPEN
	if not run_doc.get("started_at"):
		run_doc.started_at = now_datetime()
	run_doc.save(ignore_permissions=True)
	frappe.db.commit()
	return opening.name


def generate_simulation_slots(run_doc, count: int = 12) -> list:
	"""Ensure ``run_doc`` has ``count`` slots and return them.

	Idempotent: an existing slot table is returned untouched. New slots cycle
	through :data:`SCENARIO_CYCLE` and are spaced :data:`SLOT_INTERVAL_MINUTES`
	apart, anchored to the linked opening entry's ``period_start_date`` so
	every slot's posting timestamp is inside the session window. Requires
	``open_pos_session`` to have linked an opening entry first.
	"""
	assert_uat_simulator_authorized()

	run_doc = _resolve_run_doc(run_doc)
	if run_doc.get("slots"):
		return list(run_doc.slots)

	opening_name = run_doc.get("pos_opening_entry")
	if not opening_name:
		frappe.throw(
			_("Open a POS session for run {0} before generating slots.").format(run_doc.name),
			frappe.ValidationError,
		)
	period_start = get_datetime(frappe.db.get_value(POS_OPENING_DOCTYPE, opening_name, "period_start_date"))
	if not period_start:
		frappe.throw(
			_("POS Opening Entry {0} has no period_start_date.").format(opening_name),
			frappe.ValidationError,
		)

	for i in range(count):
		slot_dt = period_start + timedelta(minutes=SLOT_INTERVAL_MINUTES * (i + 1))
		run_doc.append(
			"slots",
			{
				"slot_number": i + 1,
				"slot_time": get_time(slot_dt),
				"scenario": SCENARIO_CYCLE[i % len(SCENARIO_CYCLE)],
				"status": "Pending",
			},
		)
	run_doc.save(ignore_permissions=True)
	frappe.db.commit()
	return list(frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name).slots)


def process_slot_order(run_doc, slot, items=None) -> dict:
	"""Create, pay and submit the POS Invoice for one simulation slot.

	``slot`` is a ``URY Simulation Slot`` child row (or its ``slot_number``
	int -- looked up on the run doc). ``items`` optionally overrides the
	menu item pool (list of item codes); when omitted, items are discovered
	from the branch's active menu, restricted to items that are both priced
	and actually in stock at the POS Profile warehouse (negative stock is
	not allowed on this site, and the consolidated Sales Invoice's stock
	deduction at closing would otherwise fail the whole session).

	On success the slot row is stamped (``invoice``, ``amount``,
	``status = "Completed"``), the run doc counters are incremented
	(``total_invoices``, ``total_revenue`` and the scenario counter), and
	both are saved and committed. Dine-in slots lease a free table while the
	order is processed and free it again after submit. Returns the slot
	result dict. On failure the slot is stamped ``Failed`` with the error,
	the failure is committed, and the exception re-raises.
	"""
	assert_uat_simulator_authorized()

	run_doc = _resolve_run_doc(run_doc)
	slot_row = _resolve_slot(run_doc, slot)
	if slot_row.status == "Completed" and slot_row.get("invoice"):
		return _slot_result(slot_row)

	catalog = _SlotCatalog(run_doc, items=items)
	table = None
	invoice_name = None
	try:
		invoice_name, order_meta = _create_and_submit_invoice(run_doc, slot_row, catalog)
		table = order_meta.get("table")
		amount = flt(frappe.db.get_value(POS_INVOICE_DOCTYPE, invoice_name, "grand_total"))

		slot_row.invoice = invoice_name
		slot_row.amount = amount
		slot_row.status = "Completed"
		slot_row.attempts = (slot_row.attempts or 0) + 1
		slot_row.error_message = None

		run_doc.total_invoices = (run_doc.total_invoices or 0) + 1
		run_doc.total_revenue = flt(run_doc.total_revenue) + amount
		counter_field = SCENARIO_COUNTER_FIELD.get(slot_row.scenario)
		if counter_field:
			setattr(run_doc, counter_field, (getattr(run_doc, counter_field, 0) or 0) + 1)
		run_doc.save(ignore_permissions=True)
		frappe.db.commit()

		result = _slot_result(slot_row)
		result.update(order_meta)
		return result
	except Exception as exc:
		_free_table(table)
		_delete_draft_invoice(invoice_name)
		slot_row.status = "Failed"
		slot_row.attempts = (slot_row.attempts or 0) + 1
		slot_row.error_message = str(exc)[-140:]
		run_doc.save(ignore_permissions=True)
		frappe.db.commit()
		raise


def close_pos_session(run_doc) -> dict:
	"""Close the run's POS session and link the consolidated Sales Invoice.

	Builds the closing entry via ERPNext's
	``make_closing_entry_from_opening``, sets every
	``payment_reconciliation`` row's ``closing_amount`` (and
	``custom_closing_amount`` where the field exists) to its
	``expected_amount`` -- a perfectly counted shift -- and submits. On
	submit ERPNext consolidates the session's POS Invoices into one
	``Sales Invoice`` per customer (``is_consolidated = 1``,
	``update_stock = 1``), the session's only stock deduction. The run doc's
	single Link field points at the largest consolidated invoice; the result
	lists all of them.

	If >= 10 invoices ERPNext routes consolidation through its "queued"
	path; on a developer site that path runs synchronously inside submit
	(``enqueue_job(..., now=developer_mode)``), and any genuinely queued
	residual is executed inline here via ``create_merge_logs``.

	The consolidated Sales Invoices are located via the POS Invoice Merge
	Log backlink -- this ERPNext version does not stamp
	``pos_closing_entry`` onto consolidated Sales Invoices created from POS
	Invoices (only onto the closing's own ``sales_invoices`` rows, which
	stay empty in POS mode).

	Sets ``run_doc.pos_closing_entry``, ``consolidated_sales_invoice`` and
	``status = "Completed"`` (plus ``completed_at``), saves and commits.
	On failure the run is stamped ``Closing Failed`` and the exception
	re-raises.
	"""
	assert_uat_simulator_authorized()

	run_doc = _resolve_run_doc(run_doc)
	if run_doc.get("pos_closing_entry"):
		# Idempotent re-run: report the recorded outcome.
		return _closing_result(run_doc)

	opening_name = run_doc.get("pos_opening_entry")
	if not opening_name:
		frappe.throw(
			_("Run {0} has no linked POS Opening Entry to close.").format(run_doc.name),
			frappe.ValidationError,
		)

	try:
		closing_name, si_name, invoice_count, si_names = _close_and_consolidate(opening_name)
	except Exception:
		_record_closing_failure(run_doc)
		raise

	run_doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
	run_doc.pos_closing_entry = closing_name
	run_doc.consolidated_sales_invoice = si_name
	run_doc.status = RUN_STATUS_COMPLETED
	run_doc.completed_at = now_datetime()
	run_doc.save(ignore_permissions=True)
	frappe.db.commit()

	return _closing_result(
		frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name),
		invoice_count=invoice_count,
		consolidated_si_names=si_names,
	)


def run_pos_simulation(run_doc, slot_count: int = 12) -> dict:
	"""Run the full POS simulation for one run: open -> slots -> orders -> close.

	``run_doc`` is a loaded ``URY Simulation Run`` document or ``run_id``
	string. It must already reference a POS Profile, company, branch and
	business_date (the day the session is opened). Returns the full outcome
	summary::

	    {"run_id", "pos_opening_entry", "pos_closing_entry",
	     "consolidated_sales_invoice", "status", "slots": [...],
	     "counters": {...}}

	Any failure stamps the run doc -- ``Closing Failed`` when the session
	could not be closed, ``Failed`` otherwise -- with the traceback tail,
	commits, and re-raises.
	"""
	assert_uat_simulator_authorized()

	run_doc = _resolve_run_doc(run_doc)
	try:
		opening_name = open_pos_session(run_doc)
		run_doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
		slots = generate_simulation_slots(run_doc, count=slot_count)

		run_doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
		run_doc.status = RUN_STATUS_GENERATING
		run_doc.save(ignore_permissions=True)
		frappe.db.commit()

		results = []
		for slot in list(frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name).slots):
			fresh_run = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
			if slot.status == "Completed" and slot.get("invoice"):
				results.append(_slot_result(slot))
				continue
			results.append(process_slot_order(fresh_run, slot.slot_number))

		outcome = close_pos_session(frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name))
		outcome["slots"] = results
		outcome["pos_opening_entry"] = opening_name
		return outcome
	except Exception:
		_stamp_run_failure(run_doc)
		raise


# --- run doc helpers ---------------------------------------------------------


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


def _resolve_slot(run_doc, slot):
	"""The slot row belonging to ``run_doc`` (child rows are per-doc-instance)."""
	if isinstance(slot, int):
		slot_number = slot
		slot = None
	else:
		slot_number = slot.slot_number
	for row in run_doc.slots:
		if row.slot_number == slot_number:
			return row
	frappe.throw(
		_("Run {0} has no slot number {1}.").format(run_doc.name, slot_number), frappe.ValidationError
	)


def _slot_result(slot_row):
	return {
		"slot": slot_row.slot_number,
		"scenario": slot_row.scenario,
		"invoice": slot_row.get("invoice"),
		"amount": flt(slot_row.get("amount")),
		"status": slot_row.status,
	}


def _find_reusable_opening(pos_profile, company, business_date, run_doc):
	"""Name of an open POS Opening Entry this run may reuse, or None.

	Reusable means: submitted, unclosed, same profile/company/user, AND
	opened on the run's business date. Older open entries are foreign stale
	sessions; those are already cancelled by
	:func:`cancel_stale_open_sessions` before this lookup, so anything still
	Open here was opened on the business date itself.
	"""
	filters = {
		"docstatus": 1,
		"pos_profile": pos_profile,
		"company": company,
		"user": frappe.session.user,
		"period_start_date": [">=", str(business_date)],
	}
	candidates = frappe.get_all(
		POS_OPENING_DOCTYPE,
		filters=filters,
		fields=["name", "status", "pos_closing_entry"],
		order_by="period_start_date desc",
	)
	linked = run_doc.get("pos_opening_entry")
	for row in candidates:
		if linked and row.name != linked:
			continue
		if row.status == "Open" or not row.pos_closing_entry:
			return row.name
	return None


def _create_opening_entry(pos_profile, company, opening_amount, user=None):
	"""Create and submit a fresh POS Opening Entry for ``user``.

	``user`` defaults to the current session user; callers pass the branch
	cashier explicitly so the entry is assigned to the right user even when
	the session user was not switched beforehand.
	"""
	user = user or frappe.session.user
	profile = frappe.get_doc(POS_PROFILE_DOCTYPE, pos_profile)
	if profile.disabled:
		frappe.throw(
			_("POS Profile {0} is disabled; cannot open a simulated session.").format(pos_profile),
			frappe.ValidationError,
		)

	balance_details = []
	default_cash_set = False
	for payment in profile.payments or []:
		if not payment.mode_of_payment:
			continue
		amount = 0.0
		if not default_cash_set and (payment.default or payment.mode_of_payment == "Cash"):
			amount = flt(opening_amount)
			default_cash_set = True
		balance_details.append({"mode_of_payment": payment.mode_of_payment, "opening_amount": amount})
	if not balance_details:
		frappe.throw(
			_("POS Profile {0} has no payment modes; cannot open a simulated session.").format(
				pos_profile
			),
			frappe.ValidationError,
		)

	opening = frappe.get_doc(
		{
			"doctype": POS_OPENING_DOCTYPE,
			"company": company,
			"pos_profile": pos_profile,
			"user": user,
			"period_start_date": now_datetime(),
			"posting_date": nowdate(),
			"balance_details": balance_details,
		}
	)
	opening.insert(ignore_permissions=True)
	try:
		opening.submit()
	except Exception:
		# Never leave a draft opening behind: it would shadow later runs and
		# confuse a manual review of the session list.
		frappe.delete_doc(POS_OPENING_DOCTYPE, opening.name, force=True)
		raise
	return opening


def cancel_stale_open_sessions(pos_profile, business_date=None) -> list:
	"""Cancel abandoned open POS sessions on ``pos_profile`` from before
	``business_date`` and return the cancelled opening entry names.

	ERPNext's ``check_open_pos_exists`` blocks ANY new opening on a profile
	while an entry with status Open exists -- regardless of user or date --
	and ``check_poe_is_cancellable`` refuses to cancel an opening while
	unconsolidated invoices exist in its window. So the cleanup order is:
	cancel the session's unconsolidated POS Invoices first (reversing their
	GL entries and releasing the stock they reserve), then the opening
	entry itself. Sessions opened ON ``business_date`` are left untouched.

	This runs inside ``open_pos_session`` before a fresh session is created,
	so a profile left with an abandoned prior-day session (foreign or from
	an interrupted run) unblocks itself instead of failing every later run.
	"""
	business_date = getdate(business_date or today())
	stale = frappe.get_all(
		POS_OPENING_DOCTYPE,
		filters={
			"docstatus": 1,
			"pos_profile": pos_profile,
			"status": "Open",
			"period_start_date": ["<", str(business_date)],
		},
		pluck="name",
	)
	cancelled = []
	for name in stale:
		opening = frappe.get_doc(POS_OPENING_DOCTYPE, name)
		_cancel_stale_invoices(opening)
		opening = frappe.get_doc(POS_OPENING_DOCTYPE, name)
		if opening.docstatus == 1:
			opening.cancel()
		frappe.db.commit()
		frappe.logger().info(
			"URY UAT Simulator: cancelled stale POS session {0} on profile {1}".format(name, pos_profile)
		)
		cancelled.append(name)
	return cancelled


def _cancel_stale_invoices(opening):
	"""Cancel the unconsolidated invoices of an abandoned POS session.

	Uses the same invoice window as ERPNext's own cancellability check
	(``pos_closing_entry.get_invoices`` over [period_start, now] for the
	opening's profile and owner), skipping invoices that were already
	consolidated into a Sales Invoice -- those belong to a closed session
	and must not be touched.
	"""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import get_invoices

	window = get_invoices(opening.period_start_date, now_datetime(), opening.pos_profile, opening.user)
	for row in window.get("invoices") or []:
		name = row.get("name")
		if frappe.db.get_value(POS_INVOICE_DOCTYPE, name, "consolidated_invoice"):
			continue
		invoice = frappe.get_doc(POS_INVOICE_DOCTYPE, name)
		if invoice.docstatus == 1:
			invoice.cancel()
			frappe.db.commit()


# --- invoice creation ----------------------------------------------------------


class _SlotCatalog:
	"""Per-run lookup cache: customers, payment modes, menu items with rates.

	Item pool = active menu items of the branch's restaurant that have an
	Item Price on the menu price list. Stock is checked at pick time, not
	pool time: every submitted, unconsolidated POS Invoice reserves its
	stock_qty until the session's consolidated Sales Invoice deducts it
	(ERPNext ``get_stock_availability`` = Bin qty minus that reservation),
	so a raw Bin read overstates what a session can actually sell. Rates
	resolve from the menu price list, then the profile price list, then the
	Item's standard rate.
	"""

	def __init__(self, run_doc, items=None):
		self.run_doc = run_doc
		self.profile = frappe.get_doc(POS_PROFILE_DOCTYPE, run_doc.pos_profile)
		self.company_currency = (
			frappe.db.get_value("Company", run_doc.company, "default_currency") or "INR"
		)
		self.menu_price_list = self._resolve_menu_price_list()
		self.selling_price_list = self.menu_price_list or self.profile.selling_price_list
		self.customer = self._resolve_customer()
		self.payment_modes = [p.mode_of_payment for p in self.profile.payments or [] if p.mode_of_payment]
		self._items = None
		self._explicit_items = list(items) if items else None

	@property
	def items(self):
		if self._items is None:
			self._items = self._discover_items()
		return self._items

	def _resolve_menu_price_list(self):
		if not self.profile.restaurant:
			return None
		menu = frappe.db.get_value("URY Restaurant", self.profile.restaurant, "active_menu")
		if not menu:
			return None
		return frappe.db.get_value("Price List", dict(restaurant_menu=menu, enabled=1), "name")

	def _resolve_customer(self):
		if self.profile.customer and frappe.db.exists("Customer", self.profile.customer):
			return self.profile.customer
		# Prefer a non-test customer; fall back to any enabled one.
		for where in ("name not like '\\_Test%'", "1 = 1"):
			customer = frappe.db.sql(
				"select name from `tabCustomer` where disabled = 0 and {0} order by creation limit 1".format(
					where
				)
			)
			if customer:
				return customer[0][0]
		frappe.throw(
			_("No enabled Customer found for the {0} simulation.").format(self.run_doc.branch),
			frappe.ValidationError,
		)

	def _discover_items(self):
		if self._explicit_items:
			codes = [c for c in self._explicit_items if frappe.db.exists("Item", c)]
		else:
			codes = self._menu_item_codes()
		priced = []
		for code in codes:
			rate = self._resolve_rate(code)
			if rate is not None:
				priced.append({"item_code": code, "rate": rate})
		if not priced:
			frappe.throw(
				_(
					"No sellable items found for branch {0}: no active-menu item has an Item Price."
				).format(self.run_doc.branch),
				frappe.ValidationError,
			)
		return priced

	def available_qty(self, item_code):
		"""ERPNext POS availability: Bin qty minus qty reserved by submitted,
		unconsolidated POS Invoices (this session's own earlier slots
		included). Mirrors ``erpnext.pos_invoice.get_stock_availability``
		without its POS Profile permission check, so any simulator caller can
		use it."""
		warehouse = self.profile.warehouse
		if not warehouse:
			return float("inf")
		bin_qty = flt(
			frappe.db.get_value("Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty")
		)
		reserved = flt(
			frappe.db.sql(
				"""
				select sum(pii.stock_qty)
				from `tabPOS Invoice Item` pii
				join `tabPOS Invoice` pi on pi.name = pii.parent
				where pii.item_code = %s and pii.warehouse = %s and pi.docstatus = 1
				  and (pi.consolidated_invoice is null or pi.consolidated_invoice = '')
				""",
				(item_code, warehouse),
			)[0][0]
		)
		return bin_qty - reserved

	def _menu_item_codes(self):
		if not self.profile.restaurant:
			return []
		menu = frappe.db.get_value("URY Restaurant", self.profile.restaurant, "active_menu")
		if not menu:
			return []
		return frappe.get_all(
			"URY Menu Item", filters={"parent": menu, "disabled": 0}, pluck="item", order_by="idx"
		) or []

	def _resolve_rate(self, item_code):
		for price_list in dict.fromkeys([self.menu_price_list, self.profile.selling_price_list]):
			if not price_list:
				continue
			rate = frappe.db.get_value("Item Price", {"price_list": price_list, "item_code": item_code}, "price_list_rate")
			if rate is not None:
				return flt(rate)
		return flt(frappe.db.get_value("Item", item_code, "standard_rate")) or None


def _create_and_submit_invoice(run_doc, slot_row, catalog):
	"""Build, pay and submit one POS Invoice for ``slot_row``.

	Returns ``(invoice_name, order_meta)`` where ``order_meta`` carries the
	order type, payment mode, leased table and (for degraded aggregator
	slots) whether the aggregator fallback fired.
	"""
	scenario = slot_row.scenario
	order_type = SCENARIO_ORDER_TYPE.get(scenario, "Take Away")
	payment_mode = catalog.payment_modes[(slot_row.slot_number - 1) % len(catalog.payment_modes)]
	customer = catalog.customer
	aggregator_fallback = False

	table = None
	if scenario == "Dine-in":
		table = _lease_table(run_doc.branch)
		if not table:
			frappe.throw(
				_("No free table for branch {0}; cannot process dine-in slot {1}.").format(
					run_doc.branch, slot_row.slot_number
				),
				frappe.ValidationError,
			)
	elif scenario == "Aggregator":
		aggregator = frappe.db.get_value(
			"Aggregator Settings",
			{"parent": run_doc.branch, "parenttype": "Branch"},
			["customer", "mode_of_payments"],
			as_dict=True,
		)
		if aggregator and aggregator.customer:
			customer = aggregator.customer
			if aggregator.mode_of_payments:
				payment_mode = aggregator.mode_of_payments
		else:
			# No aggregator configured for this branch: the slot degrades to
			# a takeaway order but is still counted under the aggregator
			# scenario (the slot table is the source of truth for coverage).
			order_type = "Take Away"
			aggregator_fallback = True

	customer_name = frappe.db.get_value("Customer", customer, "customer_name") or customer

	doc = frappe.new_doc(POS_INVOICE_DOCTYPE)
	doc.is_pos = 1
	doc.pos_profile = run_doc.pos_profile
	doc.branch = run_doc.branch
	doc.company = run_doc.company
	if catalog.profile.restaurant:
		doc.restaurant = catalog.profile.restaurant
	doc.cashier = frappe.session.user
	doc.customer = customer
	doc.customer_name = customer_name
	doc.selling_price_list = catalog.selling_price_list
	doc.currency = catalog.company_currency
	doc.conversion_rate = 1
	doc.order_type = order_type
	doc.no_of_pax = 1 + (slot_row.slot_number % 4)
	doc.update_stock = 0
	doc.set_posting_time = 1
	# Posting timestamp: the slot's scenario time, but never in the future
	# and never before the session opened -- the closing entry collects
	# invoices by TIMESTAMP(posting_date, posting_time) inside
	# [period_start, period_end], and the runner processes slots far faster
	# than their minute-scale spacing.
	slot_dt = datetime.combine(getdate(run_doc.business_date), _as_time(slot_row.slot_time))
	posting_dt = min(slot_dt, now_datetime())
	period_start = _session_period_start(run_doc)
	if period_start and posting_dt < period_start:
		posting_dt = period_start
	doc.posting_date = posting_dt.date()
	doc.posting_time = posting_dt.time()
	if table:
		doc.restaurant_table = table

	for line in _pick_lines(catalog, slot_row.slot_number):
		doc.append(
			"items",
			{
				"item_code": line["item_code"],
				"qty": line["qty"],
				"rate": line["rate"],
				"price_list_rate": line["rate"],
				"base_price_list_rate": line["rate"],
			},
		)
	if not doc.items:
		_free_table(table)
		frappe.throw(
			_("Slot {0}: no items could be priced for the invoice.").format(slot_row.slot_number),
			frappe.ValidationError,
		)

	# A payments row must exist at insert-time validation; grand_total is
	# only computed by validate(), so estimate from the appended lines and
	# correct to the real rounded total afterwards (historical_sales.py's
	# proven sequence).
	estimated_total = sum(flt(row.rate) * flt(row.qty) for row in doc.items)
	doc.append("payments", {"mode_of_payment": payment_mode, "amount": estimated_total})
	doc.insert(ignore_permissions=True)
	try:
		real_total = flt(doc.rounded_total) or flt(doc.grand_total)
		if real_total and abs(real_total - flt(doc.payments[0].amount)) > 0.01:
			doc.payments[0].amount = real_total
			doc.save(ignore_permissions=True)
		if table:
			# Dine-in invoices must be marked printed before submit
			# (validate_invoice_print). Real business rule, honoured the same
			# way the dev seed does it: a direct db value, there being no
			# meaningful "print" action for a simulated order.
			frappe.db.set_value(POS_INVOICE_DOCTYPE, doc.name, "invoice_printed", 1)
		# Fresh DB read before submit: the in-memory doc's string `creation`
		# breaks calculate_and_set_times (see historical_sales.py).
		doc = frappe.get_doc(POS_INVOICE_DOCTYPE, doc.name)
		doc.submit()
	except Exception:
		_free_table(table)
		_delete_draft_invoice(doc.name)
		raise

	if table:
		_free_table(table)

	return doc.name, {
		"order_type": order_type,
		"payment_mode": payment_mode,
		"customer": customer,
		"table": table,
		"aggregator_fallback": aggregator_fallback,
	}


def _as_time(value):
	"""Coerce a Time field value (time / timedelta / "HH:MM:SS") to ``time``."""
	if isinstance(value, time):
		return value
	if isinstance(value, timedelta):
		return (datetime.min + value).time()
	return datetime.strptime(str(value).split(".")[0], "%H:%M:%S").time()


def _session_period_start(run_doc):
	opening_name = run_doc.get("pos_opening_entry")
	if not opening_name:
		return None
	raw = frappe.db.get_value(POS_OPENING_DOCTYPE, opening_name, "period_start_date")
	return get_datetime(raw) if raw else None


def _pick_lines(catalog, slot_number):
	"""Deterministic 1..3 DISTINCT line pick for ``slot_number``.

	Each candidate item needs real POS availability (Bin minus the qty
	reserved by submitted, unconsolidated POS Invoices -- including this
	run's earlier slots) for its line qty; under-stocked candidates are
	skipped, so a whole session can never reserve more than the warehouse
	holds. Throws when no line at all can be formed.
	"""
	count = 1 + ((slot_number - 1) % 3)
	step = ((slot_number - 1) * 7) % len(catalog.items)
	lines = []
	seen = set()
	for j in range(len(catalog.items)):
		if len(lines) >= count:
			break
		entry = catalog.items[(step + j * 11) % len(catalog.items)]
		if entry["item_code"] in seen:
			continue
		available = catalog.available_qty(entry["item_code"])
		if available < 1:
			continue
		qty = min(1 + ((slot_number + j) % MAX_LINE_QTY), int(available))
		if qty < 1:
			continue
		seen.add(entry["item_code"])
		lines.append({"item_code": entry["item_code"], "rate": entry["rate"], "qty": qty})
	if not lines:
		frappe.throw(
			_("Slot {0}: no menu item has sellable stock at warehouse {1} right now.").format(
				slot_number, catalog.profile.warehouse
			),
			frappe.ValidationError,
		)
	return lines


def _lease_table(branch):
	"""Occupy a free, non-takeaway URY Table for a dine-in order, or None."""
	table = frappe.db.get_value(
		"URY Table", {"branch": branch, "occupied": 0, "is_take_away": 0}, "name"
	)
	if table:
		frappe.db.set_value("URY Table", table, "occupied", 1)
	return table


def _free_table(table):
	if not table:
		return
	try:
		frappe.db.set_value("URY Table", table, {"occupied": 0, "latest_invoice_time": None})
	except Exception:
		pass


def _delete_draft_invoice(invoice_name):
	if not invoice_name or not frappe.db.exists(POS_INVOICE_DOCTYPE, invoice_name):
		return
	try:
		draft = frappe.get_doc(POS_INVOICE_DOCTYPE, invoice_name)
		if draft.docstatus == 0:
			frappe.delete_doc(POS_INVOICE_DOCTYPE, invoice_name, ignore_permissions=True, force=True)
			frappe.db.commit()
	except Exception:
		pass


# --- closing -------------------------------------------------------------------


def _close_and_consolidate(opening_name):
	"""Submit the closing entry for ``opening_name`` and consolidate.

	Returns ``(closing_name, primary_si_name, invoice_count, si_names)``.
	"""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import (
		make_closing_entry_from_opening,
	)

	opening = frappe.get_doc(POS_OPENING_DOCTYPE, opening_name)
	if opening.status != "Open":
		frappe.throw(
			_("POS Opening Entry {0} is {1}, not Open; cannot close it.").format(
				opening_name, opening.status
			),
			frappe.ValidationError,
		)

	closing = make_closing_entry_from_opening(opening)
	for row in closing.payment_reconciliation or []:
		row.closing_amount = row.expected_amount
		if hasattr(row, "custom_closing_amount"):
			row.custom_closing_amount = row.expected_amount
	invoice_count = len(closing.pos_invoices or [])
	if invoice_count == 0:
		frappe.throw(
			_(
				"POS Opening Entry {0} collected no POS Invoices for the session window -- the "
				"simulated orders fell outside [period_start, period_end]. Check the slot times "
				"against the session window."
			).format(opening_name),
			frappe.ValidationError,
		)

	closing.insert(ignore_permissions=True)
	try:
		closing.submit()
	except Exception:
		if closing.name and frappe.db.exists(POS_CLOSING_DOCTYPE, closing.name):
			stray = frappe.get_doc(POS_CLOSING_DOCTYPE, closing.name)
			if stray.docstatus == 0:
				frappe.delete_doc(POS_CLOSING_DOCTYPE, closing.name, force=True)
		raise

	closing = frappe.get_doc(POS_CLOSING_DOCTYPE, closing.name)
	if closing.status == "Queued":
		# Genuine background path (developer_mode off, no inline execution):
		# run the merge synchronously so the run does not depend on RQ
		# workers. The enqueued duplicate, if a worker ever picks it up,
		# self-guards via the merge log's validate (invoices already
		# consolidated), and developer sites never enqueue at all.
		_run_merge_inline(closing)

	si_names = _find_consolidated_sales_invoices(closing.name)
	if not si_names:
		frappe.throw(
			_(
				"POS Closing Entry {0} submitted but no consolidated Sales Invoice was found for "
				"it -- see the closing entry and POS Invoice Merge Logs for errors."
			).format(closing.name),
			frappe.ValidationError,
		)
	# ERPNext merges per customer, so a session with more than one customer
	# yields several consolidated Sales Invoices; the run doc links the
	# largest one and the result lists them all.
	return closing.name, si_names[0], invoice_count, si_names


def _run_merge_inline(closing):
	from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
		create_merge_logs,
		get_invoice_customer_map,
	)

	pos_invoices = [
		frappe._dict(
			{
				"pos_invoice": row.pos_invoice,
				"posting_date": row.posting_date,
				"grand_total": row.grand_total,
				"customer": row.customer,
				"is_return": 0,
				"return_against": None,
			}
		)
		for row in closing.pos_invoices
	]
	create_merge_logs(get_invoice_customer_map(pos_invoices), closing_entry=closing)


def _find_consolidated_sales_invoices(closing_name):
	"""All consolidated Sales Invoices created for ``closing_name``.

	ERPNext merges per customer (and per accounting-dimension hash), so one
	closing entry can produce several consolidated Sales Invoices. They are
	returned ordered by grand total descending, so the caller's single Link
	field points at the session's primary invoice.

	Primary key ``pos_closing_entry`` is only stamped by
	``update_sales_invoices_closing_entry`` over the closing's own
	``sales_invoices`` rows -- which stay empty in POS Invoice mode -- so in
	this ERPNext version the reliable backlink is the POS Invoice Merge Log
	created for the closing.
	"""
	names = []
	rows = frappe.get_all(
		MERGE_LOG_DOCTYPE,
		filters={"pos_closing_entry": closing_name, "docstatus": 1},
		fields=["name", "consolidated_invoice"],
	)
	for row in rows:
		if row.consolidated_invoice and row.consolidated_invoice not in names:
			names.append(row.consolidated_invoice)
	# Defensive fallback: some versions stamp the closing backlink directly.
	for si_name in frappe.get_all(
		SALES_INVOICE_DOCTYPE,
		filters={"pos_closing_entry": closing_name, "is_consolidated": 1},
		pluck="name",
	):
		if si_name not in names:
			names.append(si_name)

	def _grand_total(name):
		return flt(frappe.db.get_value(SALES_INVOICE_DOCTYPE, name, "grand_total"))

	names.sort(key=_grand_total, reverse=True)
	return names


def _closing_result(run_doc, invoice_count=None, consolidated_si_names=None):
	closing_name = run_doc.get("pos_closing_entry")
	result = {
		"run_id": run_doc.name,
		"pos_opening_entry": run_doc.get("pos_opening_entry"),
		"pos_closing_entry": closing_name,
		"consolidated_sales_invoices": consolidated_si_names
		or ([run_doc.consolidated_sales_invoice] if run_doc.get("consolidated_sales_invoice") else []),
		"consolidated_sales_invoice": run_doc.get("consolidated_sales_invoice"),
		"status": run_doc.status,
		"counters": {
			"total_invoices": run_doc.get("total_invoices"),
			"total_revenue": flt(run_doc.get("total_revenue")),
			"takeaway_invoices": run_doc.get("takeaway_invoices"),
			"dine_in_invoices": run_doc.get("dine_in_invoices"),
			"delivery_invoices": run_doc.get("delivery_invoices"),
			"aggregator_invoices": run_doc.get("aggregator_invoices"),
		},
	}
	if closing_name:
		closing = frappe.get_doc(POS_CLOSING_DOCTYPE, closing_name)
		result["closing_grand_total"] = flt(closing.grand_total)
		result["closing_invoice_count"] = (
			invoice_count if invoice_count is not None else len(closing.pos_invoices or [])
		)
		result["payment_reconciliation"] = [
			{
				"mode_of_payment": row.mode_of_payment,
				"expected_amount": flt(row.expected_amount),
				"closing_amount": flt(row.closing_amount),
				"difference": flt(row.difference),
			}
			for row in closing.payment_reconciliation or []
		]
	return result


def _record_closing_failure(run_doc):
	try:
		doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
		doc.status = RUN_STATUS_CLOSING_FAILED
		doc.error_summary = (frappe.get_traceback() or "")[-140:]
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()


def _stamp_run_failure(run_doc):
	"""Best-effort failure stamp; never overwrites a more specific status."""
	try:
		current = frappe.db.get_value(SIMULATION_RUN_DOCTYPE, run_doc.name, "status")
		if current in (RUN_STATUS_CLOSING_FAILED, RUN_STATUS_COMPLETED):
			return
		doc = frappe.get_doc(SIMULATION_RUN_DOCTYPE, run_doc.name)
		doc.status = RUN_STATUS_FAILED
		doc.error_summary = (frappe.get_traceback() or "")[-140:]
		doc.save(ignore_permissions=True)
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
