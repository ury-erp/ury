"""CUPS polling loop for active URY print jobs.

This module is the glue between the Redis-backed monitor and the physical CUPS
server.  It is designed to be invoked by a background job or scheduler tick:

    poll_active_print_jobs()  -> polls every due job once

Each iteration performs exactly one CUPS query per due job and is non-blocking.
"""

import time

import frappe

from ury.ury.printing.cups_client import get_cups_job_attributes
from ury.ury.printing.finalizer import finalize_print_job
from ury.ury.printing.notifications import notify_long_running_print
from ury.ury.printing.print_job_monitor import (
    acquire_job_lock,
    get_due_print_jobs,
    get_print_job,
    release_job_lock,
    remove_print_job,
    schedule_next_check,
    stop_monitoring_print_job,
    update_print_job,
)
from ury.ury.printing.state_machine import (
    UNKNOWN,
    can_transition,
    is_terminal,
    map_cups_state,
)

MAX_RETRIES = 10


def _format_reasons(reasons):
    """Normalise CUPS job-state-reasons into a single string."""
    if reasons is None:
        return ""
    if isinstance(reasons, str):
        return reasons
    if isinstance(reasons, (list, tuple)):
        return ", ".join(str(r) for r in reasons)
    return str(reasons)


def _publish_status_update(metadata):
    """Publish the realtime event required by POS subscribers."""
    frappe.publish_realtime(
        "print_job_status_updated",
        {
            "print_job_id": metadata.get("print_job_id"),
            "cups_job_id": metadata.get("cups_job_id"),
            "job_type": metadata.get("job_type"),
            "reference_doctype": metadata.get("reference_doctype"),
            "reference_name": metadata.get("reference_name"),
            "production": metadata.get("production"),
            "invoice": metadata.get("invoice"),
            "status": metadata.get("status"),
            "cups_state_reason": metadata.get("cups_state_reason", ""),
        },
    )


def poll_single_print_job(print_job_id):
    """Poll CUPS once for the given job and propagate the result.

    Order of operations:
    1. Always query CUPS first to catch completed/failed transitions.
    2. If terminal state reached -> finalize print job and stop monitoring.
    3. If non-terminal and monitoring_deadline expired -> trigger still-printing alert & stop monitoring.
    4. If non-terminal and within deadline -> schedule next check & re-enqueue background worker.
    """
    if not acquire_job_lock(print_job_id):
        return

    try:
        try:
            metadata = get_print_job(print_job_id)
            if not metadata:
                frappe.logger("printing").warning(
                    {
                        "event": "orphaned_print_job_zset_entry",
                        "print_job_id": print_job_id,
                    }
                )
                stop_monitoring_print_job(print_job_id)
                return

            current_state = metadata.get("status")
            retry_count = metadata.get("retry_count", 0)
            monitoring_deadline = metadata.get("monitoring_deadline")
            long_running_sent = metadata.get("long_running_notification_sent", False)

            cups_job_id = metadata.get("cups_job_id")
            server_ip = metadata.get("server_ip")
            port = metadata.get("port")

            attrs = None
            if server_ip and port and cups_job_id is not None:
                attrs = get_cups_job_attributes(server_ip, port, cups_job_id)

            if attrs:
                new_state = map_cups_state(
                    attrs.get("job_state"), attrs.get("job_state_reasons")
                )
                retry_count = 0
                metadata["cups_state_reason"] = _format_reasons(
                    attrs.get("job_state_reasons")
                )
                metadata["printer_uri"] = attrs.get("printer_uri")
                metadata["time_at_completed"] = attrs.get("time_at_completed")
            else:
                if retry_count >= MAX_RETRIES:
                    frappe.logger("printing").warning(
                        {
                            "event": "print_job_max_retries_exceeded",
                            "print_job_id": print_job_id,
                            "invoice": metadata.get("invoice"),
                            "retry_count": retry_count,
                        }
                    )
                    if not long_running_sent:
                        notify_long_running_print(
                            invoice=metadata.get("invoice"),
                            print_job_id=print_job_id,
                            printer_name=metadata.get("printer_name"),
                            job_type=metadata.get("job_type", "BILL"),
                            reference_doctype=metadata.get("reference_doctype"),
                            reference_name=metadata.get("reference_name"),
                        )
                        update_print_job(
                            print_job_id,
                            {
                                "long_running_notification_sent": True,
                                "observation_timed_out": True,
                                "retry_count": retry_count,
                            },
                        )
                    stop_monitoring_print_job(print_job_id)
                    return
                else:
                    retry_count += 1
                    new_state = current_state

            if not can_transition(current_state, new_state):
                frappe.logger("printing").warning(
                    {
                        "event": "invalid_state_transition",
                        "print_job_id": print_job_id,
                        "current_state": current_state,
                        "new_state": new_state,
                    }
                )
                metadata["retry_count"] = retry_count
                update_print_job(print_job_id, metadata)
                schedule_next_check(print_job_id, current_state, retry_count)
                return

            metadata["status"] = new_state
            metadata["retry_count"] = retry_count

            update_print_job(print_job_id, metadata)

            if new_state != current_state:
                _publish_status_update(metadata)

            # Finalize if terminal state reached
            if is_terminal(new_state):
                finalize_print_job(
                    print_job_id,
                    new_state,
                    failure_reason=metadata.get("cups_state_reason"),
                )
                stop_monitoring_print_job(print_job_id)
                return

            # Check 30-second observation deadline AFTER CUPS query
            if monitoring_deadline and time.time() > monitoring_deadline:
                if not long_running_sent:
                    notify_long_running_print(
                        invoice=metadata.get("invoice"),
                        print_job_id=print_job_id,
                        printer_name=metadata.get("printer_name"),
                        job_type=metadata.get("job_type", "BILL"),
                        reference_doctype=metadata.get("reference_doctype"),
                        reference_name=metadata.get("reference_name"),
                    )
                    update_print_job(
                        print_job_id,
                        {
                            "long_running_notification_sent": True,
                            "observation_timed_out": True,
                        },
                    )
                    frappe.logger("printing").info(
                        {
                            "event": "print_job_observation_timeout",
                            "print_job_id": print_job_id,
                            "invoice": metadata.get("invoice"),
                            "current_state": current_state,
                        }
                    )
                stop_monitoring_print_job(print_job_id)
                return

            # Non-terminal and within deadline -> schedule next check & re-enqueue
            schedule_next_check(print_job_id, new_state, retry_count)
            if not frappe.flags.in_test:
                frappe.enqueue(
                    "ury.ury.printing.print_job_poller.poll_single_print_job",
                    print_job_id=print_job_id,
                    queue="default",
                    timeout=60,
                    enqueue_after_commit=False,
                )
        except Exception:
            frappe.logger("printing").warning(
                {"event": "poll_single_print_job_failed", "print_job_id": print_job_id},
                exc_info=True,
            )
    finally:
        release_job_lock(print_job_id)


@frappe.whitelist()
def poll_active_print_jobs():
    """Whitelisted entry point: poll every due print job once.

    This function is safe to call from a scheduler event or background job.
    Each due job is polled independently; a failure in one job does not abort
    the rest.
    """
    due_jobs = get_due_print_jobs()
    for print_job_id in due_jobs:
        try:
            poll_single_print_job(print_job_id)
        except Exception:
            frappe.logger("printing").warning(
                {"event": "poll_active_print_jobs_job_failed", "print_job_id": print_job_id},
                exc_info=True,
            )
