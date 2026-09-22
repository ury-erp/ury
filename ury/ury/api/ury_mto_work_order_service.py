"""N4: Per-item Work Order creation for MADE_TO_ORDER KOT lines.

Design decision (documented here per this task's instructions): this module
is an ADDITIVE layer, not a replacement of the existing reservation-only MTO
fulfilment path (`ury_mto_fulfilment_service.py` /
`ury_reservation_service.py`). It creates real ERPNext `Work Order` documents
per made-to-order item, part by part, at KOT creation time, alongside --
never instead of -- the reservation-group flow those modules already
implement. This is the lowest-blast-radius choice available:

- `ury_mto_fulfilment_service.py` already documents itself as "additive...
  not called by any live POS flow" for its own exactly-once posting layer;
  this module follows the same additive posture for Work Order creation, so
  a failure or bug here can never regress the reservation/fulfilment path
  those modules own.
- `ury_batch_work_order_adapter.py` deliberately, structurally excludes
  MADE_TO_ORDER items from ITS Work Order integration (see its own
  docstring: "must NOT touch: every-plate Work Order", referring to a
  *batch/aggregated* Work Order flow for PRE_PRODUCED items). This module
  does not conflict with that exclusion -- it is a different, per-order-line
  Work Order flow scoped exclusively to MADE_TO_ORDER items, wired from KOT
  creation rather than any batch/aggregation process. The two modules will
  never both attempt to create a Work Order for the same item: one is
  permanently restricted to non-MTO items, this one is restricted to MTO
  items only.
- Replacing the reservation-only MTO path outright was rejected: it is the
  currently-relied-upon stock authority for MTO fulfilment
  (`fulfil_mto_order` in `ury_mto_fulfilment_service.py` requires an active
  reservation group and would need a coordinated redesign to consume Work
  Order-based stock movements instead). Layering Work Order creation
  alongside it lets Work Orders exist as manufacturing-visibility/planning
  records without requiring any change to the already-reviewed reservation/
  fulfilment contract.

This module reads `URY KOT`, `URY Item Production Configuration` (via
`ury_production_context`'s existing resolver), `BOM`, and (for production
plan linking) `URY Sales Plan Item`, `URY Sales Plan`, and
`Production Plan Item` -- all read-only. It creates/submits `Work Order`
documents and writes back `custom_ury_work_order` onto the KOT item row.
It never touches `ury_batch_manufacture_service.py`,
`ury_fulfilment_posting_service.py`, `ury_production_plan_adapter.py`,
`ury_sales_plan.py`, `ury_reservation_service.py`, or
`ury_mto_fulfilment_service.py`.

Idempotency: the created Work Order's name is written back onto the KOT
item row's `custom_ury_work_order` field (see
`ury/ury/fixtures/custom_field.json`) so a repeated call for the same KOT
never double-creates a Work Order for a row that already has one.

Failure isolation: each item row is processed inside its own
`frappe.db.savepoint`/try-except so one item's failure (e.g. no resolvable
BOM) never blocks Work Order creation for the KOT's other rows. Failures are
logged via `frappe.log_error` and recorded in the returned summary's
`errors` list rather than raised.
"""

import frappe
from frappe import _

from ury.ury.api.ury_production_context import resolve_production_context

KOT_DOCTYPE = "URY KOT"
WORK_ORDER_DOCTYPE = "Work Order"
BOM_DOCTYPE = "BOM"

MADE_TO_ORDER = "MADE_TO_ORDER"

WORK_ORDER_LINK_FIELD = "custom_ury_work_order"


def _resolve_bom(item_code, configured_bom=None):
    """Resolve an active BOM for `item_code`.

    Prefers the BOM explicitly configured on the item's
    `URY Item Production Configuration` row (if any and still active),
    otherwise falls back to the default/active BOM lookup, read-only, same
    shape as `ury_batch_work_order_adapter._resolve_active_bom` (not
    imported/reused directly since that helper `frappe.throw`s on a miss --
    this module needs a non-raising resolution so a missing BOM is recorded
    as a per-item error instead of aborting the whole KOT).
    """
    if configured_bom and frappe.db.get_value(BOM_DOCTYPE, configured_bom, "docstatus") == 1:
        return configured_bom

    bom_no = frappe.db.get_value(
        BOM_DOCTYPE,
        {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1},
        "name",
    )
    if not bom_no:
        bom_no = frappe.db.get_value(
            BOM_DOCTYPE, {"item": item_code, "is_active": 1, "docstatus": 1}, "name"
        )
    return bom_no


