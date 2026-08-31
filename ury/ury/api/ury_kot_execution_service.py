"""Start/complete lifecycle service for production execution, per V3-50's
"Production Execution Contract" and "Idempotency, Realtime, and Fallback"
sections (see tracks/sa-v3_nxt/outputs/V3-50-prep-handoff.md).

Implements a NEW, separate `URY KOT Execution` storage doctype
(ury/ury/doctype/ury_kot_execution/) plus this create/start/mark_ready/serve
service module. This module does NOT:

  - modify `URY KOT`'s schema or `ury_kot.py` (both remain live production
    code with explicitly-preserved on-submit printing and realtime publish
    behavior -- read-only reference only);
  - wire itself into KOT creation/submission (`ury_kot_generate.py`) --
    that remains a distinct, separate, not-yet-attempted integration step;
  - touch ERPNext Job Card, Work Order, or any stock/warehouse doctype.

Scope decision: one `URY KOT Execution` row per KOT (KOT-level, not KOT-item
level) -- see the doctype controller's docstring for the reasoning.

State machine (from V3-50's "Production Execution Contract" table, restricted
to the states this task's transitions touch -- CANCELLED_* and the later
DISPOSED/WASTED/etc. disposition states are V3-54's scope, not created here):

    QUEUED --start_execution--> IN_PREPARATION --mark_ready--> READY --serve_execution--> SERVED

`URY KOT.order_status = "Ready For Prepare"` is the compatibility signal that
maps to `QUEUED` (V3-50's mapping table); this module treats "a KOT exists
with no `URY KOT Execution` row yet" as the same thing -- QUEUED is the
implicit initial state of a KOT record before any execution row exists, per
this task's own test list ("KOT submitted maps to QUEUED"), rather than a row
this module inserts eagerly on every KOT submit (which would require touching
`ury_kot.py`'s on_submit, explicitly out of scope). `_get_or_seed_execution`
below materializes that implicit QUEUED state into a real row lazily, on the
first mutating call for a KOT that has none yet.

Idempotency-key mechanism (per V3-50's "every mutating endpoint accepts or
derives an idempotency key scoped to ... KOT ... action ... actor"):
each of start_execution/mark_ready/serve_execution takes an explicit
`idempotency_key`. Before transitioning, the service looks for an existing
`URY KOT Execution` row for this `kot` whose `idempotency_key` already equals
the supplied key AND whose current `state` already equals the transition's
target state (i.e. that exact call already completed). If found, the
original recorded actor/timestamp is returned unchanged -- no new state
change, no duplicate audit entry, no duplicate realtime-worthy event. This is
deliberately a per-(kot, target_state, idempotency_key) lookup rather than a
separate log table, mirroring the "no duplicate state change" requirement
literally: state is the single source of truth, and the idempotency key is
only ever consulted when a caller is about to redo a transition that has
already landed.

Concurrency / locking strategy (mirrors V3-43's `ury_reservation_service.py`
`_lock_bin_row` pattern -- same reasoning, same explicit unexecuted-test
caveat): each transition takes a `SELECT ... FOR UPDATE` row lock on the
`URY KOT Execution` row for this `kot` (via `frappe.db.sql(..., FOR UPDATE)`)
BEFORE reading its current state and deciding whether to transition, insert,
or return an idempotent no-op -- inside the same request-scoped DB
transaction as any resulting write. Two chefs calling `start_execution` on
the same KOT "simultaneously" therefore serialize on that lock: whichever
transaction's `FOR UPDATE` select executes first proceeds to transition
QUEUED->IN_PREPARATION and commits; the second transaction's `FOR UPDATE`
select blocks until the first commits, then reads the now-already
IN_PREPARATION row and returns the idempotent/no-op "already transitioned"
result (recording the FIRST actor, not overwriting with the second) rather
than double-applying the transition.

EXPLICIT LIMITATION (documented, not fixed here, same caveat pattern as
V3-43): this locking strategy is reasoned about from Frappe/MySQL
transaction semantics and cannot be executed or proven under real concurrent
load in this environment -- there is no live bench or database available.
`test_concurrent_start_by_two_chefs_not_executed` below is written as the
test that WOULD prove correctness against a real Frappe test site (using
threads + a real DB transaction per thread), but it is explicitly marked
NOT EXECUTED / unexecutable here.
"""

