"""Cancellation/disposition service for production execution, per V3-50's
"Availability and Cancellation Coupling" section and "Focused Future Tests"
-> "V3-54 cancellation/disposition" list (see
tracks/sa-v3_nxt/outputs/V3-50-prep-handoff.md), building on top of V3-53's
`URY KOT Execution` state machine (copied byte-identical into this worktree,
NOT modified by this module -- see `ury_kot_execution_service.py` and
`doctype/ury_kot_execution/`).

This module adds the four CANCELLED_* / fail-closed cases V3-50 named for
V3-54 without touching:

  - the copied `URY KOT Execution` doctype/controller/service module (V3-53's
    accepted code -- read-only reference, reused via `_lock_execution_row`,
    `append_audit`, and the state constants it already defines);
  - the copied `ury_reservation_service.py` / `URY Stock Reservation`
    doctype (V3-43's accepted code -- called through its public
    `release_reservation`/`cancel_reservation` functions only, never
    mutated);
  - any ERPNext stock/warehouse mutation API, Bin, Job Card, or Work Order;
  - any stock-recreation/restoration function of any kind. Ingredients
    already consumed by production are NEVER restored by this module -- see
    the "NO STOCK RESTORATION" note below and each cancel_after_* function's
    docstring.

Four cancellation cases (V3-50's exact V3-54 test list):

  1. `cancel_before_start`: KOT execution is still QUEUED (never started).
     Transitions to CANCELLED_BEFORE_START. May release/cancel a reservation
     via V3-43's `release_reservation`/`cancel_reservation` -- THIS IS THE
     ONLY MECHANISM in this whole cancellation flow that restores any
     capacity, and it only ever restores *reserved-but-uncommitted*
     capacity (a Reserved-status reservation row transitioning to
     Released/Cancelled), never actual consumed stock. This module itself
     never touches Bin or any stock quantity.

  2. `cancel_after_start`: KOT execution is IN_PREPARATION. Requires an
     explicit, server-verified manager confirmation (mirrors V3-53's
     `manager_override` pattern -- see `_verify_manager_confirmation`
     below). Transitions to CANCELLED_AFTER_START. Ingredients already
     consumed are NOT restored -- instead their consumption is CAPTURED as
     Draft `URY Issue Wastage` rows (see "Disposition route" below).

  3. `cancel_after_ready`: KOT execution is READY. Same manager-confirmation
     requirement. Transitions to CANCELLED_AFTER_READY, and captures the same
     Draft write-off rows.

Disposition route (G-08, resolved): cases 2 and 3 call
`ury_wastage.capture_kot_cancellation_wastage`, which reads back the
`URY Fulfilment Posting Intent` rows that actually POSTED for this KOT and
mirrors their frozen payload -- the exact component/qty/warehouse triples the
submitted `Manufacture` Stock Entry consumed -- into one Draft
`URY Issue Wastage` row per component, tagged
`source_type = "KOT Cancellation"`. Those rows are inert: they post nothing,
and (per `ury_issue_authorization.sum_issue_sourced_wastage`) they never
decrement any Issue Authorization's material entitlement. A Stock Manager
approving them is what posts a `Material Issue` Stock Entry against the
branch's explicitly configured expense account and cost center. Case 1
(`cancel_before_start`) captures NOTHING: a QUEUED KOT consumed nothing, so
there is nothing to write off. Capture is fail-OPEN -- the cancellation is
already committed by then and must never be blocked by a write-off failure;
errors surface on the result as `wastage_capture_error`.

  4. `cancel_partial`: a KOT with some items started and some not. V3-53
     deliberately chose KOT-level (not item-level) execution state, so this
     module has no way to know which specific items were started. Per
     V3-50's "splits disposition by item or fails until item-level state
     exists" language, this function FAILS CLOSED with
     `ITEM_LEVEL_STATE_REQUIRED` rather than guessing or applying an
     all-or-nothing cancellation. This is EXPECTED BEHAVIOUR, not a bug,
     until a future task adds item-level execution granularity.

Manager confirmation verification (cases 2 and 3): the caller passes
`manager_confirmed_by`, but this value is NEVER trusted on its own -- same
"TODO real session wiring" documented pattern as V3-53's `_require_manager`.
`_verify_manager_confirmation` re-derives the acting user from
`frappe.session.user` (the session-authoritative identity hook available in
this environment) and requires that EITHER `manager_confirmed_by` is empty/
unset (letting the session user itself stand in, if that user holds a
manager role) OR that `manager_confirmed_by` equals the session user AND
that user holds a manager role. A client claiming some OTHER user confirmed
it, or claiming manager status without a manager role on the session user,
is rejected -- this function refuses to trust a client-supplied name or
boolean by itself. TODO: once real session/request wiring exists in this
environment, this should also assert `manager_confirmed_by` was itself
produced by that other user's own authenticated action (e.g. a signed
confirmation token), not merely echoed by the requesting client; until then
this is the closest server-side verification achievable in this repo's test
harness, matching the same documented limitation V3-53 already carries for
`manager_override`.

Row-locking / concurrency: every transition here reuses V3-53's
`_lock_execution_row` (a `SELECT ... FOR UPDATE` on the `URY KOT Execution`
row for the KOT) before reading current state and deciding whether the
requested cancellation transition is valid, for the identical concurrency-
safety reasoning already documented in `ury_kot_execution_service.py` --
including the same EXPLICIT LIMITATION that this cannot be proven under real
concurrent load without a live bench/DB; any concurrency-specific test for
this module would carry the same NOT EXECUTED caveat V3-53's
`test_concurrent_start_by_two_chefs_not_executed` carries.

NO STOCK RESTORATION: this module still never restores, recreates or
un-consumes any quantity. It contains no call to `Bin`, no stock quantity
mutation, and no reversal of any `Manufacture` Stock Entry -- a cooked dish
does not un-cook itself. The only external service calls it makes are:

  * `ury.ury.api.ury_reservation_service.release_reservation` /
    `.cancel_reservation`, which (per that module's own docstring) never
    mutate `Bin` either -- "restoring capacity" there is nothing more than a
    reservation status transition; and
  * `ury.ury.api.ury_wastage.capture_kot_cancellation_wastage`, which only
    INSERTS Draft `URY Issue Wastage` records. That function's own posting
    path (`_post_stock_entry`) is reachable exclusively from
    `ury_wastage.approve_wastage`, i.e. from a separate, explicitly
    authorized human approval -- never from this module. Nothing any function
    here does can reach a ledger.
"""

