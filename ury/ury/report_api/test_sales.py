import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report_api import sales

TEST_NON_MANAGER = "_test_ury_sales_non_manager@example.com"


class TestRequireManagerGate(FrappeTestCase):
	"""Every whitelisted function in sales.py must call require_manager()
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

	def test_get_today_sales_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_today_sales()

	def test_get_daywise_sales_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_daywise_sales("2026-01-01", "2026-01-31")

	def test_get_daywise_invoices_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_daywise_invoices("2026-01-01", "2026-01-31")

	def test_get_month_wise_sales_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_month_wise_sales()

	def test_get_time_wise_sales_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_time_wise_sales()

	def test_get_service_wise_sales_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_service_wise_sales("2026-01-01", "2026-01-31")

	def test_get_cancelled_invoices_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_cancelled_invoices("2026-01-01", "2026-01-31")

	def test_get_average_bill_value_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			sales.get_average_bill_value("2026-01-01", "2026-01-31")
