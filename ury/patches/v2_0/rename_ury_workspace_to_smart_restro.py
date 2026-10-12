"""
Rename the "URY" desk workspace to "Smart Restro".

The app ships the workspace as `ury/ury/workspace/smart_restro/`, so a fresh
install already gets the new record. This patch is only for sites that were
installed before the rename: without it, migrate would leave the old "URY"
workspace in place and the sidebar would show both.

Workspace autonames from `label` (`autoname: field:label`), and the desk
derives the sidebar route from `title` — so both fields are updated alongside
the rename, otherwise the record keeps answering on the old URL.
"""

import frappe

OLD = "URY"
NEW = "Smart Restro"


def execute():
    if not frappe.db.table_exists("Workspace"):
        return

    old_exists = frappe.db.exists("Workspace", OLD)
    new_exists = frappe.db.exists("Workspace", NEW)

    if not old_exists:
        # Fresh install, or the patch already ran.
        return

    if new_exists:
        # The fixture recreated the workspace under its new name, so the old
        # record is superseded rather than renamed. Anything a user had
        # customised on "URY" lives on in the new standard definition.
        frappe.delete_doc("Workspace", OLD, ignore_permissions=True, force=True)
        frappe.db.commit()
        return

    # Carry the existing record over, keeping its roles and any links an
    # administrator added on top of the standard set.
    frappe.rename_doc("Workspace", OLD, NEW, force=True, ignore_permissions=True)

    # `rename_doc` moves the primary key but not the fields the desk reads for
    # the label and the route.
    frappe.db.set_value("Workspace", NEW, {"label": NEW, "title": NEW},
                        update_modified=False)

    # Any workspace nested under the old page would otherwise be orphaned.
    frappe.db.set_value("Workspace", {"parent_page": OLD}, "parent_page", NEW,
                        update_modified=False)

    frappe.clear_cache()
    frappe.db.commit()