import json

import frappe
from frappe import _


EXECUTION_DOCTYPE = "URY KOT Execution"
KOT_DOCTYPE = "URY KOT"
BRANCH_DOCTYPE = "Branch"

QUEUED = "QUEUED"
IN_PREPARATION = "IN_PREPARATION"
READY = "READY"
SERVED = "SERVED"
CANCELLED_BEFORE_START = "CANCELLED_BEFORE_START"
CANCELLED_AFTER_START = "CANCELLED_AFTER_START"
CANCELLED_AFTER_READY = "CANCELLED_AFTER_READY"

# Forward transition map: {from_state: to_state} for the three transitions
# this module implements. Any state not present here as a key has no forward
# transition available through this module (SERVED and the CANCELLED_* states
# are terminal from this module's point of view; V3-54 owns cancellation).
FORWARD_TRANSITIONS = {
	QUEUED: IN_PREPARATION,
	IN_PREPARATION: READY,
	READY: SERVED,
}

# Stable reason codes, per V3-50's "Branch, Company, and Permission
# Invariants" suggested reason-code list.
NOT_PERMITTED = "NOT_PERMITTED"
BRANCH_SCOPE_MISMATCH = "BRANCH_SCOPE_MISMATCH"
COMPANY_SCOPE_MISMATCH = "COMPANY_SCOPE_MISMATCH"
KOT_NOT_FOUND = "KOT_NOT_FOUND"
KOT_ALREADY_TRANSITIONED = "KOT_ALREADY_TRANSITIONED"
INVALID_EXECUTION_TRANSITION = "INVALID_EXECUTION_TRANSITION"

MANAGER_ROLES = {"URY Manager", "URY Admin", "System Manager"}


class ExecutionError(frappe.ValidationError):
	"""Raised for fail-closed execution errors; carries a stable reason_code."""

	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


# ---------------------------------------------------------------------------
# Defensive existence checks (mirror V3-51/52's pattern for not-yet-merged
# doctype/field dependencies -- this doctype is new in this same task, but
# the pattern is kept so this module degrades safely if run against a site
# where `URY KOT Execution` has not yet been migrated in).
# ---------------------------------------------------------------------------


def _require_execution_doctype():
	if not frappe.db.exists("DocType", EXECUTION_DOCTYPE):
		raise ExecutionError(
			KOT_NOT_FOUND,
			_("{0} is not available on this site").format(EXECUTION_DOCTYPE),
		)


def _require_kot(kot):
	if not kot or not frappe.db.exists(KOT_DOCTYPE, kot):
		raise ExecutionError(KOT_NOT_FOUND, _("KOT {0} not found").format(kot))


def _is_manager(user):
	roles = set(frappe.get_roles(user))
	return bool(roles & MANAGER_ROLES)


def _require_manager(user, manager_override):
	if not manager_override:
		return
	if not _is_manager(user):
		raise ExecutionError(
			NOT_PERMITTED,
			_("manager_override requires a manager role"),
		)


# ---------------------------------------------------------------------------
# KOT scope resolution
# ---------------------------------------------------------------------------


def _kot_scope(kot):
	"""Return (branch, company, production_unit) for `kot`, fail closed.

	Company is derived from Branch, per the established pattern in
	ury_issue_authorization.py (`URY KOT` itself has no direct `company`
	field -- it only carries `branch`, fetched from `pos_profile.branch`).
	"""
	row = frappe.db.get_value(
		KOT_DOCTYPE, kot, ["branch", "production"], as_dict=True
	)
	if not row or not row.get("branch"):
		raise ExecutionError(
			BRANCH_SCOPE_MISMATCH,
			_("KOT {0} has no resolvable branch scope").format(kot),
		)
	company = frappe.db.get_value(BRANCH_DOCTYPE, row["branch"], "company")
	if not company:
		raise ExecutionError(
			COMPANY_SCOPE_MISMATCH,
			_("Branch {0} has no resolvable company scope").format(row["branch"]),
		)
	return row["branch"], company, row.get("production")


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
		"state": doc.get("state"),
		"idempotency_key": doc.get("idempotency_key"),
	}
	if reason:
		entry["reason"] = reason
	entries.append(entry)
	doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


