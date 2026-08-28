# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""V3-73 tests: POS stock authority feature flag read path.

These are static/unit tests using mocks -- no bench/site required to reason
about them, but they follow this repo's existing FrappeTestCase + mock
pattern (see ury/ury/doctype/ury_order/test_ury_order.py) so they run
under `bench run-tests` in a real environment.
"""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_feature_flags import is_pos_stock_authority_flag_enabled


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
