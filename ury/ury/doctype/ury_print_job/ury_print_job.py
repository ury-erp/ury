# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from ury.ury.printing.file_store import delete_job, get_job, list_all_jobs


class URYPrintJob(Document):
    """Virtual DocType representing a transient URY print job.

    The document is backed by atomic JSON files under the site's private
    ``print_jobs`` directory.  No MariaDB table is created or written to.
    """

    def load_from_db(self):
        """Load job metadata from its JSON file into the document."""
        data = get_job(self.name)

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
        """Delete the JSON file instead of removing a DB row."""
        delete_job(self.name)

    @staticmethod
    def get_list(args=None):
        """Return active print jobs stored as JSON files.

        Collects non-expired job records from the file store, applies filtering
        and field projection, and returns paginated results sorted newest-first.
        """
        args = args or {}
        start = int(args.get("start") or 0)
        page_length = int(args.get("page_length") or 20)

        jobs = list_all_jobs(max_age_seconds=7200)
        requested_fields = _parse_requested_fields(args.get("fields"))
        filters = _normalize_filters(args.get("filters"))

        valid_jobs = []
        for data in jobs:
            doc = _serialize_for_document(data)

            if filters and not _matches_filters(doc, filters):
                continue

            if requested_fields:
                doc_projected = {
                    key: doc.get(key) for key in requested_fields if key in doc
                }
                # Always preserve name for Frappe Desk list view UI.
                doc_projected["name"] = doc.get("name")
                valid_jobs.append(doc_projected)
            else:
                valid_jobs.append(doc)

        return valid_jobs[start : start + page_length]

    @staticmethod
    def get_count(args=None):
        """Return total count of non-expired print job records."""
        args = args or {}
        jobs = list_all_jobs(max_age_seconds=7200)
        filters = _normalize_filters(args.get("filters"))

        if not filters:
            return len(jobs)

        count = 0
        for data in jobs:
            doc = _serialize_for_document(data)
            if _matches_filters(doc, filters):
                count += 1
        return count

    @staticmethod
    def get_stats(args=None):
        """Return lightweight aggregate stats for active jobs."""
        jobs = list_all_jobs(max_age_seconds=7200)
        statuses = {}
        for data in jobs:
            status = data.get("status") or "Unknown"
            statuses[status] = statuses.get(status, 0) + 1

        return {
            "total_jobs": len(jobs),
            "status_breakdown": statuses,
        }


def _serialize_for_document(data):
    """Convert raw file-store metadata into a Frappe Document-compatible dict."""
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

    if isinstance(fields, str):
        try:
            fields = frappe.parse_json(fields)
        except Exception:
            fields = [fields]

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


def _normalize_filters(filters):
    """Return a list of ``(fieldname, operator, value)`` tuples.

    Accepts dicts, lists of tuples/lists, or single tuples/lists as returned
    by Frappe list views and reportview APIs.
    """
    if not filters:
        return []

    normalized = []

    if isinstance(filters, dict):
        for fname, fval in filters.items():
            normalized.append((fname, "=", fval))
    elif isinstance(filters, (list, tuple)):
        for f in filters:
            if isinstance(f, dict):
                for fname, fval in f.items():
                    normalized.append((fname, "=", fval))
            elif isinstance(f, (list, tuple)):
                if len(f) == 4:
                    normalized.append((f[1], f[2], f[3]))
                elif len(f) >= 3:
                    normalized.append((f[0], f[1], f[2]))

    return normalized


def _matches_filters(doc, filters):
    """Return True when ``doc`` satisfies all supplied filters."""
    for fname, fop, fval in filters:
        if "." in str(fname):
            fname = str(fname).split(".")[-1]

        if fname not in doc:
            return False

        doc_value = doc.get(fname)

        if fop == "=":
            if doc_value != fval:
                return False
        elif fop == "like":
            needle = str(fval).replace("%", "").lower()
            haystack = str(doc_value or "").lower()
            if needle not in haystack:
                return False
        else:
            # Unsupported operators are treated as no-match to stay safe.
            return False

    return True
