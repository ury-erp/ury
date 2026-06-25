import frappe
from frappe.utils import cint
from frappe.utils.print_format import print_by_server



@frappe.whitelist()
def reprint_kot(invoice_number):

    try:
        pos_profile = frappe.db.get_value(
            "POS Invoice", invoice_number, "pos_profile"
        )
        if not pos_profile:
            frappe.throw(f"POS Profile not found for Invoice {invoice_number}.")

        enable_kot_reprint, kot_print_format = frappe.db.get_value(
            "POS Profile", pos_profile,
            ["custom_enable_kot_reprint", "custom_reprint_kot_format"]
        )

        
        if not cint(enable_kot_reprint):
            frappe.throw("KOT Reprint is disabled in POS Profile.")

        if not kot_print_format:
            frappe.throw("No KOT Reprint Print Format is set in POS Profile.")
        
        kots = frappe.get_all("URY KOT", filters={"invoice": invoice_number}, fields=["name", "production", "restaurant_table", "table_takeaway"])
        
        if not kots:
            frappe.throw(f"No KOTs found for Invoice {invoice_number}.")

        printed = False
        for kot in kots:
            if kot.production:
                production_unit_printers = frappe.get_all(
                    "URY Printer Settings",
                    fields=["printer", "custom_block_takeaway_kot"], 
                    filters={"parent": kot.production, "custom_kot_print": 1, "parenttype": "URY Production Unit"},
                    order_by="idx"
                )
                if production_unit_printers:
                    for printer in production_unit_printers:
                        if printer.printer:
                            if printer.custom_block_takeaway_kot == 1:
                                if kot.restaurant_table and kot.table_takeaway == 0:
                                    print_kot(printer.printer, kot.name, kot_print_format)
                                    printed = True
                            else:
                                print_kot(printer.printer, kot.name, kot_print_format)
                                printed = True

        if not printed:
            frappe.throw("No production unit printers found for KOTs.")

        return "Success"

    except Exception as e:
        error_message = f"KOT Reprint Error for Invoice {invoice_number}: {str(e)}"
        frappe.log_error(error_message, "KOT Reprint Error")
        frappe.throw(f"An unexpected error occurred while reprinting KOT. Please check logs.")


def print_kot(printer,docname, kot_print_format):
    try:
        print_by_server("URY KOT", docname, printer, kot_print_format)
    except Exception as e:
        frappe.log_error(f"KOT Reprint Error: {e}")