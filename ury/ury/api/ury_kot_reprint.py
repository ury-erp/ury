import frappe
from frappe import _
from frappe.utils import cint

from ury.ury.api.ury_print import is_strict_print, print_via_cups


@frappe.whitelist()
def reprint_kot(invoice_number):

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


        print_kot(printer, invoice_number, kot_print_format, strict=is_strict_print(pos_profile))


        return "Success"

    except frappe.ValidationError:
        # Own frappe.throw messages and PrintFailedError are already
        # user-readable — pass them through unwrapped.
        raise
    except Exception as e:
        error_message = f"KOT Reprint Error for Invoice {invoice_number}: {str(e)}"
        frappe.log_error(error_message, "KOT Reprint Error")
        frappe.throw(_("KOT print failed: {0}").format(e))


def print_kot(printer, docname, kot_print_format, strict=False):
    # A user-initiated print must never fake success — errors propagate.
    print_via_cups("POS Invoice", docname, printer, kot_print_format, strict=bool(strict))