import frappe
from frappe import _

from ury.ury.api.ury_kot_execution_service import (
	CANCELLED_AFTER_READY,
	CANCELLED_AFTER_START,
	CANCELLED_BEFORE_START,
	EXECUTION_DOCTYPE,
	IN_PREPARATION,
	QUEUED,
	READY,
	ExecutionError,
	MANAGER_ROLES,
	_kot_scope,
	_lock_execution_row,
	_require_execution_doctype,
	_require_kot,
	append_audit,
)
from ury.ury.api import ury_reservation_service
from ury.ury.api import ury_wastage


# Reason codes. Reuses V3-53's stable set where applicable, plus this
# module's own for the cases V3-53 did not need.
NOT_PERMITTED = "NOT_PERMITTED"
KOT_NOT_FOUND = "KOT_NOT_FOUND"
INVALID_EXECUTION_TRANSITION = "INVALID_EXECUTION_TRANSITION"
MANAGER_CONFIRMATION_REQUIRED = "MANAGER_CONFIRMATION_REQUIRED"
ITEM_LEVEL_STATE_REQUIRED = "ITEM_LEVEL_STATE_REQUIRED"


class CancellationError(frappe.ValidationError):
	"""Raised for fail-closed cancellation errors; carries a stable reason_code."""

	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


# ---------------------------------------------------------------------------
# Manager confirmation verification
# ---------------------------------------------------------------------------


def _is_manager(user):
	roles = set(frappe.get_roles(user))
	return bool(roles & MANAGER_ROLES)


