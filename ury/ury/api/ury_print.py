import frappe
from frappe import _

import os

from pypdf import PdfWriter

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
            frappe.throw(_("CUPS library is not installed on the server"))

        try:
            cups.setServer(print_settings.server_ip)
            cups.setPort(print_settings.port)
            conn = cups.Connection()
        except Exception as e:
            frappe.throw(_("Failed to connect to the printer: {0}").format(str(e)))

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
            with open(file_path, "wb") as f:
                output.write(f)
            conn.printFile(print_settings.printer_name, file_path, name, {})

            restaurant_table, invoice_printed, invoice_name = frappe.db.get_value(
                "POS Invoice", name, ["restaurant_table", "invoice_printed", "name"]
            )

            if restaurant_table and invoice_printed == 0:
                frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)
                frappe.db.set_value(
                    "URY Table",
                    restaurant_table,
                    {"occupied": 0, "latest_invoice_time": None},
                )
            else:
                frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)

            return "Success"
        except Exception as e:
            frappe.log_error(message=frappe.get_traceback(), title="Network Printing - Print Error")
            frappe.throw(_("Failed to print: {0}").format(str(e)))
    except Exception as e:
        frappe.log_error(message=frappe.get_traceback(), title="Network Printing Error")
        frappe.throw(_("An error occurred: {0}").format(str(e)))


@frappe.whitelist()
def select_network_printer(pos_profile, invoice_id):
    table = frappe.db.get_value("POS Invoice", invoice_id, "restaurant_table")
    print_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")

    if table:
        room = frappe.db.get_value("URY Table", table, "restaurant_room")
        room_bill_printer = frappe.db.get_value(
            "URY Printer Settings", {"parent": room, "bill": 1}, "printer"
        )
        if room_bill_printer:
            return network_printing(
                "POS Invoice", invoice_id, room_bill_printer, print_format
            )

    else:
        pos_bill_printer = frappe.db.get_value(
            "URY Printer Settings", {"parent": pos_profile, "bill": 1}, "printer"
        )
        if pos_bill_printer:
            return network_printing(
                "POS Invoice", invoice_id, pos_bill_printer, print_format
            )

    frappe.throw(_("No printer configured for this POS Profile or table"))


@frappe.whitelist()
def qz_print_update(invoice):
    try:
        table = frappe.db.get_value("POS Invoice", invoice, "restaurant_table")

        if not table:
            frappe.db.set_value(
                "POS Invoice", invoice, "invoice_printed", 1, update_modified=False
            )
        else:
            invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")

            if invoice_printed == 0:
                # Use a single SQL transaction to update both atomically
                frappe.db.sql(
                    """UPDATE `tabPOS Invoice` SET invoice_printed = 1 WHERE name = %s""",
                    invoice,
                )
                frappe.db.sql(
                    """UPDATE `tabURY Table` SET occupied = 0, latest_invoice_time = NULL WHERE name = %s""",
                    table,
                )

        return {"status": "Success"}

    except Exception as e:
        frappe.log_error(message=e, title="Print Fail")
        frappe.throw(_("Error while printing order: {0}").format(str(e)))


@frappe.whitelist()
def print_pos_page(doctype, name, print_format):
    data = {"name": name, "doctype": doctype, "print_format": print_format}

    result = frappe.db.get_value(
        "POS Invoice", name, ["restaurant_table", "branch", "name"]
    )
    if not result:
        frappe.throw(_("POS Invoice {0} not found").format(name))
    restaurant_table, branch, invoice_name = result
    print_channel = "{}_{}".format("print", branch)
    frappe.publish_realtime(print_channel, {"data": data})

    invoice_printed = frappe.db.get_value("POS Invoice", name, "invoice_printed")

    if invoice_printed == 0:
        frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)

        if restaurant_table:
            frappe.db.set_value(
                "URY Table",
                restaurant_table,
                {"occupied": 0, "latest_invoice_time": None},
            )


@frappe.whitelist()
def qz_certificate():
    site_config = frappe.get_site_config()
    qz_key_value = site_config.get("qz_cert")

    return qz_key_value


@frappe.whitelist()
def signature_promise():
    if "System Manager" not in frappe.get_roles():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    site_config = frappe.get_site_config()
    key_value = site_config.get("qz_private_key")
    return key_value