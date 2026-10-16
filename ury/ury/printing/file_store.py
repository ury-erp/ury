"""Atomic JSON file-backed storage for URY Print Job metadata.

Each print job is persisted as a single JSON file under the site's private
``print_jobs`` directory:

    sites/<site>/private/print_jobs/<print_job_id>.json

Writes are atomic (temp-file + ``os.replace`` + fsync) so concurrent updates
can never leave a half-written file.  Reads open the committed file directly.

This module intentionally has no Redis dependency; it is used by
``print_job_monitor.py`` and the Virtual DocType controller.
"""

import json
import os
import tempfile
import time
from typing import Optional

import frappe

PRINT_JOBS_DIR_NAME = "print_jobs"
DEFAULT_MAX_AGE_SECONDS = 7200


def get_print_jobs_dir() -> str:
    """Return the site-private directory used to store print-job JSON files.

    The directory is created on first call if it does not already exist.

    Returns:
        Absolute path to ``sites/<site>/private/print_jobs``.
    """
    path = frappe.get_site_path("private", PRINT_JOBS_DIR_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def _job_path(print_job_id: str) -> str:
    """Return the absolute filesystem path for ``print_job_id``.

    Args:
        print_job_id: The URY Print Job identifier.

    Returns:
        Path to the corresponding ``<print_job_id>.json`` file.
    """
    return os.path.join(get_print_jobs_dir(), f"{print_job_id}.json")


def save_job(print_job_id: str, data: dict) -> bool:
    """Persist job metadata atomically as a JSON file.

    The write is performed by serialising to a temporary file in the same
    directory and then promoting it with ``os.replace``.  Both the file and the
    containing directory are fsynced so the data is durable even if the host
    crashes immediately after the call returns.

    Args:
        print_job_id: The URY Print Job identifier.
        data: Dictionary of metadata to persist.

    Returns:
        ``True`` when the file was written successfully, ``False`` otherwise.
    """
    if not print_job_id:
        return False

    target_path = _job_path(print_job_id)
    parent_dir = os.path.dirname(target_path)
    os.makedirs(parent_dir, exist_ok=True)

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json.tmp",
            prefix=f"{print_job_id}.",
            dir=parent_dir,
            delete=False,
        ) as tmp_file:
            json.dump(data, tmp_file, separators=(",", ":"), sort_keys=True)
            tmp_path = tmp_file.name
            tmp_file.flush()
            os.fsync(tmp_file.fileno())

        os.replace(tmp_path, target_path)

        try:
            dir_fd = os.open(parent_dir, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except Exception:
            # Directory fsync is best-effort; the file itself is already durable.
            pass

        return True
    except Exception:
        frappe.logger("printing").warning(
            {"event": "file_store_save_failed", "print_job_id": print_job_id},
            exc_info=True,
        )
        # Best-effort cleanup of the temporary file.
        try:
            if "tmp_path" in locals() and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except Exception:
            pass
        return False


def get_job(print_job_id: str) -> Optional[dict]:
    """Load job metadata from its JSON file.

    Args:
        print_job_id: The URY Print Job identifier.

    Returns:
        The persisted metadata dictionary, or ``None`` if the file is missing
        or unreadable.
    """
    if not print_job_id:
        return None

    target_path = _job_path(print_job_id)
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        frappe.logger("printing").warning(
            {"event": "file_store_corrupt_job", "print_job_id": print_job_id}
        )
        return None
    except Exception:
        frappe.logger("printing").warning(
            {"event": "file_store_get_failed", "print_job_id": print_job_id},
            exc_info=True,
        )
        return None


def delete_job(print_job_id: str) -> bool:
    """Delete the JSON file for a print job.

    Args:
        print_job_id: The URY Print Job identifier.

    Returns:
        ``True`` if the file no longer exists, ``False`` on an unexpected error.
    """
    if not print_job_id:
        return False

    target_path = _job_path(print_job_id)
    try:
        if os.path.exists(target_path):
            os.unlink(target_path)
        return True
    except Exception:
        frappe.logger("printing").warning(
            {"event": "file_store_delete_failed", "print_job_id": print_job_id},
            exc_info=True,
        )
        return False


def list_all_jobs(max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS) -> list:
    """Scan the print-jobs directory and return active jobs, newest first.

    Files whose ``mtime`` is older than ``max_age_seconds`` are deleted during
    the scan (lazy TTL cleanup).  The remaining files are returned sorted by
    ``mtime`` descending, i.e. most recently touched first.

    Args:
        max_age_seconds: Maximum file age in seconds.  Defaults to 2 hours.

    Returns:
        List of metadata dictionaries for non-expired jobs.
    """
    jobs_dir = get_print_jobs_dir()
    now_ts = time.time()
    cutoff = now_ts - max_age_seconds
    active_jobs = []

    try:
        entries = os.listdir(jobs_dir)
    except FileNotFoundError:
        return []
    except Exception:
        frappe.logger("printing").warning(
            {"event": "file_store_list_failed"}, exc_info=True
        )
        return []

    for entry in entries:
        if not entry.endswith(".json"):
            continue

        full_path = os.path.join(jobs_dir, entry)
        try:
            mtime = os.path.getmtime(full_path)
        except FileNotFoundError:
            continue
        except Exception:
            continue

        if mtime < cutoff:
            try:
                os.unlink(full_path)
            except Exception:
                pass
            continue

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            # Unreadable files are left in place; they will be pruned by TTL.
            continue

        data["_mtime"] = mtime
        active_jobs.append(data)

    active_jobs.sort(key=lambda job: job.get("_mtime", 0), reverse=True)
    return active_jobs


def prune_expired_jobs(max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS) -> int:
    """Standalone scheduler target that deletes expired print-job JSON files.

    Args:
        max_age_seconds: Maximum file age in seconds.  Defaults to 2 hours.

    Returns:
        Number of files deleted.
    """
    jobs_dir = get_print_jobs_dir()
    now_ts = time.time()
    cutoff = now_ts - max_age_seconds
    deleted_count = 0

    try:
        entries = os.listdir(jobs_dir)
    except FileNotFoundError:
        frappe.logger("printing").info(
            {"event": "prune_expired_jobs", "deleted_count": 0}
        )
        return 0
    except Exception:
        frappe.logger("printing").warning(
            {"event": "prune_expired_jobs_list_failed"}, exc_info=True
        )
        return 0

    for entry in entries:
        if not entry.endswith(".json"):
            continue

        full_path = os.path.join(jobs_dir, entry)
        try:
            mtime = os.path.getmtime(full_path)
            if mtime < cutoff:
                os.unlink(full_path)
                deleted_count += 1
        except FileNotFoundError:
            continue
        except Exception:
            frappe.logger("printing").warning(
                {
                    "event": "prune_expired_jobs_file_failed",
                    "file": entry,
                },
                exc_info=True,
            )

    frappe.logger("printing").info(
        {
            "event": "prune_expired_jobs",
            "deleted_count": deleted_count,
            "max_age_seconds": max_age_seconds,
        }
    )
    return deleted_count
