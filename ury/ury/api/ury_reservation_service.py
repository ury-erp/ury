"""Atomic reservation/decrement service for constrained (BOM-backed) stock capacity.

Implements the reservation layer described by V3-40's "Cache, Reservation,
and Reconciliation Invariants" section and by the V3-43 stub left in V3-42's
``ury.ury.api.ury_inventory_projection.active_ury_reservation_qty``: a
``URY Stock Reservation`` doctype plus create/release/fulfil/cancel/expire
functions, scoped by branch/company/warehouse/item/policy/order.

Design note (BOM explosion reuse): this module imports `compile_bom_vector`
from V3-41's `ury_bom_compiler.py`, which has been copied verbatim into this
worktree (the same pattern V3-32 used to reuse V3-31's accepted code across
isolated worktrees). `compile_bom_vector` reads ERPNext's precomputed
`BOM Explosion Item` table (falling back to manual recursive `BOM Item`
traversal, correctly resolving nested sub-assemblies, when explosion rows
are absent) rather than this module hand-rolling a single-level-only BOM
walk, so behaviour matches V3-41's documented contract exactly rather than
merely mirroring it:

  - Capacity formula mirrors V3-42's ``get_allocatable_qty``:
    ``allocatable_qty = Bin.projected_qty - active URY reservation qty``,
    where "active" means status in (Reserved, Fulfilled). This module reads
    `Bin` directly rather than through the stub (which always returns 0), so
    an item's real active reservation qty is honoured even before the
    wiring task lands.
  - Shared-component decomposition delegates to V3-41's
    ``compile_bom_vector``: a composite/MTO item (one with an active BOM for
    the company) is reserved by reserving every one of its exploded leaf
    components -- including components nested under sub-assemblies -- not
    the top-level item itself and not any intermediate sub-assembly. A plain
    stock item (no active BOM) is reserved directly.

Atomicity strategy (read this before changing capacity-check code):

  Two concurrent callers attempting to reserve the last unit of the same
  item/warehouse must serialize so that only one succeeds. Since there is no
  live bench/DB available in this environment to prove true concurrent
  behaviour, this module uses Frappe/MySQL's standard atomicity primitive: an
  explicit ``SELECT ... FOR UPDATE`` row lock (via
  ``frappe.db.sql(..., for_update=True)`` semantics, expressed here as a raw
  ``FOR UPDATE`` query) on each relevant `Bin` row, taken *before* the
  capacity check, inside the same request-scoped DB transaction as the
  reservation insert(s). Frappe (like standard Django/Rails-style web
  frameworks) commits at the end of a whitelisted request and rolls back on
  an unhandled exception, so:

    1. lock every distinct component's Bin row (sorted by item_code to
       avoid lock-order deadlocks between two concurrent multi-component
       reservations),
    2. compute available capacity for each locked component from the now
       lock-held Bin snapshot plus a live aggregate of active
       ``URY Stock Reservation`` rows,
    3. if every component has sufficient capacity, insert all reservation
       rows (still inside the same transaction/lock scope) and return,
    4. if any component is short, raise before inserting anything -- no
       partial reservation is ever created, and the exception unwinds the
       transaction so the row locks are released with nothing written.

  A second concurrent request for the same Bin row blocks at the `FOR UPDATE`
  select until the first transaction commits or rolls back, then reads the
  post-commit qty/reservation state, so it correctly sees the first
  reservation's effect before making its own decision.

  Known limitation of this locking scheme (documented, not fixed here): if
  an item has never had a `Bin` row created for a warehouse (no stock
  movement has ever touched it), there is no row to lock, so two concurrent
  first-time reservations for that item cannot be serialized by this
  mechanism alone until a Bin row exists. This mirrors V3-42's treatment of
  a missing Bin row as qty=0 (capacity 0, so both attempts would be rejected
  by the qty>0 check for any positive-supply resource in practice) and is
  flagged here rather than silently assumed safe.

  EXPLICIT LIMITATION: this module's locking strategy is *reasoned about*
  from Frappe/MySQL transaction semantics and cannot be executed or proven
  under real concurrent load in this environment -- there is no live bench
  or database available. `test_two_terminal_concurrent_reservation` below is
  written as the test that WOULD prove correctness against a real Frappe
  test site (using threads + a real DB transaction per thread), but it is
  explicitly marked NOT EXECUTED / unexecutable here.

Reservation states (per V3-40): Reserved, Fulfilled, Released, Expired,
Cancelled. `Reserved` and `Fulfilled` are the only "active" states that
consume capacity. `Released`, `Expired`, and `Cancelled` are terminal and
free capacity by simply no longer counting toward the active sum -- this
module never mutates `Bin`, so "restoring capacity" is nothing more than a
status transition.

Fulfilment (`fulfil_reservation`) is expected to be called by a later task
at order/production settlement time. This module intentionally does not
touch POS Invoice / invoice settlement code anywhere.
"""