def _verify_manager_confirmation(manager_confirmed_by):
	"""Re-derive and verify the confirming manager from the SESSION, not from
	`manager_confirmed_by` taken at face value.

	TODO real session wiring: `frappe.session.user` is this environment's
	session-authoritative identity hook (same pattern V3-53 uses for
	`frappe.session.user` as the actor default). A client-supplied
	`manager_confirmed_by` is only accepted if it names the SAME user as the
	session, and that user must hold a manager role -- so a client cannot
	claim some other user confirmed it, nor claim manager status for a
	non-manager session user. If `manager_confirmed_by` is omitted, the
	session user itself is checked for a manager role instead.

	Returns the verified confirming user (str). Raises CancellationError
	(MANAGER_CONFIRMATION_REQUIRED) if verification fails.
	"""
	session_user = frappe.session.user

	if manager_confirmed_by and manager_confirmed_by != session_user:
		raise CancellationError(
			MANAGER_CONFIRMATION_REQUIRED,
			_(
				"manager_confirmed_by ({0}) must match the acting session user "
				"({1}); cannot be asserted on behalf of another user"
			).format(manager_confirmed_by, session_user),
		)

	if not _is_manager(session_user):
		raise CancellationError(
			MANAGER_CONFIRMATION_REQUIRED,
			_("Cancellation after production start/ready requires a manager role"),
		)

	return session_user


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _current_state(kot):
	"""Lock and read the current `URY KOT Execution` state for `kot`.

	Mirrors `ury_kot_execution_service._transition`'s step 4/5: an execution
	row locked via `SELECT ... FOR UPDATE`, or the implicit QUEUED state if
	no row exists yet. Returns (locked_row_or_None, current_state).
	"""
	locked = _lock_execution_row(kot)
	current_state = locked["state"] if locked else QUEUED
	return locked, current_state


def _write_cancellation(kot, locked, target_state, actor, event, reason, branch, company, production_unit):
	"""Insert or update the single `URY KOT Execution` row for `kot`,
	transitioning it to `target_state` and appending an audit entry. Never
	touches any stock/warehouse/material quantity -- see module docstring.
	"""
	if locked:
		doc = frappe.get_doc(EXECUTION_DOCTYPE, locked["name"])
		# See ury_kot_execution_service._transition: `frappe.get_doc` here is
		# a plain read that can be served from a snapshot pinned before
		# `_lock_execution_row`'s `FOR UPDATE` ran. Overwrite audit_log with
		# the value the locking read fetched so the read-modify-write append
		# below cannot silently drop a concurrently committed entry.
		doc.audit_log = locked.get("audit_log")
	else:
		doc = frappe.get_doc(
			{
				"doctype": EXECUTION_DOCTYPE,
				"kot": kot,
				"state": QUEUED,
				"branch": branch,
				"company": company,
				"production_unit": production_unit,
			}
		)

	doc.state = target_state
	append_audit(doc, actor, event=event, reason=reason)

	if locked:
		doc.save(ignore_permissions=False)
	else:
		doc.insert(ignore_permissions=False)

	return doc.as_dict()


def _capture_disposition_wastage(result, kot, execution_name, disposition, reason_category, reason_notes, actor, branch, company):
	"""Capture Draft write-off rows for a post-production cancellation.

	Routes to `ury_wastage.capture_kot_cancellation_wastage`, which mirrors
	the `Manufacture` Stock Entry this KOT's production actually posted into
	one Draft `URY Issue Wastage` row per consumed component. Draft rows never
	touch the ledger and never decrement any Issue Authorization's
	entitlement; a Stock Manager approving them is what posts the
	`Material Issue`.

	Deliberately fail-OPEN: the state transition to CANCELLED_AFTER_* has
	already been written by the time this runs, and a floor cancellation must
	never be blocked (or silently rolled back) because a write-off could not
	be captured. Any failure is reported on the result under
	`wastage_capture_error` so a caller or report can find it, rather than
	raising back over a completed cancellation.
	"""
	# Resolve the default here as well as inside the capture, so the value
	# reported back on the result is the one actually used rather than a bare
	# None the caller would have to re-derive.
	disposition = disposition or ury_wastage.DEFAULT_KOT_CANCELLATION_DISPOSITION
	result["wastage_disposition"] = disposition
	try:
		captured = ury_wastage.capture_kot_cancellation_wastage(
			kot=kot,
			disposition=disposition,
			reason_category=reason_category,
			reason_notes=reason_notes,
			kot_execution=execution_name,
			branch=branch,
			company=company,
			actor=actor,
		)
	except Exception as exc:  # noqa: BLE001 -- see fail-open rationale above
		result["wastage_rows"] = []
		result["wastage_capture_error"] = str(exc)
		try:
			frappe.log_error(
				frappe.get_traceback(),
				"URY KOT cancellation wastage capture failed for {0}".format(kot),
			)
		except Exception:
			# The error log is itself a DB write. If even that fails, the
			# cancellation still stands -- the error is already on the result.
			pass
		return result

	result["wastage_rows"] = [doc.get("name") for doc in captured.get("created") or []]
	result["wastage_idempotent_replay"] = captured.get("idempotent_replay")
	result["wastage_derivation"] = captured.get("derivation")
	if captured.get("existing"):
		result["wastage_existing_rows"] = captured["existing"]
	return result


