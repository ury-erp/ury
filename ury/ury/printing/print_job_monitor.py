"""Redis-based active print job monitoring for URY printing.

This module stores transient, high-frequency print-job state in Redis
(``frappe.cache()``) instead of MariaDB.  All keys are intentionally
short-lived and site-local.

Redis schema
------------
* Sorted set ``print_jobs:monitor``
    * score   -> next check Unix timestamp
    * member  -> ``print_job_id``
* Hash ``print_job:<print_job_id>``
    * field ``data`` -> pickled job metadata dictionary
* String ``print_job_lock:<print_job_id>``
    * TTL lock used to avoid concurrent polling of the same job
"""

import time

import frappe
import redis.exceptions

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
JOB_HASH_PREFIX = "print_job:"
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


def _job_key(print_job_id):
    return f"{JOB_HASH_PREFIX}{print_job_id}"


def _lock_key(print_job_id):
    return f"{LOCK_PREFIX}{print_job_id}"


def register_print_job(print_job_metadata):
    """Store job metadata in Redis and schedule the first monitor check.

    Args:
        print_job_metadata: Dictionary of job metadata. Must contain a
            ``print_job_id`` key.

    Returns:
        The ``print_job_id`` on success, or ``None`` if Redis is unavailable.
    """
    print_job_id = print_job_metadata.get("print_job_id")
    if not print_job_id:
        return None

    cache = _redis()
    if not cache:
        return None

    try:
        metadata = dict(print_job_metadata)
        if "monitoring_deadline" not in metadata:
            metadata["monitoring_deadline"] = _now_ts() + OBSERVATION_TIMEOUT_SECONDS
        if "long_running_notification_sent" not in metadata:
            metadata["long_running_notification_sent"] = False
        cache.hset(_job_key(print_job_id), "data", metadata)
        next_check_at = _now_ts() + INITIAL_INTERVAL_SECONDS
        cache.zadd(MONITOR_ZSET, {print_job_id: next_check_at})
        return print_job_id
    except redis.exceptions.ConnectionError:
        return None
    except Exception:
        return None


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
    """Return every known print job ID, both active and retained.

    Combines members of the monitor zset with Redis hash keys matching
    ``print_job:PJ-*`` so jobs that have left the active zset but still
    have retained metadata are still listed.

    Returns:
        List of ``print_job_id`` strings.
    """
    cache = _redis()
    if not cache:
        return []

    job_ids = set()

    try:
        members = cache.zrange(MONITOR_ZSET, 0, -1) or []
        for member in members:
            print_job_id = member.decode() if isinstance(member, bytes) else member
            # Clean up orphaned ZSET entries whose hash key is already gone.
            if get_print_job(print_job_id) is None:
                cache.zrem(MONITOR_ZSET, member)
                continue
            job_ids.add(print_job_id)
    except redis.exceptions.ConnectionError:
        pass
    except Exception:
        pass

    try:
        redis_client = getattr(cache, "redis", cache)
        site_key_prefix = cache.make_key("")
        if isinstance(site_key_prefix, bytes):
            site_key_prefix = site_key_prefix.decode()
        prefixed_hash_prefix = f"{site_key_prefix}{JOB_HASH_PREFIX}"
        pattern = f"{prefixed_hash_prefix}PJ-*"
        for key in redis_client.scan_iter(match=pattern):
            key_str = key.decode() if isinstance(key, bytes) else key
            if key_str.startswith(prefixed_hash_prefix):
                print_job_id = key_str[len(prefixed_hash_prefix) :]
                if print_job_id:
                    job_ids.add(print_job_id)
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
    cache = _redis()
    if not cache:
        return None

    try:
        return cache.hget(_job_key(print_job_id), "data")
    except redis.exceptions.ConnectionError:
        return None
    except Exception:
        return None


def update_print_job(print_job_id, updates):
    """Merge ``updates`` into the stored job metadata.

    Args:
        print_job_id: The job ID to update.
        updates: Dictionary of fields to merge into the metadata.

    Returns:
        The updated metadata dictionary, or ``None`` on failure.
    """
    cache = _redis()
    if not cache:
        return None

    try:
        data = get_print_job(print_job_id) or {}
        data.update(updates)
        cache.hset(_job_key(print_job_id), "data", data)
        return data
    except redis.exceptions.ConnectionError:
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
    """Stop active monitoring for a job while retaining its metadata hash.

    Terminal jobs leave the active monitor zset (so polling stops) but keep
    their metadata hash in Redis with a TTL so the final result remains
    queryable for a limited time.

    Args:
        print_job_id: The job ID to stop monitoring.
        ttl_seconds: TTL for the retained metadata hash (default 24 hours).
    """
    cache = _redis()
    if not cache:
        return

    try:
        cache.zrem(MONITOR_ZSET, print_job_id)
        redis_client = getattr(cache, "redis", cache)
        prefixed_key = cache.make_key(_job_key(print_job_id))
        prefixed_key_str = (
            prefixed_key.decode() if isinstance(prefixed_key, bytes) else prefixed_key
        )
        redis_client.expire(prefixed_key_str, ttl_seconds)
        release_job_lock(print_job_id)
    except redis.exceptions.ConnectionError:
        pass
    except Exception:
        pass


def schedule_next_check(print_job_id, current_state, retry_count=0):
    """Schedule the next monitor check for a job.

    Terminal states stop active monitoring while retaining the job metadata
    hash with a 24-hour TTL.  All other states update the zset score based on
    the adaptive interval rules defined in the requirements.

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
    """Remove a job from the monitor zset and clean up its Redis keys.

    Args:
        print_job_id: The job ID to clean up.
    """
    cache = _redis()
    if not cache:
        return

    try:
        cache.zrem(MONITOR_ZSET, print_job_id)
        cache.delete_value(_job_key(print_job_id))
        release_job_lock(print_job_id)
    except redis.exceptions.ConnectionError:
        pass
    except Exception:
        pass
