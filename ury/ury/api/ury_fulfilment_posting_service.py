"""Durable POS fulfilment stock posting service.

This is the minimal authoritative slice for V3 stock posting:

This service owns exactly one of the two stock ledgers in a POS sale: the
PRODUCTION ledger. The sale ledger is owned by native ERPNext, always, and
is posted once per session at POS Closing Entry via the consolidated Sales
Invoice's ``update_stock = 1``. Nothing here suppresses or replaces it.

- READY creates one durable ``URY Fulfilment Posting Intent`` per KOT item,
  for MADE_TO_ORDER items only. PRE_PRODUCED items had their Manufacture
  entry posted ahead of time by the batch path; DIRECT_RETAIL items are not
  produced at all. Both post nothing here and are deducted once, by the
  sale, at closing.
- The worker claims intents with a row lock and short lease.
- ERPNext stock movement is a submitted ``Manufacture`` Stock Entry, and only
  ever that: it consumes raw-material BOM components and receives the
  selling item into the same production department warehouse the sale later
  deducts it from, so the production round trip nets to zero there. It never
  issues the selling item -- see ``_stock_entry_items``.
- Reservation fulfilment happens only after the Stock Entry has submitted.
- Replays recover from an already-submitted Stock Entry instead of creating
  another one.

Returns / credit notes (G-05, decided): a return never reverses a production
Stock Entry created here or by the batch path. Only the native sale-side
ledger is affected -- `pos_invoice_merge_log.py` sets `update_stock=1` on the
consolidated credit note, so ERPNext genuinely credits the finished good back
into the warehouse on its own. A returned dish does not un-cook itself: the
raw materials this service's Manufacture Stock Entry consumed are genuinely
gone, and that Stock Entry is left submitted and untouched. See
`ury.ury.hooks.ury_sales_invoice.fulfil_reservations_on_consolidation` for
the corresponding reservation-side statement of this policy, and
tracks/sa-pos-stock-phase2/ARCHITECTURE_POS_STOCK_AUTHORITY.md (G-05) /
PLAN.md (T7) for the full decision record.
"""

from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import add_to_date, flt, now, now_datetime

from ury.ury.api.ury_reservation_service import (
	QTY_TOLERANCE,
	RESERVED,
	fulfil_reservation_if_pending,
	group_reserved_top_level_qty,
)
from ury.ury.api.ury_kot_execution_service import READY, SERVED
from ury.ury.api.ury_bom_compiler import publish_component_stock_fanout
from ury.ury.api.ury_feature_flags import is_pos_stock_authority_flag_enabled, ITEM_EXECUTION_DOCTYPE


INTENT_DOCTYPE = "URY Fulfilment Posting Intent"
FULFILMENT_DOCTYPE = "URY Fulfilment Record"
RESERVATION_DOCTYPE = "URY Stock Reservation"
KOT_DOCTYPE = "URY KOT"
KOT_ITEM_DOCTYPE = "URY KOT Items"

PENDING = "PENDING"
POSTING = "POSTING"
POSTED = "POSTED"
FAILED = "FAILED"
CANCELLED = "CANCELLED"

TERMINAL_STATUSES = (POSTED, CANCELLED)
CLAIMABLE_STATUSES = (PENDING, FAILED, POSTING)
LEASE_MINUTES = 10
RETRY_MINUTES = 5
DEFAULT_MAX_ATTEMPTS = 5

PRE_PRODUCED = "PRE_PRODUCED"
MADE_TO_ORDER = "MADE_TO_ORDER"
MTO_LEGACY = "MTO"
DIRECT_RETAIL = "DIRECT_RETAIL"
READY_STATES = (READY, SERVED)
POSTING_ROLES = {"System Manager", "Stock Manager", "Production Manager", "Chef", "URY Captain"}


@contextmanager
def _service_mutation():
	"""Run only trusted posting mutations as the service principal."""
	previous_user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		yield
	finally:
		frappe.set_user(previous_user)


def _authorize_posting(actor, execution_doc):
	if actor == "Administrator":
		return
	roles = set(frappe.get_roles(actor))
	if not roles.intersection(POSTING_ROLES):
		raise frappe.PermissionError(_("You are not permitted to post fulfilment stock"))
	if not frappe.has_permission(ITEM_EXECUTION_DOCTYPE, "read", execution_doc, user=actor):
		raise frappe.PermissionError(_("You are not permitted to post this fulfilment item"))


class FulfilmentPostingError(frappe.ValidationError):
	def __init__(self, reason_code, message=None):
		self.reason_code = reason_code
		super().__init__(message or reason_code)


def _json_dumps(value):
	return json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))


def _hash_payload(payload):
	return hashlib.sha256(_json_dumps(payload).encode("utf-8")).hexdigest()


def _has_doctype(doctype):
	return bool(frappe.db.exists("DocType", doctype))


def _normalise_policy(policy):
	policy = (policy or "").upper()
	if policy == MTO_LEGACY:
		return MADE_TO_ORDER
	if policy in (PRE_PRODUCED, MADE_TO_ORDER, DIRECT_RETAIL):
		return policy
	return PRE_PRODUCED


def _kot_item_doc(kot_item):
	doc = frappe.get_doc(KOT_ITEM_DOCTYPE, kot_item)
	item_code = doc.get("item") or doc.get("item_code")
	qty = flt(doc.get("quantity") or doc.get("qty"))
	if not item_code or qty <= 0:
		raise FulfilmentPostingError(
			"MISSING_KOT_ITEM_SCOPE",
			_("KOT item {0} has no item/quantity for stock posting").format(kot_item),
		)
	return doc, item_code, qty


def _kot_order_ref(kot):
	invoice = frappe.db.get_value(KOT_DOCTYPE, kot, "invoice")
	return invoice or kot


