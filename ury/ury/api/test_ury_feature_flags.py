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
from ury.ury.api.ury_stock_policy import clear_branch_stock_policy_cache


class TestPosStockAuthorityFlagDefaultsSafe(FrappeTestCase):
    """The single most important test in this task: the flag must default
    to False/off whenever it is unset, or whenever reading it fails for any
    reason (missing doctype, DB error, etc). It must never fail open.

    Since T1 (I-1) this function is a deprecated shim over
    `ury_stock_policy.get_branch_stock_policy(...).realtime_production_posting_enabled`,
    so these tests now drive the shim through the resolver's underlying
    read rather than through the retired `URY Feature Flags` Single. The
    guarantee under test is unchanged.
    """

    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_flag_defaults_false_when_unset(self, mock_get_value):
        mock_get_value.return_value = {
            "reservation_control_enabled": 0,
            "realtime_production_posting_enabled": 0,
            "closing_reconciliation_enabled": 0,
        }
        self.assertFalse(is_pos_stock_authority_flag_enabled(branch="Main Branch"))

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_flag_defaults_false_when_no_policy_row(self, mock_get_value):
        # No URY Branch Stock Policy row for this branch: Tier 1.
        mock_get_value.return_value = None
        self.assertFalse(is_pos_stock_authority_flag_enabled(branch="Main Branch"))

    def test_flag_defaults_false_when_no_branch_given(self):
        # No branch at all -- nothing to resolve, so Tier 1.
        self.assertFalse(is_pos_stock_authority_flag_enabled())

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_flag_fails_closed_on_missing_doctype_or_db_error(self, mock_get_value):
        # Simulate the doctype not existing yet / any DB-level error.
        mock_get_value.side_effect = Exception(
            "DocType URY Branch Stock Policy not found"
        )
        self.assertFalse(is_pos_stock_authority_flag_enabled(branch="Main Branch"))

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_flag_true_only_when_explicitly_enabled(self, mock_get_value):
        # This is the ONLY case that should return True -- proves the
        # function is capable of reporting "on" so the flag-on branch is
        # reachable and testable, without that capability implying it is
        # ever true by default anywhere in shipped code. Note the shim maps
        # onto `realtime_production_posting_enabled`, which is only legal
        # with `reservation_control_enabled` also on.
        mock_get_value.return_value = {
            "reservation_control_enabled": 1,
            "realtime_production_posting_enabled": 1,
            "closing_reconciliation_enabled": 0,
        }
        self.assertTrue(is_pos_stock_authority_flag_enabled(branch="Main Branch"))

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_flag_false_in_reservations_only_state(self, mock_get_value):
        # State 2 of the tier gate: reservations on, no production posting.
        # The shim tracks production posting specifically, so it reads off.
        mock_get_value.return_value = {
            "reservation_control_enabled": 1,
            "realtime_production_posting_enabled": 0,
            "closing_reconciliation_enabled": 0,
        }
        self.assertFalse(is_pos_stock_authority_flag_enabled(branch="Main Branch"))

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_flag_accepts_optional_scope_args_without_changing_default(self, mock_get_value):
        mock_get_value.return_value = None
        self.assertFalse(
            is_pos_stock_authority_flag_enabled(company="Acme Co", branch="Main Branch")
        )


class TestMaybeWireFulfilmentOnSubmit(FrappeTestCase):
    """Flag-on invoice-submit gate. Under the flag this VERIFIES that the
    fulfilment posting service already posted; it never posts anything
    itself."""

    @patch("ury.ury.api.ury_feature_flags.is_pos_stock_authority_flag_enabled")
    @patch("ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice")
    def test_noop_when_flag_off(self, mock_verify, mock_flag):
        mock_flag.return_value = False
        doc = {"name": "POS-INV-001", "branch": "Main Branch"}
        maybe_wire_fulfilment_on_submit(doc)
        mock_verify.assert_not_called()

    @patch("ury.ury.api.ury_feature_flags.is_pos_stock_authority_flag_enabled")
    @patch("ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice")
    def test_verifies_when_flag_on(self, mock_verify, mock_flag):
        mock_flag.return_value = True
        doc = {"name": "POS-INV-001", "branch": "Main Branch"}
        maybe_wire_fulfilment_on_submit(doc)
        mock_verify.assert_called_once_with(doc)

    @patch("ury.ury.api.ury_feature_flags.is_pos_stock_authority_flag_enabled")
    @patch("ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice")
    def test_verification_failure_is_propagated(self, mock_verify, mock_flag):
        mock_flag.return_value = True
        mock_verify.side_effect = frappe.ValidationError("boom")
        doc = {"name": "POS-INV-001", "branch": "Main Branch"}
        with self.assertRaises(frappe.ValidationError):
            maybe_wire_fulfilment_on_submit(doc)

    @patch("ury.ury.api.ury_feature_flags.frappe.get_all")
    def test_noop_when_invoice_has_no_kots(self, mock_get_all):
        from ury.ury.api.ury_feature_flags import _verify_fulfilment_posted_for_invoice

        mock_get_all.return_value = []
        doc = frappe._dict({"name": "POS-INV-001"})
        _verify_fulfilment_posted_for_invoice(doc)
        mock_get_all.assert_called_once()


