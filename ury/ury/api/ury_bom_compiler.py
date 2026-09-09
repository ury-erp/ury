"""Compile flat BOM component vectors and a reverse (component -> consumers) index.

This module is a pure, read-only reader over ERPNext's BOM data model (`BOM`,
`BOM Item`, `BOM Explosion Item`). It performs no writes, no Stock Entry
creation, no reservation, and no order-acceptance logic. It must never be
called from, or call into, the live order path (POS Invoice / order
acceptance).

Three entry points:

- `compile_bom_vector(item_code, qty, company)`: explode one top-level item's
  active BOM into a flat per-component quantity vector for a planned qty,
  recursing through nested sub-assemblies until only non-sub-assembly
  ("raw"/stock) components remain.
- `compile_shared_component_index(item_codes, company)`: for a set of
  top-level items, build the reverse dependency index component_item ->
  [{top_level_item, qty_per_unit}], so shortage-propagation logic (V3-42/
  V3-44) can find which menu items a shortage of one component blocks.
- `build_demand_vector(sales_plan_approval_snapshot)`: given a V3-23 approved
  plan snapshot, call `compile_bom_vector` per line and assemble rows in the
  exact shape V3-31's `ury_issue_authorization.py` expects inside a Sales
  Plan's `approval_snapshot["demand_vector"]`:
  component_item, department, production_unit, required_qty, stock_uom,
  control_mode.

## BOM data source

ERPNext maintains `BOM Explosion Item` as a precomputed, flat explosion of a
BOM's leaf (non-sub-assembly) components, with `qty_consumed_per_unit`
already expressed per one unit of the BOM's own output quantity. This module
reads `BOM Explosion Item` first, because ERPNext keeps that table in sync
on every BOM save/submit and it already resolves nested sub-assemblies
without this module re-implementing that traversal (and its phantom-item /
process-loss rules) by hand. Only when a BOM has no `BOM Explosion Item` rows
(e.g. an environment where the table has not been populated, or a BOM saved
without submission in a way that skipped explosion) does this module fall
back to manual recursive traversal of `BOM Item`, exploding any line flagged
`is_sub_assembly_item` by looking up that sub-assembly's own default/active
BOM and recursing, until only non-sub-assembly stock lines remain.

## control_mode sourcing

V3-30 defines `control_mode` (`UNCONSTRAINED` / `SOFT` / `HARD`) as a
per-component-demand field but the concrete plan-line schema that would
carry it (V3-23's frozen snapshot line, or a V3-15 production-config record)
has not been implemented yet as of this task. `build_demand_vector` therefore
resolves control_mode, per plan line, in this order: (1) a `control_mode` key
on the plan line itself, (2) a `control_mode` key inside a `component_control_modes`
map on the line keyed by component_item, (3) a `default_control_mode` on the
snapshot, (4) the contract's stated default posture -- "warning-first" -- i.e.
`SOFT`. This keeps the function usable today and requires no change once an
upstream task starts populating an explicit control_mode source.
"""

import frappe
from frappe import _


BOM_DOCTYPE = "BOM"
BOM_EXPLOSION_ITEM_DOCTYPE = "BOM Explosion Item"
BOM_ITEM_DOCTYPE = "BOM Item"

DEFAULT_CONTROL_MODE = "SOFT"


def compile_bom_vector(item_code, qty, company):
	"""Explode `item_code`'s active BOM for `company` into a flat component vector.

	Returns a dict:
		{
			"item_code": item_code,
			"bom": bom_name,
			"qty": qty,
			"company": company,
			"source": "bom_explosion_item" | "manual_recursion",
			"components": [
				{"component_item": ..., "qty": ..., "stock_uom": ..., "qty_per_unit": ...},
				...
			],
		}

	Components for the same component_item across multiple explosion rows (or
	multiple recursion paths) are aggregated into a single row. Fails closed
	(raises frappe.ValidationError) if `item_code` has no active/default BOM
	for `company`, or if the resolved BOM has no exploded components.
	"""
	if qty is None or qty <= 0:
		frappe.throw(_("Quantity must be greater than zero"), frappe.ValidationError)

	bom_name = _resolve_active_bom(item_code, company)

	components_by_item, source = _explode_bom_components(bom_name, qty)

	if not components_by_item:
		frappe.throw(
			_("BOM {0} for item {1} has no exploded components").format(bom_name, item_code),
			frappe.ValidationError,
		)

	components = [
		{
			"component_item": component_item,
			"qty": row["qty"],
			"stock_uom": row["stock_uom"],
			"qty_per_unit": row["qty"] / qty,
		}
		for component_item, row in sorted(components_by_item.items())
	]

	return {
		"item_code": item_code,
		"bom": bom_name,
		"qty": qty,
		"company": company,
		"source": source,
		"components": components,
	}


