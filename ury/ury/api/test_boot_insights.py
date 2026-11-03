import sys
import types
import unittest
from unittest import mock

f = types.ModuleType("frappe")
f.get_installed_apps = lambda: []
f.get_roles = lambda: []
sys.modules.setdefault("frappe", f)
fr = sys.modules["frappe"]

from ury.ury import boot_insights as b  # noqa: E402


class TestBootInsights(unittest.TestCase):
	def _boot(self, apps, roles):
		info = types.SimpleNamespace()
		with (
			mock.patch.object(fr, "get_installed_apps", lambda: apps, create=True),
			mock.patch.object(fr, "get_roles", lambda: roles, create=True),
		):
			b.boot_session(info)
		return info.ury_insights

	def test_installed(self):
		r = self._boot(["frappe", "insights"], ["System Manager"])
		self.assertEqual(r, {"installed": True, "install_hint": None})

	def test_missing_system_manager_gets_hint(self):
		r = self._boot(["frappe"], ["System Manager"])
		self.assertFalse(r["installed"])
		self.assertIn("bench get-app insights", r["install_hint"]["cmd"])

	def test_hint_has_real_site(self):
		with mock.patch.object(fr, "local", types.SimpleNamespace(site="demo.localhost"), create=True):
			r = self._boot(["frappe"], ["System Manager"])
		self.assertIn("--site demo.localhost ", r["install_hint"]["cmd"])

	def test_missing_other_gets_no_hint(self):
		r = self._boot(["frappe"], ["Waiter"])
		self.assertEqual(r, {"installed": False, "install_hint": None})

	def test_never_raises(self):
		with mock.patch.object(fr, "get_installed_apps", mock.Mock(side_effect=RuntimeError), create=True):
			info = types.SimpleNamespace()
			b.boot_session(info)
		self.assertTrue(info.ury_insights["installed"])


if __name__ == "__main__":
	unittest.main()
