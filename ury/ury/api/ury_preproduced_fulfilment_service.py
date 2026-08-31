"""Pre-produced finished-goods fulfilment service (V3-71).

Implements the PRE_PRODUCED half of the fulfilment layer described by the
approved V3-70 transition checklist
(tracks/sa-v3_nxt/outputs/V3-70-fulfilment-accounting-transition-checklist.md,
Section 3, point 1 and Section 9's "Summary for implementers"): a new,
additive service that exists alongside the current `update_stock=1` POS
Invoice path, is not called by `ury_order.py` or any live POS flow, and does
not touch `ury_order.py`'s two `update_stock = 1` assignments or its
`header_fields` copy list. MTO fulfilment (manufacture-then-fulfil,
micro-batch posting) is explicitly out of scope -- that is V3-72.

This module composes three already-accepted, unwired modules, copied
byte-identical into this worktree (same reuse pattern as V3-32/V3-44/V3-54):

  - `ury_reservation_service.py` (V3-43) -- `fulfil_reservation` is the only
    function this module calls to consume stock authority. This module never
    invents its own stock authority: a pre-produced item must already have
    an active `URY Stock Reservation` (status Reserved) referenced by
    `reservation_ref` before it can be fulfilled here.
  - `ury_stock_service.py` (V3-32) -- copied for pattern consistency (the
    "storage-only tracking record, never a real Stock Entry" discipline this
    module also follows for its own new `URY Fulfilment Record` doctype).
    This module does not call into `ury_stock_service.py`'s
    transfer/receipt/return functions directly -- those model central-store
    <-> department movement against a `URY Issue Authorization`, a different
    authority chain than reservation-backed pre-produced fulfilment.
  - `ury_kot_execution_service.py` (V3-53) -- this module reads (never
    writes) `URY KOT Execution.state` to gate fulfilment: a pre-produced item
    may only be fulfilled once its KOT's execution has reached READY (ready
    for pickup/counter items) or SERVED (served-at-table items). This module
    never calls `start_execution`/`mark_ready`/`serve_execution` itself --
    driving the execution state machine remains that module's exclusive
    responsibility.

New doctype (`URY Fulfilment Record`, ury/ury/doctype/ury_fulfilment_record/)
is storage-only, following the V3-31/32/33/43/53 pattern: every row this
module writes has `posted_to_erpnext = 0` (False), because this task
explicitly does NOT post to real ERPNext stock -- that is the eventual job
of V3-73's flag-flip integration, once the V3-70 evidence bar is met, not
this task. This module never calls a real ERPNext stock-mutation API: no
`Stock Entry` is created or submitted anywhere here, and `Bin` is never
written via `frappe.db.set_value` or any other mutation path.

Idempotency: mirrors V3-53's per-key dedup shape, adapted to this module's
natural key. A repeated `fulfil_preproduced_order` call for the same
`(kot, item_code)` pair that has already produced a PRE_PRODUCED
`URY Fulfilment Record` row returns that existing row's result unchanged
(`idempotent_replay=True`) -- it does not re-call `fulfil_reservation` (which
would itself fail closed on an already-Fulfilled reservation, since
`fulfil_reservation` only accepts rows currently in `Reserved` state) and
does not insert a second `URY Fulfilment Record` row. The dedup lookup runs
before the KOT-execution-state check and before `fulfil_reservation` is
called, so a replayed call for an already-fulfilled pair never touches
either dependency again.

Fail-closed order of operations (read before changing this module):

  1. defensive existence checks (both dependency doctypes on this site);
  2. idempotency dedup lookup on `(kot, item_code, fulfilment_type=
     PRE_PRODUCED)` -- return the existing result unchanged if found;
  3. required-scope validation (kot, item_code, qty, reservation_ref, branch,
     company all resolved/non-empty);
  4. KOT-execution-state gate: the KOT's current `URY KOT Execution.state`
     must be READY or SERVED, else raise -- checked BEFORE the reservation is
     touched, so a rejected fulfilment never leaves the reservation
     partially transitioned;
  5. `fulfil_reservation(reservation_ref)` -- fails closed (raises) if the
     reservation does not exist or is not currently `Reserved`;
  6. insert the new `URY Fulfilment Record` row, `posted_to_erpnext=0`,
     append audit, return the result.
"""

import json

import frappe
from frappe import _

