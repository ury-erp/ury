"""The restaurant app answers on /restro and /pos-mobile; the URY URLs redirect there."""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.website.path_resolver import resolve_from_map, resolve_redirect
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request


def _redirect(path):
	"""(location, status) of the redirect for this path, or None."""
	frappe.cache.delete_key("website_redirects")
	try:
		resolve_redirect(path)
	except frappe.Redirect as e:
		return frappe.flags.redirect_location, e.http_status_code
	return None


class TestRestroRoutes(FrappeTestCase):
	def test_new_urls_render_the_apps(self):
		frappe.cache.delete_value("website_route_rules")
		# Frappe only matches dynamic routes inside a request.
		frappe.local.request = Request(EnvironBuilder(path="/").get_environ())
		self.addCleanup(setattr, frappe.local, "request", None)
		self.assertEqual(resolve_from_map("restro"), "ury")
		self.assertEqual(resolve_from_map("restro/dashboard"), "ury")
		self.assertEqual(resolve_from_map("restro/setup-wizard/0"), "ury")
		self.assertEqual(resolve_from_map("pos-mobile"), "urypos")
		self.assertEqual(resolve_from_map("pos-mobile/Table"), "urypos")

	def test_old_urls_redirect(self):
		self.assertEqual(_redirect("ury"), ("/restro", 302))
		self.assertEqual(_redirect("ury/dashboard"), ("/restro/dashboard", 302))
		self.assertEqual(_redirect("ury/invoices/ACC-PSINV-0001"), ("/restro/invoices/ACC-PSINV-0001", 302))
		self.assertEqual(_redirect("urypos"), ("/pos-mobile", 302))
		self.assertEqual(_redirect("urypos/Table"), ("/pos-mobile/Table", 302))
		self.assertEqual(_redirect("ury-login"), ("/login", 302))
		self.assertEqual(_redirect("setup-wizard"), ("/restro/setup-wizard/0", 302))

	def test_lookalike_paths_are_left_alone(self):
		for path in ("restro", "restro/dashboard", "ury-unavailable", "urylike", "pos", "pos-mobile"):
			self.assertIsNone(_redirect(path), path)
