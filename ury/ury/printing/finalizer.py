"""Idempotent finalization side effects for URY print jobs.

This module applies terminal-state side effects according to ``job_type``:

* ``BILL``: flips ``POS Invoice.invoice_printed`` and releases table clusters on
  ``COMPLETED``.
* ``KOT``: does NOT touch ``invoice_printed`` or tables; emits
  ``kot_print_completed`` / ``kot_print_failed``.
* ``WAITER_SLIP``: does NOT touch ``invoice_printed`` or tables; emits
  ``waiter_print_completed`` / ``waiter_print_failed``.
* ``KOT_REPRINT``: does NOT touch ``invoice_printed`` or tables; emits
  ``kot_reprint_completed`` / ``kot_reprint_failed``.

It is guarded by a Redis idempotency key so retries / duplicate polls
cannot run the side effects more than once.
"""

import frappe
import redis.exceptions

from ury.ury.doctype.ury_order.ury_order import release_merge_cluster_tables
from ury.ury.printing.notifications import notify_print_failure
from ury.ury.printing.print_job_monitor import get_print_job, update_print_job
from ury.ury.printing.state_machine import CANCELED, COMPLETED, FAILED, UNKNOWN

FINALIZED_KEY_PREFIX = "print_job_finalized:"
FINALIZED_KEY_TTL_SECONDS = 86400  # 24 hours


def _redis():
    """Return the Frappe Redis cache client, or None if unavailable."""
    try:
        return frappe.cache()
    except Exception:
        return None


def _finalized_key(print_job_id):
    return f"{FINALIZED_KEY_PREFIX}{print_job_id}"


def _set_finalized_idempotency_key(print_job_id):
    """Atomically set the idempotency key with a TTL.

    Returns:
        ``True`` if the key was newly created, ``False`` if it already existed.
    """
    cache = _redis()
    if not cache:
        # Without Redis we cannot guarantee idempotency.  Treat as already
        # finalized to be safe and rely on logged warnings for observability.
        frappe.logger("printing").warning(
            {
                "event": "finalize_print_job_redis_unavailable",
                "print_job_id": print_job_id,
            }
        )
        return False

    try:
        result = cache.set(
            _finalized_key(print_job_id),
            "1",
            nx=True,
            ex=FINALIZED_KEY_TTL_SECONDS,
        )
        return bool(result)
    except redis.exceptions.ConnectionError:
        frappe.logger("printing").warning(
            {
                "event": "finalize_print_job_redis_connection_error",
                "print_job_id": print_job_id,
            }
        )
        return False
    except Exception:
        frappe.logger("printing").warning(
            {
                "event": "finalize_print_job_redis_error",
                "print_job_id": print_job_id,
            },
            exc_info=True,
        )
        return False


def finalize_print_job(print_job_id, final_state, failure_reason=None):
    """Apply terminal-state side effects for a print job exactly once.

    The function is idempotent: repeated calls with the same ``print_job_id``
    return the cached "Already Finalized" result without re-running side
    effects.

    Args:
        print_job_id: The URY print job identifier.
        final_state: One of ``COMPLETED``, ``FAILED``, ``CANCELED``, ``UNKNOWN``.
        failure_reason: Human/machine-readable reason for non-completed states.

    Returns:
        A dictionary describing the outcome.
    """
    if not _set_finalized_idempotency_key(print_job_id):
        return {
            "status": "Already Finalized",
            "print_job_id": print_job_id,
        }

    metadata = get_print_job(print_job_id) or {}
    job_type = metadata.get("job_type", "BILL")

    # Persist terminal state back to the file store.
    metadata["status"] = final_state
    metadata["completed_at"] = frappe.utils.now()
    if failure_reason:
        metadata["failure_reason"] = failure_reason
    update_print_job(print_job_id, metadata)

    handlers = {
        "BILL": _finalize_bill,
        "KOT": _finalize_kot,
        "WAITER_SLIP": _finalize_waiter_slip,
        "KOT_REPRINT": _finalize_kot_reprint,
    }
    handler = handlers.get(job_type, _finalize_bill)
    return handler(print_job_id, final_state, metadata, failure_reason)


