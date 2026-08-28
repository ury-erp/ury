# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""V3-73 tests: POS stock authority feature flag read path.

These are static/unit tests using mocks -- no bench/site required to reason
about them, but they follow this repo's existing FrappeTestCase + mock
pattern (see ury/ury/doctype/ury_order/test_ury_order.py) so they run
under `bench run-tests` in a real environment.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_feature_flags import (
    is_pos_stock_authority_flag_enabled,
    maybe_wire_fulfilment_on_submit,
)


class TestPosStockAuthorityFlagDefaultsSafe(FrappeTestCase):
    """The single most important test in this task: the flag must default
    to False/off whenever it is unset, or whenever reading it fails for any
    reason (missing doctype, DB error, etc). It must never fail open."""

    @patch("ury.ury.api.ury_feature_flags.frappe.db.get_single_value")
    def test_flag_defaults_false_when_unset(self, mock_get_single_value):
        mock_get_single_value.return_value = 0
        self.assertFalse(is_pos_stock_authority_flag_enabled())

    @patch("ury.ury.api.ury_feature_flags.frappe.db.get_single_value")
    def test_flag_defaults_false_when_field_missing_none(self, mock_get_single_value):
        # get_single_value returns None if the field/doctype doesn't resolve
        mock_get_single_value.return_value = None
        self.assertFalse(is_pos_stock_authority_flag_enabled())

    @patch("ury.ury.api.ury_feature_flags.frappe.db.get_single_value")
    def test_flag_fails_closed_on_missing_doctype_or_db_error(self, mock_get_single_value):
        # Simulate the doctype not existing yet / any DB-level error.
        mock_get_single_value.side_effect = Exception("DocType URY Feature Flags not found")
        self.assertFalse(is_pos_stock_authority_flag_enabled())

    @patch("ury.ury.api.ury_feature_flags.frappe.db.get_single_value")
    def test_flag_true_only_when_explicitly_enabled(self, mock_get_single_value):
        # This is the ONLY case that should return True -- proves the
        # function is capable of reporting "on" so the flag-on branch is
        # reachable and testable, without that capability implying it is
        # ever true by default anywhere in shipped code.
        mock_get_single_value.return_value = 1
        self.assertTrue(is_pos_stock_authority_flag_enabled())

    @patch("ury.ury.api.ury_feature_flags.frappe.db.get_single_value")
    def test_flag_accepts_optional_scope_args_without_changing_default(self, mock_get_single_value):
        mock_get_single_value.return_value = 0
        self.assertFalse(
            is_pos_stock_authority_flag_enabled(company="Acme Co", branch="Main Branch")
        )


class TestMaybeWireFulfilmentOnSubmit(FrappeTestCase):
    """V3-73 flag-on wiring, added on top of the accepted flag-read path."""

    @patch("ury.ury.api.ury_feature_flags.is_pos_stock_authority_flag_enabled")
    @patch("ury.ury.api.ury_feature_flags._wire_fulfilment_for_invoice")
    def test_noop_when_flag_off(self, mock_wire, mock_flag):
        mock_flag.return_value = False
        doc = {"name": "POS-INV-001", "branch": "Main Branch"}
        maybe_wire_fulfilment_on_submit(doc)
        mock_wire.assert_not_called()

    @patch("ury.ury.api.ury_feature_flags.is_pos_stock_authority_flag_enabled")
    @patch("ury.ury.api.ury_feature_flags._wire_fulfilment_for_invoice")
    def test_calls_wiring_when_flag_on(self, mock_wire, mock_flag):
        mock_flag.return_value = True
        doc = {"name": "POS-INV-001", "branch": "Main Branch"}
        maybe_wire_fulfilment_on_submit(doc)
        mock_wire.assert_called_once_with(doc)

    @patch("ury.ury.api.ury_feature_flags.frappe.log_error")
    @patch("ury.ury.api.ury_feature_flags.is_pos_stock_authority_flag_enabled")
    @patch("ury.ury.api.ury_feature_flags._wire_fulfilment_for_invoice")
    def test_wiring_failure_is_caught_and_logged_never_raised(
        self, mock_wire, mock_flag, mock_log_error
    ):
        mock_flag.return_value = True
        mock_wire.side_effect = Exception("boom")
        doc = {"name": "POS-INV-001", "branch": "Main Branch"}
        # Must not raise -- a fulfilment bookkeeping failure can never be
        # allowed to block or roll back a real invoice submission.
        maybe_wire_fulfilment_on_submit(doc)
        mock_log_error.assert_called_once()

    @patch("ury.ury.api.ury_feature_flags.frappe.get_all")
    def test_wire_for_invoice_noop_when_no_kots(self, mock_get_all):
        from ury.ury.api.ury_feature_flags import _wire_fulfilment_for_invoice

        mock_get_all.return_value = []
        doc = frappe._dict({"name": "POS-INV-001"})
        # Must not raise, and must not proceed past the KOT lookup.
        _wire_fulfilment_for_invoice(doc)
        mock_get_all.assert_called_once()

    @patch("ury.ury.api.ury_feature_flags.frappe.log_error")
    @patch("ury.ury.api.ury_feature_flags.frappe.get_doc")
    @patch("ury.ury.api.ury_feature_flags.frappe.get_all")
    def test_wire_for_invoice_skips_when_no_matching_reservation(
        self, mock_get_all, mock_get_doc, mock_log_error
    ):
        from ury.ury.api.ury_feature_flags import _wire_fulfilment_for_invoice

        # First get_all call: KOTs linked to invoice.
        # Second: KOT Execution rows (READY). Third: reservation lookup (none).
        mock_get_all.side_effect = [
            [frappe._dict({"name": "KOT-001"})],
            [frappe._dict({"state": "READY"})],
            [],
        ]
        kot_doc = frappe._dict(
            {"kot_items": [frappe._dict({"item": "BURGER", "quantity": 2})]}
        )
        mock_get_doc.return_value = kot_doc
        doc = frappe._dict({"name": "POS-INV-001"})

        with patch("ury.ury.api.ury_feature_flags.frappe.db.get_value", return_value=None):
            # Must not raise even though no reservation exists -- this is
            # the expected, documented state until reservation-on-order
            # creation is wired in as a separate follow-up.
            _wire_fulfilment_for_invoice(doc)

        mock_log_error.assert_called_once()
        self.assertIn("no reservation found", mock_log_error.call_args.kwargs["title"].lower())
