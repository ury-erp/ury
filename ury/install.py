import click

import frappe
from frappe import _

from ury.setup import after_install as setup


def after_install():
    try:
        print("Setting up URY...")
        setup()
        create_ury_roles()
        click.secho("Thank you for installing URY App!", fg="green")
    except Exception as e:
        click.secho(f"Warning during URY install: {e}", fg="yellow")


def after_migrate():
    """Called after every bench migrate. Idempotent role seeding."""
    try:
        create_ury_roles()
    except Exception as e:
        frappe.log_error(f"URY: Error during role migration: {e}")


def create_ury_roles():
    """
    Idempotent seeding of URY roles, Frappe backing roles,
    and capability assignments. Safe to run on every migrate.
    """
    from ury.ury.permissions import (
        URY_ROLE_FRAPPE_ROLE_MAP,
        DEFAULT_ROLE_CAPABILITIES,
        DESK_ACCESS_ROLES,
        ROLE_DESCRIPTIONS,
        CAPABILITIES,
    )

    # Step 1: Create Frappe Role records for all backing roles
    for ury_role_name, frappe_role_name in URY_ROLE_FRAPPE_ROLE_MAP.items():
        if frappe_role_name == "System Manager":
            continue  # System Manager already exists in Frappe

        if not frappe.db.exists("Role", frappe_role_name):
            role_doc = frappe.new_doc("Role")
            role_doc.role_name = frappe_role_name
            role_doc.desk_access = 1 if ury_role_name in DESK_ACCESS_ROLES else 0
            role_doc.is_custom = 1
            role_doc.flags.ignore_permissions = True
            role_doc.insert()
            print(f"  Created Frappe role: {frappe_role_name}")
        else:
            # Ensure desk_access is correct
            expected_desk = 1 if ury_role_name in DESK_ACCESS_ROLES else 0
            current_desk = frappe.db.get_value("Role", frappe_role_name, "desk_access")
            if current_desk != expected_desk:
                frappe.db.set_value("Role", frappe_role_name, "desk_access", expected_desk)

    # Step 2: Create/update URY Role documents with capability sets
    for role_name, caps in DEFAULT_ROLE_CAPABILITIES.items():
        frappe_role = URY_ROLE_FRAPPE_ROLE_MAP.get(role_name)
        description = ROLE_DESCRIPTIONS.get(role_name, "")
        desk_access = 1 if role_name in DESK_ACCESS_ROLES else 0

        if frappe.db.exists("URY Role", role_name):
            doc = frappe.get_doc("URY Role", role_name)
            doc.description = description
            doc.is_system_role = 1
            doc.desk_access = desk_access
            doc.frappe_role = frappe_role

            # Rebuild capability rows
            doc.permissions = []
            for cap in caps:
                label = CAPABILITIES.get(cap, cap)
                doc.append("permissions", {
                    "capability": cap,
                    "label": label,
                })

            doc.flags.ignore_permissions = True
            doc.save()
        else:
            doc = frappe.new_doc("URY Role")
            doc.role_name = role_name
            doc.description = description
            doc.is_system_role = 1
            doc.desk_access = desk_access
            doc.frappe_role = frappe_role

            for cap in caps:
                label = CAPABILITIES.get(cap, cap)
                doc.append("permissions", {
                    "capability": cap,
                    "label": label,
                })

            doc.flags.ignore_permissions = True
            doc.insert()
            print(f"  Created URY Role: {role_name}")

    # Step 3: Set DocType permissions on URY Role and URY User Role
    _set_doctype_permissions()

    # Step 4: Assign Administrator the URY Admin role (if not already)
    _assign_admin_role()

    # Step 5: Migration — assign existing URY Manager users to URY Manager role
    _migrate_existing_users()

    frappe.db.commit()
    print("URY roles seeded successfully.")


def _set_doctype_permissions():
    """Set DocType-level permissions for URY Role and URY User Role."""
    from frappe.permissions import add_permission, update_permission_property

    for dt in ("URY Role", "URY User Role"):
        try:
            # System Manager: full access
            add_permission(dt, "System Manager", 0)
            for ptype in ("read", "write", "create", "delete", "report", "export"):
                update_permission_property(dt, "System Manager", 0, ptype, 1, validate=False)

            # URY Manager: read + export
            add_permission(dt, "URY Manager", 0)
            for ptype in ("read", "export"):
                update_permission_property(dt, "URY Manager", 0, ptype, 1, validate=False)
        except Exception:
            pass  # Permission may already exist


def _assign_admin_role():
    """Assign Administrator the URY Admin role if not already assigned."""
    if not frappe.db.exists("URY User Role", "Administrator"):
        try:
            doc = frappe.new_doc("URY User Role")
            doc.user = "Administrator"
            doc.ury_role = "URY Admin"
            doc.enabled = 1
            doc.flags.ignore_permissions = True
            doc.insert()
            print("  Assigned Administrator → URY Admin")
        except Exception as e:
            frappe.log_error(f"URY: Failed to assign admin role: {e}")


def _migrate_existing_users():
    """
    One-time migration: assign existing users with old URY roles
    (URY Manager, URY Captain, URY Cashier) to corresponding URY User Roles.
    """
    role_migration_map = {
        "URY Manager": "URY Manager",
        "URY Captain": "URY Captain",
        "URY Cashier": "URY Cashier",
    }

    for frappe_role, ury_role in role_migration_map.items():
        try:
            users_with_role = frappe.get_all(
                "Has Role",
                filters={"role": frappe_role, "parenttype": "User"},
                pluck="parent",
            )
            for user_email in users_with_role:
                if user_email == "Administrator":
                    continue
                if frappe.db.exists("URY User Role", user_email):
                    continue
                try:
                    doc = frappe.new_doc("URY User Role")
                    doc.user = user_email
                    doc.ury_role = ury_role
                    doc.enabled = 1
                    doc.flags.ignore_permissions = True
                    doc.insert()
                except Exception:
                    pass  # Skip if user doesn't exist or other issue
        except Exception:
            pass  # Non-fatal migration
