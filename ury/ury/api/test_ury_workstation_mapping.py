"""Tests for V3-60 ury_workstation_mapping.py.

No bench/DB is available in this worktree (static-review only, per task
instructions). These tests use `unittest.mock` to stub out `frappe.db.*`,
`frappe.get_meta`, and `frappe.get_roles` so the module's control flow can be
exercised without a live site. This mirrors the "no bench -- static review"
disclosure used by V3-53's test module for the same environment constraint.

If/when this runs under `bench run-tests` against a real site, these mocks
should be replaced with `frappe.get_test_records` fixtures; the assertions
themselves describe the intended real behavior either way.
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from ury.ury.api import ury_workstation_mapping as mod


def _meta(has_field: bool) -> MagicMock:
	meta = MagicMock()
	meta.has_field.return_value = has_field
	return meta


class TestMappingAbsentReturnsNoneGracefully(unittest.TestCase):
	"""Proves the non-breaking default: no field applied yet -> None, no error."""

	@patch.object(mod.frappe, "get_meta")
	@patch.object(mod.frappe.db, "exists")
	def test_field_not_applied_returns_none(self, mock_exists, mock_get_meta):
		mock_exists.return_value = True
		mock_get_meta.return_value = _meta(has_field=False)
		self.assertIsNone(mod.get_mapped_workstation("PU-001"))

	@patch.object(mod.frappe.db, "exists")
	def test_missing_production_unit_returns_none(self, mock_exists):
		mock_exists.return_value = False
		self.assertIsNone(mod.get_mapped_workstation("PU-DOES-NOT-EXIST"))

	def test_empty_production_unit_returns_none(self):
		self.assertIsNone(mod.get_mapped_workstation(""))
		self.assertIsNone(mod.get_mapped_workstation(None))

	@patch.object(mod.frappe.db, "get_value")
	@patch.object(mod.frappe, "get_meta")
	@patch.object(mod.frappe.db, "exists")
	def test_field_applied_but_unset_returns_none(
		self, mock_exists, mock_get_meta, mock_get_value
	):
		mock_exists.return_value = True
		mock_get_meta.return_value = _meta(has_field=True)
		mock_get_value.return_value = None
		self.assertIsNone(mod.get_mapped_workstation("PU-001"))


class TestValidateMappingIsOptional(unittest.TestCase):
	@patch.object(mod.frappe.db, "exists")
	def test_never_raises_for_unmapped_unit(self, mock_exists):
		mock_exists.return_value = True
		# No exception of any kind should propagate.
		self.assertTrue(mod.validate_mapping_is_optional("PU-001"))

	def test_never_raises_for_missing_unit(self):
		with patch.object(mod.frappe.db, "exists", return_value=False):
			self.assertTrue(mod.validate_mapping_is_optional("PU-NOPE"))


class TestSetWorkstationMappingSuccess(unittest.TestCase):
	@patch.object(mod, "_field_exists", return_value=True)
	@patch.object(mod.frappe.db, "set_value")
	@patch.object(mod, "_resolve_workstation_company", return_value="Acme Co")
	@patch.object(mod, "_resolve_production_unit_company", return_value="Acme Co")
	@patch.object(mod.frappe.db, "exists", return_value=True)
	@patch.object(mod.frappe, "get_roles", return_value=["URY Manager"])
	def test_manager_can_set_valid_mapping(
		self,
		mock_roles,
		mock_exists,
		mock_pu_company,
		mock_ws_company,
		mock_set_value,
		mock_field_exists,
	):
		result = mod.set_workstation_mapping("PU-001", "WS-001", actor="chef.manager@ury.test")
		self.assertEqual(result["linked_workstation"], "WS-001")
		mock_set_value.assert_called_once_with(
			mod.PRODUCTION_UNIT_DOCTYPE, "PU-001", mod.LINKED_WORKSTATION_FIELDNAME, "WS-001"
		)


class TestSetWorkstationMappingNonExistentWorkstation(unittest.TestCase):
	@patch.object(mod.frappe, "get_roles", return_value=["URY Manager"])
	def test_fails_closed_for_missing_workstation(self, mock_roles):
		def exists_side_effect(doctype, name):
			if doctype == mod.PRODUCTION_UNIT_DOCTYPE:
				return True
			if doctype == mod.WORKSTATION_DOCTYPE:
				return False
			return False

		with patch.object(mod.frappe.db, "exists", side_effect=exists_side_effect):
			with self.assertRaises(mod.WorkstationMappingError) as ctx:
				mod.set_workstation_mapping("PU-001", "WS-GHOST", actor="mgr@ury.test")
			self.assertEqual(ctx.exception.reason_code, "WORKSTATION_NOT_FOUND")


class TestSetWorkstationMappingUnauthorized(unittest.TestCase):
	@patch.object(mod.frappe, "get_roles", return_value=["URY Waiter"])
	def test_non_manager_cannot_set_mapping(self, mock_roles):
		with self.assertRaises(mod.WorkstationMappingError) as ctx:
			mod.set_workstation_mapping("PU-001", "WS-001", actor="waiter@ury.test")
		self.assertEqual(ctx.exception.reason_code, "NOT_PERMITTED")


class TestSetWorkstationMappingCompanyScope(unittest.TestCase):
	@patch.object(mod.frappe.db, "exists", return_value=True)
	@patch.object(mod, "_resolve_workstation_company", return_value="Other Co")
	@patch.object(mod, "_resolve_production_unit_company", return_value="Acme Co")
	@patch.object(mod.frappe, "get_roles", return_value=["URY Manager"])
	def test_mismatched_company_fails_closed(
		self, mock_roles, mock_pu_company, mock_ws_company, mock_exists
	):
		with self.assertRaises(mod.WorkstationMappingError) as ctx:
			mod.set_workstation_mapping("PU-001", "WS-001", actor="mgr@ury.test")
		self.assertEqual(ctx.exception.reason_code, "COMPANY_SCOPE_MISMATCH")


class TestSetWorkstationMappingFieldNotApplied(unittest.TestCase):
	@patch.object(mod, "_field_exists", return_value=False)
	@patch.object(mod, "_resolve_workstation_company", return_value=None)
	@patch.object(mod, "_resolve_production_unit_company", return_value=None)
	@patch.object(mod.frappe.db, "exists", return_value=True)
	@patch.object(mod.frappe, "get_roles", return_value=["URY Manager"])
	def test_refuses_write_when_field_not_yet_applied(
		self, mock_roles, mock_exists, mock_pu_company, mock_ws_company, mock_field_exists
	):
		with self.assertRaises(mod.WorkstationMappingError) as ctx:
			mod.set_workstation_mapping("PU-001", "WS-001", actor="mgr@ury.test")
		self.assertEqual(ctx.exception.reason_code, "FIELD_NOT_APPLIED")


if __name__ == "__main__":
	unittest.main()