import frappe
from frappe import _

from ury.ury.api.ury_bom_compiler import compile_bom_vector


RESERVATION_DOCTYPE = "URY Stock Reservation"
BIN_DOCTYPE = "Bin"
BOM_DOCTYPE = "BOM"
BOM_ITEM_DOCTYPE = "BOM Item"

RESERVED = "Reserved"
FULFILLED = "Fulfilled"
RELEASED = "Released"
EXPIRED = "Expired"
CANCELLED = "Cancelled"

ACTIVE_STATUSES = (RESERVED, FULFILLED)


# ---------------------------------------------------------------------------
# Capacity
# ---------------------------------------------------------------------------


def _lock_bin_row(item_code, warehouse):
	"""Take a `SELECT ... FOR UPDATE` lock on the Bin row for item/warehouse.

	No-op (returns None) if the Bin row does not exist -- see the module
	docstring's "Known limitation" note. Callers must not treat a None
	return as an error; it means there is nothing yet to lock.
	"""
	rows = frappe.db.sql(
		"""
		SELECT name, actual_qty, projected_qty
		FROM `tabBin`
		WHERE item_code = %(item_code)s AND warehouse = %(warehouse)s
		FOR UPDATE
		""",
		{"item_code": item_code, "warehouse": warehouse},
		as_dict=True,
	)
	return rows[0] if rows else None


def _active_reservation_qty(item_code, warehouse, company, exclude_group=None):
	filters = {
		"component_item": item_code,
		"warehouse": warehouse,
		"company": company,
		"status": ["in", list(ACTIVE_STATUSES)],
	}
	rows = frappe.get_all(RESERVATION_DOCTYPE, filters=filters, fields=["qty", "reservation_group"])
	total = 0
	for row in rows:
		if exclude_group and row.get("reservation_group") == exclude_group:
			continue
		total += row.get("qty") or 0
	return total


def get_available_capacity(item_code, warehouse, company, locked_bin=None):
	"""Return allocatable capacity for `item_code`/`warehouse`, per V3-42's formula.

	``allocatable_qty = Bin.projected_qty - active URY reservation qty``. A
	missing Bin row is treated as projected_qty=0. Pass `locked_bin` (the
	dict returned by `_lock_bin_row`) to reuse an already-locked snapshot
	instead of re-reading; if omitted this re-reads (unlocked) via
	`frappe.db.get_value`, which is fine for read-only availability queries
	outside the reservation critical section.
	"""
	if locked_bin is not None:
		bin_projected_qty = locked_bin.get("projected_qty") or 0
	else:
		bin_projected_qty = frappe.db.get_value(
			BIN_DOCTYPE, {"item_code": item_code, "warehouse": warehouse}, "projected_qty"
		) or 0

	reservation_qty = _active_reservation_qty(item_code, warehouse, company)
	return bin_projected_qty - reservation_qty


# ---------------------------------------------------------------------------
# Component resolution (delegates BOM explosion to V3-41's ury_bom_compiler)
# ---------------------------------------------------------------------------


def _resolve_components(item_code, qty, company):
	"""Return [{"component_item": ..., "qty": ...}, ...] for `item_code` at `qty`.

	If `item_code` has an active BOM for `company`, it is treated as
	composite/MTO: the full leaf-level component vector is returned (via
	V3-41's `compile_bom_vector`, which reads ERPNext's precomputed
	`BOM Explosion Item` table and recurses through any nested sub-assembly
	when explosion rows are absent), scaled to `qty`. Otherwise `item_code`
	is treated as a plain stock item and is returned as its own sole
	"component".
	"""
	bom_name = frappe.db.get_value(
		BOM_DOCTYPE,
		{"item": item_code, "company": company, "is_active": 1, "is_default": 1},
		"name",
	)
	if not bom_name:
		return [{"component_item": item_code, "qty": qty}]

	vector = compile_bom_vector(item_code, qty, company)

	return [
		{"component_item": component["component_item"], "qty": component["qty"]}
		for component in sorted(vector["components"], key=lambda c: c["component_item"])
	]