# ---------------------------------------------------------------------------
# Row lock / lookup
# ---------------------------------------------------------------------------


def _lock_execution_row(kot):
	"""Take a `SELECT ... FOR UPDATE` lock on the newest `URY KOT Execution`
	row for `kot`, if one exists. Returns None (no-op) if no row exists yet --
	callers must then treat the KOT as implicitly QUEUED and insert the first
	row themselves inside the same locked transaction.
	"""
	rows = frappe.db.sql(
		"""
		SELECT name, state, idempotency_key, started_by, started_at,
		       ready_by, ready_at, served_by, served_at
		FROM `tab{doctype}`
		WHERE kot = %(kot)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""".format(doctype=EXECUTION_DOCTYPE),
		{"kot": kot},
		as_dict=True,
	)
	return rows[0] if rows else None


def _find_prior_result(kot, target_state, idempotency_key):
	"""Return an already-applied transition's row dict if one exists for the
	exact (kot, target_state, idempotency_key) triple, else None.

	This is the idempotency dedup lookup: a repeated call with the SAME key
	that already reached `target_state` returns the original result instead
	of re-transitioning or raising.
	"""
	rows = frappe.get_all(
		EXECUTION_DOCTYPE,
		filters={"kot": kot, "state": target_state, "idempotency_key": idempotency_key},
		fields=[
			"name", "state", "idempotency_key", "started_by", "started_at",
			"ready_by", "ready_at", "served_by", "served_at",
		],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows else None


def _result_dict(row, idempotent=False):
	return {
		"name": row.get("name"),
		"state": row.get("state"),
		"idempotency_key": row.get("idempotency_key"),
		"started_by": row.get("started_by"),
		"started_at": row.get("started_at"),
		"ready_by": row.get("ready_by"),
		"ready_at": row.get("ready_at"),
		"served_by": row.get("served_by"),
		"served_at": row.get("served_at"),
		"idempotent_replay": idempotent,
	}


# ---------------------------------------------------------------------------
# Core transition
# ---------------------------------------------------------------------------


def _transition(kot, target_state, idempotency_key, actor, actor_field, timestamp_field, event, manager_override=False):
	"""Shared transition body for start/mark_ready/serve.

	Order of operations (all inside one request-scoped DB transaction):
	  1. defensive existence checks (doctype, KOT);
	  2. idempotency-key dedup lookup for the exact target transition --
	     returned as-is if found, no lock taken, no write;
	  3. resolve branch/company/production_unit scope for the KOT;
	  4. take the row lock (`FOR UPDATE`) on any existing execution row for
	     this KOT;
	  5. determine current_state from the locked row, or QUEUED if no row
	     exists yet;
	  6. validate the transition (forward-only, from FORWARD_TRANSITIONS,
	     with the manager_override carve-out for mark_ready called against a
	     non-IN_PREPARATION state);
	  7. insert a new row (or update the existing single row) recording
	     actor/timestamp for this transition, append audit, save.
	"""
	_require_execution_doctype()
	_require_kot(kot)
	if not idempotency_key:
		raise ExecutionError(
			INVALID_EXECUTION_TRANSITION, _("idempotency_key is required")
		)
	actor = actor or frappe.session.user

	# Step 2: idempotency dedup -- no lock needed for a pure replay-of-success
	# lookup; if this exact transition already landed under this exact key,
	# return it unchanged.
	prior = _find_prior_result(kot, target_state, idempotency_key)
	if prior:
		return _result_dict(prior, idempotent=True)

	branch, company, production_unit = _kot_scope(kot)

	# Step 4: lock any existing row for this KOT before reading its state,
	# so two concurrent callers serialize on this SELECT ... FOR UPDATE.
	locked = _lock_execution_row(kot)
	current_state = locked["state"] if locked else QUEUED

	# Step 6a: reverse-transition / no-op-transition guard. A caller landing
	# here after the dedup lookup above found nothing means either this is a
	# genuinely new idempotency_key on an already-transitioned KOT (not the
	# same call replayed -- e.g. a second, different chef's start attempt
	# after the first already won the race), or an invalid transition
	# attempt. Both must fail closed and MUST NOT mutate the existing state.
	if current_state == target_state:
		# Same target state already reached, but under a DIFFERENT
		# idempotency_key than the one supplied. Per V3-50: "Repeating a
		# completed transition without the same key returns a stable
		# already-applied response, not a duplicate state change." Return
		# the existing row's result as an idempotent no-op rather than
		# raising, and rather than touching the row.
		return _result_dict(locked, idempotent=True)

	allowed_next = FORWARD_TRANSITIONS.get(current_state)
	if allowed_next != target_state:
		# manager_override only ever widens the specific
		# IN_PREPARATION-required-for-mark_ready case, and only for a
		# manager. It never permits a reverse transition (e.g. READY/SERVED
		# back toward QUEUED) -- FORWARD_TRANSITIONS has no entry mapping
		# READY or SERVED to an earlier state at all, so this override path
		# is unreachable for reverse transitions by construction.
		if manager_override and target_state == READY and current_state != IN_PREPARATION:
			_require_manager(actor, manager_override=True)
		else:
			raise ExecutionError(
				INVALID_EXECUTION_TRANSITION,
				_("Cannot transition KOT {0} execution from {1} to {2}").format(
					kot, current_state, target_state
				),
			)

	# Step 7: write. If a row already exists for this KOT, update it in
	# place (one row per KOT, per the KOT-level scope decision); otherwise
	# insert the first row, seeding it as having been QUEUED.
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
				"idempotency_key": idempotency_key,
			}
		)

	doc.state = target_state
	doc.idempotency_key = idempotency_key
	doc.set(actor_field, actor)
	doc.set(timestamp_field, frappe.utils.now())
	append_audit(doc, actor, event=event)

	if locked:
		doc.save(ignore_permissions=False)
	else:
		doc.insert(ignore_permissions=False)

	return _result_dict(doc.as_dict(), idempotent=False)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def start_execution(kot, idempotency_key, actor=None):
	"""QUEUED -> IN_PREPARATION. Records actor+timestamp once.

	A repeated call with the SAME idempotency_key returns the original
	transition result (no duplicate state change) -- see `_transition`'s
	dedup lookup.
	"""
	return _transition(
		kot,
		target_state=IN_PREPARATION,
		idempotency_key=idempotency_key,
		actor=actor,
		actor_field="started_by",
		timestamp_field="started_at",
		event="start",
	)


