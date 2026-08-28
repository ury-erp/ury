"""Tests for V3-62 ury_job_card_controls.py.

No bench/DB is available in this worktree (static-review only, per task
instructions). These tests use `unittest.mock` to stub out `frappe.db.*`,
`frappe.get_doc`, and `frappe.get_roles` so the module's control flow can be
exercised without a live site, mirroring V3-61's
`test_ury_batch_work_order_adapter.py` disclosure for the same environment
constraint.

If/when this runs under `bench run-tests` against a real site, these mocks
should be replaced with `frappe.get_test_records` fixtures; the assertions
themselves describe the intended real behavior either way.
"""

from __future__ import annotations

import datetime
import unittest
from unittest.mock import MagicMock, patch

from ury.ury.api import ury_job_card_controls as mod


class TestIsJobCardEligibleStructuralSafeguard(unittest.TestCase):
	"""MADE_TO_ORDER (every-plate) items must never be eligible for Job Card
	usage, no matter what the opt-in flag says -- mirrors V3-61's
	is_batch_eligible safeguard, since is_job_card_eligible is a strict
	subset of it."""

	def test_made_to_order_never_eligible_when_opted_in(self):
		eligible, reason = mod.is_job_card_eligible("ITEM-PLATE", "MADE_TO_ORDER", True)
		self.assertFalse(eligible)
		self.assertIn("MADE_TO_ORDER", reason)

	def test_made_to_order_never_eligible_when_not_opted_in(self):
		eligible, _reason = mod.is_job_card_eligible("ITEM-PLATE", "MADE_TO_ORDER", False)
		self.assertFalse(eligible)

	def test_made_to_order_case_insensitive(self):
		eligible, _reason = mod.is_job_card_eligible("ITEM-PLATE", "made_to_order", True)
		self.assertFalse(eligible)


class TestIsJobCardEligibleStrictSubsetOfBatchEligibility(unittest.TestCase):
	"""is_job_card_eligible must never return True where is_batch_eligible
	(V3-61) would return False -- Job Card usage is a strict subset of batch
	eligibility, never broader, never mandatory."""

	def test_batch_eligible_and_opted_in_is_job_card_eligible(self):
		eligible, reason = mod.is_job_card_eligible("ITEM-SAUCE", "PRE_PRODUCED", True)
		self.assertTrue(eligible)
		self.assertIn("batch-eligible", reason)

	def test_batch_ineligible_due_to_no_opt_in_is_job_card_ineligible(self):
		eligible, reason = mod.is_job_card_eligible("ITEM-SAUCE", "PRE_PRODUCED", False)
		self.assertFalse(eligible)
		self.assertIn("not batch-eligible", reason)

	def test_delegates_directly_to_batch_adapter(self):
		"""Byte-identical parity by construction: is_job_card_eligible must
		call V3-61's is_batch_eligible rather than reimplementing it."""
		with patch.object(mod, "is_batch_eligible", wraps=mod.is_batch_eligible) as spy:
			mod.is_job_card_eligible("ITEM-SAUCE", "PRE_PRODUCED", True)
			spy.assert_called_once_with("ITEM-SAUCE", "PRE_PRODUCED", True)

	def test_exhaustive_parity_with_batch_eligibility_matrix(self):
		"""For every combination of policy/opt-in, is_job_card_eligible's
		boolean result must exactly match is_batch_eligible's."""
		from ury.ury.api.ury_batch_work_order_adapter import is_batch_eligible

		cases = [
			("ITEM-A", "MADE_TO_ORDER", True),
			("ITEM-A", "MADE_TO_ORDER", False),
			("ITEM-A", "PRE_PRODUCED", True),
			("ITEM-A", "PRE_PRODUCED", False),
			("ITEM-A", None, True),
			("ITEM-A", None, False),
			("", "PRE_PRODUCED", True),
		]
		for item_code, policy, opt_in in cases:
			batch_eligible, _ = is_batch_eligible(item_code, policy, opt_in)
			job_card_eligible, _ = mod.is_job_card_eligible(item_code, policy, opt_in)
			self.assertEqual(
				batch_eligible,
				job_card_eligible,
				f"mismatch for {(item_code, policy, opt_in)}",
			)