# ---------------------------------------------------------------------------
# Case 1: cancel before start
# ---------------------------------------------------------------------------


@frappe.whitelist()
def cancel_before_start(kot, actor=None, reason=None, reservation_name=None):
	"""QUEUED -> CANCELLED_BEFORE_START.

	Only valid if the execution is still QUEUED (never started). Releases
	any reservation tied to this KOT/order by calling V3-43's
	`release_reservation` (falling back to `cancel_reservation` if the
	reservation is not eligible for a plain release) -- this call is the
	ONLY mechanism in this function that restores any capacity; this
	function itself never touches Bin or any stock quantity. If
	`reservation_name` is not supplied, no reservation call is made (there
	may be no reservation associated with this KOT), and this function still
	records the cancellation.

	Captures NO wastage. A QUEUED KOT never started production, so nothing was
	consumed and there is nothing to write off -- creating a write-off row here
	would invent a cost that does not exist. See
	`test_cancel_before_start_captures_no_wastage`.
	"""
	_require_execution_doctype()
	_require_kot(kot)
	actor = actor or frappe.session.user

	branch, company, production_unit = _kot_scope(kot)

	locked, current_state = _current_state(kot)
	if current_state != QUEUED:
		raise CancellationError(
			INVALID_EXECUTION_TRANSITION,
			_(
				"cancel_before_start requires execution state QUEUED, found {0} "
				"for KOT {1} -- use cancel_after_start or cancel_after_ready instead"
			).format(current_state, kot),
		)

	released = None
	if reservation_name:
		try:
			released = ury_reservation_service.release_reservation(reservation_name, reason=reason)
		except frappe.ValidationError:
			# Already-fulfilled rows cannot be released; fall back to cancel,
			# which raises the same way if truly ineligible. Documented in
			# ury_reservation_service.cancel_reservation's own docstring.
			released = ury_reservation_service.cancel_reservation(reservation_name, reason=reason)

	result = _write_cancellation(
		kot, locked, CANCELLED_BEFORE_START, actor,
		event="cancel_before_start", reason=reason,
		branch=branch, company=company, production_unit=production_unit,
	)
	result["reservation_release_result"] = released
	return result


# ---------------------------------------------------------------------------
# Case 2: cancel after start
# ---------------------------------------------------------------------------


