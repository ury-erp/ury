# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest import mock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_work_order_hooks import validate


class _FakeWorkOrder(dict):
	def get(self, key, default=None):
		return super().get(key, default)

	def set(self, key, value):
		self[key] = value


class TestWorkOrderWipWarehouseHook(FrappeTestCase):
	def test_already_set_is_left_alone(self):
		doc = _FakeWorkOrder(wip_warehouse="Manual - URY", production_plan_item="row-1")
		validate(doc)
		self.assertEqual(doc["wip_warehouse"], "Manual - URY")

	def test_no_production_plan_item_leaves_it_empty(self):
		doc = _FakeWorkOrder(wip_warehouse=None)
		validate(doc)
		self.assertIsNone(doc.get("wip_warehouse"))

	@mock.patch("ury.ury.api.ury_work_order_hooks.frappe.db.get_value")
	def test_resolves_department_warehouse_via_production_plan_item(self, mock_get_value):
		# First call resolves the department from the Production Plan Item
		# row, second resolves that department's warehouse.
		mock_get_value.side_effect = ["Kitchen", "Kitchen WH"]
		doc = _FakeWorkOrder(wip_warehouse=None, production_plan_item="row-1")

		validate(doc)
		self.assertEqual(doc["wip_warehouse"], "Kitchen WH")

	@mock.patch("ury.ury.api.ury_work_order_hooks.frappe.db.get_value")
	def test_department_with_no_warehouse_leaves_it_empty(self, mock_get_value):
		mock_get_value.side_effect = ["Kitchen", None]
		doc = _FakeWorkOrder(wip_warehouse=None, production_plan_item="row-1")

		validate(doc)
		self.assertIsNone(doc.get("wip_warehouse"))
