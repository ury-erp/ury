import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_settings import (
	auto_production_plan_enabled,
	get_store_warehouse,
)


DOCTYPE = "URY Production Settings"


class TestURYProductionSettings(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value(DOCTYPE, "store_warehouse", None)
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)

	def tearDown(self):
		frappe.db.set_single_value(DOCTYPE, "store_warehouse", None)
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		frappe.set_user("Administrator")

	def test_defaults_are_falsy(self):
		self.assertFalse(get_store_warehouse())
		self.assertFalse(auto_production_plan_enabled())

	def test_get_store_warehouse_reads_configured_value(self):
		frappe.db.set_single_value(DOCTYPE, "store_warehouse", "Stores - URY")
		self.assertEqual(get_store_warehouse(), "Stores - URY")

	def test_auto_production_plan_enabled_reads_configured_value(self):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		self.assertTrue(auto_production_plan_enabled())

	def test_auto_production_plan_enabled_is_boolean(self):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		self.assertIs(auto_production_plan_enabled(), False)
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		self.assertIs(auto_production_plan_enabled(), True)
