# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from ury.ury.printing.print_job_monitor import (
    get_active_print_job_ids,
    get_all_tracked_print_job_ids,
    get_print_job,
    remove_print_job,
)


class URYPrintJob(Document):
    """Virtual DocType representing a transient URY print job.

    The document is backed entirely by Redis via ``print_job_monitor.py``.
    No MariaDB table is created or written to.
    """

    def load_from_db(self):
        """Load job metadata from Redis into the document."""
        data = get_print_job(self.name)

        if not data:
            raise frappe.DoesNotExistError

        super(Document, self).__init__(_serialize_for_document(data))

    def db_insert(self, *args, **kwargs):
        """No-op: virtual doctype does not write to MariaDB."""
        pass

    def db_update(self, *args, **kwargs):
        """No-op: virtual doctype does not write to MariaDB."""
        pass

    def delete(self, *args, **kwargs):
        """Remove the job from Redis instead of deleting a DB row."""
        remove_print_job(self.name)

    @staticmethod
    def get_list(args=None):
        """Return tracked print jobs stored in Redis.

        Collects all valid print job records from Redis, applies filtering and field
        projection, and returns paginated results sorted newest-first.
        """
        args = args or {}
        start = int(args.get("start") or 0)
        page_length = int(args.get("page_length") or 20)

        job_ids = get_all_tracked_print_job_ids() or []
        # Sort so newest jobs appear first.
        job_ids = list(reversed(job_ids))

        requested_fields = _parse_requested_fields(args.get("fields"))

        valid_jobs = []
        for job_id in job_ids:
            data = get_print_job(job_id)
            if not data:
                continue

            doc = _serialize_for_document(data)

            # Check basic name filter if provided
            if args.get("filters"):
                filters = args.get("filters")
                # Apply docstatus or name filters if present
                skip = False
                for f in filters:
                    if isinstance(f, (list, tuple)) and len(f) >= 3:
                        fname, fop, fval = f[0], f[1], f[2]
                        if "." in str(fname):
                            fname = str(fname).split(".")[-1]
                        if fname in doc:
                            if fop == "=" and doc.get(fname) != fval:
                                skip = True
                            elif fop == "like" and str(fval).replace("%", "").lower() not in str(doc.get(fname, "")).lower():
                                skip = True
                if skip:
                    continue

            if requested_fields:
                doc_projected = {key: doc.get(key) for key in requested_fields if key in doc}
                # Always preserve name for Frappe Desk list view UI
                doc_projected["name"] = doc.get("name")
                valid_jobs.append(doc_projected)
            else:
                valid_jobs.append(doc)

        return valid_jobs[start : start + page_length]

    @staticmethod
    def get_count(args=None):
        """Return total count of valid print job records in Redis."""
        job_ids = get_all_tracked_print_job_ids() or []
        count = 0
        for job_id in job_ids:
            if get_print_job(job_id):
                count += 1
        return count

    @staticmethod
    def get_stats(args=None):
        """Return lightweight aggregate stats for active jobs."""
        job_ids = get_active_print_job_ids() or []
        statuses = {}
        for job_id in job_ids:
            data = get_print_job(job_id) or {}
            status = data.get("status") or "Unknown"
            statuses[status] = statuses.get(status, 0) + 1

        return {
            "total_jobs": len(job_ids),
            "status_breakdown": statuses,
        }


def _serialize_for_document(data):
    """Convert raw Redis metadata into a Frappe Document-compatible dict."""
    out = frappe._dict(data)
    out.name = out.get("print_job_id") or out.get("name")
    out.doctype = "URY Print Job"

    # Ensure list-view / document contract fields are present.
    out.owner = out.get("owner") or "Administrator"
    out.modified_by = out.get("modified_by") or out.owner
    out.creation = out.get("created_at") or out.get("creation") or frappe.utils.now()
    out.modified = out.get("last_checked_at") or out.get("modified") or out.creation
    out._comment_count = out.get("_comment_count", 0)

    return out


def _parse_requested_fields(fields):
    """Extract field names from a Frappe reportview fields list.

    Handles strings such as ``"`tabURY Print Job`.`name`"`` and
    ``"`name`"``. Returns a list of field names, or an empty list when no
    fields are requested (meaning the caller wants the full document).
    """
    if not fields:
        return []

    parsed = []
    for field in fields:
        if not isinstance(field, str):
            continue
        cleaned = field.strip().strip("`")
        if "." in cleaned:
            cleaned = cleaned.split(".")[-1].strip().strip("`")
        if cleaned:
            parsed.append(cleaned)

    return parsed
