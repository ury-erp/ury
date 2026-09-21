"""Read-only, advisory adapter: approved URY Sales Plan -> ERPNext Production Plan shape.

Task: V3-24 "Adapt approved pre-produced plan to ERPNext Production Plan".

Per the sa-v3_nxt PLAN.md post-completion amendment, this adapter is NOT a
prerequisite for V3-30/V3-31 (which are a policy contract and do not require a
posted ERPNext Production Plan). It exists as an optional, advisory transform
for whichever downstream ERPNext workflows may later want to consume an
URY Sales Plan in Production Plan shape (e.g. reporting or manufacturing
depth). It is intentionally:

- READ-derived only: it reads an already-approved ``URY Sales Plan`` doc (via
  its frozen ``approval_snapshot`` from V3-23's
  ``ury.ury.api.ury_sales_plan.freeze_approval_snapshot``) and never mutates
  anything.
- Pure / side-effect-free: the same input snapshot always produces the same
  output mapping. No ``.insert()``/``.save()``/``.submit()``, no database
  writes of any kind. As of Track-Item N2, ``_snapshot_item_to_production_plan_item``
  performs one read-only ``frappe.db.get_value`` lookup (department ->
  Finished Goods Warehouse) -- still no writes, no ``frappe.get_doc`` inside
  ``adapt_sales_plan_to_production_plan`` itself.
- Advisory / dry-run only: callers get back a plain ``dict`` shaped like the
  ERPNext ``Production Plan`` doctype's fields (verified against the local
  checkout at
  ``/Users/safwan/Code/URY/erpnext/erpnext/manufacturing/doctype/production_plan/production_plan.json``
  and
  ``.../production_plan_item/production_plan_item.json``), never a live
  Frappe document. It is the caller's responsibility to decide whether and
  how to turn this into a real ``frappe.get_doc({"doctype": "Production
  Plan", ...})`` at some later, explicit step -- this module must never do
  that itself.

This module deliberately does not import ``ury.ury.api.mto`` /
``ury.ury.api.pos_extend`` or any other MTO fulfilment / POS stock-authority
code. It only depends on the shape produced by
``ury.ury.api.ury_sales_plan.freeze_approval_snapshot``.

Unmapped / unknown ERPNext fields
----------------------------------
The ``Production Plan`` doctype carries several fields this adapter cannot
populate from a URY Sales Plan snapshot alone, because either (a) the source
snapshot has no equivalent concept (e.g. ``get_items_from``, which describes
how a *live* ERPNext Production Plan form pulled its rows -- Sales Order vs.
Material Request -- a question that doesn't apply to a plan seeded from a
URY Sales Plan snapshot), or (b) the value is an operational/environment
choice that belongs to whoever eventually drafts the real document (e.g.
``for_warehouse``, ``raw_material_group_warehouse``, warehouse selection
for ``po_items[].warehouse``, ``no_of_shifts``). Those are listed verbatim
in ``UNMAPPED_PRODUCTION_PLAN_FIELDS`` / ``UNMAPPED_PRODUCTION_PLAN_ITEM_FIELDS``
below and are surfaced in the output under the ``"_unmapped_fields"`` key
rather than being guessed at.

URY's ``department`` grouping has no equivalent field on the stock ERPNext
``Production Plan Item`` doctype, so a custom field
(``custom_ury_department``, a Link to ``URY Production Department``) is
added via ``ury/fixtures/custom_field.json`` (Track-Item N2) and populated
directly on each ``po_items`` row. Department fidelity is additionally kept
out-of-band in the output under ``"_ury_department_index"`` (mapping each
department name to the list of ``po_items`` indices belonging to it) for
backwards compatibility with any existing caller of that key.

Scope filter (Track-Item N2): ``po_items`` only ever contains PRE_PRODUCED
items (and, in principle, MADE_TO_ORDER items' pre-produced inner-BOM
sub-items -- not currently identifiable from the snapshot shape; see the
NOTE above ``INCLUDED_PRODUCTION_POLICIES`` in this module).
DIRECT_RETAIL items, and other MADE_TO_ORDER items, are excluded.
"""

import json

import frappe
from frappe import _
from frappe.utils import flt


#: Approved-plan states from ury.ury.api.ury_sales_plan.TRANSITIONS that carry
#: a frozen approval_snapshot. Kept as a local constant (not imported) so this
#: module has no behavioural coupling to the sales-plan state machine beyond
#: reading the resulting doc fields.
APPROVED_STATES = {"Approved", "Locked for Production"}