@frappe.whitelist()
def mark_ready(kot, idempotency_key, actor=None, manager_override=False):
	"""IN_PREPARATION -> READY. Same idempotency semantics as start_execution.

	Rejected (fail closed) if the KOT execution is not currently
	IN_PREPARATION, UNLESS `manager_override=True` is passed AND the acting
	user holds a manager role (`_require_manager`) -- this is an explicit,
	non-silent override path, never a default bypass. The override does not
	relax the reverse-transition guard: it can only move a KOT that has not
    yet started (still QUEUED, or has no execution row at all) directly to
    READY under manager authority; it can never move READY/SERVED backward.
	"""
	manager_override = manager_override in (True, "true", "1", 1)
	return _transition(
		kot,
		target_state=READY,
		idempotency_key=idempotency_key,
		actor=actor,
		actor_field="ready_by",
		timestamp_field="ready_at",
		event="mark_ready",
		manager_override=manager_override,
	)


@frappe.whitelist()
def serve_execution(kot, idempotency_key, actor=None):
	"""READY -> SERVED. Same idempotency semantics as start_execution."""
	return _transition(
		kot,
		target_state=SERVED,
		idempotency_key=idempotency_key,
		actor=actor,
		actor_field="served_by",
		timestamp_field="served_at",
		event="serve",
	)
