import os

import frappe
from frappe import _

no_cache = 1

base_template_path = "www/printview.html"
standard_format = "templates/print_formats/standard.html"

from frappe.www.printview import validate_print_permission


def _is_print_status_tracking_disabled(pos_profile):
    """Kill switch: print-status tracking disabled for the given POS Profile.

    When disabled, printing keeps the legacy synchronous behavior (no URY
    Print Job registration, no realtime notifications).
    """
    if not pos_profile:
        return False
    from ury.ury.printing.service import is_print_status_tracking_disabled

    return bool(is_print_status_tracking_disabled(pos_profile))


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
    pos_profile = None
    if doctype == "POS Invoice":
        pos_profile = frappe.db.get_value("POS Invoice", name, "pos_profile")

    if _is_print_status_tracking_disabled(pos_profile):
        return _legacy_network_printing(
            doctype, name, printer_setting, print_format, doc, no_letterhead, file_path
        )

    validate_print_permission(frappe.get_doc(doctype, name))

    # Lazy import avoids a circular dependency: service.py imports
    # _make_print_job_id from this module.
    from ury.ury.printing.service import submit_and_monitor_print_job

    restaurant_table = None
    if doctype == "POS Invoice":
        restaurant_table = frappe.db.get_value("POS Invoice", name, "restaurant_table")

    printer_doc = frappe.get_doc("Network Printer Settings", printer_setting)
    result = printer_doc.print_doc(
        doctype=doctype,
        name=name,
        print_format=print_format,
        doc=doc,
        no_letterhead=no_letterhead,
        job_type="BILL",
        extra_metadata={
            "invoice": name,
            "table": restaurant_table,
            "restaurant_table": restaurant_table,
            "job_owner": frappe.session.user,
        },
    )

    if result.get("status") == "Success":
        result["invoice"] = name
    return result


