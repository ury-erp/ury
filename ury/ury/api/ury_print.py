import frappe
from frappe import _
from frappe.utils import cint

import os
import socket
import time

from pypdf import PdfWriter

no_cache = 1

base_template_path = "www/printview.html"
standard_format = "templates/print_formats/standard.html"

from frappe.www.printview import validate_print_permission


class PrintFailedError(frappe.ValidationError):
    pass


# IPP job states (RFC 8011)
IPP_JOB_CANCELED = 7
IPP_JOB_ABORTED = 8
IPP_JOB_COMPLETED = 9

CUPS_PRINTER_STOPPED = 5


def _get_cups_connection(print_settings, connect_timeout=3):
    """Connect to the CUPS server of a Network Printer Settings doc.

    pycups has no connection timeout — a dead print node would block the
    request for minutes — so reachability is probed with a raw socket first.
    """
    try:
        import cups
    except ImportError:
        frappe.throw(_("pycups is not installed on the server"), PrintFailedError)

    server_ip = print_settings.server_ip
    port = cint(print_settings.port) or 631
    try:
        with socket.create_connection((server_ip, port), timeout=connect_timeout):
            pass
    except OSError as e:
        frappe.throw(
            _("Print server {0}:{1} is unreachable — check the print PC is on ({2})").format(
                server_ip, port, e
            ),
            PrintFailedError,
        )

    cups.setServer(server_ip)
    cups.setPort(port)
    return cups.Connection()


def check_printer_ready(printer_setting, connect_timeout=3):
    """Pre-flight check: print node reachable, queue exists and accepts jobs.

    A powered-off printer behind a socket:// backend still looks idle to
    CUPS — only job-state polling in print_via_cups detects that.
    """
    print_settings = frappe.get_doc("Network Printer Settings", printer_setting)
    conn = _get_cups_connection(print_settings, connect_timeout)
    printers = conn.getPrinters()
    attrs = printers.get(print_settings.printer_name)
    if attrs is None:
        frappe.throw(
            _("Printer queue '{0}' does not exist on print server {1}").format(
                print_settings.printer_name, print_settings.server_ip
            ),
            PrintFailedError,
        )
    if not attrs.get("printer-is-accepting-jobs", True) or (
        attrs.get("printer-state") == CUPS_PRINTER_STOPPED
    ):
        frappe.throw(
            _("Printer '{0}' is stopped or not accepting jobs — check it is powered on").format(
                print_settings.printer_name
            ),
            PrintFailedError,
        )


def print_via_cups(
    doctype,
    name,
    printer_setting,
    print_format=None,
    doc=None,
    no_letterhead=0,
    file_path=None,
    strict=False,
    job_timeout=8,
    poll_interval=0.4,
):
    """Render a PDF and print it via CUPS.

    strict=True waits until CUPS reports the job completed (bytes delivered
    to the printer). On timeout the job is cancelled AND purged so it can
    never ghost-print when the printer comes back online, then raises
    PrintFailedError.
    """
    import cups

    print_settings = frappe.get_doc("Network Printer Settings", printer_setting)
    conn = _get_cups_connection(print_settings)

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
        file_path = os.path.join("/", "tmp", f"frappe-pdf-{frappe.generate_hash()}.pdf")
    with open(file_path, "wb") as f:
        output.write(f)

    job_id = conn.printFile(print_settings.printer_name, file_path, name, {})
    if not strict:
        return

    deadline = time.monotonic() + job_timeout
    while time.monotonic() < deadline:
        try:
            attrs = conn.getJobAttributes(job_id)
        except cups.IPPError:
            # Job record already cleaned up — only happens after completion
            # (e.g. PreserveJobHistory off on the node).
            return
        state = attrs.get("job-state")
        if state == IPP_JOB_COMPLETED:
            return
        if state in (IPP_JOB_CANCELED, IPP_JOB_ABORTED):
            frappe.throw(
                _("Print job on '{0}' was {1} by the print server").format(
                    print_settings.printer_name,
                    "cancelled" if state == IPP_JOB_CANCELED else "aborted",
                ),
                PrintFailedError,
            )
        time.sleep(poll_interval)

    try:
        conn.cancelJob(job_id, True)  # purge=True: never ghost-print later
    except Exception:
        pass
    frappe.throw(
        _(
            "Printer '{0}' did not accept the job within {1}s — check it is powered on and connected"
        ).format(print_settings.printer_name, job_timeout),
        PrintFailedError,
    )


def is_strict_print(pos_profile):
    return cint(
        frappe.db.get_value("POS Profile", pos_profile, "custom_block_on_print_failure")
    )


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
        strict = 0
        if doctype == "POS Invoice":
            pos_profile = frappe.db.get_value("POS Invoice", name, "pos_profile")
            if pos_profile:
                strict = is_strict_print(pos_profile)

        print_via_cups(
            doctype,
            name,
            printer_setting,
            print_format,
            doc=doc,
            no_letterhead=no_letterhead,
            file_path=file_path,
            strict=bool(strict),
        )

        # Printing the bill no longer frees the table: it stays occupied
        # until the invoice is settled (see release_table on submit).
        frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)

        return "Success"
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Network Print Failed")
        return f"Failed to print: {str(e)}"


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
        # Printing the bill no longer frees the table: it stays occupied
        # until the invoice is settled (see release_table on submit).
        frappe.db.set_value(
            "POS Invoice", invoice, "invoice_printed", 1, update_modified=False
        )

        new_invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")
        if new_invoice_printed != 1:
            return {"status": "Failure"}

        return {"status": "Success"}

    except Exception as e:
        frappe.log_error(message=e, title="Print Fail")
        frappe.throw(_("Error while printing order",e))
        return {"status": "Failure"}


@frappe.whitelist()
def print_pos_page(doctype, name, print_format):
    data = {"name": name, "doctype": doctype, "print_format": print_format}

    restaurant_table, branch, name = frappe.db.get_value(
        "POS Invoice", name, ["restaurant_table", "branch", "name"]
    )
    print_channel = "{}_{}".format("print", branch)
    frappe.publish_realtime(print_channel, {"data": data})

    # Printing the bill no longer frees the table: it stays occupied
    # until the invoice is settled (see release_table on submit).
    frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)


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
