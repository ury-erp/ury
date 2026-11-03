# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Pure tests: plain unittest, no Frappe site needed (frappe is stubbed if not
# importable). Run: python3 -m unittest test_analytics_env

import sys
import types
import unittest
from unittest import mock


def _stub_frappe():
	try:
		import frappe  # noqa: F401

		return
	except ImportError:
		pass
	f = types.ModuleType("frappe")
	f.get_installed_apps = lambda: ["frappe", "erpnext", "ury"]
	sys.modules["frappe"] = f


_stub_frappe()

try:
	from ury.ury.api import analytics_env as env
except ImportError:
	import analytics_env as env


class TestAnalyticsEnv(unittest.TestCase):
	def test_installed_from_apps(self):
		self.assertTrue(env.installed_from_apps(["frappe", "insights"]))
		self.assertFalse(env.installed_from_apps(["frappe", "erpnext", "ury"]))
		self.assertFalse(env.installed_from_apps(None))

	def test_url_for(self):
		self.assertEqual(env.url_for("owner", True), "/insights/dashboards/994d77ru95")
		self.assertIsNone(env.url_for("owner", False))
		self.assertIsNone(env.url_for("nope", True))

	def test_flag(self):
		self.assertEqual(env.insights_flag(True), {"installed": True, "install_hint": None})
		off = env.insights_flag(False)
		self.assertFalse(off["installed"])
		self.assertEqual(off["install_hint"], env.INSTALL_HINT)
		off["install_hint"]["cmd"] = "x"
		self.assertNotEqual(env.INSTALL_HINT["cmd"], "x")

	def test_flag_substitutes_site(self):
		off = env.insights_flag(False, "demo.localhost")
		self.assertIn("--site demo.localhost ", off["install_hint"]["cmd"])
		self.assertNotIn("<site>", off["install_hint"]["cmd"])
		self.assertIn("<site>", env.INSTALL_HINT["cmd"])

	def test_seam_with_patched_apps(self):
		with mock.patch.object(env.frappe, "get_installed_apps", create=True, return_value=["frappe", "erpnext", "ury"]):
			self.assertFalse(env.insights_installed())
			self.assertIsNone(env.dashboard_url())
		with mock.patch.object(env.frappe, "get_installed_apps", create=True, return_value=["frappe", "insights"]):
			self.assertTrue(env.insights_installed())
			self.assertEqual(env.dashboard_url("owner"), "/insights/dashboards/994d77ru95")


if __name__ == "__main__":
	unittest.main()
