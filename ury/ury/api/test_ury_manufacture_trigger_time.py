import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_settings import get_manufacture_trigger_time
from ury.ury.api.ury_fulfilment_posting_service import (
	READY,
	SERVED,
	FulfilmentPostingError,
	_freeze_payload,
	post_intents_for_kot,
	post_intents_for_pos_invoice,
	trigger_manufacture_on_bill_print,
)
from ury.ury.api.ury_kot_item_execution_service import (
	_attach_ready_posting_intent,
	seed_kot_item_executions_on_submit,
)


class TestManufactureTriggerTimeConfiguration(FrappeTestCase):
	def test_get_manufacture_trigger_time_default(self):
		with patch("frappe.db.get_single_value", return_value=None):
			self.assertEqual(get_manufacture_trigger_time(), "On KOT Serve")

	def test_get_manufacture_trigger_time_options(self):
		for opt, expected in [
			("On KOT Serve", "On KOT Serve"),
			("on kot serve", "On KOT Serve"),
			("On KOT Create", "On KOT Create"),
			("on kot create", "On KOT Create"),
			("On Bill Print", "On Bill Print"),
			("on bill print", "On Bill Print"),
		]:
			with patch("frappe.db.get_single_value", return_value=opt):
				self.assertEqual(get_manufacture_trigger_time(), expected)

	def test_on_kot_serve_attach_ready_posting_intent(self):
		result = {"name": "EXEC-1", "branch": "BR-1", "company": "COMP-1", "idempotent_replay": False}
		fake_policy = frappe._dict({"realtime_production_posting_enabled": True})
		fake_doc = frappe._dict({"name": "EXEC-1"})

		with patch("ury.ury.api.ury_stock_policy.get_branch_stock_policy", return_value=fake_policy), patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time", return_value="On KOT Serve"
		), patch("frappe.get_doc", return_value=fake_doc), patch(
			"ury.ury.api.ury_fulfilment_posting_service.create_or_get_posting_intent_for_ready",
			return_value={"name": "INTENT-1", "status": "PENDING"},
		) as mock_create, patch(
			"ury.ury.api.ury_fulfilment_posting_service.enqueue_posting_intent"
		) as mock_enqueue:
			res = _attach_ready_posting_intent(dict(result), actor="chef@example.com")

		mock_create.assert_called_once_with(fake_doc, actor="chef@example.com")
		mock_enqueue.assert_called_once_with("INTENT-1")
		self.assertEqual(res["posting_intent"], "INTENT-1")
		self.assertEqual(res["posting_intent_status"], "PENDING")

	def test_on_kot_create_skips_attach_ready_posting_intent(self):
		result = {"name": "EXEC-1", "branch": "BR-1", "company": "COMP-1", "idempotent_replay": False}
		fake_policy = frappe._dict({"realtime_production_posting_enabled": True})

		with patch("ury.ury.api.ury_stock_policy.get_branch_stock_policy", return_value=fake_policy), patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time", return_value="On KOT Create"
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.create_or_get_posting_intent_for_ready"
		) as mock_create:
			res = _attach_ready_posting_intent(dict(result), actor="chef@example.com")

		mock_create.assert_not_called()
		self.assertIsNone(res["posting_intent"])
		self.assertEqual(res["posting_intent_status"], "SKIPPED_TRIGGER_ON_KOT_CREATE")

	def test_on_bill_print_skips_attach_ready_posting_intent(self):
		result = {"name": "EXEC-1", "branch": "BR-1", "company": "COMP-1", "idempotent_replay": False}
		fake_policy = frappe._dict({"realtime_production_posting_enabled": True})

		with patch("ury.ury.api.ury_stock_policy.get_branch_stock_policy", return_value=fake_policy), patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time", return_value="On Bill Print"
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.create_or_get_posting_intent_for_ready"
		) as mock_create:
			res = _attach_ready_posting_intent(dict(result), actor="chef@example.com")

		mock_create.assert_not_called()
		self.assertIsNone(res["posting_intent"])
		self.assertEqual(res["posting_intent_status"], "SKIPPED_TRIGGER_ON_BILL_PRINT")

	def test_on_kot_create_triggers_post_intents_on_submit(self):
		fake_doc = frappe._dict({"name": "KOT-123"})
		with patch(
			"ury.ury.api.ury_kot_item_execution_service.seed_kot_item_executions",
			return_value=[{"name": "EXEC-1"}],
		), patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time",
			return_value="On KOT Create",
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.post_intents_for_kot"
		) as mock_post:
			seed_kot_item_executions_on_submit(fake_doc)

		mock_post.assert_called_once_with("KOT-123")

	def test_on_kot_serve_does_not_trigger_post_intents_on_submit(self):
		fake_doc = frappe._dict({"name": "KOT-123"})
		with patch(
			"ury.ury.api.ury_kot_item_execution_service.seed_kot_item_executions",
			return_value=[{"name": "EXEC-1"}],
		), patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time",
			return_value="On KOT Serve",
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.post_intents_for_kot"
		) as mock_post:
			seed_kot_item_executions_on_submit(fake_doc)

		mock_post.assert_not_called()

	def test_on_bill_print_triggers_manufacture(self):
		with patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time",
			return_value="On Bill Print",
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.post_intents_for_pos_invoice",
			return_value=[{"name": "INTENT-1", "status": "POSTED"}],
		) as mock_post:
			res = trigger_manufacture_on_bill_print("INV-001")

		mock_post.assert_called_once_with("INV-001")
		self.assertEqual(res["status"], "success")
		self.assertEqual(len(res["results"]), 1)

	def test_on_bill_print_skipped_when_configured_for_other_options(self):
		with patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time",
			return_value="On KOT Serve",
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.post_intents_for_pos_invoice"
		) as mock_post:
			res = trigger_manufacture_on_bill_print("INV-001")

		mock_post.assert_not_called()
		self.assertEqual(res["status"], "skipped")

	def test_freeze_payload_execution_state_for_triggers(self):
		exec_doc_queued = frappe._dict({
			"name": "EXEC-1",
			"kot": "KOT-1",
			"kot_item": "ITEM-1",
			"state": "QUEUED",
			"branch": "BR-1",
			"company": "COMP-1",
		})
		fake_kot_item = frappe._dict({"name": "ITEM-1", "reservation_line_key": "LINE-1"})
		fake_row = frappe._dict({
			"reservation_group": "GRP-1",
			"reservation_line_key": "LINE-1",
			"item_code": "DISH-1",
			"qty": 1.0,
			"reserved_qty": 1.0,
			"policy": "MADE_TO_ORDER",
			"warehouse": "Kitchen - BR",
			"component_item": "RAW-1",
		})

		# Case 1: On KOT Create -> state QUEUED resolves to READY
		with patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time",
			return_value="On KOT Create",
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service._kot_item_doc",
			return_value=(fake_kot_item, "DISH-1", 1.0),
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service._kot_order_ref",
			return_value="ORD-1",
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service._reservation_rows",
			return_value=[fake_row],
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service._reservation_snapshot",
			return_value={
				"policy": "MADE_TO_ORDER",
				"reservation_ref": "RES-1",
				"reservation_group": "GRP-1",
				"component_item": "RAW-1",
				"qty": 1.0,
				"warehouse": "Stores - BR",
			},
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.group_reserved_top_level_qty",
			return_value=1.0,
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service._fg_warehouse",
			return_value="Kitchen - BR",
		):
			payload = _freeze_payload(exec_doc_queued, actor="Administrator")
			self.assertEqual(payload["execution_state"], READY)

		# Case 2: On KOT Serve -> state QUEUED raises EXECUTION_NOT_READY
		with patch(
			"ury.ury.api.ury_production_settings.get_manufacture_trigger_time",
			return_value="On KOT Serve",
		):
			with self.assertRaises(FulfilmentPostingError) as ctx:
				_freeze_payload(exec_doc_queued, actor="Administrator")
			self.assertEqual(ctx.exception.reason_code, "EXECUTION_NOT_READY")

