"""Wires order-time stock reservation (V3-43's `ury_reservation_service`) into
KOT creation/cancellation, so an item added to any order (dine-in, takeaway,
captain, table) actually reserves capacity instead of only being checked for
*display* availability (`ury_availability.get_item_availability`).

Scope boundary (read before extending this file): this module ONLY calls
`create_reservation` / `release_reservation`, which never touch ERPNext's
Bin or Stock Ledger -- they are a separate, additive tracking ledger
(`URY Stock Reservation`). This module does not, and must not, touch
`POS Invoice.update_stock`, call the V3-71/V3-72 fulfilment services, or
flip `URY Feature Flags.pos_stock_authority_v2`. That flag change is
explicitly gated behind human sign-off per
`docs/v3-integration/V3-70-fulfilment-accounting-transition-checklist.md`
("REQUIRES HUMAN SIGN-OFF... not a technical deliverable a session can
produce alone"). Reservation bookkeeping is safe to wire ahead of that
because it cannot double-post or misstate real stock/GL by itself; the
fulfilment/posting layer stays exactly as gated as it was before this file
existed.

Every call here is best-effort and fails soft: a reservation problem must
never block a KOT from being created or cancelled (kitchens must keep
running even if bookkeeping has an issue) -- mirrors the same fail-soft
pattern already used by `ury_feature_flags.maybe_wire_fulfilment_on_submit`.
"""

import frappe

from ury.ury.api.ury_production_context import resolve_production_context
from ury.ury.api.ury_reservation_service import create_reservation, release_reservation

RESERVATION_TTL_MINUTES = 240  # a KOT's reservation outlives a normal dine-in service window


def _resolve_branch_company(branch):
	company = frappe.db.get_value("Branch", branch, "company")
	return company


def reserve_for_order_items(invoice, branch, items):
	"""Best-effort: reserve capacity for every item on an order, regardless
	of whether that item ends up on a KOT.

	Called ONCE per order from `process_items_for_kot`, over the FULL item
	list -- not per-KOT, and not only for the subset that
	`process_items_for_kot`'s production-item-group routing sends to a KOT.
	That distinction matters: a DIRECT_RETAIL/PRE_PRODUCED item (e.g. a
	pre-made ice cream) whose Item Group isn't mapped to any Production
	Unit's item groups never appears on ANY KOT at all -- `process_items_
	for_kot`'s own loop just prints a warning and moves on for such items.
	The earlier version of this bridge only reserved items that reached
	`create_kot_doc`, so pre-made/direct-retail items silently never
	reserved anything. Reserving at the full-order level here, once, fixes
	that for every order flow (all of them funnel through
	`process_items_for_kot`) without duplicating reservations for items
	that DO also reach a KOT (`create_kot_doc` itself no longer reserves --
	see its call site).

	`order_ref` is the linked POS Invoice name, so cancellation/fulfilment
	lookups (here and in the flag-gated V3-73 bridge) key off the same
	value. Items with no resolvable production context (see
	`ury_availability.py`'s own `CONFIGURATION_ERROR` fail-closed pattern)
	are skipped, not force-reserved -- if display availability can't
	resolve a policy for an item, reservation shouldn't fabricate one either.
	"""
	company = _resolve_branch_company(branch)
	if not company:
		frappe.log_error(
			title="URY order reservation: no company for branch",
			message=f"branch={branch}, invoice={invoice}",
		)
		return

	expires_at = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=RESERVATION_TTL_MINUTES)

	for item in items or []:
		item_code = item.get("item_code")
		qty = frappe.utils.flt(item.get("qty"))
		if not item_code or not qty:
			continue
		try:
			_reserve_one(invoice, item_code, qty, branch, company, expires_at)
		except Exception:
			frappe.log_error(
				title="URY order reservation: create_reservation failed",
				message=frappe.get_traceback(),
			)


def _reserve_one(invoice, item_code, qty, branch, company, expires_at):
	context = resolve_production_context(item_code, branch, company)
	if not context or not context.get("warehouse"):
		# No active production config / warehouse for this item at this
		# branch -- matches ury_availability.py's own CONFIGURATION_ERROR
		# fail-closed treatment. Nothing to reserve against.
		return

	create_reservation(
		item_code=item_code,
		qty=qty,
		warehouse=context["warehouse"],
		branch=branch,
		company=company,
		order_ref=invoice,
		policy=context.get("production_policy"),
		actor=frappe.session.user,
		expires_at=expires_at,
	)


def release_for_cancelled_items(invoice, cancel_items):
	"""Best-effort: release the Reserved group for each cancelled/removed item.

	Called ONCE per cancellation from `process_items_for_cancel_kot`, over
	the FULL cancelled-items list -- not per-cancel-KOT -- for the same
	reason `reserve_for_order_items` reserves at the full-order level: a
	cancelled DIRECT_RETAIL/PRE_PRODUCED item may never reach `create_
	cancel_kot_doc` at all (it's routed there only if its Item Group maps
	to a Production Unit), so releasing only from inside that function
	would leave such an item's reservation dangling forever.

	`cancel_items` is the same `[{"item_code": ..., "qty": ...}, ...]` shape
	`process_items_for_cancel_kot` already builds. Only releases a group
	that is still fully `Reserved` (matches `release_reservation`'s own
	all-or-nothing group semantics) -- a group with any `Fulfilled` row is
	left alone, since fulfilled consumption is not reversible by a release
	(see `ury_reservation_service.cancel_reservation`'s docstring).
	"""
	for item in cancel_items or []:
		item_code = item.get("item_code")
		if not item_code:
			continue
		try:
			_release_one(invoice, item_code)
		except Exception:
			frappe.log_error(
				title="URY KOT reservation: release_reservation failed",
				message=frappe.get_traceback(),
			)


def _release_one(invoice, item_code):
	rows = frappe.get_all(
		"URY Stock Reservation",
		filters={"order_ref": invoice, "top_level_item": item_code, "status": "Reserved"},
		fields=["name", "reservation_group"],
		limit=1,
	)
	if not rows:
		return
	release_reservation(rows[0].reservation_group or rows[0].name, reason="KOT item cancelled")


def expire_stale_reservations_job():
	"""Scheduler entry point (cron takes no arguments) -- see hooks.py."""
	from ury.ury.api.ury_reservation_service import expire_stale_reservations

	try:
		expire_stale_reservations(ttl_minutes=RESERVATION_TTL_MINUTES)
	except Exception:
		frappe.log_error(
			title="URY reservation expiry job failed",
			message=frappe.get_traceback(),
		)
