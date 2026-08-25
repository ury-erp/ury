"""Active print job monitoring for URY printing.

This module coordinates polling for print jobs submitted through CUPS.  Job
metadata is persisted atomically in JSON files via ``file_store.py``; Redis
keeps only a lightweight scheduling structure and polling locks.

Redis schema
------------
* Sorted set ``print_jobs:monitor``
    * score   -> next check Unix timestamp
    * member  -> ``print_job_id``
* String ``print_job_lock:<print_job_id>``
    * TTL lock used to avoid concurrent polling of the same job
"""

import time

import frappe
import redis.exceptions

from ury.ury.printing.file_store import delete_job, get_job, list_all_jobs, save_job
from ury.ury.printing.state_machine import (
    CANCELED,
    COMPLETED,
    FAILED,
    PENDING,
    PROCESSING,
    SUBMITTED,
    is_terminal,
)

MONITOR_ZSET = "print_jobs:monitor"
LOCK_PREFIX = "print_job_lock:"

INITIAL_INTERVAL_SECONDS = 2
DEFAULT_INTERVAL_SECONDS = 2
MAX_INTERVAL_SECONDS = 30
OBSERVATION_TIMEOUT_SECONDS = 30
PROCESSING_BACKOFF_BASE_SECONDS = 2
PROCESSING_BACKOFF_MULTIPLIER = 1.5
PROCESSING_BACKOFF_RETRY_THRESHOLD = 5


def _redis():
    """Return the Frappe Redis cache client, or None if unavailable."""
    try:
        return frappe.cache()
    except Exception:
        return None


def _now_ts():
    """Return the current Unix timestamp as a float."""
    return time.time()


def _lock_key(print_job_id):
    return f"{LOCK_PREFIX}{print_job_id}"


def register_print_job(print_job_metadata):
    """Persist job metadata to disk and schedule the first monitor check.

    The authoritative metadata is written to a JSON file via ``file_store``;
    Redis only stores the ``print_job_id`` in the monitor zset so the poller
    knows the job is active.

    Args:
        print_job_metadata: Dictionary of job metadata. Must contain a
            ``print_job_id`` key.

    Returns:
        The ``print_job_id`` on success, or ``None`` if persistence is
        unavailable.
    """
    print_job_id = print_job_metadata.get("print_job_id")
    if not print_job_id:
        return None

    metadata = dict(print_job_metadata)
    if "monitoring_deadline" not in metadata:
        metadata["monitoring_deadline"] = _now_ts() + OBSERVATION_TIMEOUT_SECONDS
    if "long_running_notification_sent" not in metadata:
        metadata["long_running_notification_sent"] = False

    if not save_job(print_job_id, metadata):
        return None

    cache = _redis()
    if not cache:
        return print_job_id

    try:
        next_check_at = _now_ts() + INITIAL_INTERVAL_SECONDS
        cache.zadd(MONITOR_ZSET, {print_job_id: next_check_at})
        return print_job_id
    except redis.exceptions.ConnectionError:
        return print_job_id
    except Exception:
        return print_job_id


def get_due_print_jobs(now_ts=None):
    """Return all print job IDs whose next check timestamp has passed.

    Args:
        now_ts: Optional Unix timestamp. Defaults to the current time.

    Returns:
        List of ``print_job_id`` strings with ``score <= now_ts``.
    """
    cache = _redis()
    if not cache:
        return []

    now_ts = now_ts if now_ts is not None else _now_ts()

    try:
        members = cache.zrangebyscore(MONITOR_ZSET, "-inf", now_ts) or []
        return [m.decode() if isinstance(m, bytes) else m for m in members]
    except redis.exceptions.ConnectionError:
        return []
    except Exception:
        return []


def get_active_print_job_ids():
    """Return all print job IDs currently tracked in the monitor zset.

    Unlike :func:`get_due_print_jobs`, this returns every active job
    regardless of its next scheduled check timestamp.

    Returns:
        List of ``print_job_id`` strings.
    """
    cache = _redis()
    if not cache:
        return []

    try:
        members = cache.zrange(MONITOR_ZSET, 0, -1) or []
        return [m.decode() if isinstance(m, bytes) else m for m in members]
    except redis.exceptions.ConnectionError:
        return []
    except Exception:
        return []


def get_all_tracked_print_job_ids():
    """Return every known print job ID backed by a JSON file.

    Scans the file store for active jobs and cleans up orphaned zset members
    that no longer have a corresponding JSON file.

    Returns:
        List of ``print_job_id`` strings sorted newest-first.
    """
    cache = _redis()
    job_ids = set()

    # Authoritative source: JSON files.
    try:
        for job in list_all_jobs():
            print_job_id = job.get("print_job_id")
            if print_job_id:
                job_ids.add(print_job_id)
    except Exception:
        pass

    # Remove any zset members that no longer have a backing file.
    if cache:
        try:
            members = cache.zrange(MONITOR_ZSET, 0, -1) or []
            for member in members:
                print_job_id = member.decode() if isinstance(member, bytes) else member
                if print_job_id not in job_ids:
                    try:
                        cache.zrem(MONITOR_ZSET, member)
                    except Exception:
                        pass
        except redis.exceptions.ConnectionError:
            pass
        except Exception:
            pass

    return sorted(job_ids)


