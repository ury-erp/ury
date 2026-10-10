import frappe

# Paths that must keep working during setup (wizard SPA, APIs, static files, login).
_SKIP_PREFIXES = ("restro", "ury", "api", "assets", "files", "private", "login")

# Desk / default landing paths that should send an incomplete site to the URY wizard.
# PathResolver strips leading slashes, so these are first-segment matches.
_REDIRECT_PREFIXES = ("", "app", "desk", "apps", "setup-wizard")


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
        return "/restro/setup-wizard/1"
    return "/restro/setup-wizard/0"


def _normalize_path(path):
    return (path or "").strip("/")


def _first_segment(path):
    normalized = _normalize_path(path)
    return normalized.split("/")[0] if normalized else ""


def _should_redirect_to_ury_setup(path):
    """True when a logged-in user on a Desk/landing path should be sent to the URY wizard."""
    if frappe.session.user == "Guest":
        return False
    if is_ury_setup_complete():
        return False

    first = _first_segment(path)
    if first in _SKIP_PREFIXES:
        return False
    return first in _REDIRECT_PREFIXES


def website_path_resolver(path):
    """URY's say over which page a path renders, before any HTML is built.

    Used as the `website_path_resolver` hook so redirects happen inside
    PathResolver (which handles frappe.Redirect) rather than before_request
    (which ignores frappe.local.response type=redirect on page GETs). In order:

      1. /login renders URY's sign-in page while that feature is on;
      2. pages of a switched-off feature render "unavailable" (404);
      3. restaurant staff kept out of Desk are sent to their own screen;
      4. an incomplete site sends everyone else to the setup wizard.
    """
    from frappe.website.path_resolver import resolve_path

    from ury.ury import features
    from ury.ury.controllers import access

    first = _first_segment(path)

    if first == "login" and features.is_enabled("custom_login"):
        return resolve_path("ury-login")

    feature = features.feature_for_page(first)
    if feature:
        frappe.local.flags.ury_unavailable_feature = feature["key"]
        return resolve_path("ury-unavailable")

    landing = access.guard_page(path)
    if landing:
        frappe.local.flags.redirect_location = landing
        raise frappe.Redirect(302)

    if _should_redirect_to_ury_setup(path):
        frappe.local.flags.redirect_location = _setup_wizard_target()
        raise frappe.Redirect(302)

    return resolve_path(path)


def on_session_creation(login_manager=None):
    """Hint login toward the wizard. LoginManager.set_user_info may overwrite
    home_page afterwards; website_path_resolver is the real intercept.
    """
    if is_ury_setup_complete():
        return
    frappe.local.response["message"] = "Logged In"
    frappe.local.response["home_page"] = _setup_wizard_target()


def extend_bootinfo(bootinfo):
    """Expose URY setup status for the Desk JS fallback redirect.

    Do not fake bootinfo.setup_complete — sessions.py overwrites that flag
    after extend_bootinfo runs.
    """
    complete = is_ury_setup_complete()
    bootinfo.ury_setup_complete = complete
    if not complete:
        bootinfo.ury_setup_wizard_target = _setup_wizard_target()
