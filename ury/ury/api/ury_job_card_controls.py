"""V3-62: Add SELECTIVE Job Card controls and chef time logging.

Scope (deliberately conservative, additive-only, mirrors V3-51/52/53/60/61):

- This module never calls `.insert()`, `.save()`, or `.submit()` on any
  ERPNext `Job Card`, `Work Order`, or `Stock Entry` document, and never
  writes to real Job Card `time_logs`. `log_chef_time` writes only to a NEW,
  lightweight, additive doctype `URY Job Card Time Log` introduced by this
  task -- it is not the ERPNext `Job Card Time Log` child table and does not
  touch it. `build_job_card_draft` returns a plain dict shaped like a Job
  Card's key fields, mirroring V3-61's `build_work_order_draft` -- evidence
  of what a LATER, separately-reviewed task would need to actually create
  one. Posting is explicitly out of scope for this task.
- This module is not imported by, and does not import, any live order/KOT
  execution path. Nothing calls into it today -- it exists to prove
  selective Job Card usage *can* be mapped safely, without being wired into
  anything (same pattern as V3-60/61).
- "Selective/opt-in only" is structural, not just documented:
  `is_job_card_eligible` is a STRICT SUBSET of V3-61's `is_batch_eligible`:
  rather than re-implementing (and risking drift from) the MADE_TO_ORDER
  hard-coded exclusion, this module imports and calls
  `ury.ury.api.ury_batch_work_order_adapter.is_batch_eligible` directly --
  guaranteeing byte-identical logic parity by construction, not by copying
  and hoping the two stay in sync. `is_job_card_eligible` additionally
  requires a separate, explicit
  `batch_opt_in_flag` truthiness check that is already folded into the
  mirrored predicate. `is_job_card_eligible` can therefore never return
  `True` for an item that `is_batch_eligible` would reject, which is what
  "Job Card usage must be SELECTIVE/opt-in for batch-eligible flows from
  V3-61 only, NEVER mandatory" (TODO.md V3-62) requires: Job Cards are never
  forced onto MADE_TO_ORDER (per-order/every-plate) execution, and are never
  auto-created for a batch-eligible item without the caller's explicit
  opt-in.
- `log_chef_time` is additive-only recordkeeping: it creates one row in
  `URY Job Card Time Log` (a new, standalone doctype -- NOT ERPNext's real
  Job Card `time_logs` child table) referencing an existing Job Card by name
  only (`job_card_ref`, a plain string/Link value never dereferenced via
  `frappe.get_doc` by this module). It never mutates the referenced Job Card
  itself. It fails closed (raises `frappe.PermissionError`) whenever the
  actor's role scope is missing, empty, or ambiguous, rather than silently
  allowing the write -- the same "never assume, never default to eligible"
  posture as V3-61's `_field_exists`/opt-in handling.

Company/BOM lookup and Work Order draft shape reuse are NOT duplicated here;
`build_job_card_draft` is a Job Card analogue, not a Work Order one, and
looks up the item's active BOM using the identical read-only
`frappe.db.get_value` contract against `BOM` used by V3-41/V3-61 (filtered
by `item`, `is_active`, `docstatus`), so this module never diverges from
that BOM-resolution contract either.
"""

from __future__ import annotations

import frappe

from ury.ury.api.ury_batch_work_order_adapter import is_batch_eligible

MADE_TO_ORDER_POLICY = "MADE_TO_ORDER"

JOB_CARD_DOCTYPE = "Job Card"
JOB_CARD_TIME_LOG_DOCTYPE = "URY Job Card Time Log"
BOM_DOCTYPE = "BOM"

# Roles permitted to log chef time. Mirrors the role names already used in
# this codebase's lightweight tracking doctypes (see
# ury/ury/doctype/ury_kot_execution/ury_kot_execution.json permissions:
# "Chef", "Production Manager", plus "System Manager" for admin/testing
# access). No other role name is invented by this module.
CHEF_TIME_LOG_ROLES = frozenset({"Chef", "Production Manager", "System Manager"})


def is_job_card_eligible(item_code: str, production_policy: str, batch_opt_in_flag: bool) -> tuple[bool, str]:
	"""Pure predicate: is `item_code` eligible for SELECTIVE Job Card usage?

	Returns `(eligible: bool, reason: str)`. Never raises, never reads or
	writes any document -- takes only the three explicit inputs and decides.

	Strict subset of V3-61's `is_batch_eligible`: this function delegates
	directly to that predicate (imported, not reimplemented) and returns
	eligible only when it also returns eligible. Job
	Card usage can therefore never be broader than batch Work Order
	eligibility -- it is the same MADE_TO_ORDER-excluding, opt-in-gated
	check, reused rather than reimplemented, so a MADE_TO_ORDER (per-order/
	every-plate) item can never become eligible for Job Card usage no matter
	what `batch_opt_in_flag` says. This directly matches TODO.md V3-62's
	"Job Card usage must be SELECTIVE/opt-in for batch-eligible flows from
	V3-61 only, NEVER mandatory" constraint.
	"""
	batch_eligible, batch_reason = is_batch_eligible(item_code, production_policy, batch_opt_in_flag)

	if not batch_eligible:
		return False, (
			f"not eligible for Job Card usage because it is not batch-eligible "
			f"(V3-61 is_batch_eligible reason: {batch_reason})"
		)

	return True, (
		f"item {item_code} is batch-eligible (per V3-61 is_batch_eligible) and "
		"explicitly opted in for selective Job Card usage"
	)