def _row_reservation_line_key(row):
	"""Best-effort read of the order-time `reservation_line_key` off a reservation row.

	`reservation_line_key` is not a column on `URY Stock Reservation`; it is
	frozen into the row's `audit_log` JSON by
	`ury_order_reservation_service._reconcile_line` (see its `frozen_context`),
	which is why this is a Python-side read rather than a SQL filter.
	Deliberately tolerant -- a row with a missing/unparseable/legacy audit log
	simply has no line key, and `_scope_rows_to_line` treats that as "not
	line-bound" rather than an error. Hard validation of the frozen context
	still happens per selected row in `_reservation_audit_context`.
	"""
	try:
		entries = json.loads(row.get("audit_log") or "[]")
	except (TypeError, ValueError):
		return None
	for entry in reversed(entries or []):
		context = entry.get("frozen_context")
		if context:
			return context.get("reservation_line_key")
	return None


def _scope_rows_to_line(rows, reservation_line_key):
	"""Narrow `(order_ref, item_code)` reservation rows to one POS line's groups.

	B03: the same item_code can be live on one order more than once -- two
	separate POS lines of the same dish, or an original line plus a delta KOT
	raised by a quantity change. Each such line owns its OWN reservation group
	(`ury_order_reservation_service._reconcile_line` releases and rebuilds per
	`reservation_line_key`), but this service used to look reservations up by
	`(order_ref, item_code)` alone. That pooled every line's groups together,
	so serving one KOT could consume, and Fulfil, the reservation group that
	rightfully belonged to the other line -- leaving the second KOT to be
	served with nothing Reserved (`RESERVATION_NOT_FOUND`), or blocking the
	first outright with `AMBIGUOUS_RESERVATION_BINDING`.

	The narrowing is deliberately one-directional and cannot introduce a false
	negative:

	- No line key on the KOT item (legacy/pre-migration KOTs, or any creation
	  path that does not set `URY KOT Items.reservation_line_key`): no
	  filtering at all, today's exact behaviour.
	- Line key present and matching rows exist: those rows only. Every row of
	  one reservation group shares one frozen context -- the group is created
	  by a single `create_reservation` call -- so a match selects WHOLE groups,
	  never a partial one.
	- Line key present but nothing matches (reservations predating the line
	  key being frozen, or a line whose group was rebuilt under a different
	  key): fall back to the unfiltered set rather than failing closed.

	So the result is either identical to the old behaviour or a strict subset
	consisting of whole groups, which means this can only ever turn an
	ambiguous/cross-consuming lookup into a correct one -- it can never turn a
	previously-successful lookup into a failure.
	"""
	if not reservation_line_key:
		return rows
	scoped = [row for row in rows if _row_reservation_line_key(row) == reservation_line_key]
	return scoped or rows


def _reservation_rows(order_ref, item_code, branch, company, reservation_line_key=None):
	rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={
			"order_ref": order_ref,
			"top_level_item": item_code,
			"branch": branch,
			"company": company,
			"status": RESERVED,
		},
		fields=[
			"name",
			"reservation_group",
			"policy",
			"warehouse",
			"top_level_item",
			"component_item",
			"qty",
			"audit_log",
		],
		order_by="creation asc",
	)
	if not rows:
		raise FulfilmentPostingError(
			"RESERVATION_NOT_FOUND",
			_("No Reserved stock reservation found for order {0}, item {1}").format(order_ref, item_code),
		)
	rows = _scope_rows_to_line(rows, reservation_line_key)
	groups = {row.get("reservation_group") or row.get("name") for row in rows}
	if len(groups) > 1:
		raise FulfilmentPostingError(
			"AMBIGUOUS_RESERVATION_BINDING",
			_("KOT item {0} maps to multiple reservation groups; posting is blocked until the line is resolved").format(item_code),
		)
	return rows


def _reservation_audit_context(row):
	try:
		entries = json.loads(row.get("audit_log") or "[]")
	except (TypeError, ValueError) as exc:
		raise FulfilmentPostingError(
			"INVALID_RESERVATION_AUDIT_LOG",
			_("Reservation {0} has invalid audit log JSON").format(row.get("name")),
		) from exc
	for entry in reversed(entries):
		context = entry.get("frozen_context")
		if context:
			return entry, context
	raise FulfilmentPostingError(
		"ORDER_TIME_RESERVATION_CONTEXT_MISSING",
		_("Reservation {0} has no order-time frozen context").format(row.get("name")),
	)


def _reservation_snapshot(row, item_code):
	entry, context = _reservation_audit_context(row)
	policy = _normalise_policy(context.get("production_policy") or context.get("policy"))
	warehouse = context.get("warehouse")
	component_item = entry.get("component_item") or context.get("component_item")
	qty = flt(entry.get("qty") or context.get("qty"))
	if not policy or not warehouse or not component_item or qty <= 0:
		raise FulfilmentPostingError(
			"INVALID_ORDER_TIME_RESERVATION_CONTEXT",
			_("Reservation {0} has incomplete order-time frozen context").format(row.get("name")),
		)
	return {
		"reservation_ref": row.get("name"),
		"reservation_group": row.get("reservation_group"),
		"policy": policy,
		"warehouse": warehouse,
		"top_level_item": context.get("item_code") or item_code,
		"component_item": component_item,
		"qty": qty,
		"production_unit": context.get("production_unit"),
		"department": context.get("department"),
		"production_configuration": context.get("production_configuration"),
	}


def _existing_sequence_for_reservation(branch, kot, kot_item, accepted_revision, reservation_group):
	rows = frappe.get_all(
		INTENT_DOCTYPE,
		filters={
			"branch": branch,
			"kot": kot,
			"kot_item": kot_item,
			"accepted_revision": accepted_revision,
			"reservation_ref": reservation_group,
		},
		fields=["fulfilment_sequence"],
		order_by="fulfilment_sequence desc",
		limit=1,
	)
	return int(rows[0].get("fulfilment_sequence") or 0) if rows else None


