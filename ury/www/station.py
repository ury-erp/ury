import json

import frappe
import frappe.sessions
from frappe.utils import cint

from ury.ury.station import pin as pin_rules
from ury.ury.station.session import current_station

no_cache = 1


def get_context(context):
	# Arriving here always means "next waiter": end a station session that
	# was left open (browser back, or a tab closed without tapping Done).
	if current_station():
		frappe.local.login_manager.logout()
		frappe.db.commit()  # nosemgrep: the logout must persist on a GET

	settings = pin_rules.get_settings()
	low, high = pin_rules.pin_length_range()
	config = {
		"min_pin_length": low,
		"max_pin_length": high,
		"require_activation": bool(cint(settings.require_device_activation)),
		# Someone else (e.g. a manager) is logged in on this browser: their
		# session expects a CSRF token on the sign-in call.
		"csrf_token": frappe.sessions.get_csrf_token() if frappe.session.user != "Guest" else "",
	}
	frappe.db.commit()  # nosemgrep: persist a newly issued CSRF token
	context.config_json = json.dumps(config).replace("</", "<\\/")
	context.build_version = frappe.utils.get_build_version()
	return context
