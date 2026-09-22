# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest
from unittest.mock import patch, MagicMock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_yield_check.ury_yield_check import URYYieldCheck


MODULE = "ury.ury.doctype.ury_yield_check.ury_yield_check"

# Constructing a URYYieldCheck(Document) instance triggers frappe's own
# internal DocType-meta loading (frappe.get_meta -> Document("DocType", ...))
# the FIRST time it's needed, which itself calls frappe.db.get_value --
# the SAME global attribute these tests patch (unittest.mock.patch on a
# dotted path patches the shared frappe.db object, not a per-module copy).
# If that first meta load happens while a test has frappe.db.get_value
# mocked to something meta-loading doesn't expect (a bare float, None,
# ...), Document construction itself crashes deep inside frappe internals
# with a confusing AttributeError/DoesNotExistError that has nothing to
# do with the test's own assertions. Warm the meta cache for real, once,
# here at import time, before any test patches frappe.db.get_value --
# every later URYYieldCheck(...) construction then hits frappe's meta
# cache instead of the DB.
frappe.get_meta("URY Yield Check")


def _create_yield_check(**kwargs):
	"""Helper to create a Yield Check document with sensible defaults."""
	defaults = {
		"doctype": "URY Yield Check",
		"item": "TEST-ITEM-001",
		"branch": "Test Branch",
		"company": "Test Company",
		"input_qty": 100,
		"output_qty": 85,
		"stock_uom": "Nos",
		"check_type": "Routine",
		"checked_by": "test_user",
		"checked_on": "2026-01-01 00:00:00",
	}
	defaults.update(kwargs)
	return frappe._dict(defaults)


class TestYieldCheckValidateItemYieldTrackingEnabled(FrappeTestCase):
	"""Test Check 1: validate_item_yield_tracking_enabled"""

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_item_yield_tracked_is_falsy(self, mock_throw, mock_get_value):
		"""Item without yield tracking enabled fails validation."""
		mock_get_value.return_value = False

		doc = URYYieldCheck(_create_yield_check())
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_item_yield_tracking_enabled()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Yield tracking is not enabled", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	def test_passes_when_item_yield_tracked_is_true(self, mock_get_value):
		"""Item with yield tracking enabled passes validation."""
		mock_get_value.return_value = True

		doc = URYYieldCheck(_create_yield_check())
		# Should not raise
		doc.validate_item_yield_tracking_enabled()


class TestYieldCheckValidateInputQty(FrappeTestCase):
	"""Test Check 2: validate_input_qty"""

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_input_qty_is_zero(self, mock_throw):
		"""Input quantity of 0 fails validation."""
		doc = URYYieldCheck(_create_yield_check(input_qty=0))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_input_qty()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Input quantity must be greater than zero", call_args[0])

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_input_qty_is_negative(self, mock_throw):
		"""Negative input quantity fails validation."""
		doc = URYYieldCheck(_create_yield_check(input_qty=-10))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_input_qty()

		mock_throw.assert_called_once()

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_input_qty_is_none(self, mock_throw):
		"""None input quantity fails validation."""
		doc = URYYieldCheck(_create_yield_check(input_qty=None))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_input_qty()

		mock_throw.assert_called_once()

	@patch(f"{MODULE}.frappe.throw")
	def test_passes_when_input_qty_is_positive(self, mock_throw):
		"""Positive input quantity passes validation."""
		doc = URYYieldCheck(_create_yield_check(input_qty=50))
		doc.validate_input_qty()

		mock_throw.assert_not_called()


