# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Per-branch POS stock authority tier resolution (I-1).

This module is the SOLE read path for which URY stock-authority tier a
branch is operating in. It supersedes the site-wide single flag in
`ury.ury.api.ury_feature_flags` (`pos_stock_authority_v2`), which is now a
thin deprecated shim over `get_branch_stock_policy`.

Read this before changing anything here.

WHAT THESE GATES DO NOT DO: none of them switches stock authority away from
native ERPNext. The sale-side stock deduction is owned by native ERPNext in
every tier, unconditionally, anchored to POS Closing Entry -- consolidation
copies each POS Invoice Item onto a `Sales Invoice` with `update_stock = 1`
and that document's submit writes the SLEs. Turning gates on adds a second,
orthogonal production-side ledger and some validation; it subtracts nothing
from the sale ledger. See ARCHITECTURE_POS_STOCK_AUTHORITY.md sections 3.3
and 3.4.

THE THREE GATES ARE STRICTLY ORDERED (section 3.4):

	reservation_control_enabled
		-> realtime_production_posting_enabled
			-> closing_reconciliation_enabled

which collapses eight combinations to the four that are real operating
configurations:

1. all off                        -- Tier 1, pure native. The known-good state.
2. reservations only              -- oversell protection and capacity-aware
                                     menus, with no stock-ledger change at all.
3. + real-time production posting -- Tier 2 operating, verification advisory.
4. + closing reconciliation       -- Tier 2 enforcing. The steady state.

States 2 and 3 are the shadow / parallel-run comparison window the V3-70
checklist demands before a real flip, which is why the split is per-concern
rather than one boolean.

HARD RULES this module exists to enforce:

1. FAIL CLOSED, ALWAYS. A missing `URY Branch Stock Policy` row, a missing
   doctype/table (e.g. before migration), a database error, a malformed row,
   a missing branch argument, or an illegal gate combination that somehow
   slipped past the doctype's own validation, all resolve to
   `POLICY_ALL_OFF` -- every gate false, i.e. Tier 1. Fail-closed must mean
   "fall back to the tier that is known-good", and that is Tier 1. This
   function never raises.
2. The dependency constraint is enforced HERE as well as in the doctype
   controller, so no call site can ever observe an illegal combination even
   if a row reached the database out of band (direct SQL, half-applied
   patch). An illegal row is treated as untrustworthy configuration and
   resolves to all-off rather than being silently "repaired" into a tier the
   operator did not choose.
3. Nothing in this module, or anywhere else in the shipped application code,
   turns a gate on. The only way a gate becomes true in a real deployment is
   a human deliberately editing the `URY Branch Stock Policy` document for a
   branch -- an explicit, auditable, out-of-band admin action, recorded in
   that document's `enabled_by`/`enabled_on`.
