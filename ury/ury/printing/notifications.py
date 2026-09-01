"""Realtime notifications and structured logging for URY printing.

This module is responsible for publishing printer-health and print-failure
alerts to Frappe realtime subscribers.  All notifications are deduplicated
in Redis so repeated failures or unchanged health states do not spam users.
"""

import frappe
import redis.exceptions

from ury.ury.printing.file_store import get_job

PRINT_FAILURE_NOTIFIED_PREFIX = "print_failure_notified:"
PRINT_FAILURE_TTL_SECONDS = 86400  # 24 hours
LONG_RUNNING_NOTIFIED_PREFIX = "print_long_running_notified:"
LONG_RUNNING_NOTIFIED_TTL_SECONDS = 86400  # 24 hours


def _redis():
    """Return the Frappe Redis cache client, or None if unavailable."""
    try:
        return frappe.cache()
    except Exception:
        return None


def _print_failure_key(print_job_id):
    return f"{PRINT_FAILURE_NOTIFIED_PREFIX}{print_job_id}"


def notify_printer_status(printer_name, is_online, reasons=None):
    """Publish a printer health transition alert.

    Args:
        printer_name: The printer that changed state.
        is_online: True when the printer is reachable/healthy, False otherwise.
        reasons: Optional human/machine-readable reason(s) for the state.
    """
    payload = {
        "printer_name": printer_name,
        "is_online": is_online,
        "reasons": reasons,
    }

    frappe.publish_realtime("printer_health_alert", payload)

    frappe.logger("printing").info(
        {
            "event": "printer_health_transition",
            "printer_name": printer_name,
            "is_online": is_online,
            "reasons": reasons,
        }
    )


def notify_print_failure(
    invoice,
    print_job_id,
    printer_name,
    reason,
    job_type="BILL",
    reference_doctype=None,
    reference_name=None,
    job_owner=None,
):
    """Publish a print-failure alert exactly once per print job.

    Deduplication is enforced via Redis key
    ``print_failure_notified:<print_job_id>`` with a 24-hour TTL.

    The alert is published only to ``job_owner`` so users do not receive
    failure notifications for print jobs initiated by other stations.

    Args:
        invoice: The POS Invoice identifier associated with the failed job.
            Kept for backward compatibility on ``BILL`` jobs.
        print_job_id: The URY Print Job identifier.
        printer_name: The printer that failed.
        reason: Human/machine-readable reason for the failure.
        job_type: Job discriminator (``BILL``, ``KOT``, ``WAITER_SLIP``,
            ``KOT_REPRINT``). Defaults to ``BILL``.
        reference_doctype: Generic source DocType for non-bill alerts.
        reference_name: Generic source document name for non-bill alerts.
        job_owner: User ID that should receive the alert. Resolved from the
            print job metadata when omitted; falls back to ``Administrator``.

    Returns:
        True if the alert was newly published, False if it was already sent
        or Redis is unavailable.
    """
    if not job_owner:
        job_data = get_job(print_job_id)
        job_owner = (
            job_data.get("job_owner")
            or job_data.get("owner")
            or job_data.get("user")
            if job_data
            else None
        )
    if not job_owner:
        job_owner = "Administrator"

    cache = _redis()
    if not cache:
        frappe.logger("printing").warning(
            {
                "event": "notify_print_failure_redis_unavailable",
                "print_job_id": print_job_id,
                "job_owner": job_owner,
            }
        )
        return False

    try:
        newly_set = cache.set(
            _print_failure_key(print_job_id),
            "1",
            nx=True,
            ex=PRINT_FAILURE_TTL_SECONDS,
        )
    except redis.exceptions.ConnectionError:
        frappe.logger("printing").warning(
            {
                "event": "notify_print_failure_redis_connection_error",
                "print_job_id": print_job_id,
            }
        )
        return False
    except Exception:
        frappe.logger("printing").warning(
            {
                "event": "notify_print_failure_redis_error",
                "print_job_id": print_job_id,
            },
            exc_info=True,
        )
        return False

    if not newly_set:
        # Already notified; deduplicate.
        return False

    if job_type == "BILL":
        payload = {
            "invoice": invoice,
            "print_job_id": print_job_id,
            "printer_name": printer_name,
            "reason": reason,
            "job_owner": job_owner,
        }
    else:
        payload = {
            "print_job_id": print_job_id,
            "printer_name": printer_name,
            "reason": reason,
            "job_type": job_type,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
            "job_owner": job_owner,
        }

    frappe.publish_realtime("print_failure_alert", payload)

    frappe.logger("printing").info(
        {
            "event": "print_failure_alert",
            "job_type": job_type,
            "invoice": invoice,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
            "print_job_id": print_job_id,
            "printer_name": printer_name,
            "reason": reason,
            "job_owner": job_owner,
        }
    )

    return True


def notify_long_running_print(
    invoice,
    print_job_id,
    printer_name,
    job_type="BILL",
    reference_doctype=None,
    reference_name=None,
):
    """Publish a 'still printing' notification exactly once per print job.

    This notification fires when the 30-second observation timeout expires
    and the job is still non-terminal. It does NOT indicate failure.

    Args:
        invoice: POS Invoice identifier for backward compatibility.
        print_job_id: The URY Print Job identifier.
        printer_name: The printer being polled.
        job_type: Job discriminator. Defaults to ``BILL``.
        reference_doctype: Generic source DocType for non-bill alerts.
        reference_name: Generic source document name for non-bill alerts.

    Returns:
        True if the alert was newly published, False if already sent or Redis unavailable.
    """
    cache = _redis()
    if not cache:
        frappe.logger("printing").warning(
            {
                "event": "notify_long_running_print_redis_unavailable",
                "print_job_id": print_job_id,
            }
        )
        return False

    notif_key = f"{LONG_RUNNING_NOTIFIED_PREFIX}{print_job_id}"

    try:
        newly_set = cache.set(notif_key, "1", nx=True, ex=LONG_RUNNING_NOTIFIED_TTL_SECONDS)
    except redis.exceptions.ConnectionError:
        frappe.logger("printing").warning(
            {
                "event": "notify_long_running_print_redis_connection_error",
                "print_job_id": print_job_id,
            }
        )
        return False
    except Exception:
        frappe.logger("printing").warning(
            {
                "event": "notify_long_running_print_redis_error",
                "print_job_id": print_job_id,
            },
            exc_info=True,
        )
        return False

    if not newly_set:
        return False

    if job_type == "BILL":
        payload = {
            "invoice": invoice,
            "print_job_id": print_job_id,
            "printer_name": printer_name,
        }
        event_name = "invoice_print_long_running"
    else:
        payload = {
            "print_job_id": print_job_id,
            "printer_name": printer_name,
            "job_type": job_type,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
        }
        event_name = "print_long_running"

    frappe.publish_realtime(event_name, payload)

    frappe.logger("printing").info(
        {
            "event": "long_running_print_notification_sent",
            "job_type": job_type,
            "invoice": invoice,
            "reference_doctype": reference_doctype,
            "reference_name": reference_name,
            "print_job_id": print_job_id,
            "printer_name": printer_name,
        }
    )

    return True
