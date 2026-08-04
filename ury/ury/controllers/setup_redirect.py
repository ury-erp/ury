import frappe

def is_ury_setup_complete():
    """Return True if system settings or installed applications mark setup complete."""
    try:
        if not int(frappe.db.get_single_value("System Settings", "setup_complete") or 0):
            return False
    except Exception:
        return False
    return frappe.is_setup_complete()

def redirect_to_setup():
    """Redirect logged-in users to /ury while setup is not complete."""
    if frappe.session.user == "Guest":
        return
    if is_ury_setup_complete():
        return
    path = getattr(frappe.request, "path", "")
    if path.startswith("/ury") or path.startswith("/api") or path.startswith("/assets"):
        return  # already on wizard, API, or static asset call, do not loop
    if path.startswith("/app") or path.startswith("/setup-wizard") or path.startswith("/desk") or path == "/" or not path:
        frappe.local.response["type"] = "redirect"
        frappe.local.response["location"] = "/ury"

def on_session_creation(login_manager=None):
    """Ensure login on a fresh site redirects to /ury instead of /app or /setup-wizard."""
    if not is_ury_setup_complete():
        frappe.local.response["type"] = "redirect"
        frappe.local.response["location"] = "/ury"
