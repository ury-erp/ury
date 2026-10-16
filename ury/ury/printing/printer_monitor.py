"""Printer health monitoring for URY network printers.

This module probes CUPS printers and evaluates health transitions.  Health
state is kept strictly separate from print-job state and is cached in Redis
under ``printer_health_state:<printer_name>``.
"""

import frappe
import redis.exceptions

try:
    import cups
except ImportError:
    cups = None

from ury.ury.printing.notifications import notify_printer_status

PRINTER_HEALTH_STATE_PREFIX = "printer_health_state:"
DEFAULT_PRINTER_HEALTH_TTL_SECONDS = 86400  # 24 hours

# CUPS printer-state constants (RFC 2911 §4.4.15)
CUPS_PRINTER_IDLE = 3
CUPS_PRINTER_PROCESSING = 4
CUPS_PRINTER_STOPPED = 5


def _redis():
    """Return the Frappe Redis cache client, or None if unavailable."""
    try:
        return frappe.cache()
    except Exception:
        return None


def _health_state_key(printer_name):
    return f"{PRINTER_HEALTH_STATE_PREFIX}{printer_name}"


def _format_reasons(reasons):
    """Normalise CUPS printer-state-reasons into a single string."""
    if reasons is None:
        return ""
    if isinstance(reasons, str):
        return reasons
    if isinstance(reasons, (list, tuple)):
        return ", ".join(str(r) for r in reasons)
    return str(reasons)


def _is_blocking_reason(reason):
    """Return True if a CUPS printer-state-reason blocks printing.

    Warnings and informational reports are not treated as blocking.
    """
    if not reason:
        return False
    reason = str(reason).lower()
    if reason in ("none",):
        return False
    if reason.endswith("-warning") or reason.endswith("-report"):
        return False
    return True


def _is_printer_online(cups_state, state_reasons):
    """Determine whether a CUPS printer is considered online/healthy.

    A printer is online when its CUPS state is idle or processing and it
    has no blocking state reasons.
    """
    if cups_state not in (CUPS_PRINTER_IDLE, CUPS_PRINTER_PROCESSING):
        return False
    if state_reasons and any(_is_blocking_reason(r) for r in state_reasons):
        return False
    return True


def check_printer_health(server_ip, port, printer_name):
    """Probe a CUPS printer and return its current health status.

    Args:
        server_ip: CUPS server host/IP.
        port: CUPS server port.
        printer_name: The CUPS printer queue name.

    Returns:
        A dictionary with keys ``printer_name``, ``is_online``, ``state``,
        and ``reasons``.  ``state`` is the raw CUPS printer-state integer
        when available, otherwise None.
    """
    base_result = {
        "printer_name": printer_name,
        "is_online": False,
        "state": None,
        "reasons": "",
    }

    if cups is None:
        base_result["reasons"] = "pycups not available"
        return base_result

    if not server_ip or not port:
        base_result["reasons"] = "missing server_ip or port"
        return base_result

    try:
        conn = cups.Connection(host=server_ip, port=port)
        printers = conn.getPrinters()

        if printer_name not in printers:
            base_result["reasons"] = f"printer {printer_name!r} not found on CUPS server"
            return base_result

        attrs = conn.getPrinterAttributes(printer_name)
        cups_state = attrs.get("printer-state")
        state_reasons = attrs.get("printer-state-reasons") or []
        reasons_str = _format_reasons(state_reasons)

        return {
            "printer_name": printer_name,
            "is_online": _is_printer_online(cups_state, state_reasons),
            "state": cups_state,
            "reasons": reasons_str,
        }
    except Exception as exc:
        base_result["reasons"] = str(exc)
        return base_result


def evaluate_and_notify_printer_health(printer_name, is_online, reasons=None):
    """Evaluate a printer health transition and notify subscribers if changed.

    The previous health state is read from Redis
    ``printer_health_state:<printer_name>``.  On the first check for a
    printer the state is stored but no alert is sent, avoiding startup noise.
    Subsequent checks emit ``printer_health_alert`` only when the state
    changes.

    Args:
        printer_name: The printer to evaluate.
        is_online: True if the printer is currently healthy, False otherwise.
        reasons: Optional reason(s) for the current state.

    Returns:
        A dictionary describing the outcome.
    """
    current_state = "ONLINE" if is_online else "OFFLINE"
    cache = _redis()

    if not cache:
        return {
            "status": "redis_unavailable",
            "printer_name": printer_name,
            "current_state": current_state,
        }

    try:
        previous_state = cache.get(_health_state_key(printer_name))
        if isinstance(previous_state, bytes):
            previous_state = previous_state.decode()
    except redis.exceptions.ConnectionError:
        return {
            "status": "redis_connection_error",
            "printer_name": printer_name,
            "current_state": current_state,
        }
    except Exception:
        return {
            "status": "redis_error",
            "printer_name": printer_name,
            "current_state": current_state,
        }

    if previous_state == current_state:
        return {
            "status": "unchanged",
            "printer_name": printer_name,
            "current_state": current_state,
        }

    try:
        cache.set(
            _health_state_key(printer_name),
            current_state,
            ex=DEFAULT_PRINTER_HEALTH_TTL_SECONDS,
        )
    except redis.exceptions.ConnectionError:
        return {
            "status": "redis_connection_error",
            "printer_name": printer_name,
            "current_state": current_state,
        }
    except Exception:
        return {
            "status": "redis_error",
            "printer_name": printer_name,
            "current_state": current_state,
        }

    if previous_state is not None:
        notify_printer_status(printer_name, is_online, reasons)

    return {
        "status": "initialized" if previous_state is None else "notified",
        "printer_name": printer_name,
        "previous_state": previous_state,
        "current_state": current_state,
    }