class TestYieldCheckValidateOutputQty(FrappeTestCase):
	"""Test Check 2b: validate_output_qty (F1)"""

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_output_qty_is_zero(self, mock_throw):
		"""Output quantity of 0 fails validation."""
		doc = URYYieldCheck(_create_yield_check(output_qty=0))
		doc.validate_output_qty()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Output quantity must be greater than zero", call_args[0])

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_output_qty_is_negative(self, mock_throw):
		"""Negative output quantity fails validation."""
		doc = URYYieldCheck(_create_yield_check(output_qty=-5))
		doc.validate_output_qty()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Output quantity must be greater than zero", call_args[0])

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_output_qty_is_none(self, mock_throw):
		"""None output quantity fails validation."""
		doc = URYYieldCheck(_create_yield_check(output_qty=None))
		doc.validate_output_qty()

		mock_throw.assert_called_once()

	@patch(f"{MODULE}.frappe.msgprint")
	@patch(f"{MODULE}.frappe.throw")
	def test_passes_without_warning_when_output_within_input(self, mock_throw, mock_msgprint):
		"""Output <= input passes validation with no warning."""
		doc = URYYieldCheck(_create_yield_check(input_qty=100, output_qty=85))
		doc.validate_output_qty()

		mock_throw.assert_not_called()
		mock_msgprint.assert_not_called()

	@patch(f"{MODULE}.frappe.msgprint")
	@patch(f"{MODULE}.frappe.throw")
	def test_warns_but_does_not_block_when_output_exceeds_input(self, mock_throw, mock_msgprint):
		"""Output > input does not hard-block, but raises a warning (soft-flag)."""
		doc = URYYieldCheck(_create_yield_check(input_qty=100, output_qty=120))
		doc.validate_output_qty()

		mock_throw.assert_not_called()
		mock_msgprint.assert_called_once()
		call_kwargs = mock_msgprint.call_args[1]
		call_args = mock_msgprint.call_args[0]
		self.assertIn("greater than input quantity", call_args[0])
		self.assertEqual(call_kwargs.get("indicator"), "orange")

	@patch(f"{MODULE}.frappe.msgprint")
	@patch(f"{MODULE}.frappe.throw")
	def test_no_warning_when_input_qty_missing(self, mock_throw, mock_msgprint):
		"""No output>input warning is attempted when input_qty is falsy (avoids false positives)."""
		doc = URYYieldCheck(_create_yield_check(input_qty=0, output_qty=10))
		doc.validate_output_qty()

		mock_msgprint.assert_not_called()


class TestYieldCheckCaptureStandardYieldSnapshot(FrappeTestCase):
	"""Test Check 3: capture_standard_yield_snapshot"""

	@patch(f"{MODULE}.frappe.db.get_value")
	def test_captures_snapshot_on_first_insert(self, mock_get_value):
		"""Snapshot is captured from Item.custom_yield_percent on insert."""
		mock_get_value.return_value = 85.0

		doc = URYYieldCheck(_create_yield_check(standard_yield_percent_snapshot=None))
		doc.capture_standard_yield_snapshot()

		self.assertEqual(doc.standard_yield_percent_snapshot, 85.0)

	@patch(f"{MODULE}.frappe.db.get_value")
	def test_not_overwritten_on_later_edit(self, mock_get_value):
		"""Snapshot is not overwritten on a later edit."""
		mock_get_value.return_value = 95.0  # Item changed to 95%

		doc = URYYieldCheck(_create_yield_check(standard_yield_percent_snapshot=85.0))
		doc.capture_standard_yield_snapshot()

		# Should remain 85.0, not be overwritten to 95.0
		self.assertEqual(doc.standard_yield_percent_snapshot, 85.0)

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_handles_missing_item_yield_percent(self, mock_throw, mock_get_value):
		"""I6 hardening: a yield-tracked item with no standard yield percent set
		now throws rather than silently defaulting to 0.0 (PR #375) -- a 0.0
		standard would make every future check's variance_percent meaningless."""
		mock_get_value.return_value = None
		mock_throw.side_effect = frappe.ValidationError

		doc = URYYieldCheck(_create_yield_check(standard_yield_percent_snapshot=None))
		with self.assertRaises(frappe.ValidationError):
			doc.capture_standard_yield_snapshot()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("no standard yield percent set", call_args[0])


