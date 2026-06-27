import frappe
from frappe.utils import cint
from frappe.utils.print_format import print_by_server



@frappe.whitelist()
def reprint_kot(invoice_number):

    try:
        result = frappe.db.get_value(
            "POS Invoice", invoice_number, ["pos_profile", "restaurant_table", "order_type"]
        )
        if not result:
            frappe.throw(_("POS Invoice {0} not found.").format(invoice_number))
        pos_profile, _, order_type = result
        if not pos_profile:
            frappe.throw(_("POS Profile not found for Invoice {0}.").format(invoice_number))

        enable_kot_reprint, kot_print_format, table_order_printer, parcel_order_printer = frappe.db.get_value(
            "POS Profile", pos_profile,
            ["custom_enable_kot_reprint", "custom_reprint_kot_format", "custom_table_order_printer", "custom_parcel_order_printer"]
        )

        
        if not cint(enable_kot_reprint):
            frappe.throw(_("KOT Reprint is disabled in POS Profile."))

        if not kot_print_format:
            frappe.throw(_("No KOT Reprint Print Format is set in POS Profile."))
        
        printer = table_order_printer if order_type == "Dine In" else parcel_order_printer

        if not printer:
            frappe.throw(_("No printer is assigned for reprinting KOT."))

       
        print_kot(printer, invoice_number, kot_print_format)


        return "Success"

    except frappe.ValidationError:
        raise  # re-raise frappe.throw() validation errors as-is
    except Exception as e:
        frappe.log_error(f"KOT Reprint Error for Invoice {invoice_number}: {e}", "KOT Reprint Error")
        frappe.throw(_("An unexpected error occurred while reprinting KOT. Please check logs."))


def print_kot(printer, docname, kot_print_format):
    try:
        print_by_server("POS Invoice", docname, printer, kot_print_format)
    except Exception as e:
        frappe.log_error(f"KOT Reprint Error: {e}", "KOT Reprint Error")
        frappe.throw(_("Failed to send print job to printer '{0}'. Please check the printer connection.").format(printer))