import frappe
from erpnext.accounts.doctype.pos_invoice.pos_invoice import get_bin_qty, get_bundle_availability
from frappe.query_builder.functions import IfNull, Sum
from frappe.utils import flt

def get_pos_bundle_reserved_qty(item_code, warehouse, branch):
    if not branch:
        return 0

    pos_opening_entry = frappe.db.get_value(
        "POS Opening Entry",
        {"branch": branch, "docstatus": 1},
        "creation"
    )

    if not pos_opening_entry:
        return 0

    reserved_qty = frappe.db.sql(
        """
        SELECT SUM(bundle_item.qty * pos_item.qty) AS qty
        FROM `tabPOS Invoice` AS pos
        INNER JOIN `tabPOS Invoice Item` AS pos_item ON pos.name = pos_item.parent
        INNER JOIN `tabProduct Bundle` AS bundle ON bundle.new_item_code = pos_item.item_code
        INNER JOIN `tabProduct Bundle Item` AS bundle_item ON bundle_item.parent = pos_item.item_code
        WHERE IFNULL(pos.consolidated_invoice, '') = ''
        AND pos_item.docstatus = 1
        AND bundle_item.item_code = %s
        AND pos_item.warehouse = %s
        AND pos.creation >= %s
        """,
        (item_code, warehouse, pos_opening_entry),
        as_dict=True,
    )
    return reserved_qty[0].qty if reserved_qty else 0

def get_pos_reserved_qty(item_code, warehouse, branch):
    if not branch:
        return 0

    pos_opening_entry = frappe.db.get_value(
        "POS Opening Entry",
        {"branch": branch, "docstatus": 1},
        "creation"
    )

    if not pos_opening_entry:
        return 0

    p_inv = frappe.qb.DocType("POS Invoice")
    p_item = frappe.qb.DocType("POS Invoice Item")

    reserved_qty = (
        frappe.qb.from_(p_inv)
        .from_(p_item)
        .select(Sum(p_item.stock_qty).as_("stock_qty"))
        .where(
            (p_inv.name == p_item.parent)
            & (IfNull(p_inv.consolidated_invoice, "") == "")
            & (p_item.docstatus == 1)
            & (p_item.item_code == item_code)
            & (p_item.warehouse == warehouse)
            & (p_inv.creation >= pos_opening_entry)  
        )
    ).run(as_dict=True)

    return flt(reserved_qty[0].stock_qty) if reserved_qty else 0

@frappe.whitelist()
def get_available_stock(item_code, warehouse, branch=None, parent_item=None):
    if not warehouse and branch:
        warehouse = frappe.get_value("POS Profile", {"branch": branch}, "warehouse")
        
    if not warehouse:
        return {"available_qty": 0}

    pos_bundle_reserved_qty = get_pos_bundle_reserved_qty(item_code, warehouse, branch) or 0
    pos_reserved_qty = get_pos_reserved_qty(item_code, warehouse, branch) or 0

    current_stock_qty = get_bin_qty(item_code, warehouse) or 0

    total_reserved_qty = pos_bundle_reserved_qty + pos_reserved_qty
    available_qty = current_stock_qty - total_reserved_qty

    parent_item_qty = 0
    if parent_item:
        parent_item_qty = get_bundle_availability(parent_item, warehouse)

    return {
        "available_qty": available_qty,
        "pos_bundle_reserved_qty": pos_bundle_reserved_qty,
        "pos_reserved_qty": pos_reserved_qty,
        "current_stock_qty": current_stock_qty,
        "parent_item_qty": parent_item_qty,
        "total_reserved_qty": total_reserved_qty
    }
