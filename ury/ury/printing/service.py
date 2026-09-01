import os
from typing import Optional

import frappe
from frappe.utils import now_datetime
from frappe.www.printview import validate_print_permission

from ury.ury.printing.print_job_monitor import register_print_job


def _make_print_job_id(printer_name: str = "Printer", cups_job_id: Optional[int] = None) -> str:
    """Generate a unique URY Print Job identity formatted as Printer Name + CUPS Job ID."""
    clean_printer = str(printer_name or "Printer").strip().replace(" ", "_")
    if cups_job_id is not None:
        return f"{clean_printer}-{cups_job_id}"
    return f"{clean_printer}-{now_datetime().strftime('%Y%m%d%H%M%S')}-{frappe.generate_hash(length=4)}"


def submit_and_monitor_print_job(
    doctype: str,
    name: str,
    printer_setting: str,
    print_format: Optional[str] = None,
    doc=None,
    no_letterhead: int = 0,
    job_type: str = "BILL",
    extra_metadata: Optional[dict] = None,
    copies: int = 1,
) -> dict:
    """Submit a document to CUPS and register a URY Print Job for monitoring.

    This is the single dispatcher for all CUPS network prints across URY and
    Grillax. It validates print permission, generates a PDF, submits the job to
    CUPS, persists metadata to the JSON file store, registers the job with the
    Redis monitor, and enqueues the poller.
    """
    try:
        import cups
    except ImportError:
        frappe.logger("printing").error("Failed to import cups library")
        return {"status": "Failure", "message": "Failed to import cups"}

    try:
        print_settings = frappe.get_doc("Network Printer Settings", printer_setting)
    except Exception as e:
        return {
            "status": "Failure",
            "message": f"Network Printer Settings '{printer_setting}' not found: {e}",
        }

    target_doc = doc if doc is not None else frappe.get_doc(doctype, name)
    try:
        validate_print_permission(target_doc)
    except Exception as e:
        return {"status": "Failure", "message": f"Print permission denied: {e}"}

    try:
        cups.setServer(print_settings.server_ip)
        cups.setPort(print_settings.port)
        conn = cups.Connection()
    except Exception as e:
        frappe.logger("printing").error(
            f"Failed to connect to printer at {print_settings.server_ip}:{print_settings.port}: {e}"
        )
        return {"status": "Failure", "message": f"Failed to connect to printer: {e}"}

    resolved_format = print_format
    if not resolved_format and doctype == "POS Invoice":
        pos_profile = getattr(target_doc, "pos_profile", None) or frappe.db.get_value("POS Invoice", name, "pos_profile")
        if pos_profile:
            resolved_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")

    pdf_content = frappe.get_print(
        doctype,
        name,
        resolved_format,
        doc=doc,
        no_letterhead=no_letterhead,
        as_pdf=True,
    )

    file_path = os.path.join("/", "tmp", f"frappe-pdf-{frappe.generate_hash()}.pdf")
    try:
        with open(file_path, "wb") as f:
            f.write(pdf_content)

        cups_job_id = None
        print_count = max(1, int(copies or 1))
        for _ in range(print_count):
            cups_job_id = conn.printFile(print_settings.printer_name, file_path, name, {})

        print_job_id = _make_print_job_id(print_settings.printer_name, cups_job_id)

        # Determine owner: extra_metadata -> frappe.session.user -> target_doc.owner -> Administrator
        user_owner = (
            (extra_metadata.get("job_owner") or extra_metadata.get("owner") or extra_metadata.get("user"))
            if extra_metadata else None
        )
        if not user_owner:
            session_user = getattr(frappe, "session", None) and getattr(frappe.session, "user", None)
            if session_user and session_user != "Guest":
                user_owner = session_user
            else:
                user_owner = getattr(target_doc, "owner", None) or "Administrator"

        # Determine table: extra_metadata -> target_doc.restaurant_table -> target_doc.table
        table_name = (
            (extra_metadata.get("table") or extra_metadata.get("restaurant_table")) if extra_metadata else None
        ) or getattr(target_doc, "restaurant_table", None) or getattr(target_doc, "table", None)

        metadata = {
            "print_job_id": print_job_id,
            "cups_job_id": cups_job_id,
            "job_type": job_type,
            "reference_doctype": doctype,
            "reference_name": name,
            "printer": printer_setting,
            "printer_name": print_settings.printer_name,
            "server_ip": print_settings.server_ip,
            "port": print_settings.port,
            "file_path": file_path,
            "status": "SUBMITTED",
            "created_at": frappe.utils.now(),
            "job_owner": user_owner,
            "table": table_name,
            "restaurant_table": table_name,
        }

        if extra_metadata:
            metadata.update(extra_metadata)

        frappe.logger("printing").info(
            {
                "event": "print_job_submitted",
                "job_type": job_type,
                **metadata,
            }
        )

        try:
            # File-store persistence and Redis monitor registration are handled
            # by register_print_job. The poller reads from the file store.
            register_print_job(metadata)

            frappe.enqueue(
                "ury.ury.printing.print_job_poller.poll_single_print_job",
                print_job_id=print_job_id,
                queue="default",
                timeout=60,
                now=frappe.flags.in_test,
            )
        except Exception:
            frappe.logger("printing").warning(
                {"event": "print_job_register_failed", "print_job_id": print_job_id},
                exc_info=True,
            )

        return {
            "status": "Success",
            "cups_job_id": cups_job_id,
            "print_job_id": print_job_id,
            "printer": printer_setting,
            "job_type": job_type,
            "reference_doctype": doctype,
            "reference_name": name,
            "file_path": file_path,
        }
    except Exception as e:
        frappe.logger("printing").error(f"Failed to submit print job: {e}", exc_info=True)
        return {"status": "Failure", "message": str(e)}
