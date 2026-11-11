"""/ury/pos and /ury/pos/* are blocked for every user while POS_ROUTE_BLOCKED is set."""

from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.www import ury as ury_page


class TestUryPosRouteBlock(FrappeTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def _context(self, path):
		with patch.object(frappe.local, "request", SimpleNamespace(path=path), create=True):
			return ury_page.get_context(frappe._dict())

	def test_blocked_paths_raise_permission_error_for_every_user(self):
		for user in ("Administrator", "cashier@example.com"):
			frappe.set_user(user)
			for path in ("/ury/pos", "/ury/pos/", "/ury/pos/dashboard", "/ury/pos/order/table/T1"):
				with self.assertRaises(frappe.PermissionError, msg=f"{user} {path}"):
					self._context(path)

	def test_other_ury_paths_and_lookalikes_are_not_blocked(self):
		for path in ("/ury", "/ury/dashboard", "/ury/posters", "/ury/serve"):
			self.assertFalse(self._is_blocked(path), path)

	def _is_blocked(self, path):
		with patch.object(frappe.local, "request", SimpleNamespace(path=path), create=True):
			return ury_page._is_blocked_pos_route()

	def test_switch_off_unblocks(self):
		with patch.object(ury_page, "POS_ROUTE_BLOCKED", False):
			self.assertFalse(self._is_blocked("/ury/pos/dashboard"))