def _legacy_network_printing(
    doctype,
    name,
    printer_setting,
    print_format=None,
    doc=None,
    no_letterhead=0,
    file_path=None,
):
    """Legacy synchronous network printing (pre print-status tracking).

    Preserved verbatim from the Aggregator-era implementation; used only when
    ``custom_disable_print_status_tracking`` is set on the POS Profile.
    """
    from pypdf import PdfWriter

    try:
        print_settings = frappe("Network Printer Settings", printer_setting)

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

            restaurant_table, invoice_printed, name = frappe.db.get_value(
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
            return f"Failed to print: {str(e)}"
    except Exception as e:
        import traceback

        traceback.print_exc()  # Print the full traceback for debugging
        return f"An error occurred: {str(e)}"


@frappe.whitelist()
def select_network_printer(pos_profile, invoice_id):
    if _is_print_status_tracking_disabled(pos_profile):
        return _legacy_select_network_printer(pos_profile, invoice_id)

    invoice_doc = frappe.get_doc("POS Invoice", invoice_id)
    if not frappe.has_permission("POS Invoice", "write", doc=invoice_doc):
        frappe.throw(_("Not permitted to print this invoice"), frappe.PermissionError)

    table = frappe.db.get_value("POS Invoice", invoice_id, "restaurant_table")
    print_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")

    print_jobs = []
    bill_printers = []

    if table:
        room = frappe.db.get_value("URY Table", table, "restaurant_room")
        bill_printers = frappe.get_all(
            "URY Printer Settings",
            filters={"parent": room, "parenttype": "URY Room", "bill": 1},
            pluck="printer",
            order_by="idx",
        )
    else:
        bill_printers = frappe.get_all(
            "URY Printer Settings",
            filters={"parent": pos_profile, "parenttype": "POS Profile", "bill": 1},
            pluck="printer",
            order_by="idx",
        )

    if bill_printers:
        for printer in bill_printers:
            print_result = network_printing(
                "POS Invoice", invoice_id, printer, print_format
            )
            print_jobs.append(print_result)

    any_succeeded = any(
        isinstance(job, dict) and job.get("status") == "Success"
        for job in print_jobs
    )

    if any_succeeded:
        return {
            "status": "Success",
            "print_jobs": print_jobs,
            "invoice": invoice_id,
        }

    return {
        "status": "Failure",
        "print_jobs": print_jobs,
        "invoice": invoice_id,
    }


def _legacy_select_network_printer(pos_profile, invoice_id):
    """Legacy single-printer selection (pre print-status tracking).

    Preserved verbatim from the Aggregator-era implementation; used only when
    ``custom_disable_print_status_tracking`` is set on the POS Profile.
    """
    table = frappe.db.get_value("POS Invoice", invoice_id, "restaurant_table")
    print_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")

    if table:
        room = frappe.db.get_value("URY Table", table, "restaurant_room")
        room_bill_printer = frappe.db.get_value(
            "URY Printer Settings", {"parent": room, "bill": 1}, "printer"
        )
        if room_bill_printer:
            print = network_printing(
                "POS Invoice", invoice_id, room_bill_printer, print_format
            )
            return print

    else:
        pos_bill_printer = frappe.db.get_value(
            "URY Printer Settings", {"parent": pos_profile, "bill": 1}, "printer"
        )
        if pos_bill_printer:
            print = network_printing(
                "POS Invoice", invoice_id, pos_bill_printer, print_format
            )
            return print


@frappe.whitelist()
def qz_print_update(invoice):
    try:
        invoice_doc = frappe.get_doc("POS Invoice", invoice)
        if not frappe.has_permission("POS Invoice", "write", doc=invoice_doc):
            frappe.throw(_("Not permitted to print this invoice"), frappe.PermissionError)

        table = frappe.db.get_value("POS Invoice", invoice, "restaurant_table")

        if table == None or table == "":
            # Update invoice_printed
            frappe.db.set_value(
                "POS Invoice",
                invoice,
                {
                    "invoice_printed": 1,
                    "custom_printing_time": frappe.utils.now_datetime(),
                },
                update_modified=False,
            )

            # Validate the update
            new_invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")
            if new_invoice_printed != 1:
                return {"status": "Failure"}
        else:
            invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")

            if invoice_printed == 0:
                # Update invoice_printed
                frappe.db.set_value(
                    "POS Invoice",
                    invoice,
                    {
                        "invoice_printed": 1,
                        "custom_printing_time": frappe.utils.now_datetime(),
                    },
                    update_modified=False,
                )

                from ury.ury.doctype.ury_order.ury_order import (
                    release_merge_cluster_tables,
                )

                release_merge_cluster_tables(table)
                # Validate both updates
                new_invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")
                new_table_status = frappe.db.get_value("URY Table", table, "occupied")

                if new_invoice_printed != 1 or new_table_status != 0:
                    return {"status": "Failure"}

        return {"status": "Success"}

    except Exception as e:
        frappe.log_error(message=e, title="Print Fail")
        frappe.throw(_("Error while printing order", e))
        return {"status": "Failure"}


@frappe.whitelist()
def print_pos_page(doctype, name, print_format):
    doc_to_check = frappe.get_doc(doctype, name)
    if not frappe.has_permission(doctype, "write", doc=doc_to_check):
        frappe.throw(_("Not permitted to print this document"), frappe.PermissionError)

    data = {"name": name, "doctype": doctype, "print_format": print_format}

    restaurant_table, branch, name = frappe.db.get_value(
        "POS Invoice", name, ["restaurant_table", "branch", "name"]
    )
    print_channel = "{}_{}".format("print", branch)
    frappe.publish_realtime(print_channel, {"data": data})

    invoice_printed = frappe.db.get_value("POS Invoice", name, "invoice_printed")

    if invoice_printed == 0:
        frappe.db.set_value(
            "POS Invoice",
            name,
            {
                "invoice_printed": 1,
                "custom_printing_time": frappe.utils.now_datetime(),
            },
        )

        if restaurant_table:
            from ury.ury.doctype.ury_order.ury_order import (
                release_merge_cluster_tables,
            )

            release_merge_cluster_tables(restaurant_table)


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


@frappe.whitelist()
def get_print_job_status(print_job_id):
    """Return the current metadata for a URY Print Job.

    The job is a Virtual DocType backed by JSON files.  If the job is not
    found, a structured failure response is returned instead of raising.
    """
    if not print_job_id:
        return {"status": "Failure", "message": "print_job_id is required"}

    try:
        doc = frappe.get_doc("URY Print Job", print_job_id)
        return {
            "status": "Success",
            "print_job": doc.as_dict(),
        }
    except frappe.DoesNotExistError:
        return {
            "status": "Failure",
            "message": f"Print job {print_job_id} not found",
        }
    except Exception as e:
        frappe.logger("printing").warning(
            {"event": "get_print_job_status_failed", "print_job_id": print_job_id},
            exc_info=True,
        )
        return {"status": "Failure", "message": str(e)}
