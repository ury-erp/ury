"""Idempotent finalization side effects for URY print jobs.

This module is the *only* place allowed to flip ``POS Invoice.invoice_printed``
and release merged table clusters as a result of a print job reaching a terminal
state.  It is guarded by a Redis idempotency key so retries / duplicate polls
cannot run the side effects more than once.
"""

import frappe
import redis.exceptions

from ury.ury.doctype.ury_order.ury_order import release_merge_cluster_tables
from ury.ury.printing.notifications import notify_print_failure
from ury.ury.printing.print_job_monitor import get_print_job
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
        if invoice:
            frappe.db.set_value("POS Invoice", invoice, "invoice_printed", 0)

        if final_state == FAILED:
            event_name = "print_job_finalized_failed"
            notify_print_failure(
                invoice=invoice,
                print_job_id=print_job_id,
                printer_name=metadata.get("printer_name"),
                reason=failure_reason or metadata.get("cups_state_reason") or "unknown",
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
            },
        )

        frappe.logger("printing").info(
            {
                "event": event_name,
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
