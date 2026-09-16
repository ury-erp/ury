"""Generate Material Requests (Purchase + Transfer) from a Production Plan.

Track-Items N5 ("Department stock check") + N6 ("Material Request
generation"), bundled together because they share this one new module.

This module takes a Production Plan (real or shaped like the one produced by
``ury.ury.api.ury_production_plan_adapter``) whose ``po_items`` rows carry
``bom_no``, ``planned_qty``, ``warehouse`` (the department's Finished Goods
Warehouse) and ``custom_ury_department``, explodes each row's BOM into raw
material requirements (reusing ``ury_bom_compiler.compile_bom_vector`` --
BOM explosion is never reimplemented here), checks how much of that raw
material each department already has in its own warehouse, and creates
**draft** (never submitted) ``Material Request`` documents following the
two-request pattern:

- **Transfer MR** (Store -> Department): always created for a department's
  full *remaining* raw-material requirement (i.e. after netting off what the
  department's own warehouse already holds) -- because this is how the
  department actually receives the goods it needs for production, whether or
  not Store currently has enough on its own shelves.
- **Purchase MR** (against Store): created only for the portion of the
  aggregate Store-wide requirement (the sum, across every department, of
  their remaining/net raw-material requirement for a given raw material)
  that exceeds what Store's own warehouse currently has in stock. If Store
  already holds enough to cover every department's transfer, no Purchase MR
  line is created for that raw material at all.

Department stock check (scope item 4) is a strictly prior, per-department
gate: ``department_need = max(0, bom_requirement - department_current_stock)``.
If a department already fully holds what its production plan needs for a
raw material, ``department_need`` is 0 and that raw material is skipped
entirely for that department (no Transfer line, and it contributes nothing
to the Store-wide aggregate feeding the Purchase MR calculation).

Nothing here submits a document. Every ``Material Request`` created by
``generate_material_requests_for_production_plan`` is left in Draft status
for a human to review, edit, and submit.
"""

import frappe
from frappe import _

from ury.ury.api.ury_bom_compiler import compile_bom_vector
from ury.ury.api.ury_production_settings import get_store_warehouse

MATERIAL_REQUEST_DOCTYPE = "Material Request"


