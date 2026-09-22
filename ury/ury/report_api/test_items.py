import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report_api import items

TEST_NON_MANAGER = "_test_ury_items_non_manager@example.com"


class TestRequireManagerGate(FrappeTestCase):
	"""Every whitelisted function in items.py must call require_manager()
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

	def test_get_item_wise_sales_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			items.get_item_wise_sales("2026-01-01", "2026-01-31")

	def test_get_item_groups_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			items.get_item_groups()

	def test_get_item_wise_purchase_history_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			items.get_item_wise_purchase_history("2026-01-01", "2026-01-31")


class TestPurchaseHistoryBranchScope(FrappeTestCase):
	"""Purchase Invoice has no `branch` field. Passing one must not reach SQL
	as a filter -- it used to, raising OperationalError 1054 ("Unknown column
	'a.branch'") on every branch-scoped call, which is every call the
	frontend makes unless the user is on "All branches".
	"""

	def setUp(self):
		frappe.set_user("Administrator")

	def test_branch_is_accepted_and_ignored_not_a_sql_error(self):
		with_branch = items.get_item_wise_purchase_history("2026-01-01", "2026-01-31", branch="_Nonexistent Branch")
		without_branch = items.get_item_wise_purchase_history("2026-01-01", "2026-01-31")

		self.assertEqual(with_branch["items"], without_branch["items"])
		self.assertEqual(with_branch["summary"], without_branch["summary"])

	def test_response_reports_company_scope_rather_than_a_branch(self):
		result = items.get_item_wise_purchase_history("2026-01-01", "2026-01-31", branch="URY")

		self.assertIsNone(result["branch"], "must not echo back a branch it did not filter on")
		self.assertEqual(result["branch_scope"], "company")
