# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_sales_plan_auto_production_plan import create_production_plans_on_lock

MOD = "ury.ury.api.ury_sales_plan_auto_production_plan"
DOCTYPE = "URY Production Settings"


class _FakeSalesPlanDoc(dict):
	def __init__(self, **kwargs):
		super().__init__(**kwargs)
		self.name = kwargs.get("name", "SP-0001")

	def set(self, key, value):
		self[key] = value


class TestCreateProductionPlansOnLock(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)

	def tearDown(self):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		frappe.set_user("Administrator")

	@patch(f"{MOD}.create_or_get_department_production_plans")
	def test_setting_disabled_does_not_create_anything(self, mock_create):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 0)
		sales_plan_doc = _FakeSalesPlanDoc(status="Locked for Production", name="SP-0001")

		create_production_plans_on_lock(sales_plan_doc)

		mock_create.assert_not_called()

	@patch(f"{MOD}.create_or_get_department_production_plans")
	def test_setting_enabled_creates_and_submits_every_department_plan(self, mock_create):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		mock_create.return_value = {
			"sales_plan": "SP-0001",
			"production_plans": [
				{"department": "Main Kitchen", "production_plan": "MFG-PP-1", "state": "Awaiting Materials", "created": True},
				{"department": "Bakery", "production_plan": "MFG-PP-2", "state": "Awaiting Materials", "created": True},
			],
			"blockers": [],
		}
		sales_plan_doc = _FakeSalesPlanDoc(status="Locked for Production", name="SP-0001")

		create_production_plans_on_lock(sales_plan_doc)

		mock_create.assert_called_once_with(sales_plan_doc, submit=True)
		# D11: the deprecated singular pointer field is never written.
		self.assertNotIn("custom_ury_production_plan", sales_plan_doc)

	@patch(f"{MOD}.create_or_get_department_production_plans")
	def test_creation_failure_propagates_and_is_not_swallowed(self, mock_create):
		"""D14: with the toggle on, a creation failure must abort the Lock
		transition, never be logged-and-ignored the way the old
		Approval-time auto-create used to be."""
		frappe.db.set_single_value(DOCTYPE, "enable_auto_production_plan", 1)
		mock_create.side_effect = Exception("missing warehouse")
		sales_plan_doc = _FakeSalesPlanDoc(status="Locked for Production", name="SP-0001")

		with self.assertRaisesRegex(Exception, "missing warehouse"):
			create_production_plans_on_lock(sales_plan_doc)
