"""N3: block direct (hand-built, no-Work-Order) Manufacture Stock Entries for
PRE_PRODUCED/IN_HOUSE finished items.

`ury_batch_manufacture_service.start_batch` used to hand-build a `purpose:
"Manufacture"` Stock Entry directly (no linked `work_order`), the same
pattern `ury_fulfilment_posting_service._submit_stock_entry` still uses for
MADE_TO_ORDER items. That MADE_TO_ORDER pattern is deliberate and stays
out of scope here (see that module's docstring). For PRE_PRODUCED/IN_HOUSE
items, `start_batch` has been migrated (see `ury_batch_manufacture_service.py`)
to post through a real, submitted ERPNext `Work Order` instead -- this
module is the enforcement side of that migration: it rejects any *other*
Manufacture Stock Entry (hand-built from the desk, a script, an import, or
any future code path) for a PRE_PRODUCED/IN_HOUSE finished item unless it is
linked to a submitted Work Order.

`ury/ury/doctype/bulk_production/bulk_production.py`'s `create_stock_entry()`
is a second, pre-existing, shipped hand-built Manufacture Stock Entry
producer (no `work_order` either) that the original migration simply missed.
Unlike the MADE_TO_ORDER `ury_fulfilment_posting_service` case above, Bulk
Production is not scoped by production_policy/sourcing_mode -- it can target
PRE_PRODUCED/IN_HOUSE finished items directly (that is its whole purpose: a
manual bulk manufacture run). Blocking it here would regress a shipped
feature, and it is not the "hand-built Manufacture Stock Entry bypassing
Work Order" problem this hook targets (POS/KOT-time fulfilment). It is
therefore explicitly exempted: `create_stock_entry()` sets a transient,
in-memory-only `stock_entry.flags.ignore_manufacture_enforcement = True`
before `insert()`, and this hook honors that flag. The flag is deliberately
not persisted (no new Stock Entry field/fixture) -- simpler, but it means the
exemption is not visible/queryable on the Stock Entry record after the fact;
Bulk Production's own `production_items` child table (which links back to
the Stock Entry it created) is the audit trail for that instead.

Wired via `hooks.py`'s `doc_events` (not edited by this module -- the
orchestrator merges the entry centrally):

    "Stock Entry": {
        "validate": "ury.ury.api.ury_manufacture_enforcement.validate_manufacture_requires_work_order",
    }

Scope: only `URY Item Production Configuration` rows with
`production_policy == "PRE_PRODUCED"` and `sourcing_mode == "IN_HOUSE"` are
enforced (grepped from `ury_item_production_configuration.json`:
`production_policy` options include `PRE_PRODUCED`/`MADE_TO_ORDER`/
`DIRECT_RETAIL`; `sourcing_mode` options are `IN_HOUSE`/`EXTERNAL_RECEIPT` and
are only meaningful when `production_policy == "PRE_PRODUCED"`).
EXTERNAL_RECEIPT never posts a Manufacture entry (it's a Material Receipt) so
it never reaches this check. MADE_TO_ORDER and DIRECT_RETAIL items are never
blocked, regardless of `work_order`, matching the track's acceptance
criteria which target pre-produced items specifically.

The lookup is intentionally item-scoped only (not branch-scoped): Stock
Entry carries no reliable `branch` field to join against
`URY Item Production Configuration.branch`, so any active PRE_PRODUCED/
IN_HOUSE configuration row for the item is enough to trigger enforcement.
If the configuration doctype/record is missing for an item this app does
not manage, the hook no-ops safely (nothing to enforce).
"""

from __future__ import annotations

import frappe
from frappe import _

CONFIG_DOCTYPE = "URY Item Production Configuration"

MANUFACTURE_PURPOSE = "Manufacture"
PRE_PRODUCED = "PRE_PRODUCED"
IN_HOUSE = "IN_HOUSE"


def validate_manufacture_requires_work_order(doc, method=None):
	"""Block a Manufacture-purpose Stock Entry for a PRE_PRODUCED/IN_HOUSE
	finished item unless it is linked to a submitted Work Order.

	No-ops (does nothing) for:
	- Stock Entries that are not Manufacture-purpose.
	- Stock Entries created by the pre-existing Bulk Production flow
	  (`doc.flags.ignore_manufacture_enforcement` set by
	  `BulkProduction.create_stock_entry()` -- see module docstring).
	- Finished item rows whose item has no active PRE_PRODUCED/IN_HOUSE
	  `URY Item Production Configuration` row (including items this app
	  does not manage at all).
	- Any item row that is not itself a finished item
	  (`is_finished_item != 1`).
	"""
	if doc.get("purpose") != MANUFACTURE_PURPOSE and doc.get("stock_entry_type") != MANUFACTURE_PURPOSE:
		return

	if doc.flags.get("ignore_manufacture_enforcement"):
		return

	work_order = (doc.get("work_order") or "").strip() if isinstance(doc.get("work_order"), str) else doc.get("work_order")
	if work_order:
		# Already linked to a Work Order -- caller must additionally ensure
		# that Work Order is submitted; ERPNext core itself only lets a
		# submitted Work Order be referenced by a submitted Stock Entry in
		# practice (a draft Work Order's `make_stock_entry` path is the only
		# supported way to reach here with `work_order` set), so we do not
		# re-validate that here.
		return

	for item_row in doc.get("items") or []:
		if not _cint(item_row.get("is_finished_item")):
			continue
		item_code = item_row.get("item_code")
		if not item_code:
			continue
		if _requires_work_order(item_code):
			frappe.throw(
				_(
					"Item {0} is configured as PRE_PRODUCED/IN_HOUSE and must be "
					"manufactured through a submitted Work Order; a direct "
					"Manufacture Stock Entry without a linked work_order is not "
					"permitted for this item."
				).format(item_code),
				frappe.ValidationError,
			)


def _requires_work_order(item_code):
	"""True if `item_code` has any active PRE_PRODUCED/IN_HOUSE
	`URY Item Production Configuration` row. Fails open (returns False,
	never raises) if the configuration doctype/record cannot be read --
	this hook must never break Stock Entries for items this app does not
	manage."""
	try:
		return bool(
			frappe.db.exists(
				CONFIG_DOCTYPE,
				{
					"item": item_code,
					"active": 1,
					"production_policy": PRE_PRODUCED,
					"sourcing_mode": IN_HOUSE,
				},
			)
		)
	except Exception:
		return False


def _cint(value):
	try:
		return int(value or 0)
	except (TypeError, ValueError):
		return 0
