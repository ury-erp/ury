"""Shown for the pages of a feature that is switched off (with a 404 status)."""

import frappe
from frappe import _

from ury.ury import features

no_cache = 1
RTL_LANGS = {"ar", "he", "fa", "ps", "ur", "ku"}
sitemap = 0


def get_context(context):
	key = getattr(frappe.local.flags, "ury_unavailable_feature", None)
	feature = features.BY_KEY.get(key)
	lang = frappe.local.lang or "en"
	context.http_status_code = 404
	context.no_header = True
	context.lang = lang
	context.dir = "rtl" if lang.split("-")[0] in RTL_LANGS else "ltr"
	context.title = _("Not available")
	context.feature = _(feature["label"]) if feature else None
	context.home = "/login" if frappe.session.user == "Guest" else "/"
	return context