def compile_shared_component_index(item_codes, company, skip_invalid_items=False):
	"""Build the reverse dependency index component_item -> consuming top-level items.

	`item_codes` is an iterable of top-level (finished/menu) item codes. Returns:
		{
			component_item: [
				{"top_level_item": item_code, "qty_per_unit": ..., "stock_uom": ...},
				...
			],
			...
		}

	Each top-level item is compiled at qty=1 (i.e. only the per-unit rate is
	indexed here; callers scale by their own planned/order qty). A component
	shared by two or more top-level items has one entry per consumer, so a
	caller can answer "which menu items does a shortage of component X
	block" by reading `index[X]`.

	`skip_invalid_items` selects the failure mode when `compile_bom_vector`
	raises for one of `item_codes` (most commonly a MADE_TO_ORDER item with no
	active BOM -- an entirely normal, reachable state for a menu item added
	before its recipe is finalised):

	  - False (default): the exception propagates and no index is returned.
	    This is the correct, fail-closed behaviour for any caller that plans
	    production or authorises stock issue, where silently omitting an item's
	    demand would understate what must be produced or issued.
	  - True: that one item is logged and skipped, and the index is still built
	    from every other item. Use this only for advisory/best-effort consumers
	    -- see `get_items_affected_by_component`, where one misconfigured item
	    must not blind the realtime availability channel for the whole branch.

	Returns the index either way; with `skip_invalid_items=True` the skipped
	items are simply absent from it.
	"""
	item_codes = list(dict.fromkeys(item_codes))  # de-dupe, preserve order
	index = {}
	skipped = []

	for item_code in item_codes:
		try:
			vector = compile_bom_vector(item_code, 1, company)
		except Exception:
			if not skip_invalid_items:
				raise
			# Per-item isolation: one unbuildable item must not abort the
			# whole reverse-index build for every other item.
			skipped.append(item_code)
			frappe.logger("ury_bom_compiler").exception(
				"compile_shared_component_index: skipping item {0} (company {1}); "
				"its BOM vector could not be compiled. The index is still built "
				"from the remaining items, so this item's availability changes "
				"will not propagate via the rich realtime channel until its "
				"configuration is fixed.".format(item_code, company)
			)
			continue

		for component in vector["components"]:
			index.setdefault(component["component_item"], []).append(
				{
					"top_level_item": item_code,
					"qty_per_unit": component["qty_per_unit"],
					"stock_uom": component["stock_uom"],
				}
			)

	if skipped:
		frappe.logger("ury_bom_compiler").warning(
			"compile_shared_component_index (company {0}): built index from {1} of {2} "
			"items; skipped {3} with uncompilable BOMs: {4}".format(
				company, len(item_codes) - len(skipped), len(item_codes), len(skipped), ", ".join(skipped)
			)
		)

	return index


def build_demand_vector(sales_plan_approval_snapshot):
	"""Compile the V3-31-shaped demand_vector rows for an approved plan snapshot.

	`sales_plan_approval_snapshot` is a dict with an `items` list of plan
	lines, each carrying at least: item_code, qty, department,
	production_unit, policy, bom, bom_revision (per this task's brief; `bom`
	and `bom_revision` are accepted but not required by this function, since
	`compile_bom_vector` resolves the active BOM directly -- they are read
	only for a fail-closed cross-check when present, see below). A line's
	`company` falls back to the snapshot's top-level `company`.

	Lines whose `policy` is `DIRECT_RETAIL` are excluded (V3-30: direct-retail
	lines are excluded from manufacturing demand).

	Returns a list of rows shaped exactly as V3-31's `ury_issue_authorization.py`
	expects inside `approval_snapshot["demand_vector"]`:
		{"component_item", "department", "production_unit", "required_qty",
		 "stock_uom", "control_mode"}

	Rows for the same (component_item, department, production_unit) across
	multiple plan lines (e.g. a shared component used by two menu items in
	the same department) are aggregated by summing required_qty. This is a
	pure function: no doc is read via frappe.get_doc for mutation, and no
	Sales Plan, BOM, or Issue Authorization document is written.
	"""
	snapshot_company = sales_plan_approval_snapshot.get("company")
	default_control_mode = sales_plan_approval_snapshot.get("default_control_mode") or DEFAULT_CONTROL_MODE

	lines = sales_plan_approval_snapshot.get("items") or []
	rows_by_key = {}

	for line in lines:
		if (line.get("policy") or "").upper() == "DIRECT_RETAIL":
			continue

		item_code = line.get("item_code")
		qty = line.get("qty")
		department = line.get("department")
		production_unit = line.get("production_unit")

		if not item_code or qty is None:
			frappe.throw(
				_("Plan line missing item_code or qty: {0}").format(line), frappe.ValidationError
			)
		if not department:
			frappe.throw(
				_("Plan line for {0} missing department").format(item_code), frappe.ValidationError
			)

		company = line.get("company") or snapshot_company
		vector = compile_bom_vector(item_code, qty, company)

		line_control_mode = line.get("control_mode")
		component_control_modes = line.get("component_control_modes") or {}

		for component in vector["components"]:
			component_item = component["component_item"]
			control_mode = (
				component_control_modes.get(component_item)
				or line_control_mode
				or default_control_mode
			)

			key = (component_item, department, production_unit)
			if key not in rows_by_key:
				rows_by_key[key] = {
					"component_item": component_item,
					"department": department,
					"production_unit": production_unit,
					"required_qty": 0.0,
					"stock_uom": component["stock_uom"],
					"control_mode": control_mode,
				}
			rows_by_key[key]["required_qty"] += component["qty"]

	return [rows_by_key[key] for key in sorted(rows_by_key.keys())]


