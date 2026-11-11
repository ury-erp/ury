import json
import re

import frappe
import frappe.sessions
from frappe import _
from frappe.utils.telemetry import capture

no_cache = 1
login_required = True

# ======================================================================================
#  /ury/pos AND /ury/pos/*  ARE TEMPORARILY BLOCKED FOR EVERY USER (incl. Administrator).
# ======================================================================================
# The POS tree inside this app (frontend/src/pages/Pos) is not ready for use and must not
# be reachable, e.g. by a cashier who picks the URY tile on the Desk apps screen. The same
# block exists on the client: frontend/src/lib/posRouteBlock.ts (URY_POS_ROUTES_ENABLED).
# To re-enable, set POS_ROUTE_BLOCKED = False here AND URY_POS_ROUTES_ENABLED = true there,
# then rebuild the frontend. The standalone POS at /pos is NOT affected.
POS_ROUTE_BLOCKED = True

SCRIPT_TAG_PATTERN = re.compile(r"\<script[^<]*\</script\>")
CLOSING_SCRIPT_TAG_PATTERN = re.compile(r"</script\>")


def _is_blocked_pos_route():
	path = (getattr(frappe.local.request, "path", "") or "").rstrip("/")
	return POS_ROUTE_BLOCKED and (path == "/ury/pos" or path.startswith("/ury/pos/"))


def get_context(context):
	if _is_blocked_pos_route():
		frappe.throw(_("You do not have access to this page."), frappe.PermissionError)

	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login"
		raise frappe.Redirect

	csrf_token = frappe.sessions.get_csrf_token()
	# Manually commit the CSRF token here
	frappe.db.commit()  # nosemgrep

	try:
		boot = frappe.sessions.get()
	except Exception as e:
		raise frappe.SessionBootFailed from e

	# add server_script_enabled in boot
	if "server_script_enabled" in frappe.conf:
		enabled = frappe.conf.server_script_enabled
	else:
		enabled = True
	boot["server_script_enabled"] = enabled

	boot_json = frappe.as_json(boot, indent=None, separators=(",", ":"))
	boot_json = SCRIPT_TAG_PATTERN.sub("", boot_json)

	boot_json = CLOSING_SCRIPT_TAG_PATTERN.sub("", boot_json)
	boot_json = json.dumps(boot_json)

	from frappe.utils import cint

	context.update(
		{
			"build_version": frappe.utils.get_build_version(),
			"boot": boot_json,
			"csrf_token": csrf_token,
			"dev_server": cint(getattr(frappe.local, "dev_server", 0)),
		}
	)
	return context


@frappe.whitelist(methods=["POST"])
def get_context_for_dev():
	if not frappe.conf.developer_mode:
		frappe.throw(_("This method is only meant for developer mode"))
	if "System Manager" not in frappe.get_roles():
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return json.loads(get_boot())


def get_boot():
	try:
		boot = frappe.sessions.get()
	except Exception as e:
		raise frappe.SessionBootFailed from e

	boot["push_relay_server_url"] = frappe.conf.get("push_relay_server_url")
	boot_json = frappe.as_json(boot, indent=None, separators=(",", ":"))
	boot_json = SCRIPT_TAG_PATTERN.sub("", boot_json)

	boot_json = CLOSING_SCRIPT_TAG_PATTERN.sub("", boot_json)
	boot_json = json.dumps(boot_json)

	return boot_json
