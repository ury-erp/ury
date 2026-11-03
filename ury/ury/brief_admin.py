"""Administrator is an owner for URY Brief by default; write the explicit site default once."""

import frappe
from frappe.installer import update_site_config

KEY = "ury_brief_allow_administrator"


def ensure_default():
	"""Idempotent: set the site config to 1 only when the site has no explicit value."""
	if frappe.conf.get(KEY) is None:
		update_site_config(KEY, 1)
