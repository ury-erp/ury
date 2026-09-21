# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_plan_auto_work_order import (
	maybe_create_and_submit_work_orders,
)

DOCTYPE = "URY Production Settings"


class _FakeProductionPlanDoc:
	def __init__(self, name="PP-0001"):
		self.name = name
		self.make_work_order_for_finished_goods = MagicMock(
			side_effect=lambda wo_list, defaults: wo_list.extend(["WO-0001", "WO-0002"])
		)


class TestMaybeCreateAndSubmitWorkOrders(FrappeTestCase):
	def setUp(self):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_work_order_on_production_plan_submit", 0)

	def tearDown(self):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_work_order_on_production_plan_submit", 0)

	def test_setting_disabled_is_a_no_op(self):
		doc = _FakeProductionPlanDoc()
		maybe_create_and_submit_work_orders(doc)
		doc.make_work_order_for_finished_goods.assert_not_called()

	@patch("ury.ury.api.ury_production_plan_auto_work_order.frappe.get_doc")
	@patch("ury.ury.api.ury_production_plan_auto_work_order.get_default_warehouse", return_value={})
	def test_enabled_creates_and_submits_each_work_order(self, mock_defaults, mock_get_doc):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_work_order_on_production_plan_submit", 1)
		created_docs = {}

		def _fake_get_doc(doctype, name):
			wo = MagicMock()
			wo.docstatus = 0
			created_docs[name] = wo
			return wo

		mock_get_doc.side_effect = _fake_get_doc
		doc = _FakeProductionPlanDoc()

		maybe_create_and_submit_work_orders(doc)

		doc.make_work_order_for_finished_goods.assert_called_once()
		self.assertEqual(set(created_docs.keys()), {"WO-0001", "WO-0002"})
		for wo in created_docs.values():
			wo.submit.assert_called_once()

	@patch("ury.ury.api.ury_production_plan_auto_work_order.frappe.log_error")
	@patch("ury.ury.api.ury_production_plan_auto_work_order.frappe.get_doc")
	@patch("ury.ury.api.ury_production_plan_auto_work_order.get_default_warehouse", return_value={})
	def test_never_raises_out_of_the_hook(self, mock_defaults, mock_get_doc, mock_log_error):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_work_order_on_production_plan_submit", 1)
		mock_get_doc.side_effect = Exception("boom")
		doc = _FakeProductionPlanDoc()

		maybe_create_and_submit_work_orders(doc)  # must not raise

		mock_log_error.assert_called_once()

	@patch("ury.ury.api.ury_production_plan_auto_work_order.frappe.get_doc")
	@patch("ury.ury.api.ury_production_plan_auto_work_order.get_default_warehouse", return_value={})
	def test_already_submitted_work_order_is_not_resubmitted(self, mock_defaults, mock_get_doc):
		frappe.db.set_single_value(DOCTYPE, "enable_auto_work_order_on_production_plan_submit", 1)
		created_docs = {}

		def _fake_get_doc(doctype, name):
			wo = MagicMock()
			wo.docstatus = 1  # e.g. a core hook already submitted it
			created_docs[name] = wo
			return wo

		mock_get_doc.side_effect = _fake_get_doc
		doc = _FakeProductionPlanDoc()

		maybe_create_and_submit_work_orders(doc)

		for wo in created_docs.values():
			wo.submit.assert_not_called()
