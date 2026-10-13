import frappe

# Roles that are allowed to see the URY app tile on the Desk apps screen.
# The redirect logic in setup_redirect.py then sends each role to its own
# landing page (/pos for Cashier-only, /ury/serve for Captain-only, /ury
# for everyone else).
_URY_ROLES = {"URY Cashier", "URY Captain", "URY Manager", "URY Admin"}


def check_app_permission():
    """Return True when the current user is allowed to see the URY app tile.

    Grants access to:
    - Administrator and System Manager (Frappe built-ins)
    - Any user who holds at least one URY role
    """
    if frappe.session.user in ("Administrator", "Guest"):
        return frappe.session.user == "Administrator"
    roles = set(frappe.get_roles())
    return bool(roles & _URY_ROLES) or "System Manager" in roles