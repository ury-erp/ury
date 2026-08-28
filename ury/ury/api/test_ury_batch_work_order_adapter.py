"""Tests for V3-61 ury_batch_work_order_adapter.py.

No bench/DB is available in this worktree (static-review only, per task
instructions). These tests use `unittest.mock` to stub out `frappe.db.*` and
`frappe.get_meta` so the module's control flow can be exercised without a
live site, mirroring V3-60's `test_ury_workstation_mapping.py` disclosure for
the same environment constraint.

If/when this runs under `bench run-tests` against a real site, these mocks
should be replaced with `frappe.get_test_records` fixtures; the assertions
themselves describe the intended real behavior either way.
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from ury.ury.api import ury_batch_work_order_adapter as mod


def _meta(has_field: bool) -> MagicMock:
	meta = MagicMock()
	meta.has_field.return_value = has_field
	return meta


class TestIsBatchEligibleStructuralSafeguard(unittest.TestCase):
	"""MADE_TO_ORDER (every-plate) items must never be eligible, no matter
	what the opt-in flag says -- this is the TODO.md 'must NOT touch:
	every-plate Work Order' guardrail."""

	def test_made_to_order_never_eligible_when_opted_in(self):
		eligible, reason = mod.is_batch_eligible("ITEM-PLATE", "MADE_TO_ORDER", True)
		self.assertFalse(eligible)
		self.assertIn("MADE_TO_ORDER", reason)

	def test_made_to_order_never_eligible_when_not_opted_in(self):
		eligible, reason = mod.is_batch_eligible("ITEM-PLATE", "MADE_TO_ORDER", False)
		self.assertFalse(eligible)

	def test_made_to_order_case_insensitive(self):
		eligible, _reason = mod.is_batch_eligible("ITEM-PLATE", "made_to_order", True)
		self.assertFalse(eligible)


class TestIsBatchEligibleOptIn(unittest.TestCase):
	def test_pre_produced_with_opt_in_true_is_eligible(self):
		eligible, reason = mod.is_batch_eligible("ITEM-SAUCE", "PRE_PRODUCED", True)
		self.assertTrue(eligible)
		self.assertIn("opted in", reason)

	def test_pre_produced_with_opt_in_false_is_not_eligible(self):
		eligible, reason = mod.is_batch_eligible("ITEM-SAUCE", "PRE_PRODUCED", False)
		self.assertFalse(eligible)
		self.assertIn("not opted in", reason)

	def test_missing_item_code_is_not_eligible(self):
		eligible, reason = mod.is_batch_eligible("", "PRE_PRODUCED", True)
		self.assertFalse(eligible)
		self.assertIn("item_code", reason)

	def test_unset_policy_with_opt_in_is_eligible(self):
		# No implicit policy assumption -- an unset/unknown policy that isn't
		# MADE_TO_ORDER can still opt in explicitly.
		eligible, _reason = mod.is_batch_eligible("ITEM-X", None, True)
		self.assertTrue(eligible)


