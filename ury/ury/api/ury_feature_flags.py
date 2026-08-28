# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""V3-73: POS stock authority feature flag.

This module is the SOLE read path used by `ury_order.py` to decide whether a
POS Invoice's stock authority is handled by ERPNext's native
`update_stock=1` posting (the current, always-on-by-default behavior) or by
the new fulfilment services from V3-71/V3-72 (an integration STUB — see the
loud warning below and in `ury_order.py`).

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

FLAG_DOCTYPE = "URY Feature Flags"
FLAG_FIELD = "pos_stock_authority_v2"


def is_pos_stock_authority_flag_enabled(company=None, branch=None):
	"""Return True only if a human has explicitly enabled the V3-73 flag.

	Fails CLOSED (returns False) on any error, including a missing doctype
	(e.g. before this app's migration has run), an unset field, or any other
	unexpected condition. Never raises.

	`company` and `branch` are accepted for forward compatibility with a
	future per-scope override but are not currently used to vary the result
	-- the single global "URY Feature Flags" value is authoritative today.
	"""

	try:
		value = frappe.db.get_single_value(FLAG_DOCTYPE, FLAG_FIELD)
	except Exception:
		# Fail closed: doctype missing, DB error, not yet migrated, etc.
		# Never let a read failure be interpreted as "flag on".
		return False

	return bool(value)
