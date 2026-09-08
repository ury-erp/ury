import json
import unittest
from unittest.mock import patch

from ury.ury.api import ury_order_reservation_service as service


class TestOrderReservationLineIsolation(unittest.TestCase):
	def test_resolve_production_context_uses_existing_config_reader(self):
		context = {"production_policy": "MADE_TO_ORDER", "department": "Hot Line"}

		with patch.object(service, "_resolve_production_config", return_value=context) as resolve_config:
			result = service.resolve_production_context("ITEM-1", "BR-1", "COMP-1")

		self.assertIs(result, context)
		resolve_config.assert_called_once_with("ITEM-1", "BR-1", "COMP-1")

	def test_same_item_distinct_lines_do_not_collapse(self):
		previous = [
			{"item": "ITEM-1", "qty": 1, "comment": "no onion"},
			{"item": "ITEM-1", "qty": 1, "comment": "extra spicy"},
		]
		accepted = [
			{"item": "ITEM-1", "qty": 2, "comment": "no onion"},
			{"item": "ITEM-1", "qty": 1, "comment": "extra spicy"},
		]

		with patch.object(service, "_reconcile_line") as reconcile_line:
			service.reconcile_order_reservations(
				"INV-1", previous, accepted, "BR-1", "COMP-1", "user@example.com"
			)

		reconcile_line.assert_called_once()
		order_ref, line_key, line, branch, company, actor = reconcile_line.call_args.args
		self.assertEqual(order_ref, "INV-1")
		self.assertIn("no onion", line_key)
		self.assertEqual(line["item_code"], "ITEM-1")
		self.assertEqual(line["qty"], 2.0)
		self.assertEqual(branch, "BR-1")
		self.assertEqual(company, "COMP-1")
		self.assertEqual(actor, "user@example.com")

	def test_active_groups_only_returns_matching_line_key(self):
		rows = [
			{
				"reservation_group": "GROUP-CHANGED",
				"audit_log": json.dumps(
					[
						{
							"event": "create",
							"frozen_context": {"reservation_line_key": "ctx:ITEM-1:changed:1"},
						}
					]
				),
			},
			{
				"reservation_group": "GROUP-OTHER",
				"audit_log": json.dumps(
					[
						{
							"event": "create",
							"frozen_context": {"reservation_line_key": "ctx:ITEM-1:other:1"},
						}
					]
				),
			},
		]

		with patch.object(service.frappe, "get_all", return_value=rows) as get_all:
			result = service._active_groups(
				"INV-1", "ITEM-1", reservation_line_key="ctx:ITEM-1:changed:1"
			)

		self.assertEqual(result, ["GROUP-CHANGED"])
		get_all.assert_called_once()
		self.assertEqual(get_all.call_args.kwargs["filters"]["top_level_item"], "ITEM-1")

	def test_changed_line_releases_only_its_matching_group_before_recreate(self):
		context = service.frappe._dict(
			{
				"name": "UIPC-1",
				"production_policy": "MADE_TO_ORDER",
				"production_unit": "Kitchen",
				"department": "Hot Line",
				"warehouse": "WH-FG",
			}
		)
		line = {
			"item_code": "ITEM-1",
			"qty": 3,
			"source_line_ref": "POS-LINE-1",
			"source_context": {"comment": "no onion"},
		}

		with patch.object(service, "resolve_production_context", return_value=context), patch.object(
			service, "_active_groups", return_value=["GROUP-LINE-1"]
		) as active_groups, patch.object(service, "release_reservation") as release_reservation, patch.object(
			service, "create_reservation", return_value={"reservation_group": "GROUP-NEW"}
		) as create_reservation:
			result = service._reconcile_line(
				"INV-1", "ref:ITEM-1:POS-LINE-1", line, "BR-1", "COMP-1", "user@example.com"
			)

		self.assertEqual(result, {"reservation_group": "GROUP-NEW"})
		active_groups.assert_called_once_with(
			"INV-1", "ITEM-1", reservation_line_key="ref:ITEM-1:POS-LINE-1"
		)
		release_reservation.assert_called_once_with(
			"GROUP-LINE-1", reason="Order acceptance line quantity reconciliation"
		)
		create_reservation.assert_called_once()
		self.assertEqual(
			create_reservation.call_args.kwargs["frozen_context"]["reservation_line_key"],
			"ref:ITEM-1:POS-LINE-1",
		)