def _next_fulfilment_sequence(branch, kot, kot_item, accepted_revision, reservation_group):
	existing = _existing_sequence_for_reservation(branch, kot, kot_item, accepted_revision, reservation_group)
	if existing:
		return existing
	rows = frappe.get_all(
		INTENT_DOCTYPE,
		filters={
			"branch": branch,
			"kot": kot,
			"kot_item": kot_item,
			"accepted_revision": accepted_revision,
		},
		fields=["fulfilment_sequence"],
		order_by="fulfilment_sequence desc",
		limit=1,
	)
	if not rows:
		return 1
	return int(rows[0].get("fulfilment_sequence") or 0) + 1


def _fg_warehouse(snapshots):
	"""Resolve the warehouse the finished good is received into.

	Each snapshot's `warehouse` is the value
	`ury_order_reservation_service._reserve_line` froze into the reservation's
	audit log at order time, straight from `_warehouse_for_context(context)`.
	Reading the frozen value rather than re-resolving the context live is
	deliberate: the posting runs minutes later, in a background worker, and
	must use the warehouse the order was accepted and reserved against even
	if the item's production configuration has been edited since.

	Every component of one line resolves through that one context and
	therefore shares one warehouse today. Rather than assume that silently --
	which is what reading `components[0]` did -- assert it. More than one
	distinct warehouse means components are being sourced across departments
	(e.g. a central raw store), and there is no defined answer yet for which
	of them the finished good belongs in; fail closed instead of picking one
	arbitrarily and posting the FG somewhere the sale will not find it.
	"""
	warehouses = {snapshot.get("warehouse") for snapshot in snapshots if snapshot.get("warehouse")}
	if len(warehouses) != 1:
		raise FulfilmentPostingError(
			"AMBIGUOUS_FINISHED_GOODS_WAREHOUSE",
			_(
				"Reserved rows for this KOT item resolve to {0} warehouses; "
				"the finished good's warehouse cannot be determined"
			).format(len(warehouses)),
		)
	return warehouses.pop()


