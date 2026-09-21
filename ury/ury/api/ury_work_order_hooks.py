# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Work Order warehouse policy for URY's Production Plan Automation feature.

See ``ongoing/production-plan-automation/PLAN.md``, sections "Warehouse
model", D1, D13 and D16, and the "Agent 6" task section.

URY has no separate WIP warehouse concept: production for an item always
happens in the item's department warehouse -- the same warehouse the
Department both draws raw materials from and stocks finished PRE_PRODUCED
goods in (D13). Every URY Work Order therefore:

- skips the WIP transfer entirely (``skip_transfer = 1``, ``wip_warehouse``
  cleared);
- draws its ``required_items`` and manufactures its finished item out of, and
  into, the one Department Warehouse (``source_warehouse == fg_warehouse ==
  production_plan.custom_ury_department_warehouse``).

This module exposes that policy as two plain, importable functions --
``apply_ury_warehouse_policy`` and ``apply_ury_required_items`` -- so Agent 7's
Work Order/Manufacture executor can call them directly while *constructing*
a Work Order (D16: "The executor builds Work Orders; the hook is a gated
safeguard"). The ``validate`` function below is only wired up as the
``doc_events`` hook (see ``hooks.py``) and exists purely as a safeguard for a
URY Work Order created or edited by hand from the desk -- it must never be
the primary construction path.

## URY detection

A Work Order is a URY Work Order iff it is linked (via the standard
``production_plan`` field) to a Production Plan whose
``custom_ury_sales_plan`` is set -- i.e. one of the per-department Production
Plans this feature creates from a locked URY Sales Plan (see
``ury_sales_plan_production_plan.py``, Agent 3). Merely having
``production_plan_item`` set is NOT sufficient: that is also true of a plain
ERPNext Production Plan with no URY involvement at all, and of the native
"Create Work Order" button on any Production Plan. This module's previous
revision keyed off ``production_plan_item`` alone; that was wrong and is
replaced here, not extended (see the module's git history / PLAN.md's Agent 6
section for why).

The Department is resolved from the Production Plan *parent*
(``custom_ury_department`` / ``custom_ury_department_warehouse``), never from
the Production Plan Item row -- ``Production Plan Item.custom_ury_department``
is a deprecated field from an earlier revision of this feature (see
``ury_production_plan_adapter.py``) and is never read here.

## Why the safeguard hook is gated, not unconditional (D16)

``validate`` runs on every save of an already-submitted-or-in-progress Work
Order, including after real stock movements (transfers, manufacture) have
been posted against its ``required_items`` rows. Blindly replacing those rows
with a freshly compiled component vector would silently destroy that
consumption history. So:

- The warehouse policy (``skip_transfer``, ``wip_warehouse``,
  ``source_warehouse``, ``fg_warehouse``, and forcing every existing
  ``required_items`` row's ``source_warehouse``) is reasserted
  unconditionally for a URY Work Order on every save. It is idempotent --
  the Department Warehouse never changes for a given Production Plan -- so
  there is nothing unsafe about repeating it.
- Replacing ``required_items`` wholesale is gated: it only happens when
  ``doc.docstatus == 0`` (still a draft -- a submitted Work Order is never
  rewritten) AND no existing row carries a ``transferred_qty`` or
  ``consumed_qty`` (real fields on ``Work Order Item``) greater than zero.

## Where the hook gets a component vector from

Agent 2's target compiler (``ury_production_target_compiler.py``) is the only
legitimate source of a component vector, and it is deliberately NOT callable
from inside this hook: per PLAN.md's coordination rules, "The Work Order hook
consumes the compiled component vector. It must never re-interpret a BOM."
Nothing in the current architecture persists a compiled vector anywhere the
``validate`` hook could read it back from (Production Plan Item carries no
such field) -- that data only exists transiently, in memory, while Agent 7's
executor is running.

So, for a hand-desk-created/edited URY Work Order, this hook has no vector of
its own to rewrite ``required_items`` with, and does not invent one. The one
supported extension point is ``doc.flags.ury_component_vector``: a caller
that already has a compiled vector in hand (Agent 7's executor, or a future
caller) may stash it there before calling ``doc.save()``/``doc.validate()``,
and the hook will apply it -- through the exact same gate described above --
instead of leaving the rows ERPNext's own ``set_required_items()`` produced.
Agent 7 does not need this: it is instructed to call
``apply_ury_required_items`` directly while still constructing the draft
(D16), which is both simpler and unconditional (no gate needed on a brand
new, never-saved draft). The flag exists solely so the *hook* has a defined,
testable behaviour instead of a silent no-op every single time.
"""

import frappe
from frappe.utils import flt


def is_ury_work_order(work_order):
	"""True iff ``work_order`` is linked to a URY Production Plan.

	A Work Order is URY's iff its ``production_plan`` links to a Production
	Plan whose ``custom_ury_sales_plan`` is set -- never merely because
	``production_plan_item`` is set (see module docstring, "URY detection").
	"""
	production_plan = work_order.get("production_plan")
	if not production_plan:
		return False
	return bool(frappe.db.get_value("Production Plan", production_plan, "custom_ury_sales_plan"))


def get_linked_production_plan(work_order):
	"""Fetch the Production Plan doc linked to ``work_order``, or ``None``.

	Returns ``None`` when ``work_order`` carries no ``production_plan`` at
	all -- callers use this, together with ``custom_ury_sales_plan`` on the
	result, to decide whether ``work_order`` is a URY Work Order.
	"""
	production_plan = work_order.get("production_plan")
	if not production_plan:
		return None
	return frappe.get_doc("Production Plan", production_plan)


def apply_ury_warehouse_policy(work_order, production_plan):
	"""Apply URY's Work Order warehouse policy (D13, PLAN.md "Warehouse model").

	``production_plan`` is the linked Production Plan document (or any
	object exposing ``.get("custom_ury_department_warehouse")``) that
	``work_order`` was built for. Its ``custom_ury_department_warehouse`` is
	the single source of truth for "the Department Warehouse" -- stamped
	once when the Production Plan is created; never re-resolved from the
	department here.

	Sets, on ``work_order``:

	- ``skip_transfer = 1`` -- URY has no separate WIP transfer step.
	- ``wip_warehouse = None`` -- there is no WIP warehouse to transfer into.
	- ``source_warehouse = fg_warehouse = <Department Warehouse>`` --
	  manufacturing draws from, and produces into, the one Department
	  Warehouse.
	- every existing ``required_items`` row's ``source_warehouse`` to the
	  same Department Warehouse (native ``set_warehouses()``/
	  ``set_required_items()`` would otherwise leave or reset these to each
	  item's own default warehouse -- see module docstring).

	Idempotent and safe to call on every save of a URY Work Order, at any
	``docstatus`` -- unlike ``apply_ury_required_items``, this never touches
	quantities or which items are on the Work Order, only warehouse fields.
	"""
	department_warehouse = production_plan.get("custom_ury_department_warehouse")

	work_order.set("skip_transfer", 1)
	work_order.set("wip_warehouse", None)
	work_order.set("source_warehouse", department_warehouse)
	work_order.set("fg_warehouse", department_warehouse)

	for row in work_order.get("required_items") or []:
		row.source_warehouse = department_warehouse


def apply_ury_required_items(work_order, component_vector):
	"""Replace ``work_order.required_items`` wholesale with ``component_vector``.

	``component_vector`` is a list of ``{"item_code", "required_qty",
	"stock_uom"}`` dicts -- the exact shape produced by Agent 2's
	``ury_production_target_compiler`` (see its module docstring, "Return
	shape"). This never re-derives a component vector from a BOM itself; it
	only consumes one a caller already compiled (PLAN.md coordination
	rules).

	Existing rows are dropped, not merged into or appended after -- this is
	always a full replacement, matching what a fresh
	``WorkOrder.set_required_items()`` call would have produced had it known
	about URY's selective-explosion rules (D1). Every new row's
	``source_warehouse`` is forced to ``work_order.source_warehouse`` -- call
	``apply_ury_warehouse_policy`` first (or again afterwards) so that value
	is already the Department Warehouse.

	Callers are responsible for the D16 gate (never call this on a
	submitted Work Order, or one with any ``transferred_qty``/
	``consumed_qty`` already posted) -- this function itself performs no
	such check, since Agent 7's executor calls it on a brand new draft where
	the gate is trivially satisfied.
	"""
	source_warehouse = work_order.get("source_warehouse")

	work_order.set("required_items", [])
	for component in component_vector:
		work_order.append(
			"required_items",
			{
				"item_code": component["item_code"],
				"required_qty": component["required_qty"],
				"stock_uom": component.get("stock_uom"),
				"source_warehouse": source_warehouse,
			},
		)


def required_items_rewrite_allowed(work_order):
	"""The D16 gate: may ``required_items`` be rewritten wholesale right now?

	``True`` only when ``work_order`` is still a draft (``docstatus == 0``)
	and no existing ``required_items`` row carries a ``transferred_qty`` or
	``consumed_qty`` greater than zero. A submitted Work Order, or one with
	any real stock movement already posted against it, must never have its
	``required_items`` replaced -- doing so would silently discard that
	consumption history.
	"""
	if work_order.get("docstatus") != 0:
		return False
	for row in work_order.get("required_items") or []:
		if flt(row.get("transferred_qty")) or flt(row.get("consumed_qty")):
			return False
	return True


def validate(doc, method=None):
	"""``doc_events`` "validate" hook for ``Work Order`` -- a gated safeguard only.

	Runs after ``WorkOrder.validate()`` (``frappe/model/document.py``'s
	``Document.hook``/``compose`` calls the controller method of the same
	name first), so ``doc.required_items`` is already populated by ERPNext's
	own ``set_required_items()`` by the time this runs -- see module
	docstring.

	No-ops entirely for a non-URY Work Order (see ``is_ury_work_order``).
	For a URY Work Order: always reasserts the warehouse policy, and,
	subject to the D16 gate, replaces ``required_items`` from
	``doc.flags.ury_component_vector`` when a caller has stashed one there
	(see module docstring, "Where the hook gets a component vector from").
	Agent 7's executor does not rely on this -- it calls
	``apply_ury_warehouse_policy``/``apply_ury_required_items`` directly
	while constructing the draft (D16).
	"""
	production_plan = get_linked_production_plan(doc)
	if not production_plan or not production_plan.get("custom_ury_sales_plan"):
		return

	apply_ury_warehouse_policy(doc, production_plan)

	flags = getattr(doc, "flags", None)
	component_vector = flags.get("ury_component_vector") if flags else None
	if component_vector is None:
		return
	if not required_items_rewrite_allowed(doc):
		return

	apply_ury_required_items(doc, component_vector)
