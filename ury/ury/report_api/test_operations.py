import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.report_api import operations
from ury.ury.tests.factories import make_user

TEST_NON_MANAGER = "_test_ury_operations_non_manager@example.com"


class TestRequireManagerGate(FrappeTestCase):
	"""Every whitelisted function in operations.py must call require_manager()
	first and deny a non-manager user."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", TEST_NON_MANAGER):
			make_user(email=TEST_NON_MANAGER, roles=["Employee"], first_name="NonManager")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_get_completed_work_orders_denied(self):
		frappe.set_user(TEST_NON_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			operations.get_completed_work_orders("2026-01-01", "2026-01-31")


class TestCompletedWorkOrderDateBoundary(FrappeTestCase):
	"""`actual_end_date` is a Datetime. A bare `BETWEEN start AND end` compares
	it against end-of-range MIDNIGHT, so everything completed after 00:00:00
	on the last day of the range was silently dropped -- a same-day range
	returned nothing at all, however many Work Orders finished that day.

	The row is inserted with raw SQL rather than as a real Work Order
	document: submitting one needs a BOM, warehouses, item defaults and
	manufacturing entries, none of which this date-boundary assertion depends
	on. It is inserted once for the class -- FrappeTestCase rolls back per
	class, not per test, so a per-test insert would collide on the primary
	key.
	"""

	COMPLETED_AT = "2026-03-17 23:45:00"
	SERVICE_DATE = "2026-03-17"
	WORK_ORDER = "_TEST-WO-DATE-BOUNDARY"

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.db.delete("Work Order", {"name": cls.WORK_ORDER})
		frappe.db.sql(
			"""
			INSERT INTO `tabWork Order`
				(name, creation, modified, owner, modified_by, docstatus, status,
				 production_item, item_name, qty, produced_qty, actual_end_date)
			VALUES
				(%(name)s, NOW(), NOW(), 'Administrator', 'Administrator', 1, 'Completed',
				 '_Test Boundary Item', '_Test Boundary Item', 7, 7, %(actual_end_date)s)
			""",
			{"name": cls.WORK_ORDER, "actual_end_date": cls.COMPLETED_AT},
		)

	def setUp(self):
		frappe.set_user("Administrator")

	def _names(self, start_date, end_date):
		result = operations.get_completed_work_orders(start_date, end_date)
		return [row["name"] for row in result["work_orders"]]

	def test_same_day_range_includes_a_work_order_completed_late_that_day(self):
		self.assertIn(self.WORK_ORDER, self._names(self.SERVICE_DATE, self.SERVICE_DATE))

	def test_range_ending_on_that_day_includes_it(self):
		self.assertIn(self.WORK_ORDER, self._names("2026-03-11", self.SERVICE_DATE))

	def test_range_ending_the_day_before_excludes_it(self):
		self.assertNotIn(self.WORK_ORDER, self._names("2026-03-11", "2026-03-16"))

	def test_summary_counts_the_late_completion(self):
		result = operations.get_completed_work_orders(self.SERVICE_DATE, self.SERVICE_DATE)
		self.assertGreaterEqual(result["summary"]["total_completed"], 1)
		self.assertGreaterEqual(result["summary"]["total_qty_produced"], 7)