def _freeze_payload(execution_doc, actor):
	execution_state = execution_doc.get("state") or execution_doc.get("execution_state")
	if execution_state not in READY_STATES:
		raise FulfilmentPostingError(
			"EXECUTION_NOT_READY",
			_("KOT {0} execution state is {1}; posting requires READY or SERVED").format(
				execution_doc.kot, execution_state or "UNKNOWN"
			),
		)
	kot_item_doc, item_code, accepted_qty = _kot_item_doc(execution_doc.kot_item)
	order_ref = _kot_order_ref(execution_doc.kot)
	# B03: bind this posting to the reservation group owned by THIS KOT
	# line, not to every group the order happens to hold for this item_code.
	# `URY KOT Items.reservation_line_key` is written at KOT creation from the
	# same `_line_key` derivation the reservation side freezes (see
	# `ury_kot_generate._line_keyed_items` / `create_kot_doc`), so the two
	# sides already agree on line identity -- the consumption side simply was
	# not using it. Absent (legacy KOT item), `_scope_rows_to_line` is a no-op.
	reservation_line_key = kot_item_doc.get("reservation_line_key")
	rows = _reservation_rows(
		order_ref,
		item_code,
		execution_doc.branch,
		execution_doc.company,
		reservation_line_key=reservation_line_key,
	)
	snapshots = [_reservation_snapshot(row, item_code) for row in rows]
	policies = {snapshot["policy"] for snapshot in snapshots}
	if len(policies) != 1:
		raise FulfilmentPostingError(
			"MIXED_RESERVATION_POLICIES",
			_("Reserved rows for KOT item {0} do not share one frozen policy").format(execution_doc.kot_item),
		)
	policy = snapshots[0]["policy"]
	reservation_group = rows[0].get("reservation_group") or rows[0].get("name")

	# B03b: this KOT item's SHARE of the reservation group, not the whole group.
	#
	# One group can legitimately cover several KOT items. A straight quantity
	# bump on one POS line (Coffee 1 -> 2) does not create a second group --
	# `ury_order_reservation_service._reconcile_line` releases the line's group
	# and creates ONE replacement sized for the new TOTAL, under the same
	# `reservation_line_key` -- and the delta KOT raised for the +1 inherits
	# that same line key. So B03's line scoping correctly binds BOTH the
	# original KOT item and the delta KOT item to that one group, whose
	# component rows are sized for qty 2.
	#
	# Freezing those rows verbatim, as this did, made each of the two postings
	# consume raw materials for the full 2 while receiving a finished good for
	# its own 1: components deducted twice over. Scale each component to
	# `accepted_qty / reserved_total` so the two postings together consume
	# exactly what the group reserved. `fulfil_reservation_if_pending` performs
	# the matching cumulative accounting on the group's status.
	#
	# Whole-group behaviour is preserved bit-for-bit wherever the share is 1.0
	# -- the single-KOT case, and B03's two-separate-lines case (two groups of
	# one KOT each) -- because `x * 1.0 == x` exactly for floats, and likewise
	# for a legacy group whose reserved total is unknown.
	reserved_group_qty = group_reserved_top_level_qty(rows)
	line_share = 1.0
	if reserved_group_qty:
		if accepted_qty - reserved_group_qty > QTY_TOLERANCE:
			# The KOT item claims more than the line ever reserved. Posting it
			# would consume beyond the reservation, and silently scaling it
			# down would under-produce against the ticket. Neither is a
			# defensible guess, so fail closed and observably: the intent lands
			# FAILED with this reason code rather than corrupting the ledger.
			raise FulfilmentPostingError(
				"KOT_QTY_EXCEEDS_RESERVATION",
				_(
					"KOT item {0} is for {1} of {2}, but its reservation group {3} "
					"reserves only {4}; posting is blocked until the line is resolved"
				).format(execution_doc.kot_item, accepted_qty, item_code, reservation_group, reserved_group_qty),
			)
		line_share = accepted_qty / reserved_group_qty

	components = [
		{
			"reservation_ref": snapshot["reservation_ref"],
			"reservation_group": snapshot["reservation_group"],
			"item_code": snapshot["component_item"],
			"qty": flt(snapshot["qty"]) * line_share,
			"s_warehouse": snapshot["warehouse"],
		}
		for snapshot in snapshots
	]
	if policy in (PRE_PRODUCED, DIRECT_RETAIL) and len(components) > 1:
		raise FulfilmentPostingError(
			"UNEXPECTED_FINISHED_GOODS_RESERVATION",
			_("{0} fulfilment for KOT item {1} must resolve to one stock row").format(policy, execution_doc.kot_item),
		)
	# Which VERSION OF THE LINE this posting is accepted against.
	#
	# This used to read `idempotency_key`, but that field is a per-RPC replay
	# token: the client mints a fresh UUID for every call and `_transition`
	# rewrites the row's copy on every state change. Freezing it here meant
	# the intent carried the READY call's UUID while the row went on to carry
	# the SERVED call's UUID, so the G-07 gate in `ury_feature_flags` found a
	# mismatch on every normally served item and falsely blocked the invoice.
	# `revision_key` is stamped once at seed time and advanced only by
	# `ury_kot_item_execution_service.bump_item_execution_revision` (a genuine
	# edit / re-fire of the line), which is exactly the identity this needs.
	#
	# The `idempotency_key` fallback covers rows seeded before `revision_key`
	# existed and not yet touched by the v3_21 backfill patch; the gate skips
	# the revision comparison for such rows rather than acting on a value it
	# knows is not a revision.
	accepted_revision = (
		execution_doc.get("revision_key") or execution_doc.get("idempotency_key") or "current"
	)
	fulfilment_sequence = _next_fulfilment_sequence(
		execution_doc.branch,
		execution_doc.kot,
		execution_doc.kot_item,
		accepted_revision,
		reservation_group,
	)
	payload = {
		"kot": execution_doc.kot,
		"kot_item": execution_doc.kot_item,
		"order_ref": order_ref,
		"item_code": item_code,
		"accepted_qty": accepted_qty,
		"accepted_revision": accepted_revision,
		"fulfilment_sequence": fulfilment_sequence,
		"branch": execution_doc.branch,
		"company": execution_doc.company,
		"production_unit": snapshots[0].get("production_unit") or execution_doc.get("production_unit"),
		"department": snapshots[0].get("department"),
		"production_configuration": snapshots[0].get("production_configuration"),
		"production_policy": policy,
		"reservation_group": reservation_group,
		# The POS line this KOT item belongs to, as agreed between the
		# reservation and KOT layers. Recorded for traceability/debugging of
		# which line a posting was bound to; None for legacy KOT items that
		# carry no line key (see `_scope_rows_to_line`).
		"reservation_line_key": reservation_line_key,
		# B03b traceability: the group's total reserved top-level quantity, and
		# the fraction of it this KOT item's components were scaled to. None/1.0
		# means this posting consumes the whole group, which is the single-KOT
		# case and every legacy group. Recorded so a Stock Entry's component
		# quantities can be reconciled back to the reservation that authorised
		# them without re-deriving the ratio.
		"reservation_group_qty": reserved_group_qty,
		"reservation_line_share": line_share,
		# The warehouse the finished good is received into, resolved
		# explicitly rather than inferred from a component row. Frozen here,
		# at the same moment and from the same order-time context as every
		# component's own warehouse, so the posting that runs minutes later
		# in a background worker uses the warehouse the order was accepted
		# against -- not whatever the item's configuration says by then.
		#
		# This is the warehouse the sale later deducts from: the same
		# `_warehouse_for_context(context)` resolution that
		# `ury_order_reservation_service._reserve_line` and
		# `ury_order._department_warehouse_for_item` use, so the FG received
		# here and the FG issued by the consolidated Sales Invoice at closing
		# land in one warehouse and net out.
		"fg_warehouse": _fg_warehouse(snapshots),
		"components": components,
		"ready_at": execution_doc.get("ready_at") or now(),
		"execution_state": execution_state,
		"actor": actor,
	}
	payload["idempotency_key"] = ":".join(
		str(part)
		for part in (
			payload["branch"],
			payload["kot"],
			payload["kot_item"],
			payload["accepted_revision"],
			payload["fulfilment_sequence"],
		)
	)
	return payload


def _intent_result(intent, idempotent=False):
	return {
		"name": intent.get("name"),
		"status": intent.get("status"),
		"idempotency_key": intent.get("idempotency_key"),
		"erpnext_stock_entry": intent.get("erpnext_stock_entry"),
		"idempotent_replay": idempotent,
	}


