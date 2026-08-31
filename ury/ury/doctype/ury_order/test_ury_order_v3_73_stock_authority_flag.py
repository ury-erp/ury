# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""V3-73 tests: POS stock authority flag integration point in ury_order.py.

Scope, deliberately narrow (see
tracks/sa-v3_nxt/outputs/V3-70-fulfilment-accounting-transition-checklist.md
and the sa-v3_nxt/TODO.md row for V3-73):

1. Flag OFF (unset/off) -> `invoice.update_stock` ends up 1, exactly as
   before this task existed. This is the single most important behavior in
   this whole task: it is what makes the flag a real rollback mechanism.
2. Flag ON (mocked only -- never true in real, unmocked code) -> routes to
   the flag-on branch and sets `invoice.update_stock = 0` instead.
3. Flag flip regression: OFF -> ON -> OFF again must return to identical
   `update_stock = 1` behavior, proving no persisted side effect from a
   prior "on" state leaks into a later "off" state on the same or a new
   invoice object.

These are static/mocked unit tests (no bench/site required to reason about
them), following this repo's existing FrappeTestCase + mock pattern used in
test_ury_order.py.
"""

from types import SimpleNamespace
from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_order.ury_order import _apply_pos_stock_authority


class TestPosStockAuthorityFlagOffIsUnchangedBehavior(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.is_pos_stock_authority_flag_enabled")
    def test_flag_off_sets_update_stock_1_and_nothing_else(self, mock_flag):
        mock_flag.return_value = False

        invoice = SimpleNamespace(update_stock=None)
        _apply_pos_stock_authority(invoice, branch="Main Branch")

        # This is exactly what the two call sites in ury_order.py did before
        # V3-73: `invoice.update_stock = 1`, unconditionally, nothing else.
        self.assertEqual(invoice.update_stock, 1)

    @patch("ury.ury.doctype.ury_order.ury_order.is_pos_stock_authority_flag_enabled")
    def test_flag_off_with_no_branch_arg_still_sets_update_stock_1(self, mock_flag):
        # Mirrors the second call site in _resolve_or_create_pos_invoice,
        # where branch is not yet known at the point the invoice is built.
        mock_flag.return_value = False

        invoice = SimpleNamespace(update_stock=None)
        _apply_pos_stock_authority(invoice, branch=None)

        self.assertEqual(invoice.update_stock, 1)


class TestPosStockAuthorityFlagOnRoutesToStub(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.log_error")
    @patch("ury.ury.doctype.ury_order.ury_order.is_pos_stock_authority_flag_enabled")
    def test_flag_on_sets_update_stock_0_and_logs_stub_warning(self, mock_flag, mock_log_error):
        mock_flag.return_value = True

        invoice = SimpleNamespace(update_stock=None)
        _apply_pos_stock_authority(invoice, branch="Main Branch")

        self.assertEqual(invoice.update_stock, 0)
        # The flag-on path must be loudly logged as a stub every time it
        # runs, since it does not yet call the real fulfilment services.
        mock_log_error.assert_called_once()
        _, kwargs = mock_log_error.call_args
        self.assertIn("stub", kwargs.get("message", "").lower())


class TestPosStockAuthorityFlagFlipRegression(FrappeTestCase):
    @patch("ury.ury.doctype.ury_order.ury_order.frappe.log_error")
    @patch("ury.ury.doctype.ury_order.ury_order.is_pos_stock_authority_flag_enabled")
    def test_off_then_on_then_off_returns_to_identical_behavior(self, mock_flag, mock_log_error):
        # Off first.
        mock_flag.return_value = False
        invoice_a = SimpleNamespace(update_stock=None)
        _apply_pos_stock_authority(invoice_a, branch="Main Branch")
        self.assertEqual(invoice_a.update_stock, 1)

        # Then on, for a different invoice (simulating a later order while
        # the flag was toggled on in some environment).
        mock_flag.return_value = True
        invoice_b = SimpleNamespace(update_stock=None)
        _apply_pos_stock_authority(invoice_b, branch="Main Branch")
        self.assertEqual(invoice_b.update_stock, 0)

        # Flip back off -- a brand new invoice must behave exactly like
        # invoice_a did, with no residue from the flag having been on.
        mock_flag.return_value = False
        invoice_c = SimpleNamespace(update_stock=None)
        _apply_pos_stock_authority(invoice_c, branch="Main Branch")
        self.assertEqual(invoice_c.update_stock, 1)

        # And re-running against the very same invoice object used while
        # the flag was on, if the flag is now off, must also converge back
        # to 1 -- no sticky state on the invoice itself from the earlier
        # flag-on call.
        mock_flag.return_value = False
        _apply_pos_stock_authority(invoice_b, branch="Main Branch")
        self.assertEqual(invoice_b.update_stock, 1)
