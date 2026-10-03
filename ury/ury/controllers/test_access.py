"""Desk policy for restaurant roles, feature switches, and the request gates."""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from ury.ury import features
from ury.ury.controllers import access

A = "ury.ury.controllers.access"
F = "ury.ury.features"

POLICY = {"enforce": True, "roles": [dict(r) for r in access.DEFAULT_POLICY]}


def _request(path):
	frappe.local.request = Request(EnvironBuilder(path=path, method="POST").get_environ())


class TestAccessFor(FrappeTestCase):

	def _access(self, roles, policy=POLICY, user="someone@example.com"):
		with patch(f"{A}.get_policy", return_value=policy), patch(f"{A}.frappe.get_roles", return_value=roles):
			return access.access_for(user)

	def test_a_cashier_is_kept_out_and_lands_on_the_pos(self):
		a = self._access(["URY Cashier"])
		self.assertFalse(a.desk)
		self.assertEqual(a.landing, "/pos")

	def test_a_captain_lands_on_the_order_pad(self):
		self.assertEqual(self._access(["URY Captain"]).landing, "/pos/order")

	def test_one_allowed_role_keeps_desk(self):
		a = self._access(["URY Cashier", "URY Admin"])
		self.assertTrue(a.desk)
		self.assertEqual(a.landing, "/restro/dashboard")  # highest role in the list

	def test_a_system_manager_is_never_blocked(self):
		self.assertTrue(self._access(["URY Cashier", "System Manager"]).desk)

	def test_administrator_is_never_blocked(self):
		with patch(f"{A}.get_policy", return_value=POLICY):
			self.assertTrue(access.access_for("Administrator").desk)

	def test_users_without_restaurant_roles_are_untouched(self):
		a = self._access(["Accounts User"])
		self.assertTrue(a.desk)
		self.assertIsNone(a.landing)

	def test_the_policy_can_be_switched_off(self):
		self.assertTrue(self._access(["URY Cashier"], policy={**POLICY, "enforce": False}).desk)

	def test_a_blocked_user_never_lands_in_desk(self):
		policy = {"enforce": True, "roles": [{"role": "URY Cashier", "block_desk": 1, "landing": "/app/home"}]}
		self.assertEqual(self._access(["URY Cashier"], policy=policy).landing, "/pos")


class AsUser(FrappeTestCase):
	"""Runs each test as a non-admin user, restoring the original afterwards."""

	def setUp(self):
		self._user = frappe.session.user
		frappe.set_user("cashier@example.com")

	def tearDown(self):
		frappe.set_user(self._user)
		frappe.local.request = None


class TestPageGuard(AsUser):

	def _guard(self, path, desk):
		with patch(f"{A}.access_for", return_value=frappe._dict(desk=desk, landing="/pos")):
			return access.guard_page(path)

	def test_desk_paths_redirect_a_restricted_user(self):
		for path in ("app", "app/sales-invoice/X", "desk", "apps", "me"):
			self.assertEqual(self._guard(path, desk=False), "/pos", path)

	def test_restaurant_screens_are_left_alone(self):
		for path in ("pos", "ury/dashboard", "printview", "update-password"):
			self.assertIsNone(self._guard(path, desk=False), path)

	def test_users_with_desk_pass(self):
		self.assertIsNone(self._guard("app", desk=True))


class TestRequestGate(AsUser):

	def test_a_disabled_feature_refuses_its_api(self):
		_request("/api/method/ury.ury.api.purchases.get_purchases")
		with patch(f"{F}.enabled_map", return_value={"purchases": False}):
			with self.assertRaises(features.FeatureDisabledError):
				access.before_request()

	def test_v2_paths_are_gated_too(self):
		_request("/api/v2/method/ury.ury.api.waitlist.get_waitlist")
		with patch(f"{F}.enabled_map", return_value={"waitlist": False}):
			with self.assertRaises(features.FeatureDisabledError):
				access.before_request()

	def test_soft_methods_stay_callable(self):
		# The POS shows a reservation badge on tables even with reservations off.
		_request("/api/method/ury.ury.api.reservations.get_table_reservation_status")
		with patch(f"{F}.enabled_map", return_value={"reservations": False}):
			access.before_request()

	def test_a_prefix_does_not_match_a_longer_module(self):
		self.assertIsNone(
			features.feature_for_method("ury.ury.api.purchases_extra.x")
			if not features.enabled_map().get("purchases", True) else None
		)
		with patch(f"{F}.enabled_map", return_value={"purchases": False}):
			self.assertIsNone(features.feature_for_method("ury.ury.api.purchases_extra.x"))

	def test_desk_api_is_refused_to_restricted_users(self):
		_request("/api/method/frappe.desk.reportview.get")
		with patch(f"{A}.access_for", return_value=frappe._dict(desk=False)):
			with self.assertRaises(frappe.PermissionError):
				access.before_request()

	def test_the_notification_bell_stays_available(self):
		_request("/api/method/frappe.desk.doctype.notification_log.notification_log.get_notification_logs")
		with patch(f"{A}.access_for", return_value=frappe._dict(desk=False)):
			access.before_request()


class TestRedirects(AsUser):

	def test_only_same_site_paths_are_accepted(self):
		for bad in ("https://evil.com", "//evil.com", "evil.com", "/\\evil.com", "javascript:alert(1)", "/login", "/api/method/x"):
			self.assertIsNone(access.safe_redirect(bad), bad)
		self.assertEqual(access.safe_redirect("/pos"), "/pos")
		self.assertEqual(access.safe_redirect("/app/sales-invoice/X?y=1"), "/app/sales-invoice/X?y=1")

	def _login(self, desk, redirect_to=None):
		frappe.form_dict = frappe._dict(redirect_to=redirect_to) if redirect_to else frappe._dict()
		with patch(f"{A}.access_for", return_value=frappe._dict(desk=desk, landing="/pos")), \
			 patch(f"{A}.frappe.cache.hset") as hset:
			access.on_session_creation()
		return hset.call_args.args[2] if hset.called else None

	def test_a_restricted_user_ignores_a_desk_deep_link(self):
		self.assertEqual(self._login(desk=False, redirect_to="/app/sales-invoice"), "/pos")

	def test_a_restricted_user_keeps_a_non_desk_deep_link(self):
		self.assertEqual(self._login(desk=False, redirect_to="/restro/invoices/X"), "/restro/invoices/X")

	def test_a_desk_user_keeps_their_deep_link(self):
		self.assertEqual(self._login(desk=True, redirect_to="/app/sales-invoice"), "/app/sales-invoice")