class TestYieldCheckComputeYieldAndVariance(FrappeTestCase):
	"""Test Check 4: compute_yield_and_variance"""

	def test_actual_yield_percent_computed_correctly(self):
		"""Actual yield percent = (output_qty / input_qty) * 100."""
		# 85 / 100 * 100 = 85%
		doc = URYYieldCheck(_create_yield_check(
			input_qty=100,
			output_qty=85,
			standard_yield_percent_snapshot=80.0
		))
		doc.compute_yield_and_variance()

		self.assertEqual(doc.actual_yield_percent, 85.0)

	def test_variance_percent_computed_correctly(self):
		"""Variance = actual - standard."""
		# actual=85%, standard=80% -> variance=+5%
		doc = URYYieldCheck(_create_yield_check(
			input_qty=100,
			output_qty=85,
			standard_yield_percent_snapshot=80.0
		))
		doc.compute_yield_and_variance()

		self.assertEqual(doc.variance_percent, 5.0)

	def test_negative_variance_when_actual_below_standard(self):
		"""Negative variance when yield is below standard."""
		# actual=75%, standard=80% -> variance=-5%
		doc = URYYieldCheck(_create_yield_check(
			input_qty=100,
			output_qty=75,
			standard_yield_percent_snapshot=80.0
		))
		doc.compute_yield_and_variance()

		self.assertEqual(doc.actual_yield_percent, 75.0)
		self.assertEqual(doc.variance_percent, -5.0)

	def test_zero_actual_yield_when_zero_output(self):
		"""Actual yield is 0% when output_qty is 0."""
		doc = URYYieldCheck(_create_yield_check(
			input_qty=100,
			output_qty=0,
			standard_yield_percent_snapshot=80.0
		))
		doc.compute_yield_and_variance()

		self.assertEqual(doc.actual_yield_percent, 0.0)
		self.assertEqual(doc.variance_percent, -80.0)

	def test_handles_zero_input_qty(self):
		"""When input_qty is 0, actual_yield_percent defaults to 0.0."""
		doc = URYYieldCheck(_create_yield_check(
			input_qty=0,
			output_qty=10,
			standard_yield_percent_snapshot=80.0
		))
		doc.compute_yield_and_variance()

		self.assertEqual(doc.actual_yield_percent, 0.0)


