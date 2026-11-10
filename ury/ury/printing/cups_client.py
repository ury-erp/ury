"""Thin CUPS client for querying individual print job attributes.

This module isolates pycups interaction so the poller can remain mock-friendly
and free of low-level CUPS details.
"""

import logging

try:
    import cups
except ImportError:
    cups = None

logger = logging.getLogger(__name__)


def get_cups_job_attributes(server_ip, port, cups_job_id):
    """Fetch job attributes from a CUPS server.

    Args:
        server_ip: CUPS server host/IP.
        port: CUPS server port.
        cups_job_id: The CUPS job identifier.

    Returns:
        A dictionary with keys ``job_state``, ``job_state_reasons``,
        ``printer_uri``, and ``time_at_completed`` when the job is found.
        Returns ``None`` when the CUPS library is unavailable, the connection
        fails, or the job cannot be found.
    """
    if cups is None:
        return None

    if not server_ip or not port or cups_job_id is None:
        return None

    try:
        conn = cups.Connection(host=server_ip, port=port)
        attrs = conn.getJobAttributes(cups_job_id)
    except Exception as exc:
        logger.warning(
            "CUPS job query failed for job %s on %s:%s: %s",
            cups_job_id,
            server_ip,
            port,
            exc,
        )
        return None

    if not attrs:
        return None

    return {
        "job_state": attrs.get("job-state"),
        "job_state_reasons": attrs.get("job-state-reasons"),
        "printer_uri": attrs.get("printer-uri"),
        "time_at_completed": attrs.get("time-at-completed"),
    }
