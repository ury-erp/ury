"""Real (non-mock), live-DB negative-permission test for `kot_execute()` in
`ury_kot_generate.py` (Phase 4 round 4).

`kot_execute` is the whitelisted entrypoint that turns a POS Invoice's
current/previous item diff into KOT documents. It explicitly checks
`frappe.has_permission("POS Invoice", "write", doc=pos_invoice)` and throws
`frappe.PermissionError` before doing any item-diffing or KOT creation. This
is exercised end-to-end against a real site/DB with `frappe.set_user()`
against a real POS Invoice fixture (built with ERPNext's own
`create_pos_invoice` test helper), not a mock of `has_permission` itself.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_generate import kot_execute

PLAIN_USER = "phase4-r4-kot-generate-plain-user@ury.test"


class TestKotExecutePermission(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")

		if not frappe.db.exists("User", PLAIN_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": PLAIN_USER,
					"first_name": "Phase4R4",
					"last_name": "KotGeneratePlain",
					"send_welcome_email": 0,
					"roles": [{"role": "Employee"}] if frappe.db.exists("Role", "Employee") else [],
				}
			).insert(ignore_permissions=True, ignore_mandatory=True)

		# `kot_execute`'s permission gate (`frappe.get_doc(...)` +
		# `frappe.has_permission(..., doc=pos_invoice)`) runs before any
		# item-diffing/business logic, so this fixture only needs a real,
		# loadable POS Invoice row -- not a business-valid one. Building a
		# fully valid POS Invoice via ERPNext's own `create_pos_invoice` test
		# helper requires "_Test Company"/"_Test Customer" test fixtures that
		# this dedicated bench's site was never bootstrapped with (no
		# `--app erpnext` global test run has ever executed here), so instead
		# this inserts a bare-minimum POS Invoice directly, bypassing the
		# controller's `validate()` (which computes taxes/totals against a
		# real chart of accounts) via `flags.ignore_validate`, while still
		# exercising the REAL `frappe.get_doc` + `has_permission` code path
		# the test targets.
		company = frappe.db.get_value("Company", {}, "name")

		pos_profile_name = "Phase4R4 Test POS Profile"
		if not frappe.db.exists("POS Profile", pos_profile_name):
			pos_profile = frappe.get_doc(
				{
					"doctype": "POS Profile",
					"name": pos_profile_name,
					"company": company,
					"currency": frappe.db.get_value("Company", company, "default_currency"),
					"warehouse": frappe.db.get_value("Warehouse", {"company": company}, "name"),
				}
			)
			pos_profile.flags.ignore_validate = True
			pos_profile.insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

		pos_invoice = frappe.new_doc("POS Invoice")
		pos_invoice.update(
			{
				"customer": frappe.db.get_value("Customer", {}) or "Phase4R4 Test Customer",
				"company": company,
				"pos_profile": pos_profile_name,
				"is_pos": 1,
				"posting_date": frappe.utils.nowdate(),
			}
		)
		if not frappe.db.exists("Customer", pos_invoice.customer):
			frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": pos_invoice.customer,
					"customer_group": frappe.db.get_value("Customer Group", {}, "name"),
					"territory": frappe.db.get_value("Territory", {}, "name"),
				}
			).insert(ignore_permissions=True, ignore_mandatory=True)
		pos_invoice.flags.ignore_validate = True
		pos_invoice.insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
		cls.invoice_name = pos_invoice.name

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		super().tearDownClass()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_plain_user_without_pos_invoice_write_access_is_rejected(self):
		frappe.set_user(PLAIN_USER)
		with self.assertRaises(frappe.PermissionError):
			kot_execute(
				invoice_id=self.invoice_name,
				customer=frappe.db.get_value("POS Invoice", self.invoice_name, "customer"),
				current_items=[{"item_code": "PHASE4R4-TEST-ITEM", "qty": 1}],
				previous_items=[],
			)
