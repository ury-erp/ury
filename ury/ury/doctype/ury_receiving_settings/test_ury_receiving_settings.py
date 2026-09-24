import frappe
from frappe.tests.utils import FrappeTestCase


DOCTYPE = "URY Receiving Settings"


class TestURYReceivingSettings(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_defaults(self):
		doc = frappe.get_single(DOCTYPE)
		self.assertEqual(float(doc.default_tolerance_lower_pct or 0), 5)
		self.assertEqual(float(doc.default_tolerance_upper_pct or 0), 5)

	def test_out_of_range_tolerance_rejected(self):
		doc = frappe.get_single(DOCTYPE)
		doc.default_tolerance_lower_pct = 150
		with self.assertRaises(frappe.ValidationError):
			doc.save()