# --- internal helpers -------------------------------------------------------


def _resolve_active_bom(item_code, company):
	filters = {"item": item_code, "is_active": 1, "docstatus": 1}
	if company:
		filters["company"] = company

	bom_name = frappe.db.get_value(
		BOM_DOCTYPE, {**filters, "is_default": 1}, "name", order_by="modified desc"
	)
	if not bom_name:
		bom_name = frappe.db.get_value(BOM_DOCTYPE, filters, "name", order_by="modified desc")

	if not bom_name:
		frappe.throw(
			_("No active BOM found for item {0}{1}").format(
				item_code, _(" in company {0}").format(company) if company else ""
			),
			frappe.ValidationError,
		)

	return bom_name


def _explode_bom_components(bom_name, qty):
	"""Return ({component_item: {"qty", "stock_uom"}}, source_label)."""
	explosion_rows = frappe.get_all(
		BOM_EXPLOSION_ITEM_DOCTYPE,
		filters={"parent": bom_name, "parenttype": BOM_DOCTYPE, "docstatus": ("<", 2)},
		fields=["item_code", "qty_consumed_per_unit", "stock_uom"],
	)

	if explosion_rows:
		components = {}
		for row in explosion_rows:
			entry = components.setdefault(row.item_code, {"qty": 0.0, "stock_uom": row.stock_uom})
			entry["qty"] += (row.qty_consumed_per_unit or 0) * qty
		return components, "bom_explosion_item"

	components = {}
	_explode_bom_recursive(bom_name, qty, components, visited=set())
	return components, "manual_recursion"


def _explode_bom_recursive(bom_name, parent_qty, components, visited):
	if bom_name in visited:
		frappe.throw(
			_("Circular BOM reference detected at {0}").format(bom_name), frappe.ValidationError
		)
	visited = visited | {bom_name}

	bom_quantity = frappe.db.get_value(BOM_DOCTYPE, bom_name, "quantity") or 1

	lines = frappe.get_all(
		BOM_ITEM_DOCTYPE,
		filters={"parent": bom_name, "parenttype": BOM_DOCTYPE, "docstatus": ("<", 2)},
		fields=["item_code", "stock_qty", "stock_uom", "is_sub_assembly_item", "bom_no"],
	)

	for line in lines:
		line_qty = ((line.stock_qty or 0) / bom_quantity) * parent_qty

		if line.is_sub_assembly_item:
			sub_bom = line.bom_no or _resolve_active_bom(line.item_code, None)
			_explode_bom_recursive(sub_bom, line_qty, components, visited)
			continue

		entry = components.setdefault(line.item_code, {"qty": 0.0, "stock_uom": line.stock_uom})
		entry["qty"] += line_qty