class TestBuildWorkOrderDraft(unittest.TestCase):
	@patch.object(mod.frappe.db, "get_value")
	def test_produces_correct_field_mapping(self, mock_get_value):
		mock_get_value.side_effect = ["BOM-SAUCE-001"]
		draft = mod.build_work_order_draft(
			"ITEM-SAUCE", 10, "Acme Co", "Stores - AC", workstation="WS-01"
		)
		self.assertEqual(draft["doctype"], "Work Order")
		self.assertEqual(draft["production_item"], "ITEM-SAUCE")
		self.assertEqual(draft["bom_no"], "BOM-SAUCE-001")
		self.assertEqual(draft["qty"], 10)
		self.assertEqual(draft["company"], "Acme Co")
		self.assertEqual(draft["fg_warehouse"], "Stores - AC")
		self.assertEqual(draft["wip_warehouse"], "Stores - AC")
		self.assertIsNone(draft["planned_start_date"])
		self.assertEqual(draft["workstation"], "WS-01")

	@patch.object(mod.frappe.db, "get_value")
	def test_workstation_omitted_when_not_supplied(self, mock_get_value):
		mock_get_value.side_effect = ["BOM-SAUCE-001"]
		draft = mod.build_work_order_draft("ITEM-SAUCE", 10, "Acme Co", "Stores - AC")
		self.assertNotIn("workstation", draft)

	def test_zero_or_negative_qty_throws(self):
		with self.assertRaises(mod.frappe.ValidationError):
			mod.build_work_order_draft("ITEM-SAUCE", 0, "Acme Co", "Stores - AC")

	@patch.object(mod.frappe.db, "get_value", return_value=None)
	def test_no_active_bom_throws(self, mock_get_value):
		with self.assertRaises(mod.frappe.ValidationError):
			mod.build_work_order_draft("ITEM-NO-BOM", 5, "Acme Co", "Stores - AC")

	def test_never_calls_any_mutation_api(self):
		"""Grep-style verification: the module source contains no call to
		.insert(/.save(/.submit(/set_value( anywhere in build_work_order_draft,
		and at runtime frappe.get_doc is never invoked by it."""
		import ast
		import inspect

		source = inspect.getsource(mod.build_work_order_draft)
		# Strip the docstring before scanning -- it documents the forbidden
		# APIs by name (e.g. ".insert()/.save()/.submit()") for humans, which
		# is not the same as the function body actually calling them.
		tree = ast.parse(source)
		func_node = tree.body[0]
		body_without_docstring = func_node.body
		if body_without_docstring and isinstance(body_without_docstring[0], ast.Expr) and isinstance(
			body_without_docstring[0].value, ast.Constant
		) and isinstance(body_without_docstring[0].value.value, str):
			body_without_docstring = body_without_docstring[1:]
		body_source = chr(10).join(ast.unparse(node) for node in body_without_docstring)
		for forbidden in (".insert(", ".save(", ".submit(", "set_value(", "get_doc("):
			self.assertNotIn(forbidden, body_source)

		with patch.object(mod.frappe, "get_doc") as mock_get_doc, patch.object(
			mod.frappe.db, "get_value", return_value="BOM-SAUCE-001"
		), patch.object(mod.frappe.db, "set_value") as mock_set_value:
			mod.build_work_order_draft("ITEM-SAUCE", 10, "Acme Co", "Stores - AC")
			mock_get_doc.assert_not_called()
			mock_set_value.assert_not_called()


class TestTraceBatchIntegration(unittest.TestCase):
	@patch.object(mod, "_field_exists", return_value=True)
	@patch.object(mod.frappe.db, "get_value")
	def test_eligible_case_returns_coherent_trace(self, mock_get_value, mock_field_exists):
		# Order of frappe.db.get_value calls inside trace_batch_integration:
		# 1) production_policy, 2) batch_opt_in_flag, then inside
		# build_work_order_draft: 3) bom_no lookup.
		mock_get_value.side_effect = ["PRE_PRODUCED", True, "BOM-SAUCE-001"]

		trace = mod.trace_batch_integration("ITEM-SAUCE", 10, "Acme Co", "Stores - AC")

		self.assertEqual(trace["item_code"], "ITEM-SAUCE")
		self.assertEqual(trace["production_policy"], "PRE_PRODUCED")
		self.assertTrue(trace["batch_opt_in_flag"])
		self.assertTrue(trace["eligible"])
		self.assertIsNotNone(trace["draft"])
		for key in ("production_item", "bom_no", "qty", "company", "fg_warehouse"):
			self.assertIn(key, trace["draft"])
		self.assertGreaterEqual(len(trace["checks"]), 3)

	@patch.object(mod, "_field_exists", return_value=True)
	@patch.object(mod.frappe.db, "get_value")
	def test_made_to_order_case_has_no_draft(self, mock_get_value, mock_field_exists):
		mock_get_value.side_effect = ["MADE_TO_ORDER", True]

		trace = mod.trace_batch_integration("ITEM-PLATE", 1, "Acme Co", "Stores - AC")

		self.assertFalse(trace["eligible"])
		self.assertIsNone(trace["draft"])
		self.assertIn("MADE_TO_ORDER", trace["reason"])

	@patch.object(mod, "_field_exists", return_value=False)
	@patch.object(mod.frappe.db, "get_value")
	def test_missing_opt_in_field_fails_closed(self, mock_get_value, mock_field_exists):
		# Only production_policy is read; batch_opt_in_flag field absent ->
		# treated as False, never defaults to eligible.
		mock_get_value.side_effect = ["PRE_PRODUCED"]

		trace = mod.trace_batch_integration("ITEM-SAUCE", 10, "Acme Co", "Stores - AC")

		self.assertFalse(trace["batch_opt_in_flag"])
		self.assertFalse(trace["eligible"])
		self.assertIsNone(trace["draft"])


if __name__ == "__main__":
	unittest.main()
