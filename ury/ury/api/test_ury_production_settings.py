import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_settings import (
	auto_production_plan_enabled,
	get_manufacture_trigger_time,
	get_store_warehouse,
)


DOCTYPE = "URY Production Settings"


class TestURYProductionSettings(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value(DOCTYPE, "store_warehouse", None)
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", None)

	def tearDown(self):
		frappe.db.set_single_value(DOCTYPE, "store_warehouse", None)
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", None)
		frappe.set_user("Administrator")

	def test_defaults_are_falsy(self):
		self.assertFalse(get_store_warehouse())
		self.assertFalse(auto_production_plan_enabled())
		self.assertEqual(get_manufacture_trigger_time(), "On KOT Serve")

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

	def test_manufacture_trigger_time_reads_configured_values(self):
		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", "On KOT Create")
		self.assertEqual(get_manufacture_trigger_time(), "On KOT Create")

		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", "On Bill Print")
		self.assertEqual(get_manufacture_trigger_time(), "On Bill Print")

		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", "On KOT Serve")
		self.assertEqual(get_manufacture_trigger_time(), "On KOT Serve")

	def test_manufacture_trigger_time_normalizes_case(self):
		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", "on kot create")
		self.assertEqual(get_manufacture_trigger_time(), "On KOT Create")

		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", "on bill print")
		self.assertEqual(get_manufacture_trigger_time(), "On Bill Print")

		frappe.db.set_single_value(DOCTYPE, "manufacture_trigger_time", "on kot serve")
		self.assertEqual(get_manufacture_trigger_time(), "On KOT Serve")



