# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""V3-73: POS stock authority feature flag.

SUPERSEDED (T1 / I-1). This module is no longer the read path for tier
state. `ury.ury.api.ury_stock_policy.get_branch_stock_policy` is, and it
reads the per-branch, per-concern `URY Branch Stock Policy` doctype rather
than the site-wide `URY Feature Flags` Single. `is_pos_stock_authority_flag_enabled`
below is retained as a deprecated shim over that resolver so the already-merged
Phase 0/1 call sites stay correct; new code must call the resolver directly.
Everything the rest of this docstring says about what the gate DOES (and,
more importantly, does not do) remains accurate -- only its storage and its
per-concern granularity changed. See ARCHITECTURE_POS_STOCK_AUTHORITY.md
section 3.4.

Read this before changing anything here: the flag does NOT switch stock
authority away from native ERPNext, and never did. The sale-side stock
deduction is owned by native ERPNext in every mode, unconditionally. It is
anchored to POS Closing Entry, not to invoice submit: `POS Invoice` has no
`update_stock` field at all, and `POSInvoice.on_submit` writes no stock
ledger entry. Consolidation at closing copies each POS Invoice Item onto a
consolidated `Sales Invoice`, sets `update_stock = 1` on it, and that
document's submit writes the SLEs -- once per session, out of each line's
warehouse.

What this flag actually gates is a SECOND, orthogonal ledger: the
production-side raws-to-finished-good movement, posted in real time at KOT
READY as a `Manufacture` Stock Entry by the fulfilment posting service, for
made-to-order items only. That movement receives the finished good into the
same department warehouse the sale later deducts from, so the two net out
rather than competing. Turning the flag on adds the production ledger; it
subtracts nothing from the sale ledger.

Concretely, the flag's only effects are (a) whether READY creates a posting
intent (`ury_kot_item_execution_service._attach_ready_posting_intent`) and
(b) whether the POS Invoice submit gate below runs. The replacement path
remains feature-flagged and operationally gated until its runtime accounting
and deployment evidence is accepted.

Governing contract:
tracks/sa-v3_nxt/outputs/V3-70-fulfilment-accounting-transition-checklist.md

HARD RULES this module exists to enforce:

1. The flag defaults to False/off in every circumstance: unset field, a
   missing "URY Feature Flags" doctype/table (e.g. before migration), a
   database error, or any other unexpected condition. This function FAILS
   CLOSED -- any exception is caught here and treated as "flag is off". It
   must never fail open to the new, less-battle-tested code path.
2. Nothing in this module, or anywhere else in the shipped application code,
   sets this flag to True. The only way the flag becomes True in a real
   deployment is a human deliberately editing the "URY Feature Flags" single
   doctype (Desk UI or a direct, out-of-band data change) -- an explicit,
   auditable, out-of-band admin action, not a code default.
3. Per-branch/per-company overrides are accepted as optional future-proofing
   (the checklist recommends per-branch scoping) but the current
   implementation only reads the single global flag; `company`/`branch`
   arguments are accepted so callers don't need to change their call sites
   later, and are currently unused. Document any future per-scope storage
   choice here when it's built.

