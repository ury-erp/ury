import json
import re

import frappe
import frappe.sessions
import frappe.website.utils
from ury.brand import get_brand_context, json_for_script

no_cache = 1

SCRIPT_TAG_PATTERN = re.compile(r"\<script[^<]*\</script\>")
CLOSING_SCRIPT_TAG_PATTERN = re.compile(r"</script\>")


def get_context(context):
	"""Boot context for the customer self-ordering app (/order/*).

	Customers are anonymous (Guest) by design — see ury/ury/api/self_ordering.py
	for the real trust boundary (signed QR tokens / device credentials), which
	is independent of the Frappe user session. This page never expects a
	logged-in operational user, so it always uses the lightweight Guest boot
	rather than frappe.sessions.get()'s full desk boot payload.
	"""
	csrf_token = frappe.sessions.get_csrf_token()
	context.update(get_brand_context())
	frappe.db.commit()  # nosemgrep

	boot = frappe.website.utils.get_boot_data()
	boot["ury_brand"] = context["brand"]

	boot_json = json_for_script(boot)
	boot_json = SCRIPT_TAG_PATTERN.sub("", boot_json)
	boot_json = CLOSING_SCRIPT_TAG_PATTERN.sub("", boot_json)
	boot_json = json.dumps(boot_json)

	context.update(
		{"build_version": frappe.utils.get_build_version(), "boot": boot_json, "csrf_token": csrf_token}
	)
	return context