@frappe.whitelist()
def generate_material_requests_for_production_plan(production_plan):
    """For a Production Plan, explode BOMs, check department stock, and
    generate the two-request Material Request pattern (draft only).

    ``production_plan`` may be a Production Plan document name (loaded via
    ``frappe.get_doc``) or a dict already shaped like one (e.g. the output of
    ``ury_production_plan_adapter.adapt_sales_plan_to_production_plan``,
    exposing ``company`` and a ``po_items`` list of dicts with ``item_code``,
    ``bom_no``, ``planned_qty``, ``warehouse``, ``custom_ury_department``).

    Returns:
        {
            "purchase_material_requests": [name, ...],
            "transfer_material_requests": [name, ...],
            "department_stock_used": {
                (department, raw_material_item): qty_netted_off_from_department_stock,
                ...
            },
            "skipped_sufficient_stock": [
                {"department": ..., "item_code": ...}, ...
            ],
        }
    """
    plan_doc = _load_production_plan(production_plan)
    company = plan_doc.get("company")
    po_items = plan_doc.get("po_items") or []

    store_warehouse = get_store_warehouse()

    # department_need[(department, raw_material)] -> net qty department still needs
    department_need = {}
    # department_uom[(department, raw_material)] -> stock_uom
    department_uom = {}
    # department_warehouse[department] -> department's own FG/target warehouse
    department_warehouse = {}

    department_stock_used = {}
    skipped_sufficient_stock = []

    for row in po_items:
        item_code = row.get("item_code")
        bom_no = row.get("bom_no")
        planned_qty = row.get("planned_qty")
        department = row.get("custom_ury_department")
        dept_warehouse = row.get("warehouse")

        if not item_code or not bom_no or not planned_qty:
            continue
        if not department or not dept_warehouse:
            # No department / department warehouse resolved for this row --
            # nothing to check stock against or transfer into; skip it
            # rather than guess.
            continue

        department_warehouse[department] = dept_warehouse

        vector = compile_bom_vector(item_code, planned_qty, company)

        for component in vector["components"]:
            raw_material = component["component_item"]
            required_qty = component["qty"]
            stock_uom = component["stock_uom"]

            key = (department, raw_material)
            department_need[key] = department_need.get(key, 0.0) + required_qty
            department_uom[key] = stock_uom

    # Department stock check (scope item 4): net off each department's own
    # current stock of the raw material before anything downstream sees it.
    net_department_need = {}
    for (department, raw_material), required_qty in department_need.items():
        dept_warehouse = department_warehouse.get(department)
        current_stock = _get_bin_actual_qty(raw_material, dept_warehouse)

        net_need = required_qty - current_stock
        stock_used = min(required_qty, current_stock) if current_stock > 0 else 0.0
        if stock_used:
            department_stock_used[(department, raw_material)] = stock_used

        if net_need <= 0:
            skipped_sufficient_stock.append(
                {"department": department, "item_code": raw_material}
            )
            continue

        net_department_need[(department, raw_material)] = net_need

    # Aggregate the net department requirement per raw material, across all
    # departments, to compute the Store-wide requirement feeding the
    # Purchase MR calc.
    store_wide_requirement = {}
    for (department, raw_material), net_need in net_department_need.items():
        store_wide_requirement[raw_material] = (
            store_wide_requirement.get(raw_material, 0.0) + net_need
        )

    # Purchase MR qty per raw material: Store-wide requirement minus what
    # Store itself already has in stock, floored at 0, then bumped up to any
    # configured min_order_qty purchase rule.
    purchase_qty_by_item = {}
    for raw_material, total_required in store_wide_requirement.items():
        store_stock = _get_bin_actual_qty(raw_material, store_warehouse)
        purchase_qty = total_required - store_stock
        if purchase_qty <= 0:
            continue
        purchase_qty = _apply_min_order_qty(raw_material, purchase_qty)
        purchase_qty_by_item[raw_material] = purchase_qty

    # --- Create draft Material Requests -------------------------------

    purchase_mr_names = []
    if purchase_qty_by_item and store_warehouse:
        items = [
            {
                "item_code": raw_material,
                "qty": qty,
                "warehouse": store_warehouse,
                "uom": department_uom.get(_first_key_for_item(department_need, raw_material)),
                "schedule_date": frappe.utils.nowdate(),
            }
            for raw_material, qty in purchase_qty_by_item.items()
        ]
        mr_name = _create_material_request(
            material_request_type="Purchase",
            company=company,
            items=items,
        )
        if mr_name:
            purchase_mr_names.append(mr_name)

    transfer_mr_names = []
    if store_warehouse:
        # Group Transfer MR items by department: one doc per department.
        by_department = {}
        for (department, raw_material), net_need in net_department_need.items():
            by_department.setdefault(department, []).append((raw_material, net_need))

        for department, raw_material_rows in by_department.items():
            dept_warehouse = department_warehouse.get(department)
            if not dept_warehouse:
                continue
            items = [
                {
                    "item_code": raw_material,
                    "qty": net_need,
                    "warehouse": dept_warehouse,
                    "from_warehouse": store_warehouse,
                    "uom": department_uom.get((department, raw_material)),
                    "schedule_date": frappe.utils.nowdate(),
                }
                for raw_material, net_need in raw_material_rows
            ]
            mr_name = _create_material_request(
                material_request_type="Material Transfer",
                company=company,
                items=items,
            )
            if mr_name:
                transfer_mr_names.append(mr_name)

    return {
        "purchase_material_requests": purchase_mr_names,
        "transfer_material_requests": transfer_mr_names,
        "department_stock_used": department_stock_used,
        "skipped_sufficient_stock": skipped_sufficient_stock,
    }


# --- internal helpers -------------------------------------------------------


def _first_key_for_item(department_need, raw_material):
    """Best-effort lookup of a (department, raw_material) key for a given
    raw_material, used only to fetch a representative stock_uom for the
    aggregated Purchase MR line. Any department carrying this raw material
    has the same stock_uom (BOM explosion is uom-consistent per item), so
    the first match found is sufficient.
    """
    for key in department_need:
        if key[1] == raw_material:
            return key
    return None


def _load_production_plan(production_plan):
    if isinstance(production_plan, dict):
        return production_plan
    doc = frappe.get_doc("Production Plan", production_plan)
    return {
        "company": doc.get("company"),
        "po_items": [
            {
                "item_code": item.get("item_code"),
                "bom_no": item.get("bom_no"),
                "planned_qty": item.get("planned_qty"),
                "warehouse": item.get("warehouse"),
                "custom_ury_department": item.get("custom_ury_department"),
            }
            for item in (doc.get("po_items") or [])
        ],
    }


def _get_bin_actual_qty(item_code, warehouse):
    if not warehouse:
        return 0.0
    actual_qty = frappe.db.get_value(
        "Bin", {"item_code": item_code, "warehouse": warehouse}, "actual_qty"
    )
    return actual_qty or 0.0


def _apply_min_order_qty(item_code, qty):
    """Apply the Item doctype's existing purchasing rule: never order less
    than the item's configured ``min_order_qty`` (if any). Reuses the
    existing ERPNext field rather than inventing a new purchase-rule
    concept.
    """
    min_order_qty = frappe.db.get_value("Item", item_code, "min_order_qty")
    if min_order_qty and qty < min_order_qty:
        return min_order_qty
    return qty


def _create_material_request(material_request_type, company, items):
    if not items:
        return None
    doc = frappe.get_doc(
        {
            "doctype": MATERIAL_REQUEST_DOCTYPE,
            "material_request_type": material_request_type,
            "company": company,
            "transaction_date": frappe.utils.nowdate(),
            "items": items,
        }
    )
    doc.insert(ignore_permissions=True)
    # Deliberately not submitted -- draft only, for human review.
    return doc.name