#: Mirrors ury.ury.api.ury_availability.POLICY_* constants. Kept as local
#: literals (not imported) for the same reason APPROVED_STATES is: no
#: behavioural coupling to another module beyond the string values.
POLICY_PRE_PRODUCED = "PRE_PRODUCED"
POLICY_MADE_TO_ORDER = "MADE_TO_ORDER"
POLICY_DIRECT_RETAIL = "DIRECT_RETAIL"

#: Track-Item N2 filter: a Production Plan only ever covers items this
#: adapter/site actually produces ahead of demand. PRE_PRODUCED items are
#: always in scope. MADE_TO_ORDER items are excluded UNLESS the snapshot row
#: represents one of their pre-produced inner/sub-BOM components -- but the
#: ``snapshot_item`` shape frozen by ``ury_sales_plan.snapshot_item`` today
#: (item_code, qty, stock_uom, department, production_unit,
#: production_policy, bom, bom_revision) carries no field identifying a row
#: as a sub-component of a parent MADE_TO_ORDER item (no
#: ``parent_item``/``is_sub_component``/equivalent). NOTE: made-to-order
#: pre-produced inner-BOM expansion is therefore out of scope here -- it
#: depends on the snapshot/BOM compiler carrying that data, which is a
#: separate gap tracked in tracks/sa-item-production-config-gaps/PLAN.md.
#: This adapter must not attempt to fix the BOM compiler; it only filters on
#: the ``production_policy`` values the snapshot already provides.
INCLUDED_PRODUCTION_POLICIES = (POLICY_PRE_PRODUCED,)

#: Production Plan (parent) fields this adapter cannot populate from a Sales
#: Plan snapshot alone -- see module docstring.
UNMAPPED_PRODUCTION_PLAN_FIELDS = (
    "naming_series",
    "get_items_from",
    "warehouse",  # filter field on the live form, not a stored plan value
    "customer",
    "project",
    "from_date",
    "to_date",
    "include_non_stock_items",
    "include_subcontracted_items",
    "ignore_existing_ordered_qty",
    "status",  # ERPNext workflow status of an actual submitted doc
    "amended_from",
    "for_warehouse",
    "raw_material_group_warehouse",
    "warehouses",
    "sales_order_status",
    "include_safety_stock",
    "combine_items",
    "sub_assembly_warehouse",
    "consider_minimum_order_qty",
    "reserve_stock",
    "no_of_shifts",
)

#: Production Plan Item (child, ``po_items``) fields this adapter cannot
#: populate from a Sales Plan snapshot line alone.
UNMAPPED_PRODUCTION_PLAN_ITEM_FIELDS = (
    "include_exploded_items",
    "pending_qty",
    "ordered_qty",
    "produced_qty",
    "sales_order",
    "sales_order_item",
    "material_request",
    "material_request_item",
    "product_bundle_item",
    "item_reference",
    "temporary_name",
    "planned_end_date",
)


class UnapprovedSalesPlanError(Exception):
    """Raised when adapting a Sales Plan that has no frozen approval snapshot."""


def adapt_sales_plan_to_production_plan(sales_plan_doc):
    """Pure transform: approved URY Sales Plan -> Production Plan-shaped dict.

    ``sales_plan_doc`` may be a real Frappe document or any dict-like object
    exposing ``.get(...)`` for the fields read here (status, company,
    approval_snapshot). Only ``.get`` is ever called -- no attribute is
    written, and no Frappe document API (``insert``/``save``/``submit``/
    ``db_set``/etc.) is invoked anywhere in this function.

    Raises ``UnapprovedSalesPlanError`` if the plan is not in an approved
    state or carries no frozen ``approval_snapshot``.

    Returns a plain ``dict`` -- never a live/bound Frappe document -- shaped
    against the ERPNext ``Production Plan`` doctype fields, plus two
    ``_``-prefixed advisory keys (see module docstring):
    ``_unmapped_fields`` and ``_ury_department_index``.
    """
    snapshot = _require_frozen_snapshot(sales_plan_doc)

    all_items = snapshot.get("items") or []
    items = _filter_items_in_scope(all_items)
    po_items = [
        _snapshot_item_to_production_plan_item(row, snapshot) for row in items
    ]
    department_index = _build_department_index(items)

    production_plan = {
        "doctype": "Production Plan",  # advisory only; never saved/submitted
        "company": snapshot.get("company"),
        "posting_date": snapshot.get("plan_date"),
        "po_items": po_items,
        "total_planned_qty": sum(
            (row.get("qty") or 0) for row in items
        ),
        "_source": {
            "source_doctype": "URY Sales Plan",
            "source_name": sales_plan_doc.get("name"),
            "approval_snapshot_hash": sales_plan_doc.get("approval_snapshot_hash"),
            "branch": snapshot.get("branch"),
            "service_period": snapshot.get("service_period"),
        },
        "_unmapped_fields": {
            "production_plan": list(UNMAPPED_PRODUCTION_PLAN_FIELDS),
            "production_plan_item": list(UNMAPPED_PRODUCTION_PLAN_ITEM_FIELDS),
        },
        "_ury_department_index": department_index,
    }
    return production_plan


