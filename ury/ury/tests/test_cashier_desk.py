"""Cashier-only Desk detection, redirects, permission hooks and boot shaping.

Mock-based (roles and the workspace shortcut list are patched), matching the pattern used by
the other role tests in this package. See `ury.ury.controllers.cashier_desk_guard`.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.controllers import cashier_desk_guard as guard
from ury.ury.utils.cashier_desk import WORKSPACE_NAME, WORKSPACE_ROUTE, is_cashier_only

AUTOMATIC = ["Guest", "All", "Desk User"]
ALLOWED = ["POS Invoice", "URY KOT", "URY Table"]


def _roles(*business):
	return AUTOMATIC + list(business)


class TestIsCashierOnly(FrappeTestCase):
	def _check(self, roles, user="cashier@example.com"):
		with patch("frappe.get_roles", return_value=roles):
			return is_cashier_only(user)

	def test_cashier_only(self):
		self.assertTrue(self._check(_roles("URY Cashier")))

	def test_cashier_plus_any_other_role_is_not_cashier_only(self):
		for extra in (
			"URY Manager",
			"URY Admin",
			"URY Owner",
			"URY Captain",
			"System Manager",
			"Accounts User",
			"HR Manager",
			"Employee",
		):
			with self.subTest(extra=extra):
				self.assertFalse(self._check(_roles("URY Cashier", extra)))

	def test_other_users_are_not_cashier_only(self):
		for role in ("URY Manager", "URY Admin", "URY Owner", "URY Captain", "System Manager"):
			with self.subTest(role=role):
				self.assertFalse(self._check(_roles(role)))

	def test_user_without_roles_is_not_cashier_only(self):
		self.assertFalse(self._check(_roles()))

	def test_administrator_and_guest_are_never_cashier_only(self):
		self.assertFalse(self._check(_roles("URY Cashier"), user="Administrator"))
		self.assertFalse(self._check(_roles("URY Cashier"), user="Guest"))


class TestRedirectTarget(FrappeTestCase):
	def setUp(self):
		self._patches = [
			patch.object(guard, "is_cashier_only", return_value=True),
			patch.object(guard, "get_allowed_doctypes", return_value=ALLOWED),
		]
		for p in self._patches:
			p.start()

	def tearDown(self):
		for p in self._patches:
			p.stop()

	def test_dashboard_routes_are_served(self):
		for path in ("desk/ury/daily-operations", "desk/daily-operations"):
			with self.subTest(path=path):
				self.assertIsNone(guard.redirect_target(path))

	def test_bare_desk_opens_the_dashboard(self):
		for path in ("desk", "desk/", "app", "apps"):
			with self.subTest(path=path):
				self.assertEqual(guard.redirect_target(path), WORKSPACE_ROUTE)

	def test_bare_desk_right_after_login_opens_pos(self):
		request = frappe._dict(query_string=b"", headers={"Referer": "https://site.example/login"})
		with patch.object(frappe.local, "request", request, create=True):
			self.assertEqual(guard.redirect_target("desk"), "/pos")
		request = frappe._dict(query_string=b"", headers={"Referer": "https://site.example/pos"})
		with patch.object(frappe.local, "request", request, create=True):
			self.assertEqual(guard.redirect_target("desk"), WORKSPACE_ROUTE)

	def test_shortcut_doctypes_are_served(self):
		for path in (
			"desk/pos-invoice",
			"desk/pos-invoice/view/report",
			"desk/ury/pos-invoice",
			"desk/ury-kot/KOT-0001",
			"desk/ury/ury-table",
		):
			with self.subTest(path=path):
				self.assertIsNone(guard.redirect_target(path))

	def test_own_user_settings_are_served(self):
		with patch.object(frappe.local, "session", frappe._dict(user="cashier@example.com")):
			self.assertIsNone(guard.redirect_target("desk/user/cashier@example.com"))
			self.assertEqual(guard.redirect_target("desk/user/other@example.com"), WORKSPACE_ROUTE)

	def test_everything_else_goes_to_the_dashboard(self):
		for path in (
			"desk/item",
			"desk/customer/view/report",
			"desk/ury/ury-operate",
			"desk/ury/ury-order",
			"desk/user",
			"desk/accounts",
			"app/stock-ledger-entry",
			"desk/query-report/Today's Sales",
			"desk/private/mine",
		):
			with self.subTest(path=path):
				self.assertEqual(guard.redirect_target(path), WORKSPACE_ROUTE)

	def test_legacy_ury_workspace_link_redirects_and_keeps_the_query(self):
		request = frappe._dict(query_string=b"ury_return_to=%2Fpos&ury_return_label=POS")
		with patch.object(frappe.local, "request", request, create=True):
			self.assertEqual(
				guard.redirect_target("desk/ury"),
				f"{WORKSPACE_ROUTE}?ury_return_to=%2Fpos&ury_return_label=POS",
			)
		self.assertEqual(guard.redirect_target("app/ury"), WORKSPACE_ROUTE)

	def test_non_desk_paths_are_ignored(self):
		for path in ("pos", "ury/serve", "api/method/ping", "login", ""):
			with self.subTest(path=path):
				self.assertIsNone(guard.redirect_target(path))


class TestRedirectTargetOtherUsers(FrappeTestCase):
	def test_non_cashier_only_users_are_never_redirected(self):
		with patch.object(guard, "is_cashier_only", return_value=False):
			for path in ("desk/ury", "desk/item", "app/user", "desk/ury/ury-operate"):
				with self.subTest(path=path):
					self.assertIsNone(guard.redirect_target(path))


class TestGetDesktopPage(FrappeTestCase):
	def test_cashier_only_can_only_open_daily_operations(self):
		with patch.object(guard, "is_cashier_only", return_value=True):
			for page in ({"name": "URY"}, '{"name": "URY Operate"}', {}, "{}"):
				with self.subTest(page=page):
					with self.assertRaises(frappe.PermissionError):
						guard.get_desktop_page(page)

			with patch("frappe.desk.desktop.get_desktop_page", return_value={"ok": 1}) as core:
				page = {"name": WORKSPACE_NAME, "public": 1}
				self.assertEqual(guard.get_desktop_page(page), {"ok": 1})
				core.assert_called_once_with(frappe.as_json(page))
				as_string = frappe.as_json(page)
				guard.get_desktop_page(as_string)
				core.assert_called_with(as_string)

	def test_other_users_get_the_core_behaviour(self):
		with patch.object(guard, "is_cashier_only", return_value=False):
			with patch("frappe.desk.desktop.get_desktop_page", return_value={"ok": 1}) as core:
				self.assertEqual(guard.get_desktop_page({"name": "URY"}), {"ok": 1})
				core.assert_called_once()


class TestWorkspacePermissionHooks(FrappeTestCase):
	def test_cashier_only_is_limited_to_daily_operations(self):
		with patch.object(guard, "is_cashier_only", return_value=True):
			own = frappe._dict(name=WORKSPACE_NAME)
			other = frappe._dict(name="URY")
			self.assertTrue(guard.workspace_has_permission(own, "read", "c@example.com"))
			self.assertFalse(guard.workspace_has_permission(own, "write", "c@example.com"))
			self.assertFalse(guard.workspace_has_permission(own, "delete", "c@example.com"))
			self.assertFalse(guard.workspace_has_permission(other, "read", "c@example.com"))
			self.assertIn(WORKSPACE_NAME, guard.workspace_permission_query_conditions("c@example.com"))

	def test_other_users_are_unaffected(self):
		with patch.object(guard, "is_cashier_only", return_value=False):
			self.assertTrue(guard.workspace_has_permission(frappe._dict(name="URY"), "write", "m@example.com"))
			self.assertEqual(guard.workspace_permission_query_conditions("m@example.com"), "")


class TestShapeBootinfo(FrappeTestCase):
	def _boot(self):
		return frappe._dict(
			workspaces={
				"pages": [{"name": "URY"}, {"name": WORKSPACE_NAME}, {"name": "URY Operate"}],
				"has_access": False,
			},
			module_sidebars={
				"URY": {
					"name": "URY",
					"items": [
						{"link_type": "Workspace", "link_to": "URY Operate"},
						{"link_type": "Workspace", "link_to": WORKSPACE_NAME},
						{"link_type": "DocType", "link_to": "URY KOT"},
					],
					"workspaces": ["URY", WORKSPACE_NAME],
				},
				"Accounts": {"name": "Accounts", "items": [{"link_type": "DocType", "link_to": "Account"}]},
			},
			home_shell="Accounts",
			dock={
				"ury": [{"link_to": "URY"}],
				"erpnext": [{"link_to": "Accounts"}],
			},
			app_data=[
				{"app_name": "ury", "on_apps_screen": True, "dock": [{"link_to": "URY"}]},
				{"app_name": "erpnext", "on_apps_screen": True, "dock": [{"link_to": "Accounts"}]},
			],
		)

	def test_cashier_only_navigation_is_pruned(self):
		boot = self._boot()
		with (
			patch.object(guard, "is_cashier_only", return_value=True),
			patch.object(guard, "get_allowed_doctypes", return_value=ALLOWED),
		):
			guard.shape_bootinfo(boot)

		self.assertEqual([p["name"] for p in boot.workspaces["pages"]], [WORKSPACE_NAME])
		self.assertEqual(list(boot.module_sidebars), ["URY"])
		self.assertEqual([i["link_to"] for i in boot.module_sidebars["URY"]["items"]], [WORKSPACE_NAME])
		self.assertEqual(boot.module_sidebars["URY"]["workspaces"], [WORKSPACE_NAME])
		self.assertEqual(boot.home_shell, "URY")
		self.assertEqual(boot.dock, {"ury": [{"link_to": "URY"}]})
		self.assertEqual(
			[(a["app_name"], a["on_apps_screen"], len(a["dock"])) for a in boot.app_data],
			[("ury", True, 1), ("erpnext", False, 0)],
		)
		self.assertEqual(boot.ury_cashier_desk["allowed_doctypes"], ALLOWED)

	def test_other_users_boot_is_untouched(self):
		boot = self._boot()
		with patch.object(guard, "is_cashier_only", return_value=False):
			guard.shape_bootinfo(boot)
		self.assertEqual(len(boot.workspaces["pages"]), 3)
		self.assertEqual(sorted(boot.module_sidebars), ["Accounts", "URY"])
		self.assertNotIn("ury_cashier_desk", boot)
