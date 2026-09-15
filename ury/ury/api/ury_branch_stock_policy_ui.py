# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Dashboard-facing (operator UI) read/write surface for the per-branch
`URY Branch Stock Policy` tier, for the "Stock Authority" section on
`frontend/src/pages/Dashboard/BranchPage.tsx`.

This module is deliberately thin and separate from
`ury.ury.api.ury_stock_policy` (the resolver, which this module reuses for
its read path and never duplicates) and from the doctype controller
`ury.ury.doctype.ury_branch_stock_policy.ury_branch_stock_policy` (which
already enforces the gate dependency ordering and stamps
`enabled_by`/`enabled_on` -- this module writes through `frappe.get_doc(...)
.save()` so that controller logic still runs, it is not re-implemented
here).

Design decision (tracks/sa-pos-followups-and-ux/ITEM_5_TIER_TOGGLE_UI.md
section 4, option 4(a)): the write endpoint is restricted to `System
Manager`, matching the doctype's own permission block exactly (`URY
Manager` and `Stock Manager` are read-only on this doctype), so this module
requires zero changes to `URY Branch Stock Policy`'s permissions. The read
endpoint has no role restriction beyond ordinary Branch-read permission,
since the tier badge is meant to be visible to any dashboard user who can
see the branch.

The four legal tiers, and the exact gate tuple each one writes, mirror
`ury.ury.api.ury_stock_policy`'s `GATE_FIELDS` ordering and
`ury_branch_stock_policy.py`'s dependency validation:

    TIER_1_NATIVE          -> (0, 0, 0)
    TIER_2_RESERVATIONS    -> (1, 0, 0)
    TIER_3_PRODUCTION      -> (1, 1, 0)
    TIER_4_FULL_ENFORCEMENT-> (1, 1, 1)

No other combination is a legal tier, and the client can only ever send one
of these four tier names -- never raw booleans -- so a stale/tampered
client cannot construct an illegal state; `_TIER_GATES` is the single
source of truth this endpoint validates the requested tier against before
writing anything.
"""

import frappe
from frappe import _

from ury.ury.api.ury_stock_policy import GATE_FIELDS, get_branch_stock_policy

POLICY_DOCTYPE = "URY Branch Stock Policy"

# Roles permitted to change a branch's stock authority tier from the
# dashboard. Matches `URY Branch Stock Policy`'s own permissions block
# exactly (System Manager: full CRUD; URY Manager / Stock Manager: read
# only) -- see ITEM_5_TIER_TOGGLE_UI.md section 4, option (a). Keep this in
# sync with that doctype's `permissions` if it is ever changed.
STOCK_AUTHORITY_TIER_WRITE_ROLES = {"System Manager"}

TIER_1_NATIVE = "Tier 1 - Native"
TIER_2_RESERVATIONS = "Reservations Only"
TIER_3_PRODUCTION = "Production Posting"
TIER_4_FULL_ENFORCEMENT = "Full Enforcement"

# The single source of truth mapping a named tier to the exact gate tuple
# it writes. Order matches `GATE_FIELDS`
# (reservation_control_enabled, realtime_production_posting_enabled,
# closing_reconciliation_enabled). Every value here is, by construction, a
# legal combination under the doctype's own dependency ordering -- there is
# no fifth entry and no way to request anything else.
_TIER_GATES = {
	TIER_1_NATIVE: (False, False, False),
	TIER_2_RESERVATIONS: (True, False, False),
	TIER_3_PRODUCTION: (True, True, False),
	TIER_4_FULL_ENFORCEMENT: (True, True, True),
}

# Reverse lookup used by the read endpoint to name whichever tuple is
# currently resolved for a branch. `get_branch_stock_policy` already fails
# closed to all-off for any malformed/illegal row, so this reverse map only
# ever needs to cover the four legal tuples themselves.
_GATES_TO_TIER = {gates: tier for tier, gates in _TIER_GATES.items()}


def _actor_roles(actor):
	return set(frappe.get_roles(actor) or [])


def _require_role(actor, allowed_roles, action_label):
	roles = _actor_roles(actor)
	if not roles or not (roles & allowed_roles):
		frappe.throw(
			_("Not permitted to {0}: requires one of {1}").format(
				action_label, ", ".join(sorted(allowed_roles))
			),
			frappe.PermissionError,
		)


@frappe.whitelist()
def get_branch_stock_authority(branch):
	"""Read the current stock authority tier for `branch`, for the
	"Stock Authority" badge/section on the dashboard Branch page.

	Visible to any dashboard user who can read the `Branch` doctype (no
	extra role restriction) -- only the tier-change control is restricted,
	per ITEM_5_TIER_TOGGLE_UI.md section 3.1 ("Read-only display of current
	tier should be visible to anyone permitted to view the Branch page even
	without edit rights").

	Returns a dict:
		{
			"branch": <branch name>,
			"tier": one of the four TIER_* names above,
			"reservation_control_enabled": bool,
			"realtime_production_posting_enabled": bool,
			"closing_reconciliation_enabled": bool,
			"enabled_by": str | None,
			"enabled_on": str | None,
		}

	Defaults to Tier 1 (and no enabled_by/enabled_on) if no policy row
	exists for the branch yet, matching `get_branch_stock_policy`'s own
	fail-closed default.
	"""
	if not branch:
		frappe.throw(_("Branch is required"), frappe.ValidationError)

	if not frappe.has_permission("Branch", "read", doc=branch):
		frappe.throw(_("Not permitted to read this branch"), frappe.PermissionError)

	policy = get_branch_stock_policy(branch=branch)
	gates = (
		policy.reservation_control_enabled,
		policy.realtime_production_posting_enabled,
		policy.closing_reconciliation_enabled,
	)
	tier = _GATES_TO_TIER.get(gates, TIER_1_NATIVE)

	enabled_by = None
	enabled_on = None
	if any(gates):
		row = frappe.db.get_value(
			POLICY_DOCTYPE, branch, ["enabled_by", "enabled_on"], as_dict=True
		)
		if row:
			enabled_by = row.get("enabled_by")
			enabled_on = row.get("enabled_on")

	return {
		"branch": branch,
		"tier": tier,
		"reservation_control_enabled": gates[0],
		"realtime_production_posting_enabled": gates[1],
		"closing_reconciliation_enabled": gates[2],
		"enabled_by": enabled_by,
		"enabled_on": enabled_on,
	}


@frappe.whitelist()
def set_branch_stock_authority_tier(branch, tier, actor=None):
	"""Set `branch`'s stock authority tier to one of the four named tiers.

	This is the ONLY dashboard write path for `URY Branch Stock Policy`'s
	gates. It:

	1. Requires the caller to hold one of `STOCK_AUTHORITY_TIER_WRITE_ROLES`
	   (System Manager) -- matches the doctype's own permission block, so
	   no doctype permission change was needed for this feature (see
	   ITEM_5_TIER_TOGGLE_UI.md section 4, option (a)).
	2. Validates `tier` against `_TIER_GATES` -- the single source of legal
	   tuples -- and rejects anything else with a clear error. The client
	   is never trusted to have sent one of the four legal tiers merely
	   because its own UI cannot construct an illegal one; this is the
	   server-side re-validation the task requires.
	3. Writes through `frappe.get_doc(...).save()`, so the doctype
	   controller's own dependency validation and `enabled_by`/`enabled_on`
	   stamping still run unmodified -- this module does not re-implement
	   or bypass either.
	4. Lets any `frappe.throw` from the controller (e.g. a concurrent edit
	   that produced an illegal row) propagate verbatim to the caller,
	   rather than catching and rewording it.
	"""
	actor = actor or frappe.session.user

	if not branch:
		frappe.throw(_("Branch is required"), frappe.ValidationError)

	_require_role(actor, STOCK_AUTHORITY_TIER_WRITE_ROLES, "change the stock authority tier")

	if not frappe.has_permission("Branch", "read", doc=branch, user=actor):
		frappe.throw(_("Not permitted to read this branch"), frappe.PermissionError)

	if tier not in _TIER_GATES:
		frappe.throw(
			_("Unknown stock authority tier {0}: must be one of {1}").format(
				tier, ", ".join(_TIER_GATES.keys())
			),
			frappe.ValidationError,
		)

	gate_values = _TIER_GATES[tier]

	if frappe.db.exists(POLICY_DOCTYPE, branch):
		doc = frappe.get_doc(POLICY_DOCTYPE, branch)
		if not frappe.has_permission(doc=doc, ptype="write", user=actor):
			frappe.throw(_("Not permitted to write {0}").format(POLICY_DOCTYPE), frappe.PermissionError)
	else:
		doc = frappe.new_doc(POLICY_DOCTYPE)
		doc.branch = branch
		if not frappe.has_permission(doc=doc, ptype="create", user=actor):
			frappe.throw(_("Not permitted to create {0}").format(POLICY_DOCTYPE), frappe.PermissionError)

	for fieldname, value in zip(GATE_FIELDS, gate_values):
		doc.set(fieldname, 1 if value else 0)

	doc.save(ignore_permissions=False)

	return get_branch_stock_authority(branch)