class TestYieldCheckValidateBranchCompanyConsistency(FrappeTestCase):
	"""Test Check 5: validate_branch_company_consistency"""

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_branch_is_missing(self, mock_throw):
		"""Validation fails if branch is not set."""
		doc = URYYieldCheck(_create_yield_check(branch=None))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_branch_company_consistency()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Branch is required", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_branch_has_no_company(self, mock_throw, mock_get_value):
		"""Validation fails if branch is not linked to a company."""
		mock_get_value.return_value = None

		doc = URYYieldCheck(_create_yield_check())
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_branch_company_consistency()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("must belong to a Company", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_branch_company_mismatches_document_company(self, mock_throw, mock_get_value):
		"""Validation fails if branch's company != document's company."""
		mock_get_value.return_value = "Other Company"

		doc = URYYieldCheck(_create_yield_check(company="Test Company"))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_branch_company_consistency()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("belongs to Company", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	def test_passes_when_branch_company_matches(self, mock_get_value):
		"""Validation passes when branch's company matches document's company."""
		mock_get_value.return_value = "Test Company"

		doc = URYYieldCheck(_create_yield_check(company="Test Company"))
		# Should not raise
		doc.validate_branch_company_consistency()


class TestYieldCheckValidateStockUomMatch(FrappeTestCase):
	"""Test Check 6: validate_stock_uom_match"""

	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_item_is_missing(self, mock_throw):
		"""Validation fails if item is not set."""
		doc = URYYieldCheck(_create_yield_check(item=None))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_stock_uom_match()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("Item is required", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_item_has_no_stock_uom(self, mock_throw, mock_get_value):
		"""Validation fails if Item.stock_uom is not set."""
		mock_get_value.return_value = None

		doc = URYYieldCheck(_create_yield_check())
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_stock_uom_match()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("does not have a stock UOM defined", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_stock_uom_mismatches_item(self, mock_throw, mock_get_value):
		"""Validation fails if document's stock_uom != Item.stock_uom."""
		mock_get_value.return_value = "Kg"

		doc = URYYieldCheck(_create_yield_check(stock_uom="Nos"))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_stock_uom_match()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("does not match", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	def test_passes_when_stock_uom_matches(self, mock_get_value):
		"""Validation passes when document's stock_uom == Item.stock_uom."""
		mock_get_value.return_value = "Nos"

		doc = URYYieldCheck(_create_yield_check(stock_uom="Nos"))
		# Should not raise
		doc.validate_stock_uom_match()


class TestYieldCheckValidateIssueAuthorization(FrappeTestCase):
	"""Test Check 7: validate_issue_authorization"""

	def test_passes_when_issue_authorization_is_not_set(self):
		"""Validation passes if issue_authorization is None."""
		doc = URYYieldCheck(_create_yield_check(issue_authorization=None))
		# Should not raise
		doc.validate_issue_authorization()

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_authorization_not_found(self, mock_throw, mock_get_value):
		"""Validation fails if authorization document doesn't exist."""
		mock_get_value.return_value = None

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_issue_authorization()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("not found", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_component_item_mismatches(self, mock_throw, mock_get_value):
		"""Validation fails when authorization's component_item != yield check's item."""
		auth_doc = frappe._dict({
			"name": "AUTH-001",
			"component_item": "DIFFERENT-ITEM",
			"status": "Authorized",
		})
		mock_get_value.return_value = auth_doc

		doc = URYYieldCheck(_create_yield_check(
			item="TEST-ITEM-001",
			issue_authorization="AUTH-001"
		))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_issue_authorization()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("is for Item", call_args[0])

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_status_is_not_authorized(self, mock_throw, mock_get_value):
		"""Validation fails when authorization status != 'Authorized'."""
		auth_doc = frappe._dict({
			"name": "AUTH-001",
			"component_item": "TEST-ITEM-001",
			"status": "Draft",
		})
		mock_get_value.return_value = auth_doc

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_issue_authorization()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("not in 'Authorized' status", call_args[0])

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_another_yield_check_references_authorization(self, mock_throw, mock_get_value, mock_get_all):
		"""Validation fails if another Yield Check already references this authorization."""
		auth_doc = frappe._dict({
			"name": "AUTH-001",
			"component_item": "TEST-ITEM-001",
			"status": "Authorized",
			"authorized_qty": 100,
		})
		mock_get_value.return_value = auth_doc
		mock_get_all.return_value = [
			frappe._dict(name="YC-EXISTING-001")
		]

		doc = URYYieldCheck(_create_yield_check(
			name="YC-NEW-001",
			issue_authorization="AUTH-001"
		))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_issue_authorization()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("already referenced by another Yield Check", call_args[0])

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	def test_passes_when_authorization_valid_and_unique(self, mock_get_value, mock_get_all):
		"""Validation passes when authorization is valid and not referenced elsewhere."""
		auth_doc = frappe._dict({
			"name": "AUTH-001",
			"component_item": "TEST-ITEM-001",
			"status": "Authorized",
			"authorized_qty": 100,
		})
		mock_get_value.return_value = auth_doc
		mock_get_all.return_value = []  # No other yield checks

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		# Should not raise
		doc.validate_issue_authorization()

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	def test_defaults_input_qty_from_authorized_qty(self, mock_get_value, mock_get_all):
		"""input_qty defaults to authorized_qty if not set."""
		auth_doc = frappe._dict({
			"name": "AUTH-001",
			"component_item": "TEST-ITEM-001",
			"status": "Authorized",
			"authorized_qty": 100,
		})
		mock_get_value.return_value = auth_doc
		mock_get_all.return_value = []

		doc = URYYieldCheck(_create_yield_check(
			input_qty=0,
			issue_authorization="AUTH-001"
		))
		doc.validate_issue_authorization()

		self.assertEqual(doc.input_qty, 100)

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.db.get_value")
	def test_does_not_overwrite_existing_input_qty(self, mock_get_value, mock_get_all):
		"""input_qty is not overwritten if already set."""
		auth_doc = frappe._dict({
			"name": "AUTH-001",
			"component_item": "TEST-ITEM-001",
			"status": "Authorized",
			"authorized_qty": 100,
		})
		mock_get_value.return_value = auth_doc
		mock_get_all.return_value = []

		doc = URYYieldCheck(_create_yield_check(
			input_qty=50,
			issue_authorization="AUTH-001"
		))
		doc.validate_issue_authorization()

		self.assertEqual(doc.input_qty, 50)  # Unchanged


class TestYieldCheckValidateNoDuplicateWastage(FrappeTestCase):
	"""Test Check 8: validate_no_duplicate_wastage (A3)."""

	def test_passes_when_issue_authorization_is_not_set(self):
		"""Validation passes if issue_authorization is None."""
		doc = URYYieldCheck(_create_yield_check(issue_authorization=None))
		# Should not raise
		doc.validate_no_duplicate_wastage()

	@patch(f"{MODULE}.frappe.get_all")
	def test_passes_when_no_existing_wastage_for_authorization(self, mock_get_all):
		"""Validation passes when issue_authorization has no Issue Wastage records."""
		mock_get_all.return_value = []  # No wastage records

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		# Should not raise
		doc.validate_no_duplicate_wastage()

	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.throw")
	def test_throws_when_wastage_already_exists(self, mock_throw, mock_get_all):
		"""Validation fails when Issue Wastage already references this authorization."""
		mock_get_all.return_value = [
			frappe._dict(name="WASTAGE-001")
		]

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		mock_throw.side_effect = frappe.ValidationError
		with self.assertRaises(frappe.ValidationError):
			doc.validate_no_duplicate_wastage()

		mock_throw.assert_called_once()
		call_args = mock_throw.call_args[0]
		self.assertIn("already has an Issue Wastage record", str(call_args[0]))
		self.assertIn("WASTAGE-001", str(call_args[0]))

	@patch(f"{MODULE}.frappe.get_all")
	def test_filters_by_issue_authorization(self, mock_get_all):
		"""Query filters for the specific issue_authorization."""
		mock_get_all.return_value = []

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		doc.validate_no_duplicate_wastage()

		mock_get_all.assert_called_once()
		call_kwargs = mock_get_all.call_args[1]
		self.assertEqual(call_kwargs["filters"]["issue_authorization"], "AUTH-001")

	@patch(f"{MODULE}.frappe.get_all")
	def test_searches_ury_issue_wastage_doctype(self, mock_get_all):
		"""Query targets URY Issue Wastage doctype."""
		mock_get_all.return_value = []

		doc = URYYieldCheck(_create_yield_check(issue_authorization="AUTH-001"))
		doc.validate_no_duplicate_wastage()

		call_args = mock_get_all.call_args[0]
		self.assertEqual(call_args[0], "URY Issue Wastage")


class TestYieldCheckIntegrationFullValidate(FrappeTestCase):
	"""Integration tests for full validate() method."""

	@patch(f"{MODULE}.frappe.db.get_value")
	@patch(f"{MODULE}.frappe.get_all")
	@patch(f"{MODULE}.frappe.throw")
	def test_all_checks_are_called_in_sequence(self, mock_throw, mock_get_all, mock_get_value):
		"""All 8 validation checks are called in the correct order."""
		# Setup mocks to make all checks pass. Order must exactly match
		# validate()'s own call sequence in ury_yield_check.py -- a missing
		# entry here previously shifted every later value by one position
		# (e.g. the "Test Company" meant for validate_branch_company_consistency
		# landing in capture_standard_yield_snapshot's `item_yield <= 0` check
		# instead, raising TypeError: '<=' not supported between str and int).
		mock_get_value.side_effect = [
			True,  # validate_item_yield_tracking_enabled
			85.0,  # capture_standard_yield_snapshot (Item.custom_yield_percent)
			"Test Company",  # validate_branch_company_consistency
			"Nos",  # validate_stock_uom_match
			frappe._dict({  # validate_issue_authorization
				"name": "AUTH-001",
				"component_item": "TEST-ITEM-001",
				"status": "Authorized",
				"authorized_qty": 100,
			}),
		]
		mock_get_all.side_effect = [
			[],  # validate_issue_authorization - no existing checks
			[],  # validate_no_duplicate_wastage - no wastage records
		]

		doc = URYYieldCheck(_create_yield_check())
		doc.validate()

		# All checks should pass
		mock_throw.assert_not_called()


class TestYieldCheckRealDocumentIntegration(FrappeTestCase):
	"""F9: real-document coverage (no mocks) for output_qty bounds
	(validate_output_qty, F1) and the Yield-Check/Wastage mutual-exclusion
	guard's reverse direction (F3) -- every prior test in this file patches
	frappe.db.get_value/get_all instead of actually inserting a document, so
	none of them could have caught a regression in the real validate()
	chain, frappe's own mandatory/link checks, or the real capture_wastage
	API. These insert real Company/Branch/Item/URY Production Department/
	URY Sales Plan/URY Issue Authorization/URY Yield Check records and call
	the real whitelisted APIs.
	"""

	def _ensure_company(self, company_name, abbr):
		if not frappe.db.exists("Company", company_name):
			frappe.get_doc(
				{
					"doctype": "Company",
					"company_name": company_name,
					"default_currency": "INR",
					"abbr": abbr,
				}
			).insert(ignore_permissions=True)

	def _ensure_branch(self, branch_name, company):
		if not frappe.db.exists("Branch", branch_name):
			frappe.get_doc(
				{
					"doctype": "Branch",
					"branch": branch_name,
					"company": company,
					"user": [{"user": "Administrator"}],
				}
			).insert(ignore_permissions=True)

	def _ensure_item(self, item_code):
		if frappe.db.exists("Item", item_code):
			return
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": item_code,
				"item_name": item_code,
				"item_group": "All Item Groups",
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"custom_yield_tracked": 1,
				"custom_yield_percent": 80.0,
			}
		).insert(ignore_permissions=True)

	def _minimal_plan(self, branch, company):
		"""A minimal, insert-only URY Sales Plan to satisfy URY Issue
		Authorization's mandatory `plan` link. validate() is skipped
		(ignore_validate) -- this test is not exercising the sales-plan
		lifecycle, only that a real `plan` link exists for the
		Authorization/Wastage chain below."""
		plan = frappe.get_doc(
			{
				"doctype": "URY Sales Plan",
				"status": "Draft",
				"enforcement_mode": "Soft",
				"branch": branch,
				"company": company,
				"plan_date": "2026-09-01",
			}
		)
		plan.flags.ignore_mandatory = True
		plan.flags.ignore_validate = True
		plan.insert(ignore_permissions=True)
		return plan.name

	def _department(self, branch, company):
		name = f"{branch} F9 Dept"
		if frappe.db.exists("URY Production Department", name):
			return name
		frappe.get_doc(
			{
				"doctype": "URY Production Department",
				"department_name": name,
				"branch": branch,
				"company": company,
				"enabled": 1,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)
		return name

	def _auth(self, plan, branch, company, department, item, qty=50.0):
		doc = frappe.get_doc(
			{
				"doctype": "URY Issue Authorization",
				"plan": plan,
				"plan_approval_hash": "f9-real-doc-test",
				"branch": branch,
				"company": company,
				"department": department,
				"component_item": item,
				"stock_uom": "Nos",
				"control_mode": "SOFT",
				"status": "Authorized",
				"required_qty": qty,
				"authorized_qty": qty,
				"remaining_before_qty": qty,
				"remaining_after_qty": 0,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc.name

	def setUp(self):
		self.company = "F9 Yield Test Co"
		self.branch = "F9 Yield Test Branch"
		self.item = "F9-YIELD-ITEM"
		self._ensure_company(self.company, "F9YC")
		self._ensure_branch(self.branch, self.company)
		self._ensure_item(self.item)

	def _base_doc(self, **overrides):
		fields = {
			"doctype": "URY Yield Check",
			"item": self.item,
			"branch": self.branch,
			"company": self.company,
			"input_qty": 100,
			"output_qty": 80,
			"stock_uom": "Nos",
			"check_type": "Routine",
			"checked_by": "Administrator",
			"checked_on": "2026-09-01 10:00:00",
		}
		fields.update(overrides)
		return frappe.get_doc(fields)

	def test_real_insert_rejects_zero_output_qty(self):
		"""F1: a real .insert() with output_qty=0 must fail closed."""
		with self.assertRaises(frappe.ValidationError):
			self._base_doc(output_qty=0).insert(ignore_permissions=True)

	def test_real_insert_rejects_negative_output_qty(self):
		"""F1: a real .insert() with a negative output_qty must fail closed."""
		with self.assertRaises(frappe.ValidationError):
			self._base_doc(output_qty=-5).insert(ignore_permissions=True)

	def test_real_insert_allows_output_exceeding_input_with_warning_not_block(self):
		"""F1: output_qty > input_qty is a soft warning (msgprint), not a
		hard block -- the real insert must succeed."""
		doc = self._base_doc(input_qty=100, output_qty=120)
		doc.insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("URY Yield Check", doc.name))
		self.assertAlmostEqual(doc.actual_yield_percent, 120.0)

	def test_real_insert_succeeds_with_valid_bounds(self):
		doc = self._base_doc(input_qty=100, output_qty=80)
		doc.insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("URY Yield Check", doc.name))
		self.assertAlmostEqual(doc.actual_yield_percent, 80.0)
		self.assertAlmostEqual(doc.variance_percent, 0.0)

	def test_real_wastage_capture_blocked_after_real_yield_check_exists(self):
		"""F3 reverse guard: with a real Issue Authorization and a real
		Yield Check already inserted against it, a real (unmocked) call to
		ury.ury.api.ury_wastage.capture_wastage for the same authorization
		must fail closed -- otherwise the same shortfall would be
		double-counted regardless of which record was created first."""
		from ury.ury.api.ury_wastage import capture_wastage

		department = self._department(self.branch, self.company)
		plan = self._minimal_plan(self.branch, self.company)
		auth_name = self._auth(plan, self.branch, self.company, department, self.item)

		yc = self._base_doc(issue_authorization=auth_name)
		yc.insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("URY Yield Check", yc.name))

		with self.assertRaises(frappe.ValidationError):
			capture_wastage(
				issue_authorization=auth_name,
				wasted_qty=1,
				reason_category="Spoilage",
				branch=self.branch,
				company=self.company,
			)


if __name__ == "__main__":
	unittest.main()