def create_or_get_posting_intent_for_ready(execution_doc, actor=None):
	"""Create/fetch the durable posting intent for one READY item execution."""
	if not _has_doctype(INTENT_DOCTYPE):
		raise FulfilmentPostingError("POSTING_INTENT_DOCTYPE_MISSING", _("{0} is not available").format(INTENT_DOCTYPE))

	actor = actor or frappe.session.user

	_authorize_posting(actor, execution_doc)
	payload = _freeze_payload(execution_doc, actor)

	# sa-architecture-closure: this service must never post stock for an item
	# native POS Invoice deduction (`update_stock=1`) is also posting for.
	# The actual production entry point (`mark_item_ready` ->
	# `_attach_ready_posting_intent` in ury_kot_item_execution_service.py)
	# already checks `pos_stock_authority_v2` before ever calling this
	# function, and skips calling it entirely while the flag is OFF (today's
	# universal default) so native POS remains the sole authority. This is a
	# second, defense-in-depth check for any other/future direct caller of
	# this function: it must never silently create a Stock Entry while the
	# flag is off, on top of whatever native POS already posts. Checked
	# after authorization/execution-state validation so those more basic
	# request-shape errors still surface first.
	if not is_pos_stock_authority_flag_enabled(
		company=execution_doc.get("company"), branch=execution_doc.get("branch")
	):
		raise FulfilmentPostingError(
			"POS_STOCK_AUTHORITY_FLAG_OFF",
			_(
				"Stock posting for this item is handled by Native POS in this "
				"branch's current mode (POS Stock Authority V2 is not enabled), "
				"so fulfilment posting cannot also post a Stock Entry for it. "
				"Enable 'POS Stock Authority V2 Enabled' in URY Feature Flags "
				"for this branch before fulfilment posting can be authoritative."
			),
		)
	# Production posting is for MADE_TO_ORDER items and nothing else.
	#
	# The production event and the sale event own different quantities:
	# production turns raw components into a finished good, the sale issues
	# that finished good at closing. For a made-to-order item that is a real,
	# per-order transformation that only this service can express, so it
	# posts a Manufacture entry here. For every other policy there is nothing
	# for this service to post:
	#
	#   PRE_PRODUCED  -- its Manufacture entry was already posted, ahead of
	#                    time, by the batch path (ury_batch_manufacture_service
	#                    start_batch / bulk_production), into the same
	#                    department warehouse the sale later deducts from
	#                    (D13: the Department Warehouse is the PRE_PRODUCED
	#                    stock authority, not direct_retail_warehouse, which
	#                    is for DIRECT_RETAIL goods only). READY here is a
	#                    plating milestone with no stock semantics.
	#   DIRECT_RETAIL -- there is no production at all, by definition.
	#
	# Posting for those policies was the double-deduction bug: the entry
	# issued the SELLING ITEM from the department warehouse at READY, and
	# closing's consolidated Sales Invoice then issued the same item from the
	# same warehouse again. Same item, same warehouse, twice. See also the
	# structural no-self-issue assertion in `_stock_entry_items`, which makes
	# that shape unrepresentable rather than merely absent.
	if payload["production_policy"] != MADE_TO_ORDER:
		return {
			"name": None,
			"status": "SKIPPED_NOT_MADE_TO_ORDER",
			"production_policy": payload["production_policy"],
			"idempotency_key": payload["idempotency_key"],
			"erpnext_stock_entry": None,
			"idempotent_replay": False,
		}

	existing_name = frappe.db.get_value(INTENT_DOCTYPE, {"idempotency_key": payload["idempotency_key"]}, "name")
	if existing_name:
		return _intent_result(frappe.get_doc(INTENT_DOCTYPE, existing_name), idempotent=True)

	doc = frappe.get_doc(
		{
			"doctype": INTENT_DOCTYPE,
			"idempotency_key": payload["idempotency_key"],
			"status": PENDING,
			"company": payload["company"],
			"branch": payload["branch"],
			"production_unit": payload.get("production_unit"),
			"production_policy": payload["production_policy"],
			"order_ref": payload["order_ref"],
			"kot": payload["kot"],
			"kot_item": payload["kot_item"],
			"accepted_revision": payload["accepted_revision"],
			"fulfilment_sequence": payload["fulfilment_sequence"],
			"accepted_qty": payload["accepted_qty"],
			"execution_state": payload["execution_state"],
			"reservation_ref": payload["reservation_group"],
			"frozen_payload_json": _json_dumps(payload),
			"frozen_payload_hash": _hash_payload(payload),
			"ready_at": payload["ready_at"],
			"actor": actor,
		}
	)
	with _service_mutation():
		doc.insert(ignore_permissions=False)
	return _intent_result(doc.as_dict(), idempotent=False)


def enqueue_posting_intent(intent_name):
	frappe.enqueue(
		"ury.ury.api.ury_fulfilment_posting_service.process_posting_intent",
		queue="short",
		enqueue_after_commit=True,
		job_id=f"ury-fulfilment-posting-{intent_name}",
		deduplicate=True,
		intent_name=intent_name,
	)


def _lock_intent(intent_name):
	rows = frappe.db.sql(
		f"""
		SELECT name, status, attempts, leased_until, erpnext_stock_entry
		FROM `tab{INTENT_DOCTYPE}`
		WHERE name = %(name)s
		FOR UPDATE
		""",
		{"name": intent_name},
		as_dict=True,
	)
	if not rows:
		raise FulfilmentPostingError("POSTING_INTENT_NOT_FOUND", _("Posting intent {0} not found").format(intent_name))
	return rows[0]


def _lease_is_fresh(row):
	leased_until = row.get("leased_until")
	return bool(leased_until and frappe.utils.get_datetime(leased_until) > now_datetime())


def _claim_intent(intent_name):
	row = _lock_intent(intent_name)
	if row.get("status") in TERMINAL_STATUSES:
		return None
	if row.get("status") == POSTING and _lease_is_fresh(row):
		return None
	if row.get("status") not in CLAIMABLE_STATUSES:
		raise FulfilmentPostingError("POSTING_INTENT_NOT_CLAIMABLE", _("Posting intent {0} is not claimable").format(intent_name))

	doc = frappe.get_doc(INTENT_DOCTYPE, intent_name)
	doc.status = POSTING
	doc.attempts = int(row.get("attempts") or 0) + 1
	doc.lease_owner = frappe.session.user
	doc.leased_until = add_to_date(now_datetime(), minutes=LEASE_MINUTES)
	doc.last_attempted_at = now()
	with _service_mutation():
		doc.save(ignore_permissions=False)
	return doc


