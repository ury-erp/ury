import os
import frappe
from frappe import _
from frappe.utils import now_datetime
from ury.ury.doctype.ury_order.ury_order import release_merge_cluster_tables

no_cache = 1

base_template_path = "www/printview.html"
standard_format = "templates/print_formats/standard.html"

from frappe.www.printview import validate_print_permission


def _make_print_job_id():
    """Generate a unique internal URY Print Job identity."""
    return f"PJ-{now_datetime().strftime('%Y%m%d%H%M%S')}-{frappe.generate_hash(length=6)}"


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
            "restaurant_table": restaurant_table,
        },
    )

    if result.get("status") == "Success":
        result["invoice"] = name
    return result



@frappe.whitelist()
def select_network_printer(pos_profile, invoice_id):
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
            order_by="idx"
        )
    else:
        bill_printers = frappe.get_all(
            "URY Printer Settings",
            filters={"parent": pos_profile, "parenttype": "POS Profile", "bill": 1},
            pluck="printer",
            order_by="idx"
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
                    "custom_printing_time":frappe.utils.now_datetime()
                },
                update_modified=False
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
                        "custom_printing_time":frappe.utils.now_datetime()
                    }, 
                    update_modified=False
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
        frappe.throw(_("Error while printing order",e))                   
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
                "custom_printing_time":frappe.utils.now_datetime()
            }   
        )

        if restaurant_table:
            release_merge_cluster_tables(restaurant_table)


@frappe.whitelist()
def qz_certificate():
    site_config = frappe.get_site_config()
    qz_key_value = site_config.get("qz_cert")

    return qz_key_value


QZ_SIGNING_ROLES = {
    "Administrator",
    "System Manager",
    "URY Admin",
    "URY Manager",
    "URY Cashier",
}

def _get_qz_private_key():
    key_value = (frappe.get_site_config().get("qz_private_key") or "").strip()
    if not key_value:
        frappe.throw(_("QZ private key is not configured in site config"))
    if key_value.startswith("-----BEGIN"):
        return key_value.encode()
    private_root = os.path.abspath(frappe.get_site_path("private"))
    key_path = os.path.abspath(frappe.get_site_path("private", key_value))
    if os.path.commonpath([key_path, private_root]) != private_root:
        frappe.throw(_("Invalid QZ private key path in site config"))
    with open(key_path, "rb") as key_file:
        return key_file.read()

@frappe.whitelist()
def signature_promise(toSign=None):
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if not QZ_SIGNING_ROLES.intersection(frappe.get_roles()):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if not toSign:
        frappe.throw(_("Missing payload to sign"))
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    import base64
    private_key = serialization.load_pem_private_key(
        _get_qz_private_key(), password=None
    )
    signature = private_key.sign(
        toSign.encode("utf-8"), padding.PKCS1v15(), hashes.SHA512()
    )
    return base64.b64encode(signature).decode("ascii")


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