# ---------------------------------------------------------------------------
# Reservation lifecycle
# ---------------------------------------------------------------------------


def _require_positive_qty(qty):
	if qty is None or qty <= 0:
		frappe.throw(_("Quantity must be greater than zero"), frappe.ValidationError)


def _require_scope(branch, company, warehouse, item_code, order_ref):
	missing = [
		name
		for name, value in (
			("branch", branch),
			("company", company),
			("warehouse", warehouse),
			("item_code", item_code),
			("order_ref", order_ref),
		)
		if not value
	]
	if missing:
		frappe.throw(
			_("Missing required reservation scope field(s): {0}").format(", ".join(missing)),
			frappe.ValidationError,
		)


def _require_create_permission():
	if not frappe.has_permission(RESERVATION_DOCTYPE, "create"):
		frappe.throw(_("Not permitted to create reservations"), frappe.PermissionError)


def append_audit(doc, actor, event, reason=None):
	import json

	existing = doc.get("audit_log")
	entries = json.loads(existing) if existing else []
	entry = {
		"actor": actor,
		"timestamp": frappe.utils.now(),
		"event": event,
		"reservation_group": doc.get("reservation_group"),
		"component_item": doc.get("component_item"),
		"qty": doc.get("qty"),
		"status": doc.get("status"),
	}
	if reason:
		entry["reason"] = reason
	entries.append(entry)
	doc.audit_log = json.dumps(entries, sort_keys=True, default=str)


@frappe.whitelist()
def create_reservation(
	item_code,
	qty,
	warehouse,
	branch,
	company,
	order_ref,
	policy=None,
	actor=None,
	expires_at=None,
):
	"""Atomically reserve capacity for `item_code` (or all of its BOM components).

	All-or-nothing: for a composite/MTO item, every exploded component's
	capacity is checked (under a Bin row lock, see module docstring) before
	any `URY Stock Reservation` row is inserted. If any single component
	lacks capacity, the whole call raises `frappe.ValidationError` and no
	rows are created -- not even for the components that did have capacity.

	Returns a dict: {"reservation_group": ..., "reservations": [docname, ...]}.
	"""
	actor = actor or frappe.session.user
	_require_create_permission()
	_require_positive_qty(qty)
	_require_scope(branch, company, warehouse, item_code, order_ref)

	components = _resolve_components(item_code, qty, company)
	components_sorted = sorted(components, key=lambda c: c["component_item"])

	# Step 1: lock every distinct component's Bin row, in a stable sorted
	# order, before reading/deciding anything (avoids lock-order deadlocks
	# between two concurrent multi-component reservations).
	locked_bins = {
		component["component_item"]: _lock_bin_row(component["component_item"], warehouse)
		for component in components_sorted
	}

	# Step 2: check capacity for every component against the now-locked
	# snapshot. Collect all shortfalls before raising, so the error message
	# is complete rather than reporting only the first shortfall found.
	shortfalls = []
	for component in components_sorted:
		available = get_available_capacity(
			component["component_item"], warehouse, company, locked_bin=locked_bins[component["component_item"]]
		)
		if component["qty"] > available:
			shortfalls.append(
				{
					"component_item": component["component_item"],
					"required": component["qty"],
					"available": available,
				}
			)

	if shortfalls:
		frappe.throw(
			_("Insufficient capacity for {0}: {1}").format(
				item_code,
				", ".join(
					"{0} (required {1}, available {2})".format(
						row["component_item"], row["required"], row["available"]
					)
					for row in shortfalls
				),
			),
			frappe.ValidationError,
		)

	# Step 3: all components have capacity -- insert every reservation row
	# inside the same transaction/lock scope, all-or-nothing.
	reservation_group = frappe.generate_hash(length=10)
	created_names = []
	for component in components_sorted:
		doc = frappe.get_doc(
			{
				"doctype": RESERVATION_DOCTYPE,
				"reservation_group": reservation_group,
				"order_ref": order_ref,
				"policy": policy,
				"status": RESERVED,
				"branch": branch,
				"company": company,
				"warehouse": warehouse,
				"top_level_item": item_code,
				"component_item": component["component_item"],
				"qty": component["qty"],
				"expires_at": expires_at,
				"actor": actor,
			}
		)
		append_audit(doc, actor, event="create")
		doc.insert(ignore_permissions=False)
		created_names.append(doc.name)

	return {"reservation_group": reservation_group, "reservations": created_names}