def _payload(intent):
	payload = json.loads(intent.get("frozen_payload_json") or "{}")
	if _hash_payload(payload) != intent.get("frozen_payload_hash"):
		raise FulfilmentPostingError("FROZEN_PAYLOAD_HASH_MISMATCH", _("Posting payload hash mismatch for {0}").format(intent.name))
	return payload


def _find_existing_stock_entry(intent_name):
	"""Locking existence check for a Stock Entry already posted for `intent_name`.

	Called from `_submit_stock_entry`, which runs after `_claim_intent` has
	taken `FOR UPDATE` on the posting intent row. A plain `get_all` here is a
	different table, so it is not covered by that lock at all -- under
	MariaDB REPEATABLE READ it is served from this transaction's consistent
	read view, which can predate a Stock Entry another worker committed for
	the same intent moments ago. Missing it here means submitting a second
	Stock Entry for the same intent, i.e. a duplicate stock issue.
	`FOR UPDATE` forces this SELECT to read (and lock) the latest committed
	rows instead, on this request's own connection/transaction.

	This queries the indexed `custom_ury_posting_intent` field (an exact
	match) rather than `remarks LIKE '%...%'`. `remarks` is free text with no
	fixed format guarantee and a leading-wildcard LIKE can never use a B-tree
	index, so `FOR UPDATE` on it would lock (scan) every row of `tabStock
	Entry` -- a table that grows unboundedly -- for the rest of the
	transaction. `custom_ury_posting_intent` is set alongside `remarks` in
	`_submit_stock_entry` purely so this lookup can be an indexed equality
	lookup.
	"""
	rows = frappe.db.sql(
		"""
		SELECT name
		FROM `tabStock Entry`
		WHERE docstatus = 1 AND custom_ury_posting_intent = %(intent_name)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""",
		{"intent_name": intent_name},
		as_dict=True,
	)
	return rows[0].get("name") if rows else None


def _stock_entry_items(payload):
	"""Build the Stock Entry rows for one production posting.

	Enforces the invariant that makes double-ownership of a quantity
	structurally impossible: **the production event never issues a quantity
	of the selling item; it only issues quantities of items strictly below
	the selling item in the BOM.** The selling item may only ever appear as
	the received finished good.

	The sale issues the selling item, once, at closing. If a consumption row
	here named the selling item too, that quantity would be deducted twice
	from the same warehouse -- which is exactly what the PRE_PRODUCED /
	DIRECT_RETAIL `Material Issue` posting did before it was removed. The
	assertion below makes that shape unrepresentable, so the bug class cannot
	be reintroduced by a future caller or policy.
	"""
	items = []
	for row in payload.get("components") or []:
		if not row.get("item_code") or not row.get("s_warehouse") or flt(row.get("qty")) <= 0:
			raise FulfilmentPostingError("INVALID_STOCK_ROW", _("Frozen stock row is incomplete"))
		if row["item_code"] == payload.get("item_code"):
			raise FulfilmentPostingError(
				"SELF_ISSUE_NOT_ALLOWED",
				_(
					"Production posting for {0} may not issue the selling item itself; "
					"the sale deducts it at POS closing. Only BOM components may be consumed here."
				).format(payload.get("item_code")),
			)
		items.append(
			{
				"item_code": row["item_code"],
				"qty": flt(row["qty"]),
				"s_warehouse": row["s_warehouse"],
			}
		)
	if payload.get("production_policy") == MADE_TO_ORDER:
		# The finished good's warehouse is resolved once, at freeze time, from
		# the order-time production context (`_warehouse_for_context`) and
		# carried on the payload. It used to be read off components[0], which
		# happened to be right only because every component of one line shares
		# one warehouse today -- an accident that would break silently the
		# moment components can be sourced from more than one warehouse (e.g.
		# a central raw store). Read the resolved value; express the invariant
		# rather than depend on the coincidence.
		target_warehouse = payload.get("fg_warehouse")
		if not target_warehouse or not payload.get("item_code") or flt(payload.get("accepted_qty")) <= 0:
			raise FulfilmentPostingError("INVALID_STOCK_ROW", _("Frozen stock row is incomplete"))
		items.append(
			{
				"item_code": payload["item_code"],
				"qty": flt(payload["accepted_qty"]),
				"t_warehouse": target_warehouse,
				# ERPNext's Stock Entry.mark_finished_and_scrap_items() only
				# auto-infers is_finished_item from a linked work_order/bom_no
				# (see get_finished_item()); this is a hand-built ad-hoc entry
				# with neither, so without setting the flag explicitly ERPNext
				# rejects the submit with "There must be atleast 1 Finished
				# Good in this Stock Entry" even though the t_warehouse row is
				# present. Found live while verifying
				# tracks/sa-nontable-production-gap (the mocked unit tests
				# never exercised real Stock Entry validation).
				"is_finished_item": 1,
			}
		)
	return items


