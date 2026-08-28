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
     below). Transitions to CANCELLED_AFTER_START. Records that ingredients
     already consumed are NOT restored; a LATER, separate disposition action
     (wastage via V3-33, or a manager-approved exception) is required and is
     explicitly NOT implemented here -- this function only records the
     cancellation and the outstanding disposition requirement.

  3. `cancel_after_ready`: KOT execution is READY. Same manager-confirmation
     requirement. Transitions to CANCELLED_AFTER_READY. Records that
     finished-good disposition (return-to-stock via V3-32, wastage via
     V3-33, or staff-meal) is a LATER, separate action NOT implemented here.

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

NO STOCK RESTORATION: grep this file (and it alone) for any of
`bin`, `stock_entry`, `warehouse`, `return_to_central_store`,
`stock_qty`, `actual_qty` -- none appear. The only external service calls
this module makes are `ury.ury.api.ury_reservation_service.release_reservation`
and `.cancel_reservation`, both of which (per that module's own docstring)
never mutate `Bin` either -- "restoring capacity" there is nothing more than
a reservation status transition, not a stock mutation.
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
def cancel_after_start(kot, actor=None, reason=None, manager_confirmed_by=None):
	"""IN_PREPARATION -> CANCELLED_AFTER_START.

	Requires a server-verified manager confirmation (see
	`_verify_manager_confirmation`). Does NOT call any stock-recreation or
	stock-restoration function -- ingredients already consumed by
	production are NOT restored here. This function only records the
	cancellation and the fact that a LATER, separate disposition action
	(wastage via V3-33, or a manager-approved exception) is required; that
	disposition action is explicitly out of scope for this task.
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
	result["disposition_required"] = True
	result["disposition_note"] = (
		"Ingredients already consumed are NOT restored by this call. A later, "
		"separate disposition action (wastage / manager-approved exception) "
		"is required and is not implemented here."
	)
	return result


# ---------------------------------------------------------------------------
# Case 3: cancel after ready
# ---------------------------------------------------------------------------


@frappe.whitelist()
def cancel_after_ready(kot, actor=None, reason=None, manager_confirmed_by=None):
	"""READY -> CANCELLED_AFTER_READY.

	Same manager-confirmation requirement as `cancel_after_start`. This
	function only marks the state -- it never itself disposes of the
	finished good. Finished-good disposition (return-to-stock via V3-32,
	wastage via V3-33, or staff-meal) is a LATER, separate action this task
	does not implement.
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
	result["disposition_required"] = True
	result["disposition_note"] = (
		"This call only marks CANCELLED_AFTER_READY. Finished-good disposition "
		"(return-to-stock, wastage, or staff-meal) is a later, separate action "
		"not implemented here."
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
