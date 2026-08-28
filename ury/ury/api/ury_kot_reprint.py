import frappe
from frappe import _
from frappe.utils import cint
from frappe.utils.print_format import print_by_server

from ury.ury_pos.api import getBranch
from ury.ury.doctype.ury_order.ury_order import _order_ownership_flags


@frappe.whitelist()
def reprint_kot(invoice_number):

    # Authorization checks run outside the existing try/except below so a
    # frappe.PermissionError isn't swallowed and rewritten into the generic
    # "unexpected error" message by that block's broad except clause.
    pos_invoice = frappe.get_doc("POS Invoice", invoice_number)

    if not frappe.has_permission("POS Invoice", "read", doc=pos_invoice):
        frappe.throw(_("Not permitted to view this order"), frappe.PermissionError)

    try:
        user_branch = getBranch()
    except frappe.ValidationError:
        if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
            user_branch = None
        else:
            raise

    if user_branch and pos_invoice.branch and pos_invoice.branch != user_branch:
        frappe.throw(
            _("Not permitted to reprint KOT for orders outside your active branch"),
            frappe.PermissionError,
        )

    if not pos_invoice.pos_profile:
        frappe.throw(f"POS Profile not found for Invoice {invoice_number}.")

    # Captain ownership/elevated-access check, reusing Phase 2's ownership
    # formula. Matches get_table_order_context()'s can_reprint_kot gate
    # exactly: is_mine OR has_elevated_access (billing access alone does not
    # imply reprint rights there, so it isn't included here either).
    flags = _order_ownership_flags(pos_invoice, pos_invoice.pos_profile)
    if not (flags["is_mine"] or flags["has_elevated_access"]):
        frappe.throw(
            _("Not permitted to reprint KOT for another Captain's order."),
            frappe.PermissionError,
        )

    try:
        pos_profile, restaurant_table, order_type = frappe.db.get_value(
            "POS Invoice", invoice_number, ["pos_profile", "restaurant_table","order_type"]
        )
        if not pos_profile:
            frappe.throw(f"POS Profile not found for Invoice {invoice_number}.")

        enable_kot_reprint, kot_print_format, table_order_printer, parcel_order_printer = frappe.db.get_value(
            "POS Profile", pos_profile,
            ["custom_enable_kot_reprint", "custom_reprint_kot_format", "custom_table_order_printer", "custom_parcel_order_printer"]
        )

        
        if not cint(enable_kot_reprint):
            frappe.throw("KOT Reprint is disabled in POS Profile.")

        if not kot_print_format:
            frappe.throw("No KOT Reprint Print Format is set in POS Profile.")
        
        printer = table_order_printer if order_type == "Dine In" else parcel_order_printer

        if not printer:
            frappe.throw("No printer is assigned for reprinting KOT.")

       
        print_kot(printer, invoice_number, kot_print_format)


        return "Success"

    except Exception as e:
        error_message = f"KOT Reprint Error for Invoice {invoice_number}: {str(e)}"
        frappe.log_error(error_message, "KOT Reprint Error")
        frappe.throw("An unexpected error occurred while reprinting KOT. Please check logs.")


def print_kot(printer,docname, kot_print_format):
    try:
        print_by_server("POS Invoice",docname, printer, kot_print_format)
    except Exception as e:
        frappe.log_error(f"KOT Reprint Error: {e}")