from ury.ury.api.ury_kot_execution_service import READY, SERVED
from ury.ury.api.ury_kot_execution_service import EXECUTION_DOCTYPE as KOT_EXECUTION_DOCTYPE
from ury.ury.api.ury_reservation_service import fulfil_reservation


FULFILMENT_DOCTYPE = "URY Fulfilment Record"
KOT_DOCTYPE = "URY KOT"
BRANCH_DOCTYPE = "Branch"

PRE_PRODUCED = "PRE_PRODUCED"

READY_STATES = (READY, SERVED)

# Stable reason codes, mirroring V3-53's `ExecutionError` reason-code
# discipline so callers can branch on failure kind without string-matching
# messages.
NOT_PERMITTED = "NOT_PERMITTED"
MISSING_SCOPE = "MISSING_SCOPE"
KOT_NOT_FOUND = "KOT_NOT_FOUND"
BRANCH_SCOPE_MISMATCH = "BRANCH_SCOPE_MISMATCH"
COMPANY_SCOPE_MISMATCH = "COMPANY_SCOPE_MISMATCH"
EXECUTION_NOT_READY = "EXECUTION_NOT_READY"


class FulfilmentError(frappe.ValidationError):
	"""Raised for fail-closed fulfilment errors; carries a stable reason_code."""

	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


# ---------------------------------------------------------------------------
# Defensive existence checks (mirror V3-51/52/53's pattern for not-yet-
# migrated doctype dependencies).
# ---------------------------------------------------------------------------


def _require_fulfilment_doctype():
	if not frappe.db.exists("DocType", FULFILMENT_DOCTYPE):
		raise FulfilmentError(
			KOT_NOT_FOUND,
			_("{0} is not available on this site").format(FULFILMENT_DOCTYPE),
		)


def _require_kot(kot):
	if not kot or not frappe.db.exists(KOT_DOCTYPE, kot):
		raise FulfilmentError(KOT_NOT_FOUND, _("KOT {0} not found").format(kot))


def _require_create_permission():
	if not frappe.has_permission(FULFILMENT_DOCTYPE, "create"):
		raise FulfilmentError(NOT_PERMITTED, _("Not permitted to create fulfilment records"))


def _require_positive_qty(qty):
	if qty is None or qty <= 0:
		raise FulfilmentError(MISSING_SCOPE, _("Quantity must be greater than zero"))


def _require_scope(kot, item_code, qty, reservation_ref):
	missing = [
		name
		for name, value in (
			("kot", kot),
			("item_code", item_code),
			("qty", qty),
			("reservation_ref", reservation_ref),
		)
		if not value
	]
	if missing:
		raise FulfilmentError(
			MISSING_SCOPE,
			_("Missing required fulfilment field(s): {0}").format(", ".join(missing)),
		)


# ---------------------------------------------------------------------------
# KOT scope + execution-state resolution
# ---------------------------------------------------------------------------


def _kot_scope(kot):
	"""Return (branch, company) for `kot`, fail closed.

	Mirrors `ury_kot_execution_service._kot_scope`'s resolution (company is
	derived from Branch, since `URY KOT` itself only carries `branch`).
	"""
	row = frappe.db.get_value(KOT_DOCTYPE, kot, ["branch"], as_dict=True)
	if not row or not row.get("branch"):
		raise FulfilmentError(
			BRANCH_SCOPE_MISMATCH, _("KOT {0} has no resolvable branch scope").format(kot)
		)
	company = frappe.db.get_value(BRANCH_DOCTYPE, row["branch"], "company")
	if not company:
		raise FulfilmentError(
			COMPANY_SCOPE_MISMATCH,
			_("Branch {0} has no resolvable company scope").format(row["branch"]),
		)
	return row["branch"], company


def _current_execution_state(kot):
	"""Read (never write) the latest `URY KOT Execution.state` for `kot`.

	No row yet means the KOT is implicitly QUEUED (per V3-53's own
	convention) -- returns None here, which the caller treats as
	not-READY/SERVED and rejects.
	"""
	rows = frappe.get_all(
		KOT_EXECUTION_DOCTYPE,
		filters={"kot": kot},
		fields=["state"],
		order_by="creation desc",
		limit=1,
	)
	return rows[0]["state"] if rows else None


