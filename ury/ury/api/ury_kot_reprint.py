import frappe
from frappe.utils import cint
from frappe.utils.print_format import print_by_server



@frappe.whitelist()
def reprint_kot(invoice_number):

    try:
        pos_invoice = frappe.get_doc("POS Invoice", invoice_number)
        pos_profile = pos_invoice.pos_profile
        order_type = pos_invoice.order_type

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

        branch = pos_invoice.branch
        productions = frappe.db.get_all(
            "URY Production Unit", filters={"branch": branch}, fields=["name"]
        )

        printed_any = False
        import copy

        for production in productions:
            productionItemGroupslist = frappe.get_all(
                "URY Production Item Groups",
                fields=["item_group"],
                filters={
                    "parent": production.name,
                    "parenttype": "URY Production Unit",
                },
                order_by="idx",
            )
            productionItemGroups = [
                item_group.item_group for item_group in productionItemGroupslist
            ]

            production_items = []
            for item in pos_invoice.items:
                if item.qty > 0:
                    item_group = frappe.db.get_value("Item", item.item_code, "item_group")
                    if item_group in productionItemGroups:
                        production_items.append(item)

            if production_items:
                production_unit_printers = frappe.get_all(
                    "URY Printer Settings",
                    fields=["printer"], 
                    filters={"parent": production.name, "parenttype":"URY Production Unit"},
                    order_by="idx"
                )
                
                if production_unit_printers:
                    temp_doc = copy.deepcopy(pos_invoice)
                    temp_doc.items = production_items
                    temp_doc.custom_production_unit = production.name
                    
                    for p in production_unit_printers:
                        frappe.log_error(f"KOT Reprint : {invoice_number}", f"Production Unit: {production.name} printer:{p.printer} kot_print_format:{kot_print_format}")
                        print_kot(p.printer, invoice_number, kot_print_format, temp_doc)
                        printed_any = True

        if not printed_any:
            frappe.log_error("KOT Reprint Error", f"No valid production unit printers found for Invoice {invoice_number}.")
            return "Failure: No valid printers found"

        return "Success"

    except Exception as e:
        error_message = f"KOT Reprint Error for Invoice {invoice_number}: {str(e)}"
        frappe.log_error(error_message, "KOT Reprint Error")
        frappe.throw("An unexpected error occurred while reprinting KOT. Please check logs.")


def print_kot(printer, docname, kot_print_format, doc=None):
    frappe.log_error(f"KOT Reprint : {docname}", f"POS Invoice: {docname}, Printer: {printer}, Print Format: {kot_print_format}")
    try:
        print_by_server("POS Invoice", docname, printer, kot_print_format, doc=doc)
    except Exception as e:
        frappe.log_error(f"KOT Reprint Error: {e}")