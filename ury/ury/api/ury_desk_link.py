"""Permission probe backing the frontend's "Open in Desk" links.

Several `/ury` screens are read-only views over documents that remain fully
editable in the Frappe desk (`URY Issue Wastage`, `URY Stock Movement`,
`POS Invoice`, `Work Order`, ...). Those screens offer a link straight to
`/app/<doctype>/<name>`, but only for users who can actually open the document
-- showing a link that lands on "Not Permitted" is worse than showing nothing.

There is no generic doctype-level permission endpoint in Frappe v15 that the
frontend can use for this: `frappe.client.has_permission` requires a `docname`
and would mean one round trip per row. This module exposes a single batched,
doctype-level probe instead.

Security notes:

* This endpoint only ever *reports* permissions; it never reads or returns
  document data, so it leaks nothing beyond "the current user's role set grants
  read/write on doctype X" -- which the user could already determine by trying.
* It is not itself an authorization boundary. The desk enforces permissions on
  arrival, and every mutating URY endpoint keeps its own
  `frappe.has_permission(...)` guard (see `ury.ury.api.ury_wastage`). This is a
  UX hint that hides dead-end links.
* Guests get nothing, unknown doctypes report `False` rather than raising, and
  the batch size is capped so the endpoint cannot be used to enumerate the
  whole doctype table in one call.
"""

import json

import frappe

#: Upper bound on doctypes probed per call. The busiest caller asks for one.
MAX_DOCTYPES_PER_CALL = 20


def _parse_doctypes(doctypes):
    """Normalise the `doctypes` argument into a de-duplicated list of strings.

    Accepts a JSON array (how `frappe.call` serialises a JS array), a Python
    list, or a single doctype name.
    """
    if isinstance(doctypes, str):
        stripped = doctypes.strip()
        if stripped.startswith("["):
            try:
                doctypes = json.loads(stripped)
            except ValueError:
                doctypes = [stripped]
        else:
            doctypes = [stripped]

    if not isinstance(doctypes, (list, tuple)):
        return []

    seen = []
    for entry in doctypes:
        if not isinstance(entry, str):
            continue
        name = entry.strip()
        if name and name not in seen:
            seen.append(name)
    return seen[:MAX_DOCTYPES_PER_CALL]


@frappe.whitelist()
def get_desk_permissions(doctypes):
    """Report the session user's doctype-level `read`/`write` permissions.

    :param doctypes: doctype name, list of names, or JSON array of names.
    :returns: ``{doctype: {"read": bool, "write": bool}}``. Doctypes that do
              not exist (or that raise while being checked) report ``False``
              for both rather than failing the whole batch -- a frontend that
              asks about a doctype from a not-yet-installed app should simply
              hide its link, not error.
    """
    if frappe.session.user in ("Guest", None):
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

    result = {}
    for doctype in _parse_doctypes(doctypes):
        try:
            result[doctype] = {
                "read": bool(frappe.has_permission(doctype, "read")),
                "write": bool(frappe.has_permission(doctype, "write")),
            }
        except Exception:
            # Unknown/removed doctype, or a has_permission hook that raised.
            # Fail closed for this entry only.
            result[doctype] = {"read": False, "write": False}

    return result