def _require_frozen_snapshot(sales_plan_doc):
    status = sales_plan_doc.get("status")
    raw_snapshot = sales_plan_doc.get("approval_snapshot")
    if status not in APPROVED_STATES or not raw_snapshot:
        frappe.throw(
            _(
                "Cannot adapt Sales Plan to a Production Plan shape: plan is not "
                "Approved / Locked for Production or has no frozen approval snapshot."
            ),
            UnapprovedSalesPlanError,
        )
    if isinstance(raw_snapshot, str):
        return json.loads(raw_snapshot)
    # Already a dict (e.g. in tests that build snapshots directly).
    return raw_snapshot


def _filter_items_in_scope(items):
    """Keep only snapshot rows this Production Plan should cover.

    See ``INCLUDED_PRODUCTION_POLICIES`` for the full rationale: PRE_PRODUCED
    rows are included; DIRECT_RETAIL rows are excluded entirely (never
    produced ahead of demand); MADE_TO_ORDER rows are excluded except for
    their pre-produced inner-BOM sub-items, which the current snapshot shape
    cannot identify (out of scope, see the NOTE above
    ``INCLUDED_PRODUCTION_POLICIES``).
    """
    sellable = set(
        frappe.get_all(
            "Item",
            filters={"name": ["in", [r.get("item_code") for r in items if r.get("item_code")] or [""]], "is_sales_item": 1},
            pluck="name",
        )
    )
    return [
        row
        for row in items
        if row.get("item_code") in sellable
        and row.get("production_policy") in INCLUDED_PRODUCTION_POLICIES
        # Untouched history suggestions carry qty 0; nothing to produce.
        and flt(row.get("qty")) > 0
    ]


def _snapshot_item_to_production_plan_item(row, snapshot):
    """Map one frozen snapshot line (see ury_sales_plan.snapshot_item) to a
    Production Plan Item-shaped dict, using only real, confirmed field names.

    Note: unlike the rest of this module, this helper is allowed one
    ``frappe.db.get_value`` read (to resolve the department's Finished Goods
    Warehouse) -- ``get_items_from_sales_plan`` already isn't 100% pure
    (it calls ``frappe.get_doc``), and ``adapt_sales_plan_to_production_plan``
    itself still performs no writes.
    """
    department = row.get("department")
    warehouse = None
    if department:
        warehouse = frappe.db.get_value(
            "URY Production Department", department, "department_warehouse"
        )
    return {
        "item_code": row.get("item_code"),
        "bom_no": row.get("bom"),
        "planned_qty": row.get("qty"),
        "stock_uom": row.get("stock_uom"),
        # No per-item date exists in the Sales Plan snapshot today, so the
        # plan's own plan_date is used as the best available start date.
        "planned_start_date": snapshot.get("plan_date"),
        "description": None,
        # Finished Goods Warehouse, resolved via the item's department --
        # mirrors ury_production_context.py's department_warehouse fallback.
        "warehouse": warehouse,
        # Real Production Plan Item custom field (see
        # ury/fixtures/custom_field.json) so department is stored directly on
        # the item rather than only in the out-of-band index below.
        "custom_ury_department": department,
        # URY-specific context preserved verbatim, namespaced so it is never
        # mistaken for a stock ERPNext field. _ury_department is kept for
        # backwards compat with any other caller of this module.
        "_ury_department": department,
        "_ury_production_unit": row.get("production_unit"),
        "_ury_production_policy": row.get("production_policy"),
        "_ury_bom_revision": row.get("bom_revision"),
    }


def _build_department_index(items):
    index = {}
    for position, row in enumerate(items):
        department = row.get("department")
        index.setdefault(department, []).append(position)
    return index


