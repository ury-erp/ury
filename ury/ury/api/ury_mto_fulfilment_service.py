"""Made-to-order (MTO) fulfilment / exactly-once micro-batch posting service
(V3-72).

Implements the MADE_TO_ORDER half of the fulfilment layer described by the
approved V3-70 transition checklist
(tracks/sa-v3_nxt/outputs/V3-70-fulfilment-accounting-transition-checklist.md,
Section 3 point 1, Section 5's "Idempotency / exactly-once requirements for
V3-72's micro-batch posting", and Section 9's "Summary for implementers"): a
new, additive service that exists alongside the current `update_stock=1` POS
Invoice path, is not called by `ury_order.py` or any live POS flow, and does
not touch `ury_order.py`'s two `update_stock = 1` assignments or its
`header_fields` copy list. This module mirrors V3-71's
`ury_preproduced_fulfilment_service.py` structure exactly, differing only in
the pieces specific to MADE_TO_ORDER items: the stock authority consumed is
a reservation GROUP (V3-43's `reservation_group`, covering every exploded
component of a composite/MTO item, all created atomically together) rather
than a single reservation row, and every call carries an explicit
`batch_key` idempotency key per V3-70 Section 5's requirement (modeled on
V3-53's `idempotency_key` pattern), not just the (kot, item_code) natural
key V3-71 dedups on alone.

SCOPE, EXPLICITLY: this module implements exactly-once posting for ONE
fulfilment call per (kot, item_code) -- the "SIMPLE per-order case" named in
this task's own instructions. Micro-batching/aggregation of MULTIPLE orders'
MTO fulfilments into one physical batch/production run is explicitly FUTURE
SCOPE and is NOT implemented here -- no batching/aggregation logic of any
kind exists in this module. "Micro-batch posting" in this module's name and
in V3-70 Section 5 refers to the exactly-once *posting discipline* applied
to each individual fulfilment call (durable idempotency key, forward-only
state, no partial application), not to grouping many orders' fulfilments
into a single batch document. A later task may build that aggregation on
top of this module's per-call exactly-once primitive; this module does not
anticipate its shape.

This module composes two already-accepted, unwired modules, copied
byte-identical into this worktree from the V3-71 worktree (same reuse
pattern V3-71 itself used, and the same pattern V3-32/V3-44/V3-54 used
before it):

  - `ury_reservation_service.py` (V3-43) -- `fulfil_reservation` is the only
    function this module calls to consume stock authority, called with the
    `reservation_group_ref` (the `reservation_group` value returned by
    `create_reservation`, covering every exploded BOM component of the
    composite/MTO item as one atomic group). This module never invents its
    own stock authority: an MTO item must already have an active reservation
    group (every row in that group currently `Reserved`) before it can be
    fulfilled here. `fulfil_reservation` itself fails closed (raises
    `frappe.ValidationError`) if any row in the group is not `Reserved`,
    which is this module's "reject if reservation group isn't in Reserved
    state" requirement -- this module does not duplicate that check, it
    relies on `fulfil_reservation`'s own fail-closed all-or-nothing
    transition, exactly as V3-71 relies on it for a single reservation row.
  - `ury_kot_execution_service.py` (V3-53) -- this module reads (never
    writes) `URY KOT Execution.state` to gate fulfilment: an MTO item may
    only be fulfilled once its KOT's execution has reached READY (ready for
    pickup/counter items) or SERVED (served-at-table items). This module
    never calls `start_execution`/`mark_ready`/`serve_execution` itself.

Doctype reuse (per this task's explicit instruction -- do NOT create a
second doctype): both this module and V3-71's
`ury_preproduced_fulfilment_service.py` write to the SAME
`URY Fulfilment Record` doctype (`ury/ury/doctype/ury_fulfilment_record/`),
differing only in `fulfilment_type` ("MTO" here vs "PRE_PRODUCED" there) and
in this module's additional use of the doctype's `batch_key` field. Every
row this module writes has `posted_to_erpnext = 0` (False) -- this task
explicitly does NOT post to real ERPNext stock; that remains exclusively
V3-73's job, gated by the V3-70 evidence bar. This module never calls a real
ERPNext stock-mutation API: no `Stock Entry` is created or submitted
anywhere here, and `Bin` is never written via `frappe.db.set_value` or any
other mutation path.

Idempotency (V3-70 Section 5, mirrors V3-71's dedup shape exactly -- see
V3-71's module docstring for the identical reasoning, adapted to add the
`batch_key`):

  A repeated `fulfil_mto_order` call for the same `(kot, item_code)` pair
  that already has an MTO `URY Fulfilment Record` row returns that existing
  row's result unchanged (`idempotent_replay=True`), regardless of whether
  the supplied `batch_key` matches the one recorded on that row or not --
  this is a deliberate, exact mirror of V3-71's semantics (a repeat call
  never re-checks anything, never re-calls `fulfil_reservation`, never
  inserts a second row), NOT a divergence: this module does not attempt to
  distinguish "same batch_key retry" from "different batch_key against an
  already-fulfilled pair" by returning different results for the two --
  both cases return the existing row as a stable no-op, per this task's own
  instruction to "mirror V3-71's exact semantics, do not diverge from it."
  The dedup lookup runs before the KOT-execution-state check and before
  `fulfil_reservation` is called, so a replayed call for an already-
  fulfilled pair never touches either dependency again.

  Exactly-once under failure: if `fulfil_reservation` (or any step before
  the `URY Fulfilment Record` insert) raises, NOTHING has been persisted --
  no partial `URY Fulfilment Record` row, no partially-applied state (
  `fulfil_reservation`'s own all-or-nothing transition means a raised
  reservation-group error leaves every row in the group untouched, still
  Reserved). A retry with the SAME `batch_key` therefore finds no prior
  fulfilment record on its dedup lookup and proceeds through the full path
  again as if it were the first attempt -- it is not blocked or confused by
  the earlier failed attempt, because that attempt left no trace to be
  confused by. This satisfies V3-70 Section 5's "a failed batch must leave
  the system in a state identical to 'never attempted'" requirement by
  construction: this module writes its single durable record only as the
  LAST step, after every fail-closed check and after `fulfil_reservation`
  has already succeeded and committed the group's Fulfilled transition.

Fail-closed order of operations (read before changing this module -- mirrors
V3-71's order exactly):

  1. defensive existence checks (both dependency doctypes on this site);
  2. idempotency dedup lookup on `(kot, item_code, fulfilment_type=MTO)` --
     return the existing result unchanged if found, regardless of
     `batch_key`;
  3. required-scope validation (kot, item_code, qty, reservation_group_ref,
     batch_key, branch, company all resolved/non-empty);
  4. KOT-execution-state gate: the KOT's current `URY KOT Execution.state`
     must be READY or SERVED, else raise -- checked BEFORE the reservation
     group is touched, so a rejected fulfilment never leaves the
     reservation group partially transitioned;
  5. `fulfil_reservation(reservation_group_ref)` -- fails closed (raises) if
     any row in the group does not exist or is not currently `Reserved`;
  6. insert the new `URY Fulfilment Record` row, `posted_to_erpnext=0`,
     `batch_key` recorded, append audit, return the result.
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

MADE_TO_ORDER = "MTO"

READY_STATES = (READY, SERVED)

# Stable reason codes, mirroring V3-53/V3-71's `reason_code` discipline so
# callers can branch on failure kind without string-matching messages.
NOT_PERMITTED = "NOT_PERMITTED"
MISSING_SCOPE = "MISSING_SCOPE"
KOT_NOT_FOUND = "KOT_NOT_FOUND"
BRANCH_SCOPE_MISMATCH = "BRANCH_SCOPE_MISMATCH"
COMPANY_SCOPE_MISMATCH = "COMPANY_SCOPE_MISMATCH"
EXECUTION_NOT_READY = "EXECUTION_NOT_READY"


class MtoFulfilmentError(frappe.ValidationError):
	"""Raised for fail-closed MTO fulfilment errors; carries a stable reason_code."""

	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


# ---------------------------------------------------------------------------
# Defensive existence checks (mirror V3-51/52/53/71's pattern for not-yet-
# migrated doctype dependencies).
# ---------------------------------------------------------------------------


def _require_fulfilment_doctype():
	if not frappe.db.exists("DocType", FULFILMENT_DOCTYPE):
		raise MtoFulfilmentError(
			KOT_NOT_FOUND,
			_("{0} is not available on this site").format(FULFILMENT_DOCTYPE),
		)


def _require_kot(kot):
	if not kot or not frappe.db.exists(KOT_DOCTYPE, kot):
		raise MtoFulfilmentError(KOT_NOT_FOUND, _("KOT {0} not found").format(kot))


def _require_create_permission():
	if not frappe.has_permission(FULFILMENT_DOCTYPE, "create"):
		raise MtoFulfilmentError(NOT_PERMITTED, _("Not permitted to create fulfilment records"))


def _require_positive_qty(qty):
	if qty is None or qty <= 0:
		raise MtoFulfilmentError(MISSING_SCOPE, _("Quantity must be greater than zero"))


def _require_scope(kot, item_code, qty, reservation_group_ref, batch_key):
	missing = [
		name
		for name, value in (
			("kot", kot),
			("item_code", item_code),
			("qty", qty),
			("reservation_group_ref", reservation_group_ref),
			("batch_key", batch_key),
		)
		if not value
	]
	if missing:
		raise MtoFulfilmentError(
			MISSING_SCOPE,
			_("Missing required fulfilment field(s): {0}").format(", ".join(missing)),
		)


# ---------------------------------------------------------------------------
# KOT scope + execution-state resolution
# ---------------------------------------------------------------------------


def _kot_scope(kot):
	"""Return (branch, company) for `kot`, fail closed.

	Mirrors `ury_preproduced_fulfilment_service._kot_scope` /
	`ury_kot_execution_service._kot_scope`'s resolution (company is derived
	from Branch, since `URY KOT` itself only carries `branch`).
	"""
	row = frappe.db.get_value(KOT_DOCTYPE, kot, ["branch"], as_dict=True)
	if not row or not row.get("branch"):
		raise MtoFulfilmentError(
			BRANCH_SCOPE_MISMATCH, _("KOT {0} has no resolvable branch scope").format(kot)
		)
	company = frappe.db.get_value(BRANCH_DOCTYPE, row["branch"], "company")
	if not company:
		raise MtoFulfilmentError(
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
		raise MtoFulfilmentError(
			EXECUTION_NOT_READY,
			_("KOT {0} execution state is {1}; MTO fulfilment requires READY or SERVED").format(
				kot, state or "QUEUED"
			),
		)


# ---------------------------------------------------------------------------
# Idempotency dedup
# ---------------------------------------------------------------------------


def _find_prior_fulfilment(kot, item_code):
	"""Return the existing MTO `URY Fulfilment Record` row for (kot,
	item_code), if any -- irrespective of `batch_key`. Mirrors V3-71's
	`_find_prior_fulfilment` exactly: this is a per-(kot, item_code) dedup
	lookup, not a per-(kot, item_code, batch_key) lookup, so both "same
	batch_key retry" and "different batch_key against an already-fulfilled
	pair" hit this same prior row and return it unchanged.
	"""
	rows = frappe.get_all(
		FULFILMENT_DOCTYPE,
		filters={"kot": kot, "item_code": item_code, "fulfilment_type": MADE_TO_ORDER},
		fields=[
			"name", "kot", "item_code", "qty", "reservation_ref", "fulfilment_type",
			"batch_key", "branch", "company", "actor", "fulfilled_at", "posted_to_erpnext",
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
		"batch_key": row.get("batch_key"),
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
		"batch_key": doc.get("batch_key"),
	}
	if reason:
		entry["reason"] = reason
	entries.append(entry)
	doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def fulfil_mto_order(kot, item_code, qty, reservation_group_ref, actor=None, batch_key=None):
	"""Fulfil a MADE_TO_ORDER item's reservation group once its KOT
	execution is READY (pickup/counter items) or SERVED (dine-in/table
	items).

	`reservation_group_ref` is the `reservation_group` value returned by
	V3-43's `create_reservation` for this composite/MTO item -- it covers
	every exploded BOM component reserved atomically together for this KOT
	item. `batch_key` is the exactly-once idempotency key required by V3-70
	Section 5 (modeled on V3-53's `idempotency_key`); it is required and
	recorded on the resulting record, but this module's dedup key remains
	`(kot, item_code)` -- see `_find_prior_fulfilment`'s docstring for why a
	mismatched `batch_key` against an already-fulfilled pair still returns
	the existing row rather than raising, mirroring V3-71 exactly.

	Fail-closed order of operations documented in this module's docstring.
	Never calls a real ERPNext stock-mutation API -- the returned record's
	`posted_to_erpnext` is always False. Returns a dict describing the
	`URY Fulfilment Record` row (existing, on an idempotent replay; newly
	inserted otherwise).

	Explicitly out of scope (see module docstring): aggregating multiple
	orders' MTO fulfilments into one micro-batch/production run. This
	function fulfils exactly one (kot, item_code) pair per call.
	"""
	actor = actor or frappe.session.user

	_require_fulfilment_doctype()
	_require_kot(kot)
	_require_scope(kot, item_code, qty, reservation_group_ref, batch_key)
	_require_positive_qty(qty)

	# Step 2: idempotency dedup -- if this exact (kot, item_code) MTO
	# fulfilment already landed, return it unchanged regardless of
	# batch_key. No re-check of KOT execution state, no re-call of
	# fulfil_reservation, no new row.
	prior = _find_prior_fulfilment(kot, item_code)
	if prior:
		return _result_dict(prior, idempotent=True)

	_require_create_permission()

	branch, company = _kot_scope(kot)

	# Step 4: KOT-execution-state gate, checked BEFORE the reservation group
	# is touched, so a rejected fulfilment never leaves the reservation
	# group partially transitioned.
	_require_execution_ready_or_served(kot)

	# Step 5: consume the existing reservation group -- fails closed
	# (raises) if any row in the group does not exist or is not currently
	# Reserved (V3-43's `fulfil_reservation` -> `_transition_group` refuses
	# a partial transition, per its own docstring). This module never
	# creates its own stock authority; `fulfil_reservation` is the only
	# source of truth for "may this quantity be consumed." If this raises,
	# nothing below runs, and nothing has been persisted -- a retry with
	# the same batch_key finds no prior row on its dedup lookup (step 2)
	# and proceeds through this same path again, exactly once.
	fulfil_reservation(reservation_group_ref)

	# Step 6: record the fulfilment. Storage-only -- never a real ERPNext
	# Stock Entry, never a Bin mutation. posted_to_erpnext is always 0/False
	# here; flipping it is exclusively V3-73's job.
	doc = frappe.get_doc(
		{
			"doctype": FULFILMENT_DOCTYPE,
			"kot": kot,
			"item_code": item_code,
			"qty": qty,
			"reservation_ref": reservation_group_ref,
			"fulfilment_type": MADE_TO_ORDER,
			"batch_key": batch_key,
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
