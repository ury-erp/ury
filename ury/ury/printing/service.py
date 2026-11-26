import os
from typing import Optional

import frappe
from frappe.utils import now_datetime
from frappe.www.printview import validate_print_permission

from ury.ury.printing.finalizer import finalize_print_job
from ury.ury.printing.print_job_monitor import register_print_job, stop_monitoring_print_job
from ury.ury.printing.state_machine import FAILED, SUBMITTED


def is_print_status_tracking_disabled(pos_profile: Optional[str] = None) -> bool:
    """Check whether print status and printer monitoring are disabled for the given profile or globally."""
    if pos_profile:
        return bool(frappe.db.get_value("POS Profile", pos_profile, "custom_disable_print_status_tracking"))

    return False


def _make_print_job_id(printer_name: str = "Printer", cups_job_id: Optional[int] = None) -> str:
    """Generate a unique URY Print Job identity formatted as Printer Name + CUPS Job ID."""
    clean_printer = str(printer_name or "Printer").strip().replace(" ", "_")
    if cups_job_id is not None:
        return f"{clean_printer}-{cups_job_id}"
    return f"{clean_printer}-{now_datetime().strftime('%Y%m%d%H%M%S')}-{frappe.generate_hash(length=4)}"


def _build_print_job_metadata(
    doctype,
    name,
    target_doc,
    print_settings,
    printer_setting,
    print_format,
    job_type,
    extra_metadata,
):
    user_owner = (
        (extra_metadata.get("job_owner") or extra_metadata.get("owner") or extra_metadata.get("user"))
        if extra_metadata
        else None
    )
    if not user_owner:
        session_user = getattr(frappe, "session", None) and getattr(frappe.session, "user", None)
        if session_user and session_user != "Guest":
            user_owner = session_user
        else:
            user_owner = getattr(target_doc, "owner", None) or "Administrator"

    table_name = (
        (extra_metadata.get("table") or extra_metadata.get("restaurant_table")) if extra_metadata else None
    ) or getattr(target_doc, "restaurant_table", None) or getattr(target_doc, "table", None)

    pos_profile = (
        (extra_metadata.get("pos_profile") if extra_metadata else None)
        or getattr(target_doc, "pos_profile", None)
        or (frappe.db.get_value("POS Invoice", name, "pos_profile") if doctype == "POS Invoice" else None)
    )

    metadata = {
        "print_job_id": _make_print_job_id(print_settings.printer_name),
        "cups_job_id": None,
        "job_type": job_type,
        "reference_doctype": doctype,
        "reference_name": name,
        "printer": printer_setting,
        "printer_name": print_settings.printer_name,
        "server_ip": print_settings.server_ip,
        "port": print_settings.port,
        "print_format": print_format,
        "pos_profile": pos_profile,
        "file_path": None,
        "status": "SUBMITTING",
        "created_at": frappe.utils.now(),
        "job_owner": user_owner,
        "table": table_name,
        "restaurant_table": table_name,
    }
    if extra_metadata:
        metadata.update(extra_metadata)
    return metadata


def _fail_print_job(metadata, stage, error):
    metadata = dict(metadata)
    reason = f"{stage}: {error}"
    metadata.update(
        {
            "status": FAILED,
            "failure_reason": reason,
            "completed_at": frappe.utils.now(),
            "last_checked_at": frappe.utils.now(),
        }
    )
    print_job_id = metadata["print_job_id"]
    frappe.logger("printing").error(
        {
            "event": "print_job_submission_failed",
            "failure_stage": stage,
            "print_job_id": print_job_id,
            "reference_doctype": metadata.get("reference_doctype"),
            "reference_name": metadata.get("reference_name"),
            "printer": metadata.get("printer"),
            "print_format": metadata.get("print_format"),
            "reason": reason,
        },
        exc_info=True,
    )

    try:
        registered_id = register_print_job(metadata)
        if registered_id:
            finalize_print_job(print_job_id, FAILED, failure_reason=reason)
    except Exception:
        frappe.logger("printing").warning(
            {"event": "print_job_failure_finalization_failed", "print_job_id": print_job_id},
            exc_info=True,
        )
    finally:
        stop_monitoring_print_job(print_job_id)

    result = dict(metadata)
    result.update({"status": "Failure", "message": str(error), "failure_stage": stage})
    return result


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
    """Render, submit, register, and monitor one network print attempt."""
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

    resolved_format = print_format
    if not resolved_format and doctype == "POS Invoice":
        pos_profile = getattr(target_doc, "pos_profile", None) or frappe.db.get_value(
            "POS Invoice", name, "pos_profile"
        )
        if pos_profile:
            resolved_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")
        if not resolved_format:
            resolved_format = "POS Invoice"

    metadata = _build_print_job_metadata(
        doctype=doctype,
        name=name,
        target_doc=target_doc,
        print_settings=print_settings,
        printer_setting=printer_setting,
        print_format=resolved_format,
        job_type=job_type,
        extra_metadata=extra_metadata,
    )

    try:
        cups.setServer(print_settings.server_ip)
        cups.setPort(print_settings.port)
        conn = cups.Connection()
    except Exception as e:
        return _fail_print_job(metadata, "CUPS_CONNECT", e)

    try:
        pdf_content = frappe.get_print(
            doctype,
            name,
            resolved_format,
            doc=doc,
            no_letterhead=no_letterhead,
            as_pdf=True,
        )
    except Exception as e:
        return _fail_print_job(metadata, "PDF_RENDER", e)

    file_path = os.path.join("/", "tmp", f"frappe-pdf-{frappe.generate_hash()}.pdf")
    metadata["file_path"] = file_path
    try:
        with open(file_path, "wb") as f:
            f.write(pdf_content)

        cups_job_id = None
        print_count = max(1, int(copies or 1))
        for _ in range(print_count):
            cups_job_id = conn.printFile(print_settings.printer_name, file_path, name, {})
    except Exception as e:
        return _fail_print_job(metadata, "CUPS_SUBMIT", e)

    metadata.update(
        {
            "print_job_id": _make_print_job_id(print_settings.printer_name, cups_job_id),
            "cups_job_id": cups_job_id,
            "status": SUBMITTED,
        }
    )
    frappe.logger("printing").info(
        {
            "event": "print_job_submitted",
            "job_type": job_type,
            **metadata,
        }
    )

    if is_print_status_tracking_disabled(metadata.get("pos_profile")):
        frappe.logger("printing").info(
            {
                "event": "print_job_submitted_tracking_disabled",
                "job_type": job_type,
                "printer": printer_setting,
                "pos_profile": metadata.get("pos_profile"),
                "cups_job_id": cups_job_id,
            }
        )
        return {
            "status": "Success",
            "cups_job_id": cups_job_id,
            "print_job_id": metadata["print_job_id"],
            "printer": printer_setting,
            "job_type": job_type,
            "reference_doctype": doctype,
            "reference_name": name,
            "file_path": file_path,
        }

    try:
        register_print_job(metadata)
        frappe.enqueue(
            "ury.ury.printing.print_job_poller.poll_single_print_job",
            print_job_id=metadata["print_job_id"],
            queue="default",
            timeout=60,
            now=frappe.flags.in_test,
        )
    except Exception:
        frappe.logger("printing").warning(
            {"event": "print_job_register_failed", "print_job_id": metadata["print_job_id"]},
            exc_info=True,
        )

    return {
        "status": "Success",
        "cups_job_id": cups_job_id,
        "print_job_id": metadata["print_job_id"],
        "printer": printer_setting,
        "job_type": job_type,
        "reference_doctype": doctype,
        "reference_name": name,
        "file_path": file_path,
    }
