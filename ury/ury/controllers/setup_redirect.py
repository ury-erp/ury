import frappe

def is_ury_setup_complete():
    """Return True only once both Frappe's own setup wizard AND URY's Step 2
    (branch/rooms/tables/menu/payment/users) have completed.

    Frappe's `setup_complete()` flips `System Settings.setup_complete` to 1 at
    the end of Step 1, before Step 2 has run -- so that flag alone is not a
    trustworthy signal that URY is actually ready to use. A Branch record only
    exists once Step 2's `submit_configure_data` has finished, so require both.
    """
    try:
        if not frappe.is_setup_complete():
            return False
    except Exception:
        return False
    return bool(frappe.db.exists("Branch", {}))

def _setup_wizard_target():
    """Which wizard step to send the user back to.

    If a Company already exists (Step 1 done) but no Branch exists yet (Step 2
    not done), resume at Step 2 -- resubmitting Step 1 throws "Setup already
    completed". Otherwise start at Step 0.
    """
    if frappe.db.exists("Company", {}) and not frappe.db.exists("Branch", {}):
        return "/ury/setup-wizard/1"
    return "/ury/setup-wizard/0"

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
        frappe.local.response["location"] = _setup_wizard_target()

def on_session_creation(login_manager=None):
    """Ensure login on a fresh site redirects to the correct wizard step instead of /app or /setup-wizard."""
    if not is_ury_setup_complete():
        frappe.local.response["type"] = "redirect"
        frappe.local.response["location"] = _setup_wizard_target()