def _resolve_work_order_for_item(payload):
	"""Return (work_order_name, bom_no) for the KOT item row, or (None, None).

	`custom_ury_work_order` is written onto `URY KOT Items` by
	`ury_mto_work_order_service.create_work_orders_for_kot` at KOT submit
	time -- always before the posting intent is enqueued, so there is no
	race between the write and this read.

	Also reads the Work Order's `bom_no` so the Stock Entry can carry both
	links, which lets ERPNext's `mark_finished_and_scrap_items()` correctly
	auto-infer `is_finished_item` without needing the explicit flag.

	Returns (None, None) when the field does not exist on this site
	(pre-migration) or when no Work Order was created for the row (e.g. no
	active BOM). Never raises: the Stock Entry is still submitted without
	the links rather than blocking the posting worker.
	"""
	kot_item = payload.get("kot_item")
	if not kot_item:
		return None, None
	try:
		meta = frappe.get_meta("URY KOT Items")
		if not meta.has_field("custom_ury_work_order"):
			return None, None
		wo_name = frappe.db.get_value("URY KOT Items", kot_item, "custom_ury_work_order") or None
		if not wo_name:
			return None, None
		bom_no = frappe.db.get_value("Work Order", wo_name, "bom_no") or None
		return wo_name, bom_no
	except Exception:
		return None, None


def _submit_stock_entry(intent, payload):
	existing = intent.get("erpnext_stock_entry") or _find_existing_stock_entry(intent.name)
	if existing:
		return existing
	# This pipeline only ever emits `Manufacture` entries. The `Material
	# Issue` branch that used to live here existed solely to serve
	# PRE_PRODUCED and DIRECT_RETAIL, which post nothing at READY at all --
	# their finished-good stock is created ahead of time by the batch path,
	# or not produced at all, and either way the sale deducts it once at
	# closing. A non-MADE_TO_ORDER payload reaching here means an intent was
	# created that never should have been, so fail closed rather than guess a
	# purpose.
	if payload.get("production_policy") != MADE_TO_ORDER:
		raise FulfilmentPostingError(
			"UNSUPPORTED_PRODUCTION_POLICY",
			_(
				"Production posting is only defined for MADE_TO_ORDER items; "
				"{0} items are deducted by the sale at POS closing and post nothing here."
			).format(payload.get("production_policy") or "unconfigured"),
		)
	stock_entry_type = "Manufacture"
	wo_name, wo_bom_no = _resolve_work_order_for_item(payload)
	doc = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"company": payload["company"],
			"stock_entry_type": stock_entry_type,
			"purpose": stock_entry_type,
			"items": _stock_entry_items(payload),
			"remarks": "URY Fulfilment Posting Intent: {0}".format(intent.name),
			"custom_ury_posting_intent": intent.name,
			# Link to the Work Order created at KOT submit time (if any).
			# Read from the KOT item row rather than the frozen payload so
			# existing PENDING intents (whose JSON pre-dates this field) are
			# handled correctly without a payload migration.
			"work_order": wo_name,
			# bom_no from the Work Order lets ERPNext's
			# mark_finished_and_scrap_items() auto-infer is_finished_item
			# (matching the Work Order's production_item), so the
			# explicit is_finished_item=1 in _stock_entry_items acts as a
			# belt-and-suspenders guard for replays of pre-migration intents
			# that carry no Work Order link.
			"bom_no": wo_bom_no,
			# Standard ERPNext header fields for Manufacture entries
			"from_bom": 1 if wo_bom_no else 0,
			"from_warehouse": payload.get("fg_warehouse"),
			"to_warehouse": payload.get("fg_warehouse"),
			# ERPNext's validate_work_order() strictly requires
			# fg_completed_qty to be set on the header if work_order is linked
			# on a Manufacture SE. Without this, it throws "For Quantity
			# (Manufactured Qty) is mandatory", aborting the transaction and
			# preventing the reservation from being fulfilled.
			"fg_completed_qty": payload.get("accepted_qty") or 1,
			# Explicitly carry use_multi_level_bom = 0 to the Stock Entry just
			# in case ERPNext's getters attempt to re-evaluate the BOM.
			"use_multi_level_bom": 0,
		}
	)
	with _service_mutation():
		doc.insert(ignore_permissions=False)
		doc.submit()
	return doc.name


def _fulfil_reservation_once(payload):
	"""Fulfil THIS POSTING'S SHARE of its reservation group, exactly once.

	Delegates to the shared `fulfil_reservation_if_pending` guard rather than
	doing its own check-then-call: the consolidated Sales Invoice handler
	(`ury.ury.hooks.ury_sales_invoice.fulfil_reservations_on_consolidation`)
	fulfils the same groups at closing for every sale in both tiers, so the
	two can race on one group and BOTH must be no-ops on an already-Fulfilled
	group. Keeping one implementation of that rule means they cannot drift
	apart.

	B03b: the share, not the whole group. One group can cover several KOT items
	(an original line plus the delta KOT of a quantity bump -- see
	`_freeze_payload`), and each posts its own Stock Entry for its own
	quantity. Passing this posting's identity and quantity lets the guard
	accumulate them and flip the group to `Fulfilled` only once the last
	sharing KOT item has posted, instead of the first one closing the group and
	stranding its siblings with `RESERVATION_NOT_FOUND`.

	The contributor identity is the posting intent's `idempotency_key`, which
	is unique per (branch, kot, kot_item, accepted_revision,
	fulfilment_sequence) and stable across retries -- so a replayed worker
	contributes once, and two distinct KOT items never collide. The quantity is
	`accepted_qty`, in the same top-level item units as the group's reserved
	total.
	"""
	return fulfil_reservation_if_pending(
		payload["reservation_group"],
		contributor=payload.get("idempotency_key"),
		contributed_qty=payload.get("accepted_qty"),
	)


def _find_existing_fulfilment(payload):
	"""Locking existence check for an already-created URY Fulfilment Record,
	for the same reason as `_find_existing_stock_entry`: this table is not
	covered by `_claim_intent`'s lock on the posting intent row, so a plain
	`get_value` here can be served from this transaction's pinned consistent
	read view and miss a concurrent worker's already-committed record,
	risking a duplicate fulfilment record instead of updating the existing
	one.
	"""
	rows = frappe.db.sql(
		f"""
		SELECT name
		FROM `tab{FULFILMENT_DOCTYPE}`
		WHERE kot = %(kot)s AND item_code = %(item_code)s AND batch_key = %(batch_key)s
		ORDER BY creation DESC
		LIMIT 1
		FOR UPDATE
		""",
		{
			"kot": payload["kot"],
			"item_code": payload["item_code"],
			"batch_key": payload["idempotency_key"],
		},
		as_dict=True,
	)
	return rows[0]["name"] if rows else None