def _finalize_bill(print_job_id, final_state, metadata, failure_reason):
    """Finalize a customer bill print job.

    May mutate ``POS Invoice.invoice_printed`` and release merged table
    clusters because bill jobs represent the end of the dine-in transaction.
    """
    invoice = metadata.get("invoice")
    restaurant_table = metadata.get("restaurant_table")

    if final_state == COMPLETED:
        if invoice:
            frappe.db.set_value("POS Invoice", invoice, "invoice_printed", 1)

        if restaurant_table:
            release_merge_cluster_tables(restaurant_table)

        frappe.publish_realtime(
            "invoice_print_completed",
            {
                "invoice": invoice,
                "print_job_id": print_job_id,
            },
        )

        frappe.logger("printing").info(
            {
                "event": "print_job_finalized_completed",
                "job_type": "BILL",
                "print_job_id": print_job_id,
                "invoice": invoice,
                "restaurant_table": restaurant_table,
            }
        )

        return {
            "status": "Finalized",
            "print_job_id": print_job_id,
            "invoice": invoice,
            "invoice_printed": 1,
            "restaurant_table": restaurant_table,
            "final_state": COMPLETED,
        }

    if final_state in (FAILED, CANCELED, UNKNOWN):
        job_owner = (
            metadata.get("job_owner")
            or metadata.get("owner")
            or metadata.get("user")
            or "Administrator"
        )

        if invoice:
            frappe.db.set_value("POS Invoice", invoice, "invoice_printed", 0)

        if final_state == FAILED:
            event_name = "print_job_finalized_failed"
            notify_print_failure(
                invoice=invoice,
                print_job_id=print_job_id,
                printer_name=metadata.get("printer_name"),
                reason=failure_reason or metadata.get("cups_state_reason") or "unknown",
                job_type="BILL",
                job_owner=job_owner,
            )
        elif final_state == CANCELED:
            event_name = "print_job_finalized_canceled"
        else:
            event_name = "print_job_finalized_unknown"

        frappe.publish_realtime(
            "invoice_print_failed",
            {
                "invoice": invoice,
                "print_job_id": print_job_id,
                "reason": failure_reason,
                "job_owner": job_owner,
            },
            user=job_owner,
        )

        frappe.logger("printing").info(
            {
                "event": event_name,
                "job_type": "BILL",
                "print_job_id": print_job_id,
                "invoice": invoice,
                "final_state": final_state,
                "reason": failure_reason,
            }
        )

        return {
            "status": "Finalized",
            "print_job_id": print_job_id,
            "invoice": invoice,
            "invoice_printed": 0,
            "restaurant_table": restaurant_table,
            "final_state": final_state,
            "reason": failure_reason,
        }

    # Defensive: if an unexpected final_state is supplied, leave DB untouched
    # but still return a structured response so callers can decide what to do.
    frappe.logger("printing").warning(
        {
            "event": "finalize_print_job_unexpected_state",
            "job_type": "BILL",
            "print_job_id": print_job_id,
            "final_state": final_state,
        }
    )

    return {
        "status": "Finalized",
        "print_job_id": print_job_id,
        "invoice": invoice,
        "final_state": final_state,
        "reason": failure_reason,
    }


def _finalize_kot(print_job_id, final_state, metadata, failure_reason):
    """Finalize a Kitchen KOT print job.

    Never alters ``POS Invoice.invoice_printed`` or releases table clusters.
    """
    kot_name = metadata.get("reference_name") or metadata.get("docname")
    production = metadata.get("production")
    invoice = metadata.get("invoice")
    reference_doctype = metadata.get("reference_doctype")

    if final_state == COMPLETED:
        frappe.publish_realtime(
            "kot_print_completed",
            {
                "kot": kot_name,
                "production": production,
                "invoice": invoice,
                "print_job_id": print_job_id,
            },
        )
        frappe.logger("printing").info(
            {
                "event": "print_job_finalized_completed",
                "job_type": "KOT",
                "print_job_id": print_job_id,
                "kot": kot_name,
                "production": production,
            }
        )
    else:
        job_owner = (
            metadata.get("job_owner")
            or metadata.get("owner")
            or metadata.get("user")
            or "Administrator"
        )

        frappe.publish_realtime(
            "kot_print_failed",
            {
                "kot": kot_name,
                "production": production,
                "invoice": invoice,
                "print_job_id": print_job_id,
                "reason": failure_reason,
                "job_owner": job_owner,
            },
            user=job_owner,
        )
        frappe.logger("printing").info(
            {
                "event": "print_job_finalized_failed",
                "job_type": "KOT",
                "print_job_id": print_job_id,
                "kot": kot_name,
                "reason": failure_reason,
                "job_owner": job_owner,
            }
        )

        if final_state == FAILED:
            notify_print_failure(
                invoice=invoice,
                print_job_id=print_job_id,
                printer_name=metadata.get("printer_name"),
                reason=failure_reason or metadata.get("cups_state_reason") or "unknown",
                job_type="KOT",
                reference_doctype=reference_doctype,
                reference_name=kot_name,
                job_owner=job_owner,
            )

    return {
        "status": "Finalized",
        "print_job_id": print_job_id,
        "job_type": "KOT",
        "kot": kot_name,
        "final_state": final_state,
    }