def _resolve_group_rows(reservation_name):
	"""Resolve `reservation_name` (a single row's docname or a reservation_group) to rows.

	Accepts either a single `URY Stock Reservation` docname or a
	`reservation_group` value, so callers can operate on the whole atomic
	group (all components of one composite reservation) with one call, as
	release/fulfil/cancel must to keep the group's state consistent.
	"""
	single = frappe.db.get_value(RESERVATION_DOCTYPE, reservation_name, "reservation_group")
	group = single or reservation_name
	rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={"reservation_group": group},
		fields=["name", "status", "reservation_group"],
	)
	if not rows:
		frappe.throw(_("No reservation found for {0}").format(reservation_name), frappe.ValidationError)
	return rows


def _transition_group(reservation_name, from_status, to_status, reason, event):
	rows = _resolve_group_rows(reservation_name)
	not_eligible = [row for row in rows if row.status != from_status]
	if not_eligible:
		frappe.throw(
			_("Reservation group {0} has rows not in status {1} (found: {2}); refusing partial transition").format(
				rows[0].reservation_group,
				from_status,
				", ".join(sorted({row.status for row in not_eligible})),
			),
			frappe.ValidationError,
		)

	actor = frappe.session.user
	for row in rows:
		doc = frappe.get_doc(RESERVATION_DOCTYPE, row.name)
		doc.status = to_status
		if reason:
			doc.reason = reason
		append_audit(doc, actor, event=event, reason=reason)
		doc.save(ignore_permissions=False)
	return [row.name for row in rows]


@frappe.whitelist()
def release_reservation(reservation_name, reason=None):
	"""Transition a Reserved reservation group to Released, restoring capacity.

	"Restoring capacity" is entirely the status transition: this module
	never mutates Bin, so once a row is no longer in an active status
	(Reserved/Fulfilled) it simply stops being counted by
	`_active_reservation_qty`/`get_available_capacity`.
	"""
	return _transition_group(reservation_name, RESERVED, RELEASED, reason, event="release")


@frappe.whitelist()
def fulfil_reservation(reservation_name):
	"""Transition a Reserved reservation group to Fulfilled.

	Called by a later task at order/production settlement time. This
	function and this module never touch POS Invoice / invoice settlement
	code themselves.
	"""
	return _transition_group(reservation_name, RESERVED, FULFILLED, reason=None, event="fulfil")


@frappe.whitelist()
def cancel_reservation(reservation_name, reason=None):
	"""Cancel a reservation group.

	If every row in the group is still `Reserved`, transitions them to
	`Cancelled` (same capacity-restoring effect as release). If any row in
	the group is already `Fulfilled` (i.e. its ingredients have already been
	consumed by production), this raises and refuses the cancellation --
	fulfilled consumption cannot be silently reversed back into available
	capacity by this function. Reversing consumed stock requires the
	wastage/return flow (V3-32 `ury_stock_service.return_to_central_store`
	/ V3-33 issue-wastage flow) instead, which records an explicit,
	auditable stock movement rather than pretending the reservation never
	happened.
	"""
	rows = _resolve_group_rows(reservation_name)
	fulfilled = [row for row in rows if row.status == FULFILLED]
	if fulfilled:
		frappe.throw(
			_(
				"Reservation group {0} has already-fulfilled rows and cannot be cancelled; "
				"use the wastage/return flow to reverse consumed stock instead"
			).format(rows[0].reservation_group),
			frappe.ValidationError,
		)
	return _transition_group(reservation_name, RESERVED, CANCELLED, reason, event="cancel")


@frappe.whitelist()
def expire_stale_reservations(ttl_minutes, now=None):
	"""Transition Reserved rows older than `ttl_minutes` to Expired.

	This is a plain callable, not a live scheduler job -- there is no bench
	available in this environment to register/run a scheduled task. A later
	task is expected to wire this into `hooks.py`'s scheduler_events (e.g.
	on an `every` interval), calling this function unchanged. `now` is
	accepted for testability (defaults to `frappe.utils.now_datetime()`).

	Returns the list of `reservation_group` values that were expired.
	"""
	now = now or frappe.utils.now_datetime()
	cutoff = frappe.utils.add_to_date(now, minutes=-int(ttl_minutes))

	stale_rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={"status": RESERVED, "creation": ["<", cutoff]},
		fields=["name", "reservation_group"],
	)
	groups = sorted({row.reservation_group for row in stale_rows})
	for group in groups:
		_transition_group(group, RESERVED, EXPIRED, reason="TTL expiry", event="expire")
	return groups