DO NOT set this flag to True anywhere in this codebase. If you are looking
for how to enable the new fulfilment path in a live environment, that is an
operational decision requiring the evidence and sign-off described in the
governing contract above -- not a code change.
"""

import frappe
from frappe import _
from frappe.utils import flt

# Retired storage location, kept for the T2 migration patch (which reads the
# old Single to seed `URY Branch Stock Policy` rows) and for reference. No
# runtime read path in this module uses them any more.
FLAG_DOCTYPE = "URY Feature Flags"
FLAG_FIELD = "pos_stock_authority_v2"
INTENT_DOCTYPE = "URY Fulfilment Posting Intent"
ITEM_EXECUTION_DOCTYPE = "URY KOT Item Execution"
KOT_ITEM_DOCTYPE = "URY KOT Items"
POSTED = "POSTED"
PRODUCED_STATES = ("READY", "SERVED")
MADE_TO_ORDER = "MADE_TO_ORDER"


def is_pos_stock_authority_flag_enabled(company=None, branch=None):
	"""DEPRECATED. Use `ury.ury.api.ury_stock_policy.get_branch_stock_policy`.

	The site-wide `URY Feature Flags.pos_stock_authority_v2` Single has been
	superseded by the per-branch, per-concern `URY Branch Stock Policy`
	doctype and its resolver (I-1; see ARCHITECTURE_POS_STOCK_AUTHORITY.md
	section 3.4). This function survives only as a shim for the Phase 0/1 call
	sites that have not yet been migrated, so they stay correct without every
	one of them having to change at once. Do not delete it; do not add new
	callers to it.

	It now reads
	`get_branch_stock_policy(branch, company).realtime_production_posting_enabled`
	-- the closest semantic equivalent, because what the old Single actually
	gated was whether READY creates a posting intent and whether the POS
	Invoice submit gate below runs, i.e. "is Tier 2 production posting active".
	It no longer consults the old Single at all, so a site that has only ever
	set the old flag reads as off until the migration patch (T2) populates the
	new doctype.

	ALL NEW CALL SITES MUST CALL `get_branch_stock_policy` DIRECTLY, and must
	pick the gate matching the concern they are gating: reservation work
	belongs behind `reservation_control_enabled` and closing-time enforcement
	behind `closing_reconciliation_enabled`, neither of which this shim can
	express.

	Fails CLOSED (returns False) on any error. Never raises.
	"""
	from ury.ury.api.ury_stock_policy import get_branch_stock_policy

	try:
		policy = get_branch_stock_policy(branch=branch, company=company)
	except Exception:
		# Belt and braces. The resolver already fails closed internally and
		# documents that it never raises, but this shim guards the till and
		# must not become the thing that breaks it.
		return False

	return bool(policy.realtime_production_posting_enabled)


def maybe_wire_fulfilment_on_submit(doc, method=None):
	"""V3-73 flag-on integration point, called from POS Invoice's on_submit
	doc_event (additive: appended alongside the existing on_submit handler,
	never replacing it).

	Note what this is NOT: it does not suppress, defer, or replace any native
	stock posting on this invoice. A POS Invoice submit writes no stock
	ledger entry in any mode -- the sale is deducted later, at POS Closing
	Entry, by the consolidated Sales Invoice. This handler only checks that
	the separate production-side posting has happened for the items on this
	invoice before the invoice is allowed to submit.

	Flag OFF (default in every real environment): no-op, returns immediately.

	Flag ON: VERIFY, do not post. For every KOT item on this invoice whose
	execution reached READY/SERVED and whose production policy is
	MADE_TO_ORDER, assert that the fulfilment posting service has a POSTED
	`URY Fulfilment Posting Intent` matching this exact item, revision and
	quantity. Nothing is posted here -- the Manufacture entry was already
	written, in real time, at READY. This is the checkpoint that stops an
	invoice being settled while its production posting is missing, stale or
	stuck.

	Only MADE_TO_ORDER items are checked, for the same reason only they post
	(see `ury_fulfilment_posting_service`): PRE_PRODUCED items were produced
	ahead of time by the batch path and DIRECT_RETAIL items are not produced
	at all, so neither has an intent to find, and demanding one would block
	every submit.
	"""
	if not is_pos_stock_authority_flag_enabled(branch=doc.get("branch")):
		return

	_verify_fulfilment_posted_for_invoice(doc)


def _verify_fulfilment_posted_for_invoice(doc):
	"""Assert every produced made-to-order line on this invoice has a POSTED
	intent that matches what is actually being invoiced.

	Replaces the previous handler, which re-ran the standalone V3-71/V3-72
	fulfilment services here at submit time. That was never a verification
	gate: those services call `fulfil_reservation` themselves, and since the
	posting pipeline already transitions a made-to-order group to Fulfilled
	at READY, the old code's `status="Reserved"` lookup came back empty and
	threw on every such invoice. It was also redundant -- neither service
	writes a Stock Entry, so it produced no ledger effect the posting service
	had not already produced. Verification is the only job left here.
	"""
	from ury.ury.api.ury_fulfilment_posting_service import process_posting_intent

	kots = frappe.get_all("URY KOT", filters={"invoice": doc.name}, fields=["name"])
	if not kots:
		return

	for kot in kots:
		rows = frappe.get_all(
			ITEM_EXECUTION_DOCTYPE,
			filters={"kot": kot.name},
			fields=["name", "kot_item", "state", "idempotency_key", "branch", "company"],
		)
		for row in rows:
			if row.get("state") not in PRODUCED_STATES:
				# Not produced yet, so there is nothing to have posted. An
				# unproduced item is a kitchen-workflow question, not a stock
				# one, and must not block payment.
				continue
			_verify_item_execution_intent(row, kot.name, doc, process_posting_intent)


def _verify_item_execution_intent(row, kot_name, doc, process_posting_intent):
	item_code, invoiced_qty = _kot_item_scope(row.get("kot_item"))
	if not item_code:
		return

	if not _is_made_to_order(item_code, row.get("branch") or doc.get("branch"), row.get("company") or doc.get("company")):
		return

	intent = _latest_intent(row.get("kot_item"))
	if not intent:
		frappe.throw(
			_(
				"Production posting is missing for item {0} on KOT {1}. "
				"The kitchen marked it ready but no stock posting was recorded, "
				"so this invoice cannot be submitted."
			).format(item_code, kot_name),
			frappe.ValidationError,
		)

	if intent.get("status") != POSTED:
		# One synchronous retry: the posting normally happens in a background
		# worker moments after READY, so the common case here is simply that
		# the worker has not drained yet rather than a real failure.
		try:
			process_posting_intent(intent.get("name"))
		except Exception:
			frappe.logger("ury_feature_flags").exception(
				"Synchronous retry of posting intent %s failed", intent.get("name")
			)
		intent = _latest_intent(row.get("kot_item"))
		if not intent or intent.get("status") != POSTED:
			if _closing_reconciliation_will_catch_this(row, doc):
				# I-11: T5's closing-time reconciliation (`ury_pos_closing_reconciliation`)
				# now genuinely catches this same problem, manager-facing, at
				# end of shift -- so this cashier-facing, per-invoice gate no
				# longer needs to be the one place that stops it. A stuck
				# background worker must not stop the till: log for ops
				# visibility and let the sale proceed. This branch is reached
				# only when the branch has real enforcement at closing; see
				# the early return below for the Tier-2-without-T5 case,
				# which stays strict because it is the only safety net.
				frappe.log_error(
					title="URY till-time fulfilment posting advisory",
					message=(
						"Production posting for item {0} on KOT {1} has not completed "
						"(status: {2}) at POS Invoice submit. closing_reconciliation_enabled "
						"is on for this branch, so this is advisory only: the invoice was "
						"allowed to submit and POS Closing Entry will enforce this at "
						"end of shift instead."
					).format(item_code, kot_name, (intent or {}).get("status") or "missing"),
				)
				return
			frappe.throw(
				_(
					"Production posting for item {0} on KOT {1} has not completed "
					"(status: {2}). This invoice cannot be submitted until it does."
				).format(item_code, kot_name, (intent or {}).get("status") or "missing"),
				frappe.ValidationError,
			)

	# G-07: a POSTED intent for this kot_item is NOT on its own proof that
	# what was posted is what is being invoiced. Selecting the latest intent
	# by `creation desc` and stopping there accepts a stale one:
	#
	#   - An order edited upward after READY (1 -> 3) has a POSTED intent for
	#     qty 1. Three are sold, one was produced.
	#   - A re-fired item whose new READY transition failed to create an
	#     intent passes on the previous fire's intent.
	#
	# Both are silent stock loss, and both are invisible to a kot_item-only
	# match. Pin the intent to the execution row's CURRENT idempotency key and
	# to the quantity actually being invoiced; a mismatch means the posting
	# describes a different revision of this line, so fail rather than accept.
	current_revision = row.get("idempotency_key") or "current"
	if intent.get("accepted_revision") != current_revision:
		frappe.throw(
			_(
				"Production posting for item {0} on KOT {1} is stale: it was posted "
				"for a previous revision of this line. Re-fire the item so it is "
				"produced against the current order before submitting."
			).format(item_code, kot_name),
			frappe.ValidationError,
		)

	if flt(intent.get("accepted_qty")) != flt(invoiced_qty):
		frappe.throw(
			_(
				"Production posting for item {0} on KOT {1} covers {2}, but {3} is "
				"being invoiced. Re-fire the item for the current quantity before "
				"submitting."
			).format(item_code, kot_name, flt(intent.get("accepted_qty")), flt(invoiced_qty)),
			frappe.ValidationError,
		)


def _kot_item_scope(kot_item):
	"""Item code and quantity for a KOT item row, read from the same fields
	`ury_fulfilment_posting_service._kot_item_doc` froze onto the intent, so
	the qty comparison is like for like."""
	if not kot_item:
		return None, 0
	row = frappe.db.get_value(
		KOT_ITEM_DOCTYPE, kot_item, ["item", "quantity"], as_dict=True
	)
	if not row:
		return None, 0
	return row.get("item"), flt(row.get("quantity"))


def _is_made_to_order(item_code, branch, company):
	"""True only for a resolvable MADE_TO_ORDER production configuration.

	Fails OPEN (returns False, i.e. "do not require an intent") when the
	context cannot be resolved. An item with no production configuration
	posts nothing at READY and is deducted once by the sale at closing --
	that is correct behaviour, not a missing posting, so it must not block
	the till. Resolution failure is logged rather than swallowed silently.
	"""
	if not item_code or not branch:
		return False
	try:
		from ury.ury.api.ury_production_context import resolve_production_context

		context = resolve_production_context(item_code, branch, company)
	except Exception:
		frappe.logger("ury_feature_flags").exception(
			"Could not resolve production context for %s/%s", item_code, branch
		)
		return False
	if not context:
		return False
	return context.get("production_policy") == MADE_TO_ORDER


def _closing_reconciliation_will_catch_this(row, doc):
	"""True only when T5's `POS Closing Entry.validate` reconciliation
	(`ury_pos_closing_reconciliation.validate_closing_reconciliation`) is
	genuinely active for this invoice's branch -- i.e.
	`closing_reconciliation_enabled` on `get_branch_stock_policy(...)`.

	This is the I-11 gate: the till-time check below may only become
	advisory where the closing-time check exists to be strict in its
	place. Fails CLOSED (returns False, i.e. "stay strict at the till")
	on any resolution failure, exactly like every other policy read in
	this codebase -- an unreadable policy must not silently remove the
	only safety net a branch has.
	"""
	try:
		from ury.ury.api.ury_stock_policy import get_branch_stock_policy

		branch = row.get("branch") or doc.get("branch")
		company = row.get("company") or doc.get("company")
		policy = get_branch_stock_policy(branch=branch, company=company)
	except Exception:
		frappe.logger("ury_feature_flags").exception(
			"Could not resolve stock policy while deciding till-time "
			"fulfilment gate severity; staying strict"
		)
		return False
	return bool(policy.closing_reconciliation_enabled)


def _latest_intent(kot_item):
	if not kot_item:
		return None
	rows = frappe.get_all(
		INTENT_DOCTYPE,
		filters={"kot_item": kot_item},
		fields=["name", "status", "accepted_revision", "accepted_qty"],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None
