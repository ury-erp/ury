"""Resolves the per-branch stock-authority tier.

Sole read path for `ury_pos_closing_reconciliation.py` (and any future
caller) to answer "which of the three ordered gates are on for this
branch/company" (ARCHITECTURE_POS_STOCK_AUTHORITY.md section 3.4):

  1. `fulfilment_enabled`             -- V3-73's `pos_stock_authority_v2`.
  2. `reservation_enforcement_enabled` -- treat order-time reservation
     coverage (`ury_kot_reservation_bridge.py`) as authoritative.
  3. `closing_reconciliation_enabled` -- enforce T5's closing-time gate
     (`ury_pos_closing_reconciliation.validate_closing_reconciliation`).

HARD RULES this module exists to enforce (mirrors `ury_feature_flags.py`'s
own, deliberately -- these are the same three gates that document defers
to `URY Feature Flags`):

1. Every field defaults to False/off under every failure mode: unset field,
   missing "URY Feature Flags" doctype/table, a database error, or any
   other unexpected condition. Fails CLOSED to Tier 1 (`TIER_1`, all three
   False). Never raises -- a caller that can't resolve policy must treat
   that exactly like an explicit Tier 1 branch, not like an error state
   that propagates.
2. Nothing in this module, or anywhere else in the shipped application
   code, sets any of these three fields to True. They only become True via
   a human directly editing the "URY Feature Flags" single doctype -- see
   that doctype's own field descriptions for the evidence/sign-off bar
   each flag requires before being enabled.
3. `branch`/`company` are accepted (and required as keyword args by
   `ury_pos_closing_reconciliation._resolve_policy`) for forward
   compatibility with a future per-branch override, but -- like
   `ury_feature_flags.is_pos_stock_authority_flag_enabled` -- the current
   implementation only reads the single global flag set; per-branch
   storage is not built. Document any future per-scope storage choice here
   when it is built.
"""

from collections import namedtuple

import frappe

StockPolicy = namedtuple(
	"StockPolicy",
	["fulfilment_enabled", "reservation_enforcement_enabled", "closing_reconciliation_enabled"],
)

TIER_1 = StockPolicy(
	fulfilment_enabled=False,
	reservation_enforcement_enabled=False,
	closing_reconciliation_enabled=False,
)

FLAG_DOCTYPE = "URY Feature Flags"


def get_branch_stock_policy(branch=None, company=None):
	"""Return this branch/company's `StockPolicy`. Fails closed to `TIER_1`.

	`branch`/`company` are accepted for forward compatibility with a future
	per-scope override (see module docstring, rule 3) and are not currently
	used to vary the result -- the single global "URY Feature Flags" values
	are authoritative today, exactly like `ury_feature_flags`'s own
	single-flag resolver.
	"""
	try:
		# frappe.db.get_single_value (not get_singles_dict) -- it casts a
		# Check field to a real int (0/1) via the DocType's fieldtype.
		# get_singles_dict returns the Singles table's raw string values
		# ("0"/"1"), and `bool("0")` is True: using that here would have
		# made every gate default OPEN, the exact opposite of this
		# module's one hard rule. Read each field individually instead.
		fulfilment_enabled = frappe.db.get_single_value(FLAG_DOCTYPE, "pos_stock_authority_v2")
		reservation_enforcement_enabled = frappe.db.get_single_value(
			FLAG_DOCTYPE, "pos_reservation_enforcement_enabled"
		)
		closing_reconciliation_enabled = frappe.db.get_single_value(
			FLAG_DOCTYPE, "pos_closing_reconciliation_enabled"
		)
	except Exception:
		# Fail closed: doctype missing, DB error, not yet migrated, etc.
		# Never let a read failure be interpreted as "tier 2 is on".
		return TIER_1

	return StockPolicy(
		fulfilment_enabled=bool(fulfilment_enabled),
		reservation_enforcement_enabled=bool(reservation_enforcement_enabled),
		closing_reconciliation_enabled=bool(closing_reconciliation_enabled),
	)