class TestLogChefTime(unittest.TestCase):
	def setUp(self):
		self.from_time = datetime.datetime(2026, 8, 28, 9, 0, 0)
		self.to_time = datetime.datetime(2026, 8, 28, 10, 0, 0)

	@patch.object(mod.frappe, "get_roles", return_value=["Chef"])
	@patch.object(mod.frappe, "get_doc")
	def test_successful_log_by_chef(self, mock_get_doc, mock_get_roles):
		mock_doc = MagicMock()
		mock_doc.name = "URYJCTL-0001"
		mock_get_doc.return_value = mock_doc

		result = mod.log_chef_time(
			"JOB-CARD-001", "EMP-001", self.from_time, self.to_time, "chef@example.com"
		)

		mock_doc.insert.assert_called_once()
		self.assertEqual(result["name"], "URYJCTL-0001")
		self.assertEqual(result["job_card_ref"], "JOB-CARD-001")
		self.assertEqual(result["logged_by"], "chef@example.com")

	@patch.object(mod.frappe, "get_roles", return_value=["Production Manager"])
	@patch.object(mod.frappe, "get_doc")
	def test_successful_log_by_manager(self, mock_get_doc, mock_get_roles):
		mock_doc = MagicMock()
		mock_doc.name = "URYJCTL-0002"
		mock_get_doc.return_value = mock_doc

		result = mod.log_chef_time(
			"JOB-CARD-001", "EMP-002", self.from_time, self.to_time, "manager@example.com"
		)
		self.assertEqual(result["name"], "URYJCTL-0002")

	def test_from_time_not_before_to_time_raises(self):
		with patch.object(mod.frappe, "get_roles", return_value=["Chef"]):
			with self.assertRaises(mod.frappe.ValidationError):
				mod.log_chef_time(
					"JOB-CARD-001", "EMP-001", self.to_time, self.from_time, "chef@example.com"
				)

	def test_equal_from_and_to_time_raises(self):
		with patch.object(mod.frappe, "get_roles", return_value=["Chef"]):
			with self.assertRaises(mod.frappe.ValidationError):
				mod.log_chef_time(
					"JOB-CARD-001", "EMP-001", self.from_time, self.from_time, "chef@example.com"
				)

	@patch.object(mod.frappe, "get_roles", return_value=["Waiter"])
	def test_bad_actor_role_fails_closed(self, mock_get_roles):
		with self.assertRaises(mod.frappe.PermissionError):
			mod.log_chef_time(
				"JOB-CARD-001", "EMP-001", self.from_time, self.to_time, "waiter@example.com"
			)

	@patch.object(mod.frappe, "get_roles", return_value=[])
	def test_no_roles_fails_closed(self, mock_get_roles):
		with self.assertRaises(mod.frappe.PermissionError):
			mod.log_chef_time(
				"JOB-CARD-001", "EMP-001", self.from_time, self.to_time, "ghost@example.com"
			)

	@patch.object(mod.frappe, "get_roles", side_effect=Exception("ambiguous scope"))
	def test_role_lookup_error_fails_closed(self, mock_get_roles):
		"""Ambiguous scope (role lookup raising) must never be treated as an
		implicit allow."""
		with self.assertRaises(mod.frappe.PermissionError):
			mod.log_chef_time(
				"JOB-CARD-001", "EMP-001", self.from_time, self.to_time, "unknown@example.com"
			)

	def test_missing_actor_raises_before_permission_check(self):
		with self.assertRaises(mod.frappe.ValidationError):
			mod.log_chef_time("JOB-CARD-001", "EMP-001", self.from_time, self.to_time, "")

	def test_missing_job_card_ref_raises(self):
		with patch.object(mod.frappe, "get_roles", return_value=["Chef"]):
			with self.assertRaises(mod.frappe.ValidationError):
				mod.log_chef_time("", "EMP-001", self.from_time, self.to_time, "chef@example.com")


class TestBuildJobCardDraft(unittest.TestCase):
	def test_produces_correct_field_mapping_with_explicit_bom(self):
		draft = mod.build_job_card_draft(
			"ITEM-SAUCE",
			"WO-001",
			"BOM-SAUCE-001",
			"Acme Co",
			"WIP - AC",
			10,
			workstation="WS-01",
			operation="Cook",
		)
		self.assertEqual(draft["doctype"], "Job Card")
		self.assertEqual(draft["work_order"], "WO-001")
		self.assertEqual(draft["bom_no"], "BOM-SAUCE-001")
		self.assertEqual(draft["production_item"], "ITEM-SAUCE")
		self.assertEqual(draft["company"], "Acme Co")
		self.assertEqual(draft["wip_warehouse"], "WIP - AC")
		self.assertEqual(draft["for_quantity"], 10)
		self.assertEqual(draft["workstation"], "WS-01")
		self.assertEqual(draft["operation"], "Cook")

	def test_optional_fields_omitted_when_not_supplied(self):
		with patch.object(mod.frappe.db, "get_value", return_value="BOM-SAUCE-001"):
			draft = mod.build_job_card_draft(
				"ITEM-SAUCE", "WO-001", None, "Acme Co", "WIP - AC", 10
			)
		self.assertNotIn("workstation", draft)
		self.assertNotIn("operation", draft)

	def test_resolves_bom_when_not_supplied(self):
		with patch.object(mod.frappe.db, "get_value", return_value="BOM-RESOLVED") as mock_get_value:
			draft = mod.build_job_card_draft(
				"ITEM-SAUCE", "WO-001", None, "Acme Co", "WIP - AC", 10
			)
		self.assertEqual(draft["bom_no"], "BOM-RESOLVED")
		mock_get_value.assert_called()

	def test_zero_or_negative_for_quantity_throws(self):
		with self.assertRaises(mod.frappe.ValidationError):
			mod.build_job_card_draft("ITEM-SAUCE", "WO-001", "BOM-1", "Acme Co", "WIP - AC", 0)

	@patch.object(mod.frappe.db, "get_value", return_value=None)
	def test_no_active_bom_throws_when_not_supplied(self, mock_get_value):
		with self.assertRaises(mod.frappe.ValidationError):
			mod.build_job_card_draft("ITEM-NO-BOM", "WO-001", None, "Acme Co", "WIP - AC", 5)

	def test_never_calls_any_mutation_api(self):
		"""Grep-style verification: the module source for
		build_job_card_draft contains no call to .insert(/.save(/.submit(/
		set_value(/get_doc(, and at runtime frappe.get_doc/set_value are
		never invoked by it."""
		import ast
		import inspect

		source = inspect.getsource(mod.build_job_card_draft)
		# Strip the docstring before scanning -- it documents the forbidden
		# APIs by name for humans, which is not the function body calling them.
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
			mod.build_job_card_draft("ITEM-SAUCE", "WO-001", None, "Acme Co", "WIP - AC", 10)
			mock_get_doc.assert_not_called()
			mock_set_value.assert_not_called()


if __name__ == "__main__":
	unittest.main()
