# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Session-scoped closing reconciliation (T5 / I-10).

This is the enforcement point for the Tier 2 stock-authority design. It runs
on `POS Closing Entry.validate`, alongside (never replacing)
`ury.ury.utils.stock_count_gate.validate_pos_closing_entry`, and it is gated
on `get_branch_stock_policy(...).closing_reconciliation_enabled` -- gate 3,
the last of the three ordered gates in
ARCHITECTURE_POS_STOCK_AUTHORITY.md section 3.4. Gate off (which includes
every Tier 1 site, every un-migrated site, and every error path, since the
resolver fails closed) means a complete no-op: nothing here is queried.

WHY HERE AND NOT AT THE TILL
----------------------------
The equivalent per-invoice check already exists at `POS Invoice.on_submit`
(`ury_feature_flags.maybe_wire_fulfilment_on_submit`). That one is
cashier-facing at the moment of payment, and G-10 records why that is the
wrong place to be strict: a wedged background worker or one failed Stock
Entry refuses a customer's payment with a message a cashier cannot act on.
I-11 downgrades it to advisory -- and it may only be downgraded because THIS
check exists to be strict in its place.

Blocking a manager's end-of-shift closing screen is the acceptable trade the
architecture brief explicitly endorses: the shift's stock posture is wrong,
the manager is the person who can chase the kitchen or the queue about it,
and nothing downstream (consolidation, the SLEs) has happened yet. So this
gate throws, deliberately and by design.

WHAT IT ASSERTS, over every POS Invoice in the closing entry's session
----------------------------------------------------------------------
1. Every produced MADE_TO_ORDER item has a POSTED posting intent whose
   `accepted_revision` and `accepted_qty` match what is actually invoiced.
   This reuses `ury_feature_flags._verify_fulfilment_posted_for_invoice`
   verbatim rather than restating it -- see `_verify_invoice_production`.