class TestFulfilmentVerificationGate(FrappeTestCase):
    """G-07: a POSTED intent for the right kot_item is not on its own proof
    that what was posted is what is being invoiced."""

    def _run(self, intent, execution_state="READY", idempotency_key="rev-2", invoiced_qty=3):
        from ury.ury.api.ury_feature_flags import _verify_fulfilment_posted_for_invoice

        def get_all(doctype, **kwargs):
            if doctype == "URY KOT":
                return [frappe._dict({"name": "KOT-001"})]
            if doctype == "URY KOT Item Execution":
                return [
                    frappe._dict(
                        {
                            "name": "EXEC-1",
                            "kot_item": "KOTITEM-1",
                            "state": execution_state,
                            "idempotency_key": idempotency_key,
                            "branch": "Main Branch",
                            "company": "Acme Co",
                        }
                    )
                ]
            if doctype == "URY Fulfilment Posting Intent":
                return [frappe._dict(intent)] if intent else []
            raise AssertionError(doctype)

        doc = frappe._dict({"name": "POS-INV-001", "branch": "Main Branch", "company": "Acme Co"})
        with patch("ury.ury.api.ury_feature_flags.frappe.get_all", side_effect=get_all), patch(
            "ury.ury.api.ury_feature_flags.frappe.db.get_value",
            return_value=frappe._dict({"item": "BURGER", "quantity": invoiced_qty}),
        ), patch(
            "ury.ury.api.ury_feature_flags._is_made_to_order", return_value=True
        ):
            _verify_fulfilment_posted_for_invoice(doc)

    def _posted(self, **overrides):
        intent = {
            "name": "INTENT-1",
            "status": "POSTED",
            "accepted_revision": "rev-2",
            "accepted_qty": 3,
        }
        intent.update(overrides)
        return intent

    def test_matching_posted_intent_passes(self):
        self._run(self._posted())

    def test_missing_intent_blocks_submit(self):
        with self.assertRaises(frappe.ValidationError):
            self._run(None)

    def test_stale_revision_blocks_submit(self):
        """A re-fired item whose new READY transition never created an intent
        would otherwise pass on the previous fire's POSTED intent."""
        with self.assertRaises(frappe.ValidationError):
            self._run(self._posted(accepted_revision="rev-1"))

    def test_quantity_increased_after_ready_blocks_submit(self):
        """Order edited 1 -> 3 after READY: one was produced, three are sold."""
        with self.assertRaises(frappe.ValidationError):
            self._run(self._posted(accepted_qty=1), invoiced_qty=3)

    def test_unproduced_item_is_skipped_not_blocked(self):
        """An item the kitchen has not finished is a workflow question, not a
        stock one, and must not refuse payment at the till."""
        self._run(None, execution_state="QUEUED")

    def test_non_made_to_order_item_requires_no_intent(self):
        """Pre-produced and direct-retail items post nothing at READY, so
        demanding an intent for them would block every submit."""
        from ury.ury.api.ury_feature_flags import _verify_fulfilment_posted_for_invoice

        def get_all(doctype, **kwargs):
            if doctype == "URY KOT":
                return [frappe._dict({"name": "KOT-001"})]
            if doctype == "URY KOT Item Execution":
                return [
                    frappe._dict(
                        {
                            "name": "EXEC-1",
                            "kot_item": "KOTITEM-1",
                            "state": "READY",
                            "idempotency_key": "rev-1",
                            "branch": "Main Branch",
                            "company": "Acme Co",
                        }
                    )
                ]
            raise AssertionError(doctype)

        doc = frappe._dict({"name": "POS-INV-001", "branch": "Main Branch", "company": "Acme Co"})
        with patch("ury.ury.api.ury_feature_flags.frappe.get_all", side_effect=get_all), patch(
            "ury.ury.api.ury_feature_flags.frappe.db.get_value",
            return_value=frappe._dict({"item": "COLA", "quantity": 1}),
        ), patch(
            "ury.ury.api.ury_feature_flags._is_made_to_order", return_value=False
        ):
            _verify_fulfilment_posted_for_invoice(doc)