def log_chef_time(
	job_card_ref: str,
	employee: str,
	from_time,
	to_time,
	actor: str,
) -> dict:
	"""Additive-only: create one row in `URY Job Card Time Log`.

	This NEVER writes to a real ERPNext `Job Card`'s `time_logs` child table
	and never calls `frappe.get_doc(JOB_CARD_DOCTYPE, job_card_ref)` -- the
	referenced Job Card is treated as an opaque string reference, not
	dereferenced or mutated by this module.

	Validation (fails closed -- raises rather than silently proceeding on
	any ambiguous input):
	  - `job_card_ref`, `employee`, `from_time`, `to_time`, and `actor` are
	    all required.
	  - `from_time` must be strictly earlier than `to_time`
	    (`frappe.ValidationError` on violation).
	  - `actor` must hold at least one role in `CHEF_TIME_LOG_ROLES`
	    (checked via `frappe.get_roles`). Ambiguous scope -- no roles
	    returned, or `frappe.get_roles` raising -- is treated as a
	    permission failure, never as an implicit allow. Raises
	    `frappe.PermissionError` on any permission failure.

	Returns a dict describing the created log row on success:
	`{"name": <new URY Job Card Time Log name>, "job_card_ref": ...,
	  "employee": ..., "from_time": ..., "to_time": ..., "logged_by": actor}`.

	Never calls `.save()`/`.submit()` on any document other than the new
	`URY Job Card Time Log` row itself (via `.insert()`), and never touches
	the referenced Job Card document.
	"""
	if not job_card_ref:
		frappe.throw(frappe._("job_card_ref is required"), frappe.ValidationError)
	if not employee:
		frappe.throw(frappe._("employee is required"), frappe.ValidationError)
	if not actor:
		frappe.throw(frappe._("actor is required"), frappe.ValidationError)
	if not from_time or not to_time:
		frappe.throw(frappe._("from_time and to_time are required"), frappe.ValidationError)

	if not (from_time < to_time):
		frappe.throw(
			frappe._("from_time must be strictly earlier than to_time"),
			frappe.ValidationError,
		)

	_assert_actor_permitted(actor)

	doc = frappe.get_doc(
		{
			"doctype": JOB_CARD_TIME_LOG_DOCTYPE,
			"job_card_ref": job_card_ref,
			"employee": employee,
			"from_time": from_time,
			"to_time": to_time,
			"logged_by": actor,
		}
	)
	doc.insert(ignore_permissions=False)

	return {
		"name": doc.name,
		"job_card_ref": job_card_ref,
		"employee": employee,
		"from_time": from_time,
		"to_time": to_time,
		"logged_by": actor,
	}


def build_job_card_draft(
	item_code: str,
	work_order: str,
	bom_no: str,
	company: str,
	wip_warehouse: str,
	for_quantity: float,
	workstation: str | None = None,
	operation: str | None = None,
) -> dict:
	"""Pure, read-only mapping to a Job Card-shaped draft dict.

	Uses the real ERPNext Job Card field names (`erpnext/manufacturing/
	doctype/job_card/job_card.json`): `work_order`, `bom_no`, `company`,
	`wip_warehouse`, `for_quantity`, `production_item`, and (when supplied)
	`workstation`, `operation`.

	NEVER calls `frappe.get_doc(...).insert()/.save()/.submit()`, never
	writes via `frappe.db.set_value`, and never creates a `Job Card`
	document -- this function only reads (`frappe.db.get_value` against
	`BOM`, same read-only resolution contract as V3-41/V3-61) and returns a
	dict literal.
	"""
	if for_quantity is None or for_quantity <= 0:
		frappe.throw(frappe._("for_quantity must be greater than zero"), frappe.ValidationError)

	resolved_bom_no = bom_no or _resolve_active_bom(item_code, company)

	draft = {
		"doctype": JOB_CARD_DOCTYPE,
		"work_order": work_order,
		"bom_no": resolved_bom_no,
		"production_item": item_code,
		"company": company,
		"wip_warehouse": wip_warehouse,
		"for_quantity": for_quantity,
	}
	if workstation:
		draft["workstation"] = workstation
	if operation:
		draft["operation"] = operation

	return draft


# --- internal helpers -------------------------------------------------------


def _assert_actor_permitted(actor: str) -> None:
	"""Fail-closed permission check: `actor` must hold at least one of
	`CHEF_TIME_LOG_ROLES`. Any ambiguity (no roles resolvable, or the role
	lookup raising) is treated as NOT permitted -- this function never
	defaults to allowing the write."""
	try:
		roles = frappe.get_roles(actor)
	except Exception:
		roles = None

	if not roles:
		frappe.throw(
			frappe._("Unable to determine roles for actor {0}; time log denied").format(actor),
			frappe.PermissionError,
		)

	if not (set(roles) & CHEF_TIME_LOG_ROLES):
		frappe.throw(
			frappe._("Actor {0} does not hold a role permitted to log chef time").format(actor),
			frappe.PermissionError,
		)


def _resolve_active_bom(item_code: str, company: str | None) -> str:
	filters = {"item": item_code, "is_active": 1, "docstatus": 1}
	if company:
		filters["company"] = company

	bom_no = frappe.db.get_value(
		BOM_DOCTYPE, {**filters, "is_default": 1}, "name", order_by="modified desc"
	)
	if not bom_no:
		bom_no = frappe.db.get_value(BOM_DOCTYPE, filters, "name", order_by="modified desc")

	if not bom_no:
		frappe.throw(
			frappe._("No active BOM found for item {0}{1}").format(
				item_code, frappe._(" in company {0}").format(company) if company else ""
			),
			frappe.ValidationError,
		)

	return bom_no
