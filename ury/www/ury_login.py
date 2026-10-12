"""The restaurant's sign-in page (served at /login while the feature is on).

Authentication is Frappe's own: the page posts to /api/method/login, with its
lockout after repeated failures, two-factor step and session handling. The
forgotten-password and email-link requests use Frappe's rate-limited guest
methods. This page only decides what is shown, and where a user already
signed in should go instead.
"""

import frappe
from frappe import _
from frappe.utils import cint

from ury.ury.controllers import access

no_cache = 1
RTL_LANGS = {"ar", "he", "fa", "ps", "ur", "ku"}
sitemap = 0


def get_context(context):
	if frappe.session.user != "Guest":
		wanted = access.safe_redirect(frappe.form_dict.get("redirect-to"))
		info = access.access_for()
		target = wanted if wanted and (info.desk or access._first_segment(wanted) not in access.DESK_PAGES) else None
		frappe.local.flags.redirect_location = target or info.landing or "/app"
		raise frappe.Redirect

	from frappe.www.login import get_context as frappe_login_context

	# Keep Frappe's social login providers and sign-up / email-link /
	# password-login switches, then apply this page's Smart Choice branding.
	frappe_login_context(context)

	lang = frappe.local.lang or "en"
	context.no_header = True
	context.no_breadcrumbs = True
	context.lang = lang
	context.dir = "rtl" if lang.split("-")[0] in RTL_LANGS else "ltr"
	context.title = _("Sign in")
	context.app_name = "Smart Choice"
	context.logo = "/assets/ury/Images/smart-restro-logo.png"
	context.favicon = "/assets/ury/Images/smart-choice-icon.png"
	context.restaurant = (
		frappe.db.get_value("URY Restaurant", {}, "name")
		or frappe.defaults.get_global_default("company")
		or context.app_name
	)
	context.login_with_email_link = cint(frappe.get_system_settings("login_with_email_link"))
	context.show_password_login = not cint(context.get("disable_user_pass_login"))
	context.other_lang = "en" if lang == "ar" else "ar"
	context.year = frappe.utils.nowdate()[:4]
	return context