def _resolve_production_plan_link(item_code, branch, company):
    """Return (production_plan_name, production_plan_item_name) or (None, None).

    Finds the submitted Production Plan for today that contains `item_code` by
    querying `Production Plan Item` directly -- joined to its parent plan so we
    can filter by ``docstatus = 1`` and ``company`` in one pass.

    Using `planned_start_date = today` (the date the URY Sales Plan adapter
    stamps on every ``po_items`` row from the Sales Plan's ``plan_date``) as
    the date anchor correctly handles multiple Production Plans on the same day:
    we pick the plan that actually carries this item, not just any plan for the
    branch.

    Returns ``(None, None)`` if no matching submitted plan is found, or if any
    exception occurs.  The Work Order is still created without the links rather
    than blocking the Mosaic serve flow.
    """
    from frappe.query_builder import DocType
    from frappe.utils import getdate

    try:
        today = getdate()

        PP = DocType("Production Plan")
        PPI = DocType("Production Plan Item")

        rows = (
            frappe.qb.from_(PPI)
            .join(PP).on(PP.name == PPI.parent)
            .select(PPI.name.as_("pp_item_name"), PPI.parent.as_("pp_name"))
            .where(PPI.item_code == item_code)
            .where(PPI.planned_start_date == today)
            .where(PP.docstatus == 1)
            .where(PP.company == company)
            .limit(1)
            .run(as_dict=True)
        )

        if not rows:
            return None, None

        return rows[0]["pp_name"], rows[0]["pp_item_name"]
    except Exception:
        frappe.log_error(
            title="ury_mto_work_order_service._resolve_production_plan_link",
            message=frappe.get_traceback(),
        )
        return None, None


@frappe.whitelist()
def create_work_orders_for_kot(kot_name):
    """For a given URY KOT, create (and submit) one ERPNext Work Order per
    made-to-order line item that has a resolvable BOM, one per part/item --
    idempotent per KOT (skip items that already have a linked Work Order).

    Returns a summary dict: `{"created": [...], "skipped": [...], "errors": [...]}`.
    Never raises for a per-item failure -- each item is processed under its
    own savepoint and any exception is caught, logged via
    `frappe.log_error`, and recorded under `errors`.
    """
    result = {"created": [], "skipped": [], "errors": []}

    if not kot_name or not frappe.db.exists(KOT_DOCTYPE, kot_name):
        result["errors"].append({"kot": kot_name, "reason": "KOT_NOT_FOUND"})
        return result

    kot = frappe.get_doc(KOT_DOCTYPE, kot_name)
    branch = kot.get("branch")

    has_link_field = frappe.get_meta("URY KOT Items").has_field(WORK_ORDER_LINK_FIELD)

    for row in kot.get("kot_items") or []:
        item_code = row.get("item")
        if not item_code:
            continue

        if has_link_field and row.get(WORK_ORDER_LINK_FIELD):
            result["skipped"].append(
                {
                    "item_code": item_code,
                    "reason": "ALREADY_HAS_WORK_ORDER",
                    "work_order": row.get(WORK_ORDER_LINK_FIELD),
                }
            )
            continue

        savepoint = f"ury_mto_wo_{row.name or item_code}"
        frappe.db.savepoint(savepoint)
        try:
            context = resolve_production_context(item_code, branch)
            if not context or context.production_policy != MADE_TO_ORDER:
                result["skipped"].append(
                    {
                        "item_code": item_code,
                        "reason": "NOT_MADE_TO_ORDER",
                    }
                )
                continue

            bom_no = _resolve_bom(item_code, context.get("bom"))
            if not bom_no:
                raise frappe.ValidationError(
                    _("No active BOM found for item {0}").format(item_code)
                )

            qty = frappe.utils.flt(row.get("quantity")) or 1

            pp_name, pp_item_name = _resolve_production_plan_link(
                item_code, branch, context.get("company")
            )

            wo_doc = frappe.get_doc(
                {
                    "doctype": WORK_ORDER_DOCTYPE,
                    "production_item": item_code,
                    "bom_no": bom_no,
                    "qty": qty,
                    "company": context.get("company"),
                    "fg_warehouse": context.get("warehouse"),
                    "source_warehouse": context.get("warehouse"),
                    # skip_transfer = 1: ERPNext's validate_work_order() (in
                    # Stock Entry) requires the Work Order to be "In Process"
                    # before accepting a Manufacture SE. Without this flag the
                    # Work Order stays "Not Started" after submit (because no
                    # Material Transfer is ever done in the Mosaic serve path)
                    # and ERPNext blocks the Manufacture SE entirely. With it,
                    # ERPNext skips the transfer-completion check and allows the
                    # Manufacture SE to move the Work Order directly from
                    # "Not Started" → "In Process" → "Completed".
                    "skip_transfer": 1,
                    # use_multi_level_bom = 0: only consume the direct BOM
                    # components of this item. Sub-assembly explosion is handled
                    # separately by the reservation/BOM-compiler layer; having
                    # ERPNext recurse into sub-assemblies here would produce a
                    # duplicate component deduction on top of what the
                    # reservation snapshot already accounts for.
                    "use_multi_level_bom": 0,
                    # Link to the day's Production Plan and the specific
                    # Production Plan Item row for this item. Both are None
                    # when no submitted Production Plan exists today -- the
                    # Work Order is still created and submitted without them.
                    "production_plan": pp_name,
                    "production_plan_item": pp_item_name,
                }
            )

            wo_doc.insert()
            wo_doc.submit()

            if has_link_field:
                frappe.db.set_value(
                    "URY KOT Items", row.name, WORK_ORDER_LINK_FIELD, wo_doc.name
                )

            result["created"].append({"item_code": item_code, "work_order": wo_doc.name})
        except Exception as exc:
            frappe.db.rollback(save_point=savepoint)
            frappe.log_error(
                title="ury_mto_work_order_service.create_work_orders_for_kot",
                message=frappe.get_traceback(),
            )
            result["errors"].append({"item_code": item_code, "reason": str(exc)})

    return result