@frappe.whitelist()
def cancel_after_start(
	kot,
	actor=None,
	reason=None,
	manager_confirmed_by=None,
	disposition=None,
	reason_category=None,
	reason_notes=None,
):
	"""IN_PREPARATION -> CANCELLED_AFTER_START.

	Requires a server-verified manager confirmation (see
	`_verify_manager_confirmation`). Does NOT call any stock-recreation or
	stock-restoration function -- ingredients already consumed by production
	are NOT restored here, and never will be: a dish does not un-cook itself.

	IMPLEMENTED DISPOSITION ROUTE: what this call now does instead of leaving
	the question open is capture the consumption as a Draft write-off. After
	the state transition is written, `_capture_disposition_wastage` creates
	one Draft `URY Issue Wastage` row per consumed component, sourced from the
	`URY Fulfilment Posting Intent` rows that actually posted for this KOT (so
	the write-off mirrors the real `Manufacture` entry), tagged
	`source_type = "KOT Cancellation"`. Draft rows are inert: they touch no
	ledger and decrement no Issue Authorization entitlement. A Stock Manager
	approving them via `ury_wastage.approve_wastage` is what posts the
	`Material Issue` Stock Entry against the branch's explicitly configured
	wastage/damage/staff-meal expense account and cost center.

	`disposition` defaults to "Wastage" and may be "Damaged", "Staff Meal" or
	"Re-plated"; "Re-plated" captures the record but posts no stock, because
	the food legitimately stayed in inventory.

	`disposition_required` is still returned True -- the Draft rows genuinely
	do still require a human approval decision -- but it now names the route
	that exists rather than the absence of one.
	"""
	_require_execution_doctype()
	_require_kot(kot)
	actor = actor or frappe.session.user

	confirmed_by = _verify_manager_confirmation(manager_confirmed_by)

	branch, company, production_unit = _kot_scope(kot)

	locked, current_state = _current_state(kot)
	if current_state != IN_PREPARATION:
		raise CancellationError(
			INVALID_EXECUTION_TRANSITION,
			_(
				"cancel_after_start requires execution state IN_PREPARATION, "
				"found {0} for KOT {1}"
			).format(current_state, kot),
		)

	result = _write_cancellation(
		kot, locked, CANCELLED_AFTER_START, actor,
		event="cancel_after_start",
		reason=reason,
		branch=branch, company=company, production_unit=production_unit,
	)
	result["manager_confirmed_by"] = confirmed_by
	_capture_disposition_wastage(
		result,
		kot=kot,
		execution_name=result.get("name"),
		disposition=disposition,
		reason_category=reason_category,
		reason_notes=reason_notes,
		actor=actor,
		branch=branch,
		company=company,
	)
	result["disposition_required"] = True
	result["disposition_note"] = (
		"Ingredients already consumed are NOT restored by this call. Their "
		"consumption has been captured as Draft URY Issue Wastage rows "
		"(source_type='KOT Cancellation', see `wastage_rows`), mirroring the "
		"Manufacture Stock Entry production actually posted for this KOT. "
		"Those rows are inert until a Stock Manager approves them via "
		"ury_wastage.approve_wastage, which posts a Material Issue Stock Entry "
		"against the branch's configured expense account and cost center. "
		"Zero rows means this KOT posted no production and consumed nothing in "
		"the ledger."
	)
	return result


# ---------------------------------------------------------------------------
# Case 3: cancel after ready
# ---------------------------------------------------------------------------