"""

from typing import NamedTuple

import frappe

POLICY_DOCTYPE = "URY Branch Stock Policy"

GATE_FIELDS = (
	"reservation_control_enabled",
	"realtime_production_posting_enabled",
	"closing_reconciliation_enabled",
)

# Request-scoped cache key on `frappe.local`. This codebase's only other
# caching precedent is `ury_dashboard`'s `frappe.cache()` with an
# `expires_in_sec` TTL, which is deliberately NOT reused here: a redis TTL
# would keep serving a stale tier for up to its duration after an operator
# toggles a gate, and for a safety gate that is the wrong trade. `frappe.local`
# is torn down at the end of every request/job, so the cache cannot outlive
# the unit of work that populated it, and a toggle takes effect on the very
# next request.
_CACHE_ATTR = "ury_branch_stock_policy_cache"


class StockPolicy(NamedTuple):
	"""Resolved, guaranteed-legal tier state for one branch.

	All three fields are plain `bool` -- never None, never 0/1 ints, never a
	string -- so call sites can use them directly in boolean context without
	coercion.
	"""

	reservation_control_enabled: bool
	realtime_production_posting_enabled: bool
	closing_reconciliation_enabled: bool


POLICY_ALL_OFF = StockPolicy(False, False, False)


def get_branch_stock_policy(branch=None, company=None) -> StockPolicy:
	"""Resolve the stock authority tier for `branch`.

	Returns a `StockPolicy` whose three booleans are guaranteed to satisfy
	the dependency ordering. Fails closed to `POLICY_ALL_OFF` (Tier 1) on
	every error path and never raises.

	`company` is accepted for symmetry with the call sites this replaces
	(`is_pos_stock_authority_flag_enabled(company, branch)`) and for a
	possible future company-level default; it does not currently vary the
	result -- the branch row is authoritative.
	"""
	if not branch or not isinstance(branch, str):
		# No branch, no per-branch configuration to read: Tier 1.
		return POLICY_ALL_OFF

	cache = _request_cache()
	if cache is not None and branch in cache:
		return cache[branch]

	policy = _resolve_uncached(branch)

	if cache is not None:
		cache[branch] = policy

	return policy


def _resolve_uncached(branch) -> StockPolicy:
	try:
		row = frappe.db.get_value(
			POLICY_DOCTYPE, branch, list(GATE_FIELDS), as_dict=True
		)
	except Exception:
		# Fail closed: doctype missing, table missing, DB error, not yet
		# migrated, etc. Never let a read failure be interpreted as "on".
		frappe.logger("ury_stock_policy").exception(
			"Could not read %s for branch %s; falling back to Tier 1", POLICY_DOCTYPE, branch
		)
		return POLICY_ALL_OFF

	if not row:
		# No row for this branch is the normal, expected case on every site
		# that has not opted in. It is not an error and is not logged.
		return POLICY_ALL_OFF

	try:
		reservation = _as_bool(row.get("reservation_control_enabled"))
		production = _as_bool(row.get("realtime_production_posting_enabled"))
		closing = _as_bool(row.get("closing_reconciliation_enabled"))
	except Exception:
		# Malformed stored value (wrong type, unparseable). Untrustworthy
		# configuration -> Tier 1.
		frappe.logger("ury_stock_policy").exception(
			"Malformed %s row for branch %s; falling back to Tier 1", POLICY_DOCTYPE, branch
		)
		return POLICY_ALL_OFF

	if (production and not reservation) or (closing and not production):
		# Illegal combination that bypassed the doctype's validation. Do not
		# guess which gate the operator meant; treat the whole row as
		# untrustworthy and fall back to the known-good tier.
		frappe.logger("ury_stock_policy").error(
			"Illegal gate combination on %s for branch %s "
			"(reservation=%s, production=%s, closing=%s); falling back to Tier 1",
			POLICY_DOCTYPE,
			branch,
			reservation,
			production,
			closing,
		)
		return POLICY_ALL_OFF

	return StockPolicy(
		reservation_control_enabled=reservation,
		realtime_production_posting_enabled=production,
		closing_reconciliation_enabled=closing,
	)


def _as_bool(value):
	"""Coerce a stored Check value to a strict bool.

	Frappe stores Check fields as 0/1 ints, but a row written out of band can
	hold None, "0", "1", or "" -- and "0" is truthy in Python, which would
	fail OPEN. Handle the string forms explicitly. Anything unrecognisable
	raises, which the caller turns into Tier 1.
	"""
	if value is None or value == "":
		return False
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return bool(value)
	if isinstance(value, str):
		return bool(int(value.strip()))
	raise TypeError(f"Unsupported Check value type: {type(value)!r}")


def _request_cache():
	"""Per-request memo dict, or None if `frappe.local` is unavailable.

	Returning None (rather than raising or building a module-level dict) is
	deliberate: a module-level cache would outlive the request and could
	serve one site's or one worker's tier state to another.
	"""
	try:
		cache = getattr(frappe.local, _CACHE_ATTR, None)
		if cache is None:
			cache = {}
			setattr(frappe.local, _CACHE_ATTR, cache)
		return cache
	except Exception:
		return None


def clear_branch_stock_policy_cache(branch=None):
	"""Drop the request-scoped memo, for tests and for code that edits a
	policy row and then re-reads it within the same request."""
	try:
		cache = getattr(frappe.local, _CACHE_ATTR, None)
		if cache is None:
			return
		if branch:
			cache.pop(branch, None)
		else:
			cache.clear()
	except Exception:
		return
