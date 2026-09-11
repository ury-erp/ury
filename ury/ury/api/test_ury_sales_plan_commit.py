"""Tests for ury_sales_plan_commit.py's committed/fulfilled counter resolution.

Static-review note: mirrors test_ury_reservation_service.py / test_ury_order_
reservation_service.py's pattern of mocking this module's own composed
dependencies (`frappe.get_all`, `frappe.db.sql`, `frappe.db.get_value`)
directly rather than requiring a live bench/DB -- none of these have been
executed against a live site in this environment.
"""

import unittest
from unittest.mock import patch

from ury.ury.api import ury_sales_plan_commit as mod


class TestResolvePlanItemRows(unittest.TestCase):
	def test_no_matching_plans_returns_empty(self):
		with patch.object(mod.frappe, "get_all", return_value=[]) as get_all:
			rows = mod.resolve_plan_item_rows("ITEM-1", "BR-1", "COMP-1")
		self.assertEqual(rows, [])
		get_all.assert_called_once()

	def test_matching_plan_scopes_item_rows_by_parent(self):
		def fake_get_all(doctype, filters=None, fields=None, pluck=None):
			if doctype == mod.SALES_PLAN_DOCTYPE:
				return ["PLAN-1"]
			self.assertEqual(filters["parent"], ["in", ["PLAN-1"]])
			self.assertEqual(filters["item_code"], "ITEM-1")
			return [{"name": "PLI-1", "parent": "PLAN-1", "qty": 10, "committed_qty": 3, "fulfilled_qty": 1}]

		with patch.object(mod.frappe, "get_all", side_effect=fake_get_all):
			rows = mod.resolve_plan_item_rows("ITEM-1", "BR-1", "COMP-1")

		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["committed_qty"], 3)


class TestResolveSinglePlanItemRow(unittest.TestCase):
	def test_single_match_returned(self):
		row = {"name": "PLI-1", "parent": "PLAN-1", "qty": 10, "committed_qty": 0, "fulfilled_qty": 0}
		with patch.object(mod, "resolve_plan_item_rows", return_value=[row]):
			result = mod.resolve_single_plan_item_row("ITEM-1", "BR-1", "COMP-1")
		self.assertEqual(result, row)

	def test_no_match_returns_none(self):
		with patch.object(mod, "resolve_plan_item_rows", return_value=[]):
			result = mod.resolve_single_plan_item_row("ITEM-1", "BR-1", "COMP-1")
		self.assertIsNone(result)

	def test_ambiguous_match_logs_and_returns_none_never_guesses(self):
		rows = [
			{"name": "PLI-1", "parent": "PLAN-1", "qty": 10, "committed_qty": 0, "fulfilled_qty": 0},
			{"name": "PLI-2", "parent": "PLAN-2", "qty": 5, "committed_qty": 0, "fulfilled_qty": 0},
		]
		with patch.object(mod, "resolve_plan_item_rows", return_value=rows), patch.object(
			mod.frappe, "log_error"
		) as log_error:
			result = mod.resolve_single_plan_item_row("ITEM-1", "BR-1", "COMP-1")
		self.assertIsNone(result)
		log_error.assert_called_once()


class TestResolvePlanEnforcementMode(unittest.TestCase):
	def test_defaults_to_hard_when_no_match(self):
		with patch.object(mod, "resolve_single_plan_item_row", return_value=None):
			mode = mod.resolve_plan_enforcement_mode("ITEM-1", "BR-1", "COMP-1")
		self.assertEqual(mode, "Hard")

	def test_reads_owning_plans_mode(self):
		row = {"name": "PLI-1", "parent": "PLAN-1"}
		with patch.object(mod, "resolve_single_plan_item_row", return_value=row), patch.object(
			mod.frappe.db, "get_value", return_value="Soft"
		) as get_value:
			mode = mod.resolve_plan_enforcement_mode("ITEM-1", "BR-1", "COMP-1")
		self.assertEqual(mode, "Soft")
		get_value.assert_called_once_with(mod.SALES_PLAN_DOCTYPE, "PLAN-1", "enforcement_mode")

	def test_falls_back_to_hard_when_field_empty(self):
		row = {"name": "PLI-1", "parent": "PLAN-1"}
		with patch.object(mod, "resolve_single_plan_item_row", return_value=row), patch.object(
			mod.frappe.db, "get_value", return_value=None
		):
			mode = mod.resolve_plan_enforcement_mode("ITEM-1", "BR-1", "COMP-1")
		self.assertEqual(mode, "Hard")


class TestApplyCommitDelta(unittest.TestCase):
	def test_no_op_when_no_deltas(self):
		with patch.object(mod, "resolve_single_plan_item_row") as resolve:
			result = mod.apply_commit_delta("ITEM-1", "BR-1", "COMP-1")
		self.assertIsNone(result)
		resolve.assert_not_called()

	def test_no_match_is_a_safe_no_op(self):
		with patch.object(mod, "resolve_single_plan_item_row", return_value=None):
			result = mod.apply_commit_delta("ITEM-1", "BR-1", "COMP-1", committed_delta=5)
		self.assertIsNone(result)

	def test_increments_committed_qty_under_lock(self):
		row = {"name": "PLI-1", "parent": "PLAN-1"}
		locked = {"name": "PLI-1", "qty": 10, "committed_qty": 2, "fulfilled_qty": 0}

		with patch.object(mod, "resolve_single_plan_item_row", return_value=row), patch.object(
			mod, "_lock_plan_item_row", return_value=locked
		) as lock, patch.object(mod.frappe.db, "sql") as db_sql:
			result = mod.apply_commit_delta("ITEM-1", "BR-1", "COMP-1", committed_delta=3)

		lock.assert_called_once_with("PLI-1")
		self.assertEqual(result["committed_qty"], 5)
		self.assertEqual(result["fulfilled_qty"], 0)
		update_sql, params = db_sql.call_args.args
		self.assertIn("UPDATE", update_sql)
		self.assertEqual(params["committed"], 5)
		self.assertEqual(params["fulfilled"], 0)

	def test_fulfilment_transfer_moves_committed_to_fulfilled_in_one_call(self):
		row = {"name": "PLI-1", "parent": "PLAN-1"}
		locked = {"name": "PLI-1", "qty": 10, "committed_qty": 4, "fulfilled_qty": 1}

		with patch.object(mod, "resolve_single_plan_item_row", return_value=row), patch.object(
			mod, "_lock_plan_item_row", return_value=locked
		), patch.object(mod.frappe.db, "sql") as db_sql:
			result = mod.apply_commit_delta(
				"ITEM-1", "BR-1", "COMP-1", committed_delta=-4, fulfilled_delta=4
			)

		self.assertEqual(result["committed_qty"], 0)
		self.assertEqual(result["fulfilled_qty"], 5)
		self.assertEqual(db_sql.call_count, 1)

	def test_counters_clamp_at_zero_never_go_negative(self):
		row = {"name": "PLI-1", "parent": "PLAN-1"}
		locked = {"name": "PLI-1", "qty": 10, "committed_qty": 1, "fulfilled_qty": 0}

		with patch.object(mod, "resolve_single_plan_item_row", return_value=row), patch.object(
			mod, "_lock_plan_item_row", return_value=locked
		), patch.object(mod.frappe.db, "sql"):
			result = mod.apply_commit_delta("ITEM-1", "BR-1", "COMP-1", committed_delta=-999)

		self.assertEqual(result["committed_qty"], 0)


if __name__ == "__main__":
	unittest.main()