2. Every sold line's reservation group is resolvable, i.e. in a state the
   I-8 close-out hook (`ury_sales_invoice.fulfil_reservations_on_consolidation`,
   fired when this session's consolidated Sales Invoice submits) will
   correctly settle. See `_RESOLVABLE_STATUSES` for exactly what that means
   and why the other statuses are not resolvable.

Anything else that goes wrong -- a malformed intent row, a missing doctype,
an unexpected exception anywhere in this module -- also blocks the closing,
but with a message that names the closing entry and says what to do, rather
than surfacing a raw traceback at a manager. Fail-closed here means "block
the close", the opposite of the resolver's fail-closed ("fall back to Tier
1"), and deliberately so: at this point we already KNOW the branch opted
into enforcement, so an unreadable reconciliation result is exactly the
situation enforcement exists to catch.
"""

import frappe
from frappe import _

from ury.ury.api.ury_reservation_service import (
	FULFILLED,
	RESERVED,
	RESERVATION_DOCTYPE,
)

LOGGER = "ury_pos_closing_reconciliation"

# A reservation group is "resolvable" iff every one of its rows is Reserved,
# or every one of its rows is Fulfilled.
#
#   Reserved  -- I-8 will fulfil it when this session's consolidated Sales
#                Invoice submits (`_fulfil_reservations_for_consolidated_invoice`
#                queries exactly `status == Reserved` on this invoice's
#                `order_ref`). This is the normal Tier-2-without-production
#                and pre-consolidation state.
#   Fulfilled -- already settled, normally by the fulfilment posting service
#                at READY for a MADE_TO_ORDER group. I-8's
#                `fulfil_reservation_if_pending` returns "already" and moves
#                on. Terminal and correct.
#
# Everything else is NOT resolvable and must block:
#
#   Released / Cancelled -- the reservation was given back, but the line is
#                on a submitted POS Invoice, so it sold anyway. Capacity
#                accounting and the sale disagree. I-8 will skip the group
#                ("not_eligible") and the discrepancy is silently kept.
#   Expired   -- the stale-reservation sweeper (I-12) reclaimed capacity for
#                a line that then sold. Same disagreement.
#   MIXED     -- a group whose rows are in different statuses is mid- or
#                half-transitioned; `_transition_group` refuses partial
#                transitions, so I-8 will refuse it too and it will never
#                settle on its own.
_RESOLVABLE_STATUSES = (frozenset({RESERVED}), frozenset({FULFILLED}))

# Cap on how many distinct problems are named in one message. A session with
# a systemic failure can have hundreds; a manager needs the first few and the
# count, not a wall of text.
_MAX_REPORTED = 10


def validate_closing_reconciliation(doc, method=None):
	"""`POS Closing Entry.validate` doc_event entry point.

	No-op unless `closing_reconciliation_enabled` is on for this closing
	entry's branch. Never returns a value; either passes silently or throws.
	"""
	policy = _resolve_policy(doc)
	if not policy or not policy.closing_reconciliation_enabled:
		# Gate off. Do not query anything at all.
		return

	try:
		problems = _reconcile_session(doc)
	except Exception:
		frappe.log_error(
			frappe.get_traceback(),
			"URY closing reconciliation failed for {0}".format(doc.get("name") or "(new)"),
		)
		frappe.throw(
			_(
				"Closing stock reconciliation could not be completed for this "
				"session, so the shift cannot be closed. This is a system error, "
				"not a counting mistake -- the full details have been written to "
				"the Error Log. Please contact support with this closing entry's "
				"name ({0})."
			).format(doc.get("name") or "(unsaved)"),
			frappe.ValidationError,
		)

	if problems:
		_throw_reconciliation_failure(doc, problems)


def _resolve_policy(doc):
	"""Resolve the tier policy for this closing entry's branch.

	`POS Closing Entry` carries no `branch` field of its own in core, so the
	branch comes from its POS Profile -- which is single-valued, and which
	core's `validate_pos_invoices()` forces every `pos_transactions` row to
	match (G-12, resolved in T10: a closing entry provably cannot span two
	branches, so one policy lookup is correct and no mixed-tier defence is
	needed).

	Returns None on any failure, which the caller treats as "gate off". That
	matches the resolver's own fail-closed contract: an unreadable tier is
	Tier 1, and Tier 1 does not reconcile.
	"""
	try:
		from ury.ury.api.ury_stock_policy import get_branch_stock_policy

		branch = doc.get("branch")
		if not branch and doc.get("pos_profile"):
			branch = frappe.db.get_value("POS Profile", doc.get("pos_profile"), "branch")
		if not branch:
			return None

		return get_branch_stock_policy(branch=branch, company=doc.get("company"))
	except Exception:
		frappe.logger(LOGGER).exception(
			"Could not resolve stock policy for closing entry %s; treating as Tier 1",
			doc.get("name"),
		)
		return None


def _reconcile_session(doc):
	"""Run both checks over every POS Invoice in the session.

	Returns a list of human-readable problem strings (empty == clean).
	"""
	invoice_names = _session_invoice_names(doc)
	if not invoice_names:
		# An empty shift -- no transactions, nothing to reconcile. A trivial
		# pass, not an error: a cashier who opened and closed without selling
		# anything must be able to close.
		return []

	problems = []
	for invoice_name in invoice_names:
		problem = _verify_invoice_production(invoice_name)
		if problem:
			problems.append(problem)
	problems.extend(_verify_reservations_resolvable(invoice_names))
	return problems


def _session_invoice_names(doc):
	"""The POS Invoices in this closing entry's session, deduplicated.

	Read from `pos_transactions`, the same table
	`ury_pos_closing_entry.populate_pos_transactions` rebuilds. Hook ordering
	in `hooks.py` puts `ury_pos_closing_entry.validate` (which runs
	`populate_pos_transactions`) before this handler, so by the time we read
	it the table is populated even for the custom frontend's path, which
	never sends it.
	"""
	rows = doc.get("pos_transactions") or []
	names = []
	for row in rows:
		name = row.get("pos_invoice") if hasattr(row, "get") else getattr(row, "pos_invoice", None)
		if name and name not in names:
			names.append(name)
	return names


def _verify_invoice_production(invoice_name):
	"""Check 1: every produced MADE_TO_ORDER line on this invoice has a
	matching POSTED intent.

	REUSE, NOT REIMPLEMENTATION. This calls
	`ury_feature_flags._verify_fulfilment_posted_for_invoice` directly rather
	than extracting a shared helper or restating the matching rules. That
	function is the G-07 fix: it already walks KOTs -> execution rows, skips
	unproduced and non-MADE_TO_ORDER lines, performs one synchronous retry of
	a pending intent, and pins the intent to the execution row's current
	`idempotency_key` AND the invoiced quantity. Every one of those rules is
	subtle and safety-critical; two copies would drift, and a "shared helper"
	extraction would mean editing that module's already-merged, live-verified
	code to gain nothing this call does not already give us.

	What does differ is the CONTEXT of its message, which is written for a
	cashier at submit time ("this invoice cannot be submitted"). We catch its
	`ValidationError` and turn it into one entry in this closing entry's
	aggregated problem list, naming the invoice and keeping the original
	diagnosis verbatim so the item/KOT/reason detail survives. Aggregating
	rather than re-throwing immediately matters at this altitude: a manager
	should see every blocked invoice in the shift in one pass, not fix one
	and rediscover the next on the next attempt.

	The synchronous retry inside is a bonus here rather than a hazard: at
	end-of-shift a merely-lagging worker is exactly the case that should
	self-heal instead of blocking a manager.

	Returns a problem string, or None when the invoice is clean.
	"""
	from ury.ury.api.ury_feature_flags import _verify_fulfilment_posted_for_invoice

	# A lightweight stand-in rather than `frappe.get_doc`: the verification
	# reads only `name`, `branch` and `company`, and a busy session can hold
	# hundreds of invoices. `frappe._dict` supports both the attribute access
	# (`doc.name`) and the `.get()` access that function uses.
	row = frappe.db.get_value(
		"POS Invoice", invoice_name, ["name", "branch", "company"], as_dict=True
	)
	if not row:
		# Referenced by `pos_transactions` but not readable. Core's own
		# `validate_pos_invoices()` would fail on this too; say so plainly
		# rather than letting a later step surface it.
		return _("POS Invoice {0} is referenced by this closing entry but could not be read.").format(
			invoice_name
		)

	# `frappe.throw` pushes its message onto `frappe.message_log` before
	# raising. Since we are catching that raise and re-wording it, the
	# cashier-worded original would otherwise still pop up at the manager
	# alongside our own message. Snapshot and restore so exactly one message
	# reaches the UI.
	log_depth = len(getattr(frappe.local, "message_log", []) or [])
	try:
		_verify_fulfilment_posted_for_invoice(frappe._dict(row))
	except frappe.ValidationError as exc:
		_truncate_message_log(log_depth)
		return _("POS Invoice {0}: {1}").format(invoice_name, str(exc))
	return None


def _truncate_message_log(depth):
	try:
		log = getattr(frappe.local, "message_log", None)
		if isinstance(log, list) and len(log) > depth:
			del log[depth:]
	except Exception:
		# Cosmetic only; never let message-log bookkeeping break the gate.
		return


def _verify_reservations_resolvable(invoice_names):
	"""Check 2: every reservation group belonging to this session's invoices
	is in a state I-8 can settle.

	Reservations are keyed on `order_ref == POS Invoice name` (see
	`ury_order._ensure_invoice_reservation_ref`), the same join key I-8 uses,
	so this asks precisely the question "will the close-out hook that fires
	on this session's consolidated Sales Invoice do the right thing".
	"""
	rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={"order_ref": ["in", invoice_names]},
		fields=["reservation_group", "order_ref", "status", "top_level_item"],
	)
	if not rows:
		# No reservations for this session at all. Normal on a branch running
		# state 3/4 whose items have no production configuration, and normal
		# for a session predating the reservation rollout. Not a problem.
		return []

	groups = {}
	for row in rows:
		group = row.get("reservation_group")
		if not group:
			# An orphaned row with no group cannot be transitioned by
			# `_transition_group` (which resolves rows BY group), so I-8 can
			# never settle it. Report it against its order.
			groups.setdefault(("__ungrouped__", row.get("order_ref")), []).append(row)
			continue
		groups.setdefault((group, row.get("order_ref")), []).append(row)

	problems = []
	for (group, order_ref), group_rows in sorted(groups.items(), key=lambda kv: str(kv[0])):
		statuses = {r.get("status") for r in group_rows}
		if group == "__ungrouped__":
			problems.append(
				_(
					"POS Invoice {0}: reservation rows for {1} have no reservation "
					"group and cannot be settled automatically."
				).format(order_ref, _items_label(group_rows))
			)
			continue
		if statuses in _RESOLVABLE_STATUSES:
			continue
		problems.append(
			_(
				"POS Invoice {0}: reservation group {1} for {2} is in state {3}, "
				"which will not be settled when this session is consolidated "
				"(expected all Reserved or all Fulfilled)."
			).format(
				order_ref,
				group,
				_items_label(group_rows),
				", ".join(sorted(str(s) for s in statuses)),
			)
		)

	return problems


def _items_label(rows):
	items = sorted({str(r.get("top_level_item")) for r in rows if r.get("top_level_item")})
	if not items:
		return _("(unknown item)")
	if len(items) > 3:
		return "{0} (+{1} more)".format(", ".join(items[:3]), len(items) - 3)
	return ", ".join(items)


def _throw_reconciliation_failure(doc, problems):
	shown = problems[:_MAX_REPORTED]
	body = "\n".join("- {0}".format(p) for p in shown)
	if len(problems) > len(shown):
		body += "\n" + _("...and {0} more.").format(len(problems) - len(shown))

	frappe.throw(
		_(
			"This shift cannot be closed until its stock postings and "
			"reservations are resolved. The following need attention:\n\n{0}"
		).format(body),
		frappe.ValidationError,
		title=_("Closing Stock Reconciliation Failed"),
	)