def _finalize_waiter_slip(print_job_id, final_state, metadata, failure_reason):
    """Finalize a Waiter Slip print job.

    Never alters ``POS Invoice.invoice_printed`` or releases table clusters.
    """
    invoice = metadata.get("invoice")
    kot_names = metadata.get("kot_names") or [metadata.get("reference_name")]
    reference_doctype = metadata.get("reference_doctype")
    reference_name = metadata.get("reference_name")

    event = "waiter_print_completed" if final_state == COMPLETED else "waiter_print_failed"

    if final_state == FAILED:
        job_owner = (
            metadata.get("job_owner")
            or metadata.get("owner")
            or metadata.get("user")
            or "Administrator"
        )
    else:
        job_owner = None

    payload = {
        "invoice": invoice,
        "kot_names": kot_names,
        "print_job_id": print_job_id,
        "reason": failure_reason,
    }
    if job_owner:
        payload["job_owner"] = job_owner

    frappe.publish_realtime(
        event,
        payload,
        user=job_owner,
    )

    frappe.logger("printing").info(
        {
            "event": f"print_job_finalized_{final_state.lower()}",
            "job_type": "WAITER_SLIP",
            "print_job_id": print_job_id,
            "invoice": invoice,
            "job_owner": job_owner,
        }
    )

    if final_state == FAILED:
        notify_print_failure(
            invoice=None,
            print_job_id=print_job_id,
            printer_name=metadata.get("printer_name"),
            reason=failure_reason or metadata.get("cups_state_reason") or "unknown",
            job_type="WAITER_SLIP",
            reference_doctype=reference_doctype,
            reference_name=reference_name,
            job_owner=job_owner,
        )

    return {
        "status": "Finalized",
        "print_job_id": print_job_id,
        "job_type": "WAITER_SLIP",
        "final_state": final_state,
    }


def _finalize_kot_reprint(print_job_id, final_state, metadata, failure_reason):
    """Finalize a KOT Reprint print job.

    Never alters ``POS Invoice.invoice_printed`` or releases table clusters.
    """
    invoice = metadata.get("invoice")
    reference_doctype = metadata.get("reference_doctype")
    reference_name = metadata.get("reference_name")

    event = "kot_reprint_completed" if final_state == COMPLETED else "kot_reprint_failed"

    if final_state == FAILED:
        job_owner = (
            metadata.get("job_owner")
            or metadata.get("owner")
            or metadata.get("user")
            or "Administrator"
        )
    else:
        job_owner = None

    payload = {
        "invoice": invoice,
        "print_job_id": print_job_id,
        "reason": failure_reason,
    }
    if job_owner:
        payload["job_owner"] = job_owner

    frappe.publish_realtime(
        event,
        payload,
        user=job_owner,
    )

    frappe.logger("printing").info(
        {
            "event": f"print_job_finalized_{final_state.lower()}",
            "job_type": "KOT_REPRINT",
            "print_job_id": print_job_id,
            "invoice": invoice,
            "job_owner": job_owner,
        }
    )

    if final_state == FAILED:
        notify_print_failure(
            invoice=None,
            print_job_id=print_job_id,
            printer_name=metadata.get("printer_name"),
            reason=failure_reason or metadata.get("cups_state_reason") or "unknown",
            job_type="KOT_REPRINT",
            reference_doctype=reference_doctype,
            reference_name=reference_name,
            job_owner=job_owner,
        )

    return {
        "status": "Finalized",
        "print_job_id": print_job_id,
        "job_type": "KOT_REPRINT",
        "final_state": final_state,
    }
