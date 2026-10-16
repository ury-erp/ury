# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import os
import frappe
from frappe import _
from ury.ury.printing.file_store import get_job, save_job


@frappe.whitelist()
def retry_print_job(print_job_id: str, target_printer: str = None) -> dict:
    """Whitelisted API to retry a failed URY print job directly from the UI.

    Retrieves the persisted PDF directly from the URY Print Job record and resubmits it to
    the target printer (or original printer) without re-rendering.
    """
    job = get_job(print_job_id)
    if not job:
        frappe.throw(_("Print Job '{0}' not found.").format(print_job_id), frappe.DoesNotExistError)

    file_path = job.get("file_path")
    invoice = job.get("invoice") or job.get("reference_name")

    # If file is missing on disk, regenerate PDF fresh
    if not file_path or not os.path.exists(file_path):
        doctype = job.get("reference_doctype") or ("POS Invoice" if invoice else "URY KOT")
        docname = job.get("reference_name") or invoice
        if doctype and docname and frappe.db.exists(doctype, docname):
            pdf_content = frappe.get_print(doctype, docname, print_format=job.get("print_format"), as_pdf=True)
            file_path = os.path.join("/", "tmp", f"frappe-pdf-{frappe.generate_hash()}.pdf")
            with open(file_path, "wb") as f:
                f.write(pdf_content)
            job["file_path"] = file_path
            save_job(print_job_id, job)

    if not file_path or not os.path.exists(file_path):
        frappe.throw(_("Unable to resolve printable file for Print Job '{0}'.").format(print_job_id))

    printer_name = target_printer or job.get("printer")
    if not printer_name or not frappe.db.exists("Network Printer Settings", printer_name):
        frappe.throw(_("Network Printer Settings '{0}' not found.").format(printer_name))

    printer_doc = frappe.get_doc("Network Printer Settings", printer_name)
    extra_meta = {
        "retry_of": print_job_id,
        "invoice": invoice,
        "job_type": job.get("job_type", "BILL"),
    }

    result = printer_doc.print_file(
        file_path=file_path,
        job_name=job.get("reference_name") or invoice,
        job_type=job.get("job_type", "BILL"),
        extra_metadata=extra_meta,
    )

    if result.get("status") == "Success":
        job["retry_count"] = int(job.get("retry_count") or 0) + 1
        job["last_retry_job_id"] = result.get("print_job_id")
        save_job(print_job_id, job)

    return result