@frappe.whitelist()
def cancel_after_ready(
	kot,
	actor=None,
	reason=None,
	manager_confirmed_by=None,
	disposition=None,
	reason_category=None,
	reason_notes=None,
):
	"""READY -> CANCELLED_AFTER_READY.

	Same manager-confirmation requirement as `cancel_after_start`.

	Under POS Stock Authority V2 a made-to-order item that reached READY has
	already posted a real, submitted `Manufacture` Stock Entry -- its raw
	materials are genuinely consumed and its finished good genuinely exists in
	the department warehouse. Cancelling here means that stock is held against
	no sale: the sale-side deduction at POS Closing Entry will never happen for
	it.

	G-08 RESOLVED -- the food-waste accounting model this function used to
	refuse to invent now exists, as explicit configuration rather than
	inference. Its three former objections are answered as follows:

	  * *which account* -- named `Branch` fields `wastage_expense_account`,
	    `damage_expense_account` and `staff_meal_expense_account`, selected by
	    the row's `disposition`. No `LIKE '%Wastage%'` name-matching anywhere;
	    an unset field fails the approval closed with a message naming the
	    branch and the field.
	  * *which cost center* -- the named `Branch.wastage_cost_center` field,
	    same fail-closed rule.
	  * *whose approval* -- `ury_wastage.APPROVE_ROLES` (Stock Manager /
	    System Manager). A POS manager who can confirm this cancellation can
	    capture the Draft write-off, but only an approver can put it in the
	    ledger. Nothing this function does reaches the GL.

	So this call still never reverses the `Manufacture` entry (reversing would
	be wrong -- the food really was cooked). It captures the consumption as
	Draft `URY Issue Wastage` rows (`source_type = "KOT Cancellation"`, one per
	consumed component, mirroring that entry's own frozen payload), and a
	separate human approval turns them into a `Material Issue` write-off.
	`disposition_required` is still returned True because that approval
	decision genuinely is still outstanding.

	`disposition` defaults to "Wastage"; "Damaged" and "Staff Meal" post to
	their own configured accounts, and "Re-plated" records the event but posts
	nothing (the finished good legitimately stays in stock).

	The related reservation-side hazard (G-09) IS handled:
	`ury_order_reservation_service.release_order_reservations` skips
	already-Fulfilled groups instead of throwing, so cancelling a partly
	produced order always completes.
	"""
	_require_execution_doctype()
	_require_kot(kot)
	actor = actor or frappe.session.user

	confirmed_by = _verify_manager_confirmation(manager_confirmed_by)

	branch, company, production_unit = _kot_scope(kot)

	locked, current_state = _current_state(kot)
	if current_state != READY:
		raise CancellationError(
			INVALID_EXECUTION_TRANSITION,
			_(
				"cancel_after_ready requires execution state READY, found {0} "
				"for KOT {1}"
			).format(current_state, kot),
		)

	result = _write_cancellation(
		kot, locked, CANCELLED_AFTER_READY, actor,
		event="cancel_after_ready",
		reason=reason,
		branch=branch, company=company, production_unit=production_unit,
	)
	result["manager_confirmed_by"] = confirmed_by
	_capture_disposition_wastage(
		result,
		kot=kot,
		execution_name=result.get("name"),
		disposition=disposition,
		reason_category=reason_category,
		reason_notes=reason_notes,
		actor=actor,
		branch=branch,
		company=company,
	)
	result["disposition_required"] = True
	result["disposition_note"] = (
		"Marked CANCELLED_AFTER_READY. The raw materials production consumed for "
		"this KOT have been captured as Draft URY Issue Wastage rows "
		"(source_type='KOT Cancellation', see `wastage_rows`), mirroring the "
		"Manufacture Stock Entry that actually posted. Those rows are inert: they "
		"touch no ledger and decrement no Issue Authorization entitlement until a "
		"Stock Manager approves them, which posts a Material Issue against the "
		"branch's configured expense account and cost center for the chosen "
		"disposition (Re-plated posts nothing). Zero rows means this KOT posted no "
		"production and consumed nothing in the ledger."
	)
	return result


# ---------------------------------------------------------------------------
# Case 4: partial cancellation -- fails closed
# ---------------------------------------------------------------------------


@frappe.whitelist()
def cancel_partial(kot, item_states, actor=None, reason=None, manager_confirmed_by=None):
	"""Always fails closed with ITEM_LEVEL_STATE_REQUIRED.

	V3-53 deliberately implemented KOT-level (not KOT-item-level) execution
	state (see that module's docstring, "Scope decision"). A KOT where some
	items were started and some were not therefore cannot be disposed of
	correctly by this module: there is no per-item execution record to
	consult, and this function refuses to guess or apply an all-or-nothing
	cancellation across mixed item states. Per V3-50's "Focused Future
	Tests" -> "V3-54 cancellation/disposition" list: "Partially cancelled
	KOT with mixed started/not-started items splits disposition by item or
	fails until item-level state exists."

	This is EXPECTED BEHAVIOUR, not a bug, until a future task adds
	item-level execution granularity to `URY KOT Execution` (or a sibling
	doctype). `item_states` is accepted (and validated for shape) purely so
	callers can express intent and so a future implementation has a stable
	call signature to extend, but it is never consulted to make a
	disposition decision here.
	"""
	_require_kot(kot)

	if not item_states or not isinstance(item_states, (list, tuple)):
		raise CancellationError(
			ITEM_LEVEL_STATE_REQUIRED,
			_(
				"cancel_partial requires item_states describing per-item "
				"execution state, which URY KOT Execution does not yet track "
				"(KOT-level only, per V3-53's documented scope decision); "
				"partial cancellation cannot be safely applied for KOT {0}"
			).format(kot),
		)

	raise CancellationError(
		ITEM_LEVEL_STATE_REQUIRED,
		_(
			"Partial cancellation for KOT {0} requires item-level execution "
			"state, which does not exist yet (URY KOT Execution is KOT-level "
			"only, per V3-53's documented scope decision). Failing closed "
			"rather than guessing or applying an all-or-nothing cancellation "
			"across mixed started/not-started items."
		).format(kot),
	)