def _require_execution_ready_or_served(kot):
	state = _current_execution_state(kot)
	if state not in READY_STATES:
		raise FulfilmentError(
			EXECUTION_NOT_READY,
			_("KOT {0} execution state is {1}; pre-produced fulfilment requires READY or SERVED").format(
				kot, state or "QUEUED"
			),
		)


# ---------------------------------------------------------------------------
# Idempotency dedup
# ---------------------------------------------------------------------------


def _find_prior_fulfilment(kot, item_code):
	rows = frappe.get_all(
		FULFILMENT_DOCTYPE,
		filters={"kot": kot, "item_code": item_code, "fulfilment_type": PRE_PRODUCED},
		fields=[
			"name", "kot", "item_code", "qty", "reservation_ref", "fulfilment_type",
			"branch", "company", "actor", "fulfilled_at", "posted_to_erpnext",
		],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def _result_dict(row, idempotent=False):
	return {
		"name": row.get("name"),
		"kot": row.get("kot"),
		"item_code": row.get("item_code"),
		"qty": row.get("qty"),
		"reservation_ref": row.get("reservation_ref"),
		"fulfilment_type": row.get("fulfilment_type"),
		"branch": row.get("branch"),
		"company": row.get("company"),
		"actor": row.get("actor"),
		"fulfilled_at": row.get("fulfilled_at"),
		"posted_to_erpnext": bool(row.get("posted_to_erpnext")),
		"idempotent_replay": idempotent,
	}


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


def append_audit(doc, actor, event, reason=None):
	existing = doc.get("audit_log")
	entries = json.loads(existing) if existing else []
	entry = {
		"actor": actor,
		"timestamp": frappe.utils.now(),
		"event": event,
		"kot": doc.get("kot"),
		"item_code": doc.get("item_code"),
		"reservation_ref": doc.get("reservation_ref"),
	}
	if reason:
		entry["reason"] = reason
	entries.append(entry)
	doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def fulfil_preproduced_order(kot, item_code, qty, reservation_ref, actor=None):
	"""Fulfil a PRE_PRODUCED item's reservation once its KOT execution is
	READY (pickup/counter items) or SERVED (dine-in/table items).

	Fail-closed order of operations documented in this module's docstring.
	Never calls a real ERPNext stock-mutation API -- the returned record's
	`posted_to_erpnext` is always False. Returns a dict describing the
	`URY Fulfilment Record` row (existing, on an idempotent replay; newly
	inserted otherwise).
	"""
	actor = actor or frappe.session.user

	_require_fulfilment_doctype()
	_require_kot(kot)
	_require_scope(kot, item_code, qty, reservation_ref)
	_require_positive_qty(qty)

	# Step 2: idempotency dedup -- if this exact (kot, item_code) pre-produced
	# fulfilment already landed, return it unchanged. No re-check of KOT
	# execution state, no re-call of fulfil_reservation, no new row.
	prior = _find_prior_fulfilment(kot, item_code)
	if prior:
		return _result_dict(prior, idempotent=True)

	_require_create_permission()

	branch, company = _kot_scope(kot)

	# Step 4: KOT-execution-state gate, checked BEFORE the reservation is
	# touched, so a rejected fulfilment never leaves the reservation
	# partially transitioned.
	_require_execution_ready_or_served(kot)

	# Step 5: consume the existing reservation -- fails closed (raises) if it
	# does not exist or is not currently Reserved. This module never creates
	# its own stock authority; fulfil_reservation is the only source of
	# truth for "may this quantity be consumed."
	fulfil_reservation(reservation_ref)

	# Step 6: record the fulfilment. Storage-only -- never a real ERPNext
	# Stock Entry, never a Bin mutation. posted_to_erpnext is always 0/False
	# here; flipping it is exclusively V3-73's job.
	doc = frappe.get_doc(
		{
			"doctype": FULFILMENT_DOCTYPE,
			"kot": kot,
			"item_code": item_code,
			"qty": qty,
			"reservation_ref": reservation_ref,
			"fulfilment_type": PRE_PRODUCED,
			"branch": branch,
			"company": company,
			"actor": actor,
			"fulfilled_at": frappe.utils.now(),
			"posted_to_erpnext": 0,
		}
	)
	append_audit(doc, actor, event="fulfil")
	doc.insert(ignore_permissions=False)

	return _result_dict(doc.as_dict(), idempotent=False)
