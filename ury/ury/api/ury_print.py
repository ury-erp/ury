import frappe
from frappe import _

import os

from PyPDF2 import PdfWriter

no_cache = 1

base_template_path = "www/printview.html"
standard_format = "templates/print_formats/standard.html"

from frappe.www.printview import validate_print_permission


@frappe.whitelist()
def network_printing(
    doctype,
    name,
    printer_setting,
    print_format=None,
    doc=None,
    no_letterhead=0,
    file_path=None,
):
    try:
        print_settings = frappe.get_doc("Network Printer Settings", printer_setting)

        try:
            import cups
        except ImportError:
            return "Failed to import cups"

        try:
            cups.setServer(print_settings.server_ip)
            cups.setPort(print_settings.port)
            conn = cups.Connection()
        except Exception as e:
            return f"Failed to connect to the printer: {str(e)}"

        try:
            output = PdfWriter()
            output = frappe.get_print(
                doctype,
                name,
                print_format,
                doc=doc,
                no_letterhead=no_letterhead,
                as_pdf=True,
                output=output,
            )
            if not file_path:
                file_path = os.path.join(
                    "/", "tmp", f"frappe-pdf-{frappe.generate_hash()}.pdf"
                )
            output.write(open(file_path, "wb"))
            conn.printFile(print_settings.printer_name, file_path, name, {})

            pos_invoice = frappe.get_doc("POS Invoice", name)

            if pos_invoice.restaurant_table:
                if pos_invoice.invoice_printed == 0:
                    pos_invoice.invoice_printed = 1
                    pos_invoice.save()
                    frappe.db.set_value(
                        "URY Table",
                        pos_invoice.restaurant_table,
                        {"occupied": 0, "latest_invoice_time": None},
                    )
            else:
                pos_invoice.invoice_printed = 1
                pos_invoice.save()

            return "Success"
        except Exception as e:
            return f"Failed to print: {str(e)}"
    except Exception as e:
        import traceback

        traceback.print_exc()  # Print the full traceback for debugging
        return f"An error occurred: {str(e)}"


@frappe.whitelist()
def qz_print_update(invoice):
    table = frappe.db.get_value("POS Invoice", invoice, "restaurant_table")

    if table == None or table == "":
        frappe.db.set_value(
            "POS Invoice", invoice, "invoice_printed", 1, update_modified=False
        )

    else:
        invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")

        if invoice_printed == 0:
            frappe.db.set_value(
                "POS Invoice", invoice, "invoice_printed", 1, update_modified=False
            )

            frappe.db.set_value(
                "URY Table", table, {"occupied": 0, "latest_invoice_time": None}
            )


@frappe.whitelist()
def print_pos_page(doctype, name, print_format):
    data = {"name": name, "doctype": doctype, "print_format": print_format}
    pos_invoice = frappe.get_doc("POS Invoice", name)
    branch = pos_invoice.branch
    print_channel = "{}_{}".format("print", branch)
    frappe.publish_realtime(print_channel, {"data": data})

    frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)
    if pos_invoice.restaurant_table:
        frappe.db.set_value(
            "URY Table",
            pos_invoice.restaurant_table,
            {"occupied": 0, "latest_invoice_time": None},
        )


@frappe.whitelist()
def qz_certificate():
    site_config = frappe.get_site_config()
    qz_key_value = site_config.get("qz_cert")

    return qz_key_value


@frappe.whitelist()
def signature_promise():
    site_config = frappe.get_site_config()
    key_value = site_config.get("qz_private_key")

    return key_value