def acquire_job_lock(print_job_id, ttl_seconds=15):
    """Atomically acquire a polling lock for the given job.

    Args:
        print_job_id: The job to lock.
        ttl_seconds: Lock TTL in seconds (default 15).

    Returns:
        ``True`` if the lock was acquired, ``False`` otherwise.
    """
    cache = _redis()
    if not cache:
        return False

    try:
        result = cache.set(_lock_key(print_job_id), "1", nx=True, ex=ttl_seconds)
        return bool(result)
    except redis.exceptions.ConnectionError:
        return False
    except Exception:
        return False


def release_job_lock(print_job_id):
    """Release the polling lock for the given job.

    Args:
        print_job_id: The job whose lock should be removed.
    """
    cache = _redis()
    if not cache:
        return

    try:
        cache.delete_value(_lock_key(print_job_id), make_keys=False)
    except redis.exceptions.ConnectionError:
        pass
    except Exception:
        pass


def get_print_job(print_job_id):
    """Retrieve the stored metadata dictionary for a print job.

    Args:
        print_job_id: The job ID to look up.

    Returns:
        The metadata dictionary, or ``None`` if not found / unavailable.
    """
    return get_job(print_job_id)


def update_print_job(print_job_id, updates):
    """Merge ``updates`` into the stored job metadata.

    Args:
        print_job_id: The job ID to update.
        updates: Dictionary of fields to merge into the metadata.

    Returns:
        The updated metadata dictionary, or ``None`` on failure.
    """
    try:
        data = get_job(print_job_id) or {}
        data.update(updates)
        if save_job(print_job_id, data):
            return data
        return None
    except Exception:
        return None


def _calculate_check_interval(current_state, retry_count=0):
    """Calculate the next polling interval in seconds for a job state."""
    if current_state in (SUBMITTED, PENDING):
        return INITIAL_INTERVAL_SECONDS

    if current_state == PROCESSING:
        if retry_count <= PROCESSING_BACKOFF_RETRY_THRESHOLD:
            return INITIAL_INTERVAL_SECONDS
        exponent = retry_count - PROCESSING_BACKOFF_RETRY_THRESHOLD
        return min(
            PROCESSING_BACKOFF_BASE_SECONDS * (PROCESSING_BACKOFF_MULTIPLIER**exponent),
            MAX_INTERVAL_SECONDS,
        )

    return DEFAULT_INTERVAL_SECONDS


def stop_monitoring_print_job(print_job_id, ttl_seconds=86400):
    """Stop active monitoring for a job.

    Terminal jobs leave the active monitor zset (so polling stops) but their
    JSON file remains queryable until the 2-hour file-store TTL removes it.

    Args:
        print_job_id: The job ID to stop monitoring.
        ttl_seconds: Ignored; kept for backward compatibility only.
    """
    cache = _redis()
    if not cache:
        return

    try:
        cache.zrem(MONITOR_ZSET, print_job_id)
        release_job_lock(print_job_id)
    except redis.exceptions.ConnectionError:
        pass
    except Exception:
        pass


def schedule_next_check(print_job_id, current_state, retry_count=0):
    """Schedule the next monitor check for a job.

    Terminal states stop active monitoring.  All other states update the zset
    score based on the adaptive interval rules defined in the requirements.

    Args:
        print_job_id: The job ID to schedule.
        current_state: A URY print-job state constant.
        retry_count: Number of processing checks already performed.

    Returns:
        The new Unix timestamp score, or ``None`` for terminal states / failures.
    """
    if is_terminal(current_state):
        update_print_job(print_job_id, {"status": current_state})
        stop_monitoring_print_job(print_job_id)
        return None

    cache = _redis()
    if not cache:
        return None

    interval = _calculate_check_interval(current_state, retry_count)
    next_check_at = _now_ts() + interval

    try:
        cache.zadd(MONITOR_ZSET, {print_job_id: next_check_at})
        return next_check_at
    except redis.exceptions.ConnectionError:
        return None
    except Exception:
        return None


def remove_print_job(print_job_id):
    """Remove a job from the monitor zset and delete its JSON file.

    Args:
        print_job_id: The job ID to clean up.
    """
    cache = _redis()

    if cache:
        try:
            cache.zrem(MONITOR_ZSET, print_job_id)
        except redis.exceptions.ConnectionError:
            pass
        except Exception:
            pass

    delete_job(print_job_id)
    release_job_lock(print_job_id)


