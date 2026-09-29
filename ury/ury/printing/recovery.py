"""Redis/CUPS reconciliation for URY print jobs.

This module rebuilds the in-memory print-job index after a Redis flush,
restart, or cache eviction by scanning CUPS active jobs and re-registering
any job that belongs to an unprinted POS Invoice but is no longer tracked in
Redis.

The recovery process is deliberately conservative: it never flips
``invoice_printed`` or marks jobs as failed merely because Redis memory was
lost.  Jobs are simply re-registered so the existing poller/monitor loop can
continue tracking them to completion.
"""

import frappe

from ury.ury.printing.print_job_monitor import (
    get_active_print_job_ids,
    get_print_job,
    register_print_job,
)

try:
    import cups
except ImportError:
    cups = None


def _make_print_job_id():
    """Generate a unique internal URY Print Job identity."""
    from frappe.utils import now_datetime

    return f"PJ-{now_datetime().strftime('%Y%m%d%H%M%S')}-{frappe.generate_hash(length=6)}"


def _build_active_cups_job_index():
    """Return a set of (server_ip, port, cups_job_id) tuples currently tracked.

    The index is built from active Redis print jobs so recovery can skip jobs
    that are already monitored.
    """
    index = set()
    for print_job_id in get_active_print_job_ids():
        metadata = get_print_job(print_job_id)
        if not metadata:
            continue
        server_ip = metadata.get("server_ip")
        port = metadata.get("port")
        cups_job_id = metadata.get("cups_job_id")
        if server_ip is not None and port is not None and cups_job_id is not None:
            index.add((server_ip, port, cups_job_id))
    return index


def _get_unprinted_invoice_names(invoice_names):
    """Return the subset of invoice names that are unprinted POS Invoices and have tracking enabled."""
    if not invoice_names:
        return {}

    unique_names = list(set(invoice_names))
    rows = frappe.get_all(
        "POS Invoice",
        filters={"name": ["in", unique_names], "invoice_printed": 0},
        fields=["name", "restaurant_table", "pos_profile"],
    )
    from ury.ury.printing.service import is_print_status_tracking_disabled

    valid_invoices = {}
    for row in rows:
        if not is_print_status_tracking_disabled(row.get("pos_profile")):
            valid_invoices[row["name"]] = row.get("restaurant_table")
    return valid_invoices


@frappe.whitelist()
def reconcile_active_print_jobs():
    """Re-register active CUPS jobs that are missing from Redis.

    This function is safe to run from a scheduler event.  It queries every
    configured ``Network Printer Settings`` record, asks CUPS for active jobs,
    and re-registers any active job whose originating document is still an
    unprinted ``POS Invoice`` and that is not already tracked in Redis.

    Returns:
        A summary dictionary with the number of printer settings checked,
        CUPS jobs inspected, and jobs recovered.
    """
    summary = {
        "printers_checked": 0,
        "cups_jobs_inspected": 0,
        "jobs_recovered": 0,
        "errors": [],
    }

    if cups is None:
        summary["errors"].append("pycups not available")
        frappe.logger("printing").warning(
            {"event": "reconcile_active_print_jobs", "error": "pycups not available"}
        )
        return summary

    try:
        printer_settings = frappe.get_all(
            "Network Printer Settings",
            fields=["name", "server_ip", "port", "printer_name"],
        )
    except Exception as exc:
        summary["errors"].append(f"failed to load printer settings: {exc}")
        frappe.logger("printing").warning(
            {
                "event": "reconcile_active_print_jobs",
                "error": "failed to load printer settings",
                "details": str(exc),
            }
        )
        return summary

    tracked_cups_jobs = _build_active_cups_job_index()

    for setting in printer_settings:
        server_ip = setting.get("server_ip")
        port = setting.get("port")
        printer_name = setting.get("printer_name")
        printer_setting_name = setting.get("name")

        if not server_ip or not port:
            continue

        summary["printers_checked"] += 1

        try:
            conn = cups.Connection(host=server_ip, port=port)
            active_jobs = conn.getJobs(which_jobs="active") or {}
        except Exception as exc:
            summary["errors"].append(
                f"CUPS query failed for {printer_setting_name} ({server_ip}:{port}): {exc}"
            )
            frappe.logger("printing").warning(
                {
                    "event": "reconcile_active_print_jobs_cups_query_failed",
                    "printer_setting": printer_setting_name,
                    "server_ip": server_ip,
                    "port": port,
                    "error": str(exc),
                }
            )
            continue

        candidate_invoices = {}
        for cups_job_id, attrs in active_jobs.items():
            summary["cups_jobs_inspected"] += 1

            if (server_ip, port, cups_job_id) in tracked_cups_jobs:
                continue

            invoice_name = attrs.get("job-name") if isinstance(attrs, dict) else None
            if not invoice_name:
                continue

            candidate_invoices[cups_job_id] = invoice_name

        unprinted = _get_unprinted_invoice_names(list(candidate_invoices.values()))

        for cups_job_id, invoice_name in candidate_invoices.items():
            if invoice_name not in unprinted:
                continue

            print_job_id = _make_print_job_id()

            # Defensive check: if the generated id already exists (extremely
            # unlikely), skip to avoid overwriting an existing job.
            if get_print_job(print_job_id) is not None:
                continue

            table_val = unprinted.get(invoice_name)
            inv_owner = frappe.db.get_value("POS Invoice", invoice_name, "owner") or "Administrator"

            metadata = {
                "print_job_id": print_job_id,
                "cups_job_id": cups_job_id,
                "invoice": invoice_name,
                "printer_setting": printer_setting_name,
                "printer_name": printer_name,
                "server_ip": server_ip,
                "port": port,
                "status": "SUBMITTED",
                "table": table_val,
                "restaurant_table": table_val,
                "job_owner": inv_owner,
                "recovered": True,
            }

            registered_id = register_print_job(metadata)
            if registered_id:
                summary["jobs_recovered"] += 1
                frappe.logger("printing").info(
                    {
                        "event": "print_job_recovered_from_cups",
                        "print_job_id": print_job_id,
                        "cups_job_id": cups_job_id,
                        "invoice": invoice_name,
                        "printer_setting": printer_setting_name,
                        "printer_name": printer_name,
                        "server_ip": server_ip,
                        "port": port,
                    }
                )

    return summary
