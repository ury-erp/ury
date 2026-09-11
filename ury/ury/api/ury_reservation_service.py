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
    ``compile_bom_vector``: a MADE_TO_ORDER item (per its resolved
    `production_policy`, mirroring `ury_availability.py`'s own policy-driven
    branching -- NOT merely "has an active BOM") is reserved by reserving
    every one of its exploded leaf components -- including components nested
    under sub-assemblies -- not the top-level item itself and not any
    intermediate sub-assembly. A PRE_PRODUCED/DIRECT_RETAIL item is reserved
    directly against its own finished-goods stock, even when it has an
    active BOM (the BOM documents the recipe but is not what's checked at
    sale time). A caller that supplies no `production_policy` at all falls
    back to the legacy has-active-BOM heuristic (logged) for backward
    compatibility with genuinely unconfigured items -- see
    `_resolve_components`.

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
       lock-held Bin snapshot plus a **read-committed** aggregate of active
       ``URY Stock Reservation`` rows, taken on a short-lived second DB
       connection -- see the CRITICAL note below; a plain read on the
       request's own connection is NOT sufficient and caused a live oversell,
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

  CRITICAL -- the Bin ``FOR UPDATE`` alone is NOT sufficient, and assuming it
  was caused a live-reproduced oversell. Under MariaDB/MySQL's default
  REPEATABLE READ, a transaction's consistent-read snapshot is established at
  its *first plain (non-locking) read* and is never re-armed -- not by a
  subsequent ``SELECT ... FOR UPDATE``, not by acquiring any lock.
  `create_reservation` performs several plain reads before it locks the Bin
  row (permission check, scope check, and `_resolve_components`' BOM/company
  lookups), so its snapshot is already pinned by the time the Bin lock is
  taken. The Bin lock does serialize the transactions correctly -- but a
  *plain* re-read of the reservation rows afterwards still returns that
  pre-lock snapshot, so each queued transaction computes capacity as though no
  sibling reservation exists.

  Live reproduction (bench `sa-prodctrl-unif-live`, 16 concurrent OS
  processes, two MADE_TO_ORDER items sharing raw component GLMR with 5.0
  units in stock): all 16 calls succeeded, reserving 16.0 units against 5.0.
  The same two-call scenario run *sequentially* correctly rejected the
  over-limit call, isolating the fault to snapshot staleness rather than the
  capacity formula.

  The fix: step 2's reservation-sum is read on a short-lived second DB
  connection (`_active_reservation_qty(..., read_committed=True)`), giving that
  one query its own transaction and its own fresh read view, so it sees every
  reservation committed up to that instant. The caller's transaction is not
  committed, rolled back, or otherwise disturbed. This is sound precisely
  because the Bin ``FOR UPDATE`` (unchanged) already grants mutual exclusion:
  while this transaction holds it, no competing reservation transaction can be
  between its own Bin lock and its commit for that component, so there is no
  phantom window for the fresh read to miss.

  ...and the fix to the fix: a second connection is a second *transaction*, so
  it is blind to the CALLING transaction's own uncommitted writes, which the
  plain read always saw. Taking the fresh connection's answer as the whole
  truth traded one oversell for another and broke an everyday non-concurrent
  flow as well (both live-reproduced): a multi-line order's second
  `create_reservation` could not see the first line's uncommitted insert
  (oversell), and `_reconcile_line`'s release-then-recreate could not see its
  own uncommitted release, so a quantity edit was counted against itself and
  hard-rejected with "Insufficient capacity". The reservation-sum is therefore
  neither view alone but a reconciliation of the two per row name --
  `latest-committed-by-everyone-else` UNION `this transaction's own
  uncommitted delta`. See `_reconciled_active_rows` for the exact case
  analysis and the two insert-only/qty-immutable invariants it relies on.

  Two alternatives were tried and rejected on evidence -- see
  `_active_reservation_qty`'s docstring before changing this. In short: making
  the sum a ``SELECT ... FOR UPDATE`` removed the oversell but made MariaDB
  fail 15 of 16 concurrent calls with ``QueryDeadlockError (1020, "Record has
  changed since last read")``, because MariaDB refuses a locking read of rows
  committed after an existing read view; and committing / changing isolation
  to force a fresh read view would break the all-or-nothing multi-line
  guarantee of `ury_order_reservation_service.reconcile_order_reservations`,
  which calls this function several times inside one transaction.

  `component_item` carries a `search_index` so the reservation-sum query uses
  an index range rather than a full table scan. Do not weaken the Bin lock.

  `test_two_terminal_concurrent_reservation` below remains marked NOT EXECUTED
  because a unit test in a single process cannot prove cross-connection
  transaction behaviour -- and note that this is precisely why the bug above
  survived: no mocked or sequential test could ever have caught it. Real
  proof for this module's concurrency claims comes only from the live
  multi-process bench run documented above and in the track's
  live-bench-test-results files.

Reservation states (per V3-40): Reserved, Fulfilled, Released, Expired,
Cancelled. Only `Reserved` consumes *reserved* capacity. `Fulfilled` means
the underlying stock movement has already consumed inventory and must not be
counted again, otherwise availability is deducted twice.

Fulfilment (`fulfil_reservation`) is expected to be called by a later task
at order/production settlement time. This module intentionally does not
touch POS Invoice / invoice settlement code anywhere.
"""

from contextlib import contextmanager

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.api.ury_bom_compiler import compile_bom_vector, publish_component_stock_fanout
from ury.ury.api.ury_sales_plan_commit import apply_commit_delta

# Slack allowed when comparing a required quantity against available capacity,
# to absorb binary-float drift in accumulated BOM quantities. One millionth of
# a stock unit is orders of magnitude below any real sellable quantity, so this
# cannot admit a meaningful oversell, while it does stop an order that exactly
# fits the remaining capacity from being rejected.
QTY_TOLERANCE = 1e-6


RESERVATION_DOCTYPE = "URY Stock Reservation"
BIN_DOCTYPE = "Bin"
BOM_DOCTYPE = "BOM"
BOM_ITEM_DOCTYPE = "BOM Item"

# Mirrors ury_availability.py's policy constants. A PRE_PRODUCED/DIRECT_RETAIL
# item is sold from its own finished-goods stock, never from raw-component
# stock, even when it has an active BOM (the BOM merely documents the
# recipe -- see `_resolve_components` below).
POLICY_PRE_PRODUCED = "PRE_PRODUCED"
POLICY_MADE_TO_ORDER = "MADE_TO_ORDER"
POLICY_DIRECT_RETAIL = "DIRECT_RETAIL"

RESERVED = "Reserved"
FULFILLED = "Fulfilled"
RELEASED = "Released"
EXPIRED = "Expired"
CANCELLED = "Cancelled"

ACTIVE_STATUSES = (RESERVED,)


def _best_effort_department(item_code, branch):
	"""Best-effort department lookup for the H1 fan-out event payload only.

	Looks up the active `URY Item Production Configuration` mapping for
	`item_code`/`branch`. This is deliberately a plain, non-raising lookup
	(unlike `ury_kot_routing.resolve_production_units`, which fails closed
	on ambiguity/missing config for routing purposes) -- department here is
	informational context on a best-effort realtime event, not something a
	stock mutation should ever be blocked or failed by. Returns None on any
	ambiguity, absence, or lookup error.
	"""
	try:
		rows = frappe.get_all(
			"URY Item Production Configuration",
			filters={"item": item_code, "branch": branch, "active": 1},
			pluck="department",
			limit=1,
		)
		return rows[0] if rows else None
	except Exception:
		frappe.logger("ury_reservation_service").exception(
			"Failed to resolve department for item {0} branch {1}".format(item_code, branch)
		)
		return None


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


_RESERVATION_SUM_SQL = """
	SELECT name, qty, reservation_group
	FROM `tabURY Stock Reservation`
	WHERE component_item = %(item_code)s
	  AND warehouse = %(warehouse)s
	  AND company = %(company)s
	  AND status IN %(statuses)s
"""

_RESERVATION_EXISTS_SQL = """
	SELECT name
	FROM `tabURY Stock Reservation`
	WHERE name IN %(names)s
"""


@contextmanager
def committed_read_connection():
	"""Yield a short-lived second DB connection with its own fresh read view.

	Opening a separate connection gives its queries their own transaction and
	therefore their own read view, so they observe every reservation committed
	up to that instant -- independent of the calling transaction's (already
	stale) REPEATABLE READ view. The caller's transaction is left completely
	untouched: nothing is committed, rolled back, or locked on it.

	Open this ONCE per critical section and thread it through, rather than
	once per component: `create_reservation` performs this read while holding
	`SELECT ... FOR UPDATE` on every component's Bin row, and each connect is
	a full TCP connect + MySQL auth handshake. Opening one per component put N
	handshakes inside the lock critical section for an N-component MTO item,
	extending lock hold time and cutting reservation throughput under
	contention for no benefit -- the connection is stateless with respect to
	the component being read.

	Reusing it across components does pin ITS read view at its first read, so
	later components are read from that instant rather than from a brand new
	one. That is sound here and only here: `create_reservation` locks EVERY
	component's Bin row before performing any of these reads, so from the
	first read onward no other reservation transaction can commit a row for
	any component in the set. It must not be hoisted any wider than one
	`create_reservation` call -- in particular not across the lines of
	`reconcile_order_reservations`, whose lock sets differ per line.

	See `_active_reservation_qty` for why a second connection is required at
	all, and why the two more obvious alternatives are not usable here.
	"""
	from frappe.database import get_db

	conf = frappe.conf
	conn = get_db(
		socket=conf.db_socket,
		host=conf.db_host,
		port=conf.db_port,
		user=conf.db_name,
		password=conf.db_password,
		cur_db_name=conf.db_name,
	)
	try:
		conn.connect()
		yield conn
	finally:
		try:
			conn.close()
		except Exception:
			frappe.logger("ury_reservation_service").exception(
				"Failed to close read-committed reservation connection"
			)


def _committed_active_rows(conn, item_code, warehouse, company):
	"""Active reservation rows for the component as of latest commit."""
	return conn.sql(
		_RESERVATION_SUM_SQL,
		{
			"item_code": item_code,
			"warehouse": warehouse,
			"company": company,
			"statuses": list(ACTIVE_STATUSES),
		},
		as_dict=True,
	)


def _own_active_rows(item_code, warehouse, company):
	"""Active reservation rows for the component as this transaction sees them.

	i.e. this transaction's pinned REPEATABLE READ snapshot *plus* its own
	uncommitted inserts and status changes, which are exactly what the
	committed view above cannot see.
	"""
	return frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={
			"component_item": item_code,
			"warehouse": warehouse,
			"company": company,
			"status": ["in", list(ACTIVE_STATUSES)],
		},
		fields=["name", "qty", "reservation_group"],
	)


def _reconciled_active_rows(conn, item_code, warehouse, company):
	"""Active reservation rows as of *now*, including this transaction's own writes.

	Neither available view is sufficient on its own:

	  - the committed view (fresh connection) sees everyone else's latest
	    committed state but is blind to the calling transaction's own
	    uncommitted INSERTs and RELEASEs -- it is a different transaction;
	  - the own view (`frappe.get_all` on the request's connection) sees this
	    transaction's own uncommitted writes perfectly, but its committed
	    baseline is the transaction's stale snapshot.

	The truth is `latest-committed-by-everyone-else` UNION
	`this-transaction's-own-uncommitted-delta`, and it is recovered here by
	reconciling the two views per row name. Reservation rows are insert-only
	(nothing in this app deletes a `URY Stock Reservation` row) and `qty` is
	never mutated after insert -- only `status` moves -- so every row name
	falls into exactly one of four cases:

	  1. active in BOTH views -> genuinely active. Count it.
	  2. active in own view, absent from the committed active set -> either
	     (a) this transaction's own uncommitted INSERT (the row does not exist
	     at all on the other connection), which must be counted, or (b) a row
	     someone else released and committed after our snapshot (the row does
	     exist, just not active), which must not be. One keyed existence probe
	     on the committed connection separates them exactly.
	  3. active in the committed set, not active in own view -> either (a) a
	     row someone else inserted and committed after our snapshot (absent
	     from our snapshot entirely), which must be counted, or (b) a row THIS
	     transaction just released, uncommitted (present in our view, inactive)
	     which must not be. One keyed probe on our own connection, unfiltered
	     by status, separates them exactly.
	  4. active in neither -> not counted.

	Both symmetric-difference sets are tiny (they contain only rows written
	since the snapshot), so the two probes are keyed primary-key lookups over
	a handful of names, and are skipped entirely when a difference is empty.
	"""
	own = {row["name"]: row for row in _own_active_rows(item_code, warehouse, company)}
	committed = {row["name"]: row for row in _committed_active_rows(conn, item_code, warehouse, company)}

	resolved = {}
	for name, row in committed.items():
		if name in own:
			resolved[name] = row  # case 1

	# Case 2: active for us, not in the committed active set.
	own_only = [name for name in own if name not in committed]
	if own_only:
		exists_committed = {
			r["name"]
			for r in conn.sql(_RESERVATION_EXISTS_SQL, {"names": own_only}, as_dict=True)
		}
		for name in own_only:
			if name not in exists_committed:
				# Our own uncommitted insert.
				resolved[name] = own[name]

	# Case 3: active per latest commit, not active for us.
	committed_only = [name for name in committed if name not in own]
	if committed_only:
		exists_own = {
			r["name"]
			for r in frappe.get_all(
				RESERVATION_DOCTYPE, filters={"name": ["in", committed_only]}, fields=["name"]
			)
		}
		for name in committed_only:
			if name not in exists_own:
				# Committed by someone else after our snapshot was pinned.
				resolved[name] = committed[name]

	return list(resolved.values())


def _active_reservation_qty(
	item_code, warehouse, company, exclude_group=None, read_committed=False, committed_conn=None
):
	"""Sum active reservation qty for `item_code`/`warehouse`/`company`.

	`read_committed=True` reconciles the request's own view with a read on a
	short-lived second DB connection (see `_reconciled_active_rows`), so the
	sum is `latest-committed-by-everyone-else` UNION `this transaction's own
	uncommitted delta`. Pass an already-open `committed_conn` to reuse one
	connection across the components of a single critical section. This MUST
	be used by the
	reservation critical section (`create_reservation`), where it is a
	correctness requirement, not a performance knob -- it is the fix for a
	live-reproduced oversell:

	  MariaDB/MySQL default to REPEATABLE READ, where a transaction's
	  consistent read view is established at its *first plain (non-locking)
	  read* and is never re-armed afterwards -- not by a later
	  ``SELECT ... FOR UPDATE``, and not by acquiring any lock.
	  `create_reservation` runs several plain reads before it locks the Bin
	  row (`_require_create_permission`, `_require_scope`, and
	  `_resolve_components`' BOM/company lookups), so the read view is already
	  pinned by the time `_lock_bin_row` runs. The Bin ``FOR UPDATE`` does
	  serialize the transactions correctly (confirmed live via reservation
	  timestamps) -- but a plain re-read of the reservation rows afterwards
	  still returns that pre-lock read view, so each queued transaction
	  computed capacity as though no sibling reservation existed. Live result:
	  16 concurrent calls against 5.0 units of stock and all 16 succeeded.

	Why a second connection, rather than the two more obvious fixes -- both of
	which were tried and rejected on evidence, so please do not "simplify"
	this back into either of them:

	  1. Making this a locking read (``SELECT ... FOR UPDATE``) does NOT work
	     on MariaDB here. Live re-test: the oversell was indeed gone, but 15 of
	     16 concurrent calls died with
	     ``QueryDeadlockError (1020, "Record has changed since last read in
	     table 'tabURY Stock Reservation'")`` instead of the intended
	     "Insufficient capacity". MariaDB refuses a locking read of a row that
	     was committed after the transaction's existing read view, rather than
	     silently reading the latest version. Since the stale read view is the
	     very condition we are trying to work around, a locking read cannot
	     escape it -- it just converts a silent oversell into a storm of
	     spurious transient failures on the money path.
	  2. Committing (or resetting the isolation level) to force a fresh read
	     view is not permissible here, because `create_reservation` is called
	     from inside a larger transaction:
	     `ury_order_reservation_service.reconcile_order_reservations` releases
	     and re-creates reservations for several order lines in ONE
	     transaction and documents an explicit all-or-nothing guarantee
	     ("either the whole batch passes and is applied, or nothing in this
	     call is mutated"). A commit here would make earlier lines' mutations
	     permanent and destroy that guarantee. A mid-transaction
	     ``SET SESSION TRANSACTION ISOLATION LEVEL`` is also unreliable -- it
	     applies from the next transaction, so it would not affect the
	     in-flight one anyway.

	The second connection is safe precisely because the Bin row's
	``SELECT ... FOR UPDATE`` (taken before this read, and deliberately left
	untouched) already grants mutual exclusion: while this transaction holds
	that lock, no other reservation transaction can be between its own Bin
	lock and its commit for the same component. So "latest committed" read on
	a fresh connection is exactly the true current state, with no phantom
	window, and it takes no gap locks -- which is why it does not reintroduce
	the deadlocks of option 1.

	But the second connection is a *different transaction*, so on its own it
	is also blind to the CALLING transaction's own uncommitted writes -- which
	the plain read always saw. Taking its result as the whole answer was a
	regression in both directions, and both were live-reproduced:

	  - own uncommitted INSERTs invisible => intra-transaction oversell.
	    `reconcile_order_reservations` makes N `create_reservation` calls in
	    ONE transaction; line 2's check could not see line 1's just-inserted
	    reservation, so every line saw a world with no siblings. Live: two
	    reservations of 25.9 both accepted against a capacity of 49.8.
	  - own uncommitted RELEASEs invisible => spurious hard rejection.
	    `_reconcile_line` releases a line's group and immediately re-creates
	    it at the new quantity in the same transaction; the released rows
	    still read as `Reserved` on the fresh connection, so the replacement
	    was counted against itself. Live: releasing a full-capacity 49.8
	    reservation and re-requesting 49.8 threw "available 0.0".

	Hence `read_committed=True` does not read *only* on the second connection:
	it reconciles both views per row name (`_reconciled_active_rows`), which
	recovers `latest-committed-by-everyone-else UNION own uncommitted delta`
	exactly. See that function for the four-case argument.

	Read-only availability queries outside the reservation critical section
	keep the default `read_committed=False` plain read on the request's own
	connection: they are not serialized by any Bin lock, they must not pay for
	an extra connection, and a slightly stale read is harmless for a display
	hint.
	"""
	if read_committed:
		if committed_conn is not None:
			rows = _reconciled_active_rows(committed_conn, item_code, warehouse, company)
		else:
			with committed_read_connection() as conn:
				rows = _reconciled_active_rows(conn, item_code, warehouse, company)
	else:
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


def get_available_capacity(
	item_code, warehouse, company, locked_bin=None, read_committed=False, committed_conn=None
):
	"""Return allocatable capacity for `item_code`/`warehouse`, per V3-42's formula.

	``allocatable_qty = Bin.projected_qty - active URY reservation qty``. A
	missing Bin row is treated as projected_qty=0. Pass `locked_bin` (the
	dict returned by `_lock_bin_row`) to reuse an already-locked snapshot
	instead of re-reading; if omitted this re-reads (unlocked) via
	`frappe.db.get_value`, which is fine for read-only availability queries
	outside the reservation critical section.

	`read_committed` is forwarded to `_active_reservation_qty`: pass True from
	inside the reservation critical section (after the Bin lock) so the
	reservation-sum is read on a fresh connection and therefore sees
	latest-committed data rather than this transaction's already-stale
	REPEATABLE READ read view. See `_active_reservation_qty`'s docstring for
	the full rationale and for the two alternatives that were tried and
	rejected. Read-only availability callers leave it False.
	"""
	if locked_bin is not None:
		bin_projected_qty = locked_bin.get("projected_qty") or 0
	else:
		bin_projected_qty = frappe.db.get_value(
			BIN_DOCTYPE, {"item_code": item_code, "warehouse": warehouse}, "projected_qty"
		) or 0

	reservation_qty = _active_reservation_qty(
		item_code, warehouse, company, read_committed=read_committed, committed_conn=committed_conn
	)
	return bin_projected_qty - reservation_qty


# ---------------------------------------------------------------------------
# Component resolution (delegates BOM explosion to V3-41's ury_bom_compiler)
# ---------------------------------------------------------------------------


def _resolve_components(item_code, qty, company, production_policy=None):
	"""Return [{"component_item": ..., "qty": ...}, ...] for `item_code` at `qty`.

	Component resolution is driven by `production_policy` (the same
	single source of truth `ury_availability.py`'s `_fill_pre_produced`/
	`_fill_made_to_order` already use), NOT by "does this item happen to
	have an active BOM":

	  - PRE_PRODUCED / DIRECT_RETAIL: the item is sold from its own
	    finished-goods stock. It is returned as its own sole "component",
	    even if it has an active BOM -- a PRE_PRODUCED item's BOM merely
	    documents the recipe used ahead of time; it is not what gets
	    checked/reserved at sale time. Exploding it here would (and did,
	    live) check raw-ingredient stock instead of FG stock, leaking
	    ingredient names into a validation error on a customer-facing flow.
	  - MADE_TO_ORDER: composite; the full leaf-level component vector is
	    returned (via V3-41's `compile_bom_vector`, which reads ERPNext's
	    precomputed `BOM Explosion Item` table and recurses through any
	    nested sub-assembly when explosion rows are absent), scaled to `qty`.

	`production_policy=None` (no IPC config resolved -- a legacy/unconfigured
	item, or a caller that hasn't been updated to pass it) falls back to the
	pre-existing "has an active default BOM => composite" heuristic, so
	genuinely unconfigured items keep working exactly as before. This
	fallback is logged (not silently used) because it is the exact heuristic
	responsible for the PRE_PRODUCED-with-BOM bug this function now fixes --
	seeing it fire in logs flags any caller that still isn't threading
	`production_policy` through.
	"""
	if production_policy in (POLICY_PRE_PRODUCED, POLICY_DIRECT_RETAIL):
		return [{"component_item": item_code, "qty": qty}]

	if production_policy == POLICY_MADE_TO_ORDER:
		vector = compile_bom_vector(item_code, qty, company)
		return [
			{"component_item": component["component_item"], "qty": component["qty"]}
			for component in sorted(vector["components"], key=lambda c: c["component_item"])
		]

	# No production_policy supplied -- fall back to the legacy heuristic.
	bom_name = frappe.db.get_value(
		BOM_DOCTYPE,
		{"item": item_code, "company": company, "is_active": 1, "is_default": 1},
		"name",
	)
	if not bom_name:
		return [{"component_item": item_code, "qty": qty}]

	frappe.logger("ury_reservation_service").warning(
		"create_reservation for item {0} (company {1}) received no production_policy; "
		"falling back to legacy has-active-BOM heuristic (composite reservation). "
		"If this item is actually PRE_PRODUCED/DIRECT_RETAIL, this will incorrectly "
		"reserve raw components instead of finished-goods stock -- caller should be "
		"updated to pass production_policy.".format(item_code, company)
	)

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


def append_audit(doc, actor, event, reason=None, frozen_context=None):
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
	if frozen_context:
		entry["frozen_context"] = frozen_context
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
	frozen_context=None,
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

	components = _resolve_components(item_code, qty, company, production_policy=policy)
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
	#
	# `read_committed=True` is REQUIRED here and is not an optimisation: it
	# reads the active-reservation sum on a fresh connection, so it returns
	# latest-committed data rather than this transaction's REPEATABLE READ
	# read view -- which was already pinned by the plain reads above, *before*
	# the Bin lock was taken. Without it, queued concurrent transactions each
	# see a pre-lock world with no sibling reservations and all pass the check:
	# a live-reproduced oversell (16 concurrent calls all reserved against 5.0
	# units). It is sound only because the Bin lock above is held across this
	# read and the inserts below. See `_active_reservation_qty`'s docstring for
	# the full rationale and for the two alternatives that were tried live and
	# rejected. Do not weaken this, and do not weaken the Bin lock.
	#
	# The connection is opened ONCE for the whole call rather than once per
	# component: each connect is a TCP connect + MySQL auth handshake, and
	# this loop runs while holding `FOR UPDATE` on every component's Bin row.
	shortfalls = []
	with committed_read_connection() as committed_conn:
		for component in components_sorted:
			available = get_available_capacity(
				component["component_item"],
				warehouse,
				company,
				locked_bin=locked_bins[component["component_item"]],
				read_committed=True,
				committed_conn=committed_conn,
			)
			# Compare with a tolerance rather than a bare `>`. Component
			# quantities are products of BOM per-unit rates (e.g. 0.1) and
			# `available` is a Bin quantity minus an accumulated sum of many such
			# products, so both sides carry binary-float drift. A bare `>`
			# therefore rejects an order that exactly fits the remaining
			# capacity -- live-reproduced at volume as "required 0.2, available
			# 0.1999999999999993"; 7 of the 19 capacity rejections in the Phase 2
			# load test were this artifact and nothing else, i.e. the last
			# portion of a component was unsellable.
			#
			# QTY_TOLERANCE is applied as plain arithmetic on purpose. `flt(x,
			# precision)` would be the idiomatic-looking choice but resolves the
			# rounding method through `frappe.get_system_settings`, i.e. a DB
			# read -- and this loop runs while holding `FOR UPDATE` on every
			# component Bin row. No DB access belongs in here.
			if component["qty"] - available > QTY_TOLERANCE:
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

	# Sales Plan committed_qty tracking: this reservation's `qty` is the
	# TOP-LEVEL item's requested quantity (not a per-component quantity, which
	# for a MADE_TO_ORDER item differs per exploded component) -- the same
	# unit `URY Sales Plan Item.qty` is denominated in. `department` comes
	# from `frozen_context` (set by `_reconcile_line` in
	# `ury_order_reservation_service.py`) when the caller supplied one; a
	# caller with no frozen_context (e.g. a direct/legacy create_reservation
	# call) simply resolves without a department filter.
	#
	# The applied delta is recorded into `frozen_context` (and therefore into
	# every created row's `audit_log` via `append_audit` below) so that
	# `_transition_group` can symmetrically reverse it on release/cancel/
	# expire/fulfil without needing to re-derive the top-level item/qty from
	# component rows, which is not always possible (a MADE_TO_ORDER item's
	# component rows never equal the top-level item/qty).
	commit_qty = flt(qty)
	commit_department = (frozen_context or {}).get("department")
	commit_result = apply_commit_delta(
		item_code, branch, company, department=commit_department, committed_delta=commit_qty
	)
	frozen_context = dict(frozen_context or {})
	frozen_context["sales_plan_commit"] = {
		"applied": bool(commit_result),
		"item_code": item_code,
		"branch": branch,
		"company": company,
		"department": commit_department,
		"qty": commit_qty,
		"plan_item": commit_result.get("name") if commit_result else None,
	}

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
		append_audit(doc, actor, event="create", frozen_context=frozen_context)
		doc.insert(ignore_permissions=False)
		created_names.append(doc.name)

	# Emit realtime events (cheap component-level + rich fan-out) for each
	# distinct component_item affected. `publish_component_stock_fanout` is
	# itself fully failure-isolated (see H1/ury_bom_compiler.py), so no
	# try/except is needed here -- but this loop must still never raise, so
	# a defensive except stays in place in case department resolution above
	# it is ever inlined here in future.
	department = _best_effort_department(item_code, branch)
	for component in components_sorted:
		try:
			publish_component_stock_fanout(
				component["component_item"],
				warehouse,
				company,
				branch,
				department=department,
				logger_name="ury_reservation_service",
				# Still inside the transaction: defer to commit so a rollback
				# does not fan out phantom availability changes to clients.
				after_commit=True,
			)
		except Exception:
			# Failure to publish is best-effort, fire-and-forget.
			# Log but do not raise, so the reservation commit is never aborted.
			frappe.logger("ury_reservation_service").exception(
				"Failed to publish realtime fan-out for component {0}".format(
					component["component_item"]
				)
			)

	return {"reservation_group": reservation_group, "reservations": created_names}


def _resolve_group_rows(reservation_name):
	"""Resolve `reservation_name` (a single row's docname or a reservation_group)
	to its full row set, taking a `SELECT ... FOR UPDATE` lock on every row.

	Accepts either a single `URY Stock Reservation` docname or a
	`reservation_group` value, so callers can operate on the whole atomic
	group (all components of one composite reservation) with one call, as
	release/fulfil/cancel must to keep the group's state consistent.

	Unlike every other row this module locks, this path previously took NO
	lock at all: a plain read -> status-eligibility decision -> write, reached
	post-lock from `ury_kot_cancellation_service.cancel_before_start` and
	`ury_fulfilment_posting_service._fulfil_reservation_once` on reservation
	rows that those callers' own locks (on KOT Execution / posting intent
	rows, in different tables) do not cover. Without a lock here, two
	concurrent transitions of the same group (e.g. a release racing a
	fulfil) could each read the group as eligible and both write, or one
	could silently clobber the other's status. `FOR UPDATE` serializes
	concurrent callers on this group, and stays on this request's own
	connection/transaction.
	"""
	single_rows = frappe.db.sql(
		f"""
		SELECT reservation_group
		FROM `tab{RESERVATION_DOCTYPE}`
		WHERE name = %(name)s
		FOR UPDATE
		""",
		{"name": reservation_name},
		as_dict=True,
	)
	group = (single_rows[0]["reservation_group"] if single_rows else None) or reservation_name
	rows = frappe.db.sql(
		f"""
		SELECT name, status, reservation_group, audit_log
		FROM `tab{RESERVATION_DOCTYPE}`
		WHERE reservation_group = %(group)s
		ORDER BY name ASC
		FOR UPDATE
		""",
		{"group": group},
		as_dict=True,
	)
	if not rows:
		frappe.throw(_("No reservation found for {0}").format(reservation_name), frappe.ValidationError)
	return rows


def _group_sales_plan_commit(rows):
	"""Read back the `sales_plan_commit` info `create_reservation` recorded.

	Every row's `audit_log` carries a "create" entry with `frozen_context`
	(see `create_reservation`), including the `sales_plan_commit` dict this
	looks for. All rows in a group share the same value (it is set once,
	before the group's rows are created), so the first row with a usable
	entry is authoritative for the whole group.
	"""
	import json

	for row in rows:
		audit_log = row.get("audit_log")
		if not audit_log:
			continue
		try:
			entries = json.loads(audit_log)
		except (TypeError, ValueError):
			continue
		for entry in entries:
			frozen_context = entry.get("frozen_context") or {}
			commit_info = frozen_context.get("sales_plan_commit")
			if commit_info and commit_info.get("applied"):
				return commit_info
	return None


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

	# Resolve the group's committed_qty commitment (if any) BEFORE mutating
	# any row, from the locked snapshot `_resolve_group_rows` already fetched
	# -- reading it after the row updates below would see each row's
	# just-rewritten `audit_log` instead of the original "create" entry.
	# Every transition out of RESERVED (release/cancel/expire/fulfil) ends the
	# "committed" state for this line, so committed_qty is decremented in all
	# of them; only a FULFILLED transition additionally moves that same qty
	# into fulfilled_qty (same locked update, so the two counters never
	# observe an inconsistent intermediate state -- see
	# `ury_sales_plan_commit.apply_commit_delta`).
	sales_plan_commit = None
	if from_status == RESERVED:
		sales_plan_commit = _group_sales_plan_commit(rows)

	actor = frappe.session.user
	for row in rows:
		doc = frappe.get_doc(RESERVATION_DOCTYPE, row.name)
		# `frappe.get_doc` is a plain read; overwrite audit_log with the value
		# `_resolve_group_rows`'s locking SELECT already fetched so the
		# read-modify-write append below cannot silently drop a concurrently
		# committed audit entry.
		doc.audit_log = row.get("audit_log")
		doc.status = to_status
		if reason:
			doc.reason = reason
		append_audit(doc, actor, event=event, reason=reason)
		doc.save(ignore_permissions=False)

	if sales_plan_commit:
		committed_delta = -flt(sales_plan_commit.get("qty"))
		fulfilled_delta = flt(sales_plan_commit.get("qty")) if to_status == FULFILLED else 0
		apply_commit_delta(
			sales_plan_commit.get("item_code"),
			sales_plan_commit.get("branch"),
			sales_plan_commit.get("company"),
			department=sales_plan_commit.get("department"),
			committed_delta=committed_delta,
			fulfilled_delta=fulfilled_delta,
		)

	return [row.name for row in rows]


@frappe.whitelist()
def release_reservation(reservation_name, reason=None):
	"""Transition a Reserved reservation group to Released, restoring capacity.

	"Restoring capacity" is entirely the status transition: this module
	never mutates Bin, so once a row is no longer in an active status
	(Reserved/Fulfilled) it simply stops being counted by
	`_active_reservation_qty`/`get_available_capacity`.
	"""
	result = _transition_group(reservation_name, RESERVED, RELEASED, reason, event="release")

	# Emit realtime events (cheap component-level + rich fan-out) for each
	# distinct component_item affected.
	# Extract distinct components from the released reservation group.
	# Since _transition_group transitions the entire group, get distinct
	# components from the result row names' parent rows.
	group_rows = frappe.get_all(
		RESERVATION_DOCTYPE,
		filters={"name": ["in", result]},
		fields=["component_item", "warehouse", "company", "branch", "top_level_item"],
	)
	seen = set()
	for row in group_rows:
		key = (row.component_item, row.warehouse, row.company)
		if key not in seen:
			try:
				department = _best_effort_department(row.top_level_item, row.branch)
				publish_component_stock_fanout(
					row.component_item,
					row.warehouse,
					row.company,
					row.branch,
					department=department,
					logger_name="ury_reservation_service",
					# Still inside the transaction -- see create_reservation.
					after_commit=True,
				)
			except Exception:
				# Failure to publish is best-effort, fire-and-forget.
				frappe.logger("ury_reservation_service").exception(
					"Failed to publish realtime fan-out for released component {0}".format(
						row.component_item
					)
				)
			seen.add(key)

	return result


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