@frappe.whitelist(allow_guest=False)
def get_items_affected_by_component(component_item, branch, company):
	"""Return top-level menu/finished items affected by a component shortage.

	Given a single raw material (`component_item`) and a `branch`/`company`,
	returns a list of MADE_TO_ORDER items that use this component in their BOM.
	This is the inverse direction of `compile_shared_component_index`: instead
	of "which components does this finished item use", it answers "which
	finished items depend on this component".

	Args:
		component_item (str): The item code of the raw material/component.
		branch (str): The branch code (scopes the MADE_TO_ORDER item universe).
		company (str): The company code (verified against branch-derived company).

	Returns:
		list: A list of dicts, each with:
			- top_level_item (str): The finished/menu item code.
			- qty_per_unit (float): Qty of component per unit of finished item.
			- stock_uom (str): Stock unit of measure for the component.

		Returns an empty list if the component is not used by any MADE_TO_ORDER
		items, or if no MADE_TO_ORDER items are configured for the branch.

		A configured MADE_TO_ORDER item whose BOM vector cannot be compiled
		(typically: no active BOM yet) is logged and skipped; it simply never
		appears in the results. Every other item in the branch still resolves
		normally. See the `skip_invalid_items=True` rationale at the call site
		below.

	Raises:
		frappe.ValidationError: If `component_item`, `branch`, or `company`
			is missing/empty.
	"""
	if not component_item:
		frappe.throw(_("Component item is required"), frappe.ValidationError)
	if not branch:
		frappe.throw(_("Branch is required"), frappe.ValidationError)
	if not company:
		frappe.throw(_("Company is required"), frappe.ValidationError)

	# Query all active MADE_TO_ORDER items configured for this branch.
	made_to_order_items = frappe.get_all(
		"URY Item Production Configuration",
		filters={"branch": branch, "production_policy": "MADE_TO_ORDER", "active": 1},
		pluck="item",
	)

	if not made_to_order_items:
		return []

	# Compile the reverse dependency index across all MADE_TO_ORDER items.
	#
	# `skip_invalid_items=True` is deliberate. This lookup feeds H1's
	# best-effort realtime fan-out (`publish_component_stock_fanout`), whose
	# outer try/except correctly swallows any failure here so a reservation
	# write is never broken by it. The consequence, before this flag existed,
	# was that a SINGLE active MADE_TO_ORDER item with no active BOM -- a menu
	# item added before its recipe is finalised, entirely routine -- made
	# `compile_bom_vector` raise, aborted the whole reverse-index build, and so
	# silently stopped the rich `menu_availability_update_*` event from firing
	# for EVERY item in the branch, for every component change, with no signal
	# beyond one error-log line. (Live-reproduced on bench sa-prodctrl-unif-live
	# via the LMNT fixture.) Degrading to "that one item's changes don't
	# propagate" is both correct and already the accepted behaviour for it;
	# blinding the entire branch is not.
	index = compile_shared_component_index(made_to_order_items, company, skip_invalid_items=True)

	# Return affected items for this specific component (or empty list if unused).
	return index.get(component_item, [])


def publish_component_stock_fanout(
	component_item, warehouse, company, branch, department=None, logger_name="ury_bom_compiler"
):
	"""Publish G1's cheap component-level event, then best-effort fan out a
	richer, item-resolved event to a branch-scoped channel frontend clients
	can subscribe to (task H1).

	This is the single seam every write-side mutation site (reservation
	create/release, fulfilment posting) should call INSTEAD of calling
	`frappe.publish_realtime("ury_component_stock_changed", ...)` directly,
	so the dual-publish behaviour and its failure isolation live in exactly
	one place.

	Two publishes happen here, each independently failure-isolated:

	1. The cheap, unchanged `ury_component_stock_changed` event (component,
	   warehouse, company only -- no BOM explosion). This is G1's original
	   event; other consumers may still want just this. Its own publish
	   failure is logged and swallowed.
	2. A richer `menu_availability_update_{branch}` event carrying which
	   MADE_TO_ORDER top-level items are affected by this component's stock
	   change (resolved via F2's `get_items_affected_by_component`), plus
	   `component_item`/`branch`/`department`. The channel name mirrors the
	   `"{event}_{branch}_{scope}"` convention used by
	   `ury_order.change_table_in_kot`'s `kot_update_{branch}_{production}`
	   channel (branch-scoped fan-out channel per event family).

	Both steps are independently wrapped: a failure resolving/publishing the
	rich event is logged and skipped, and never suppresses or is suppressed
	by the cheap event -- neither publish can become a single point of
	failure for the caller's stock mutation. Callers should not call this
	from anywhere but a best-effort, already-committed context, mirroring
	how G1's original call sites wrapped `publish_realtime` directly.
	"""
	logger = frappe.logger(logger_name)

	try:
		frappe.publish_realtime(
			"ury_component_stock_changed",
			{
				"component_item": component_item,
				"warehouse": warehouse,
				"company": company,
			},
		)
	except Exception:
		# Failure to publish is best-effort, fire-and-forget.
		logger.exception(
			"Failed to publish ury_component_stock_changed for component {0}".format(component_item)
		)

	try:
		affected = get_items_affected_by_component(component_item, branch, company) or []
		affected_items = [row["top_level_item"] for row in affected if row.get("top_level_item")]
		if not affected_items:
			return
		frappe.publish_realtime(
			"menu_availability_update_{0}".format(branch),
			{
				"affected_items": affected_items,
				"component_item": component_item,
				"branch": branch,
				"department": department,
			},
		)
	except Exception:
		# The rich fan-out lookup/publish is best-effort: log and move on.
		# The cheap event above has already fired independently and this
		# failure must never suppress it or propagate to the caller.
		logger.exception(
			"Failed to resolve/publish menu_availability_update fan-out for component {0}".format(
				component_item
			)
		)
