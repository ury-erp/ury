import frappe

# Paths that must keep working during setup (wizard SPA, APIs, static files, login).
_SKIP_PREFIXES = ("ury", "api", "assets", "files", "private", "login")

# Desk / default landing paths that should send an incomplete site to the URY wizard.
# PathResolver strips leading slashes, so these are first-segment matches.
_REDIRECT_PREFIXES = ("", "app", "desk", "apps", "setup-wizard")

# Frappe's installer points the Desk home page at its setup wizard and only
# moves it on in the final "Wrapping up" stage. A stage that fails before that
# leaves the page behind, while earlier stages' implicit DDL commits keep the
# completion flags they already wrote -- so setup reads as complete.
_WIZARD_HOME_PAGE = "setup-wizard"
_DESK_HOME_PAGE = "Workspaces"

# Boots arrive in parallel, and every one of them sees the same stale pair.
# Without a claim they all attempt the same write and deadlock each other on
# tabDefaultValue's SELECT ... FOR UPDATE. The claim expires so that a repair
# that dies mid-flight is retried rather than blocked forever.
_REPAIR_LOCK_KEY = "ury_setup_repair_in_flight"
_REPAIR_LOCK_TTL = 60


def _is_setup_complete_safe():
    """`frappe.is_setup_complete()` without letting a boot-time failure raise."""
    try:
        return bool(frappe.is_setup_complete())
    except Exception:
        return False


def is_ury_setup_complete():
    """Return True only once both Frappe's own setup wizard AND URY's Step 2
    (branch/rooms/tables/menu/payment/users) have completed.

    Frappe's `setup_complete()` flips `System Settings.setup_complete` to 1 at
    the end of Step 1, before Step 2 has run -- so that flag alone is not a
    trustworthy signal that URY is actually ready to use. A Branch record only
    exists once Step 2's `submit_configure_data` has finished, so require both.
    """
    if not _is_setup_complete_safe():
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
    """Send incomplete sites to the URY wizard before Desk is rendered.

    Used as the `website_path_resolver` hook so the redirect happens inside
    PathResolver (which handles frappe.Redirect) rather than before_request
    (which ignores frappe.local.response type=redirect on page GETs).
    """
    from frappe.website.path_resolver import resolve_path

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


def _has_stale_wizard_home_page():
    """True when setup reads as complete but Desk still lands on the wizard.

    Desk cannot resolve that pair: it opens `home_page`, the wizard page sees
    `setup_complete` and bounces straight back to /app, forever.
    """
    if not _is_setup_complete_safe():
        return False
    return frappe.db.get_default("desktop:home_page") == _WIZARD_HOME_PAGE


def _claim_repair():
    """Take the single-flight claim for the repair, or report it is taken."""
    try:
        return bool(
            frappe.cache.set(
                frappe.cache.make_key(_REPAIR_LOCK_KEY), 1, nx=True, ex=_REPAIR_LOCK_TTL
            )
        )
    except Exception:
        # No cache to coordinate through: skip the write rather than race it.
        return False


def repair_interrupted_setup():
    """Finish the wrap-up a failed setup stage skipped.

    A stage that raises rolls back, but DDL run by earlier stages has already
    committed implicitly -- including the Installed Application rows that make
    `frappe.is_setup_complete()` true. Frappe's final stage never runs, so the
    Desk home page keeps pointing at the wizard and Desk loops between /app and
    the wizard page with no way out through the UI.

    Running Frappe's own wrap-up is the repair: it is what the missing stage
    would have done, and it is idempotent.
    """
    from frappe.desk.page.setup_wizard.setup_wizard import disable_future_access

    if not _has_stale_wizard_home_page():
        return False

    if frappe.local.flags.read_only or getattr(frappe.local, "request", None) is None:
        # Nothing to write into: leave the boot-time override to unwedge Desk,
        # and repair on the next writable request.
        return False

    if not _claim_repair():
        return False

    try:
        disable_future_access()
        frappe.db.commit()  # nosemgrep -- boot path; the repair must outlive this request
    except frappe.QueryDeadlockError:
        # Someone else is writing the same row. Their repair stands; this boot
        # still gets the override below, so nothing is left wedged.
        frappe.db.rollback()
        return False

    return True


def extend_bootinfo(bootinfo):
    """Expose URY setup status for the Desk JS fallback redirect.

    Do not fake bootinfo.setup_complete — sessions.py overwrites that flag
    after extend_bootinfo runs.
    """
    complete = is_ury_setup_complete()
    bootinfo.ury_setup_complete = complete
    if not complete:
        bootinfo.ury_setup_wizard_target = _setup_wizard_target()

    if frappe.session.user == "Guest":
        return

    try:
        repaired = repair_interrupted_setup()
    except Exception:
        # Never let a repair attempt break the boot the user is waiting on.
        frappe.log_error(title="URY setup repair failed")
        repaired = False

    # Whether or not the stored default could be rewritten, this boot must not
    # hand Desk the pair it loops on. A cached boot carries the stale value too.
    if (repaired or bootinfo.get("home_page") == _WIZARD_HOME_PAGE) and _is_setup_complete_safe():
        bootinfo["home_page"] = _DESK_HOME_PAGE
