import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report_api import customers

TEST_NON_MANAGER = "_test_ury_customers_non_manager@example.com"


class TestRequireManagerGate(FrappeTestCase):
	"""Every whitelisted function in customers.py must call require_manager()
	first and deny a non-manager user."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", TEST_NON_MANAGER):
			frappe.get_doc({
				"doctype": "User",
				"email": TEST_NON_MANAGER,
				"first_name": "NonManager",
				"send_welcome_email": 0,
				"roles": [{"role": "Employee"}],
			}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_search_customers_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			customers.search_customers("john")

	def test_get_customer_data_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			customers.get_customer_data("CUST-0001", "2026-01-01", "2026-01-31")

	def test_get_daywise_customer_details_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			customers.get_daywise_customer_details("2026-01-01", "2026-01-31")

	def test_get_repeated_customers_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			customers.get_repeated_customers("2026-01-01", "2026-01-31")