def _create_or_update_fulfilment(intent, payload, stock_entry):
	existing = intent.get("fulfilment_record") or _find_existing_fulfilment(payload)
	if existing:
		doc = frappe.get_doc(FULFILMENT_DOCTYPE, existing)
	else:
		doc = frappe.get_doc(
			{
				"doctype": FULFILMENT_DOCTYPE,
				"kot": payload["kot"],
				"item_code": payload["item_code"],
				"qty": payload["accepted_qty"],
				"reservation_ref": payload["reservation_group"],
				"fulfilment_type": MTO_LEGACY if payload["production_policy"] == MADE_TO_ORDER else payload["production_policy"],
				"batch_key": payload["idempotency_key"],
				"branch": payload["branch"],
				"company": payload["company"],
				"actor": payload.get("actor"),
				"fulfilled_at": now(),
			}
		)
	doc.posted_to_erpnext = 1
	doc.posting_reference = stock_entry
	if existing:
		with _service_mutation():
			doc.save(ignore_permissions=False)
	else:
		with _service_mutation():
			doc.insert(ignore_permissions=False)
	return doc.name


def _mark_failed(intent_name, error):
	doc = frappe.get_doc(INTENT_DOCTYPE, intent_name)
	doc.status = FAILED
	doc.last_error = str(error)
	doc.failure_class = getattr(error, "reason_code", error.__class__.__name__)
	max_attempts = int(doc.max_attempts or 0) or DEFAULT_MAX_ATTEMPTS
	if int(doc.attempts or 0) >= max_attempts:
		# Give up: this intent has exhausted its retry budget. Leave it FAILED
		# but not retryable so recover_pending_posting_intents stops
		# re-enqueuing it forever — it becomes a dead letter, visible for
		# manual intervention instead of retrying indefinitely.
		doc.retryable = 0
		doc.next_retry_at = None
	else:
		doc.retryable = 1
		doc.next_retry_at = add_to_date(now_datetime(), minutes=RETRY_MINUTES)
	doc.leased_until = None
	with _service_mutation():
		doc.save(ignore_permissions=False)
	return _intent_result(doc.as_dict(), idempotent=False)


def process_posting_intent(intent_name):
	"""Claim and post one fulfilment intent. Safe to replay."""
	intent = _claim_intent(intent_name)
	if not intent:
		return _intent_result(frappe.get_doc(INTENT_DOCTYPE, intent_name), idempotent=True)
	try:
		payload = _payload(intent)
		stock_entry = _submit_stock_entry(intent, payload)
		if not intent.get("erpnext_stock_entry"):
			intent.erpnext_stock_entry = stock_entry
			with _service_mutation():
				intent.save(ignore_permissions=False)
		with _service_mutation():
			_fulfil_reservation_once(payload)

		# Emit realtime events (cheap component-level + rich fan-out) for each
		# distinct component_item in the stock entry.
		# Wrap in try/except so a socketio failure never breaks the posting transaction.
		seen = set()
		for component in payload.get("components") or []:
			component_item = component.get("item_code")
			warehouse = component.get("s_warehouse")
			if not component_item or not warehouse:
				continue
			key = (component_item, warehouse)
			if key not in seen:
				try:
					publish_component_stock_fanout(
						component_item,
						warehouse,
						payload.get("company"),
						payload.get("branch"),
						department=payload.get("department"),
						logger_name="ury_fulfilment_posting_service",
					)
				except Exception:
					# Failure to publish is best-effort, fire-and-forget.
					frappe.logger("ury_fulfilment_posting_service").exception(
						"Failed to publish realtime fan-out for component {0}".format(component_item)
					)
				seen.add(key)

		fulfilment = _create_or_update_fulfilment(intent, payload, stock_entry)
		intent.fulfilment_record = fulfilment
		intent.erpnext_stock_entry = stock_entry
		intent.status = POSTED
		intent.posted_at = now()
		intent.posted_by = frappe.session.user
		intent.leased_until = None
		intent.last_error = None
		with _service_mutation():
			intent.save(ignore_permissions=False)
		return _intent_result(intent.as_dict(), idempotent=False)
	except Exception as exc:
		return _mark_failed(intent.name, exc)


def recover_pending_posting_intents(limit=100):
	"""Re-enqueue stale PENDING/FAILED/POSTING intents for recovery.

	FAILED intents that _mark_failed gave up on (retryable=0, having exceeded
	max_attempts) are dead letters: they are deliberately skipped here so they
	stop retrying forever and stay visible for manual intervention instead.
	"""
	candidates = frappe.get_all(
		INTENT_DOCTYPE,
		filters={"status": ["in", [PENDING, FAILED, POSTING]]},
		fields=["name", "status", "leased_until", "next_retry_at", "retryable"],
		limit=limit,
	)
	queued = []
	now_dt = now_datetime()
	for row in candidates:
		if row.get("status") == POSTING and row.get("leased_until") and frappe.utils.get_datetime(row.leased_until) > now_dt:
			continue
		if row.get("status") == FAILED and not row.get("retryable"):
			continue
		if row.get("status") == FAILED and row.get("next_retry_at") and frappe.utils.get_datetime(row.next_retry_at) > now_dt:
			continue
		enqueue_posting_intent(row.name)
		queued.append(row.name)
	return queued
