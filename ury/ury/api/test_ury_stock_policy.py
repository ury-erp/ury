# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""T1 (I-1) tests: per-branch POS stock authority tier resolution.

Two properties are under test, and they are the two everything downstream
(T2-T6) depends on:

1. All four LEGAL states resolve exactly, and the illegal ones are
   unreachable -- rejected at the doctype validation level, and neutralised
   at the resolver level if they ever reach the database out of band.
2. Every failure mode falls back to all-False (Tier 1). Missing row, missing
   doctype, DB exception, malformed row, wrong types, no branch.

These follow this repo's existing FrappeTestCase + mock pattern (see
test_ury_feature_flags.py); the resolver tests need no site, the doctype
validation test does.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_stock_policy import (
    POLICY_ALL_OFF,
    StockPolicy,
    clear_branch_stock_policy_cache,
    get_branch_stock_policy,
)

BRANCH = "Test Branch"


def _row(reservation, production, closing):
    return {
        "reservation_control_enabled": reservation,
        "realtime_production_posting_enabled": production,
        "closing_reconciliation_enabled": closing,
    }


class TestStockPolicyLegalStates(FrappeTestCase):
    """The four legal states of the tier gate (architecture brief 3.4)."""

    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_state_1_all_off_is_tier_1(self, mock_get_value):
        mock_get_value.return_value = _row(0, 0, 0)
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_state_2_reservations_only(self, mock_get_value):
        mock_get_value.return_value = _row(1, 0, 0)
        self.assertEqual(
            get_branch_stock_policy(BRANCH), StockPolicy(True, False, False)
        )

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_state_3_production_posting_advisory(self, mock_get_value):
        mock_get_value.return_value = _row(1, 1, 0)
        self.assertEqual(
            get_branch_stock_policy(BRANCH), StockPolicy(True, True, False)
        )

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_state_4_tier_2_enforcing(self, mock_get_value):
        mock_get_value.return_value = _row(1, 1, 1)
        self.assertEqual(get_branch_stock_policy(BRANCH), StockPolicy(True, True, True))

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_fields_are_strict_bools_not_ints(self, mock_get_value):
        # Downstream code does `if policy.reservation_control_enabled`, and
        # some of it will serialise the policy. Ints leaking through would
        # work by accident here and break there.
        mock_get_value.return_value = _row(1, 1, 1)
        policy = get_branch_stock_policy(BRANCH)
        for value in policy:
            self.assertIsInstance(value, bool)


class TestStockPolicyFailsClosed(FrappeTestCase):
    """Every failure mode must resolve to all-off. Tier 1 is the known-good
    tier; falling back to anything else is a stock-correctness incident."""

    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    def test_no_branch_argument(self):
        self.assertEqual(get_branch_stock_policy(), POLICY_ALL_OFF)
        self.assertEqual(get_branch_stock_policy(None), POLICY_ALL_OFF)
        self.assertEqual(get_branch_stock_policy(""), POLICY_ALL_OFF)

    def test_non_string_branch_argument(self):
        # A caller passing a doc, a dict or an int must not blow up the till.
        self.assertEqual(get_branch_stock_policy(123), POLICY_ALL_OFF)
        self.assertEqual(get_branch_stock_policy({"name": BRANCH}), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_missing_row(self, mock_get_value):
        mock_get_value.return_value = None
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_missing_doctype_or_table(self, mock_get_value):
        mock_get_value.side_effect = Exception(
            "DocType URY Branch Stock Policy not found"
        )
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_db_error(self, mock_get_value):
        mock_get_value.side_effect = RuntimeError("Lost connection to MySQL server")
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_malformed_row_wrong_value_type(self, mock_get_value):
        mock_get_value.return_value = _row(1, ["not", "a", "bool"], 0)
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_malformed_row_unparseable_string(self, mock_get_value):
        mock_get_value.return_value = _row(1, "yes", 0)
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_row_missing_expected_keys(self, mock_get_value):
        mock_get_value.return_value = {"reservation_control_enabled": 1}
        # Absent keys read as None -> False, which is itself a legal state.
        self.assertEqual(
            get_branch_stock_policy(BRANCH), StockPolicy(True, False, False)
        )

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_string_zero_does_not_fail_open(self, mock_get_value):
        # "0" is truthy in Python. A naive bool() here would turn Tier 1 into
        # Tier 2 for any row written as strings out of band.
        mock_get_value.return_value = _row("0", "0", "0")
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_illegal_production_without_reservation(self, mock_get_value):
        # Should be impossible via the doctype (see the validation test
        # below), but a direct SQL write or a half-applied patch could do it.
        mock_get_value.return_value = _row(0, 1, 0)
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_illegal_closing_without_production(self, mock_get_value):
        mock_get_value.return_value = _row(1, 0, 1)
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_illegal_closing_only(self, mock_get_value):
        mock_get_value.return_value = _row(0, 0, 1)
        self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_resolver_never_raises(self, mock_get_value):
        # Belt and braces: anything at all coming back from the DB layer.
        for value in (object(), 0, "", [], Exception("boom")):
            with self.subTest(value=value):
                clear_branch_stock_policy_cache()
                mock_get_value.return_value = value
                self.assertEqual(get_branch_stock_policy(BRANCH), POLICY_ALL_OFF)


class TestStockPolicyRequestCache(FrappeTestCase):
    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_repeat_reads_hit_the_db_once(self, mock_get_value):
        mock_get_value.return_value = _row(1, 1, 1)
        first = get_branch_stock_policy(BRANCH)
        second = get_branch_stock_policy(BRANCH)
        self.assertEqual(first, second)
        self.assertEqual(mock_get_value.call_count, 1)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_cache_is_per_branch(self, mock_get_value):
        mock_get_value.side_effect = [_row(1, 1, 1), _row(0, 0, 0)]
        self.assertEqual(get_branch_stock_policy("A"), StockPolicy(True, True, True))
        self.assertEqual(get_branch_stock_policy("B"), POLICY_ALL_OFF)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_clearing_the_cache_forces_a_reread(self, mock_get_value):
        mock_get_value.return_value = _row(1, 1, 1)
        get_branch_stock_policy(BRANCH)
        clear_branch_stock_policy_cache(BRANCH)
        get_branch_stock_policy(BRANCH)
        self.assertEqual(mock_get_value.call_count, 2)


class TestBranchStockPolicyDoctypeValidation(FrappeTestCase):
    """The dependency constraint is a hard validation error, not only a
    resolver-side neutralisation -- an operator who ticks the wrong box must
    be told, not silently left on Tier 1."""

    def _policy(self, reservation, production, closing):
        return frappe.get_doc(
            {
                "doctype": "URY Branch Stock Policy",
                "branch": BRANCH,
                "reservation_control_enabled": reservation,
                "realtime_production_posting_enabled": production,
                "closing_reconciliation_enabled": closing,
            }
        )

    def test_production_without_reservation_is_rejected(self):
        with self.assertRaises(frappe.ValidationError):
            self._policy(0, 1, 0).validate()

    def test_closing_without_production_is_rejected(self):
        with self.assertRaises(frappe.ValidationError):
            self._policy(1, 0, 1).validate()

    def test_closing_only_is_rejected(self):
        with self.assertRaises(frappe.ValidationError):
            self._policy(0, 0, 1).validate()

    def test_legal_states_validate(self):
        for state in ((0, 0, 0), (1, 0, 0), (1, 1, 0), (1, 1, 1)):
            with self.subTest(state=state):
                self._policy(*state).validate()

    def test_enabling_stamps_actor_and_time(self):
        doc = self._policy(1, 0, 0)
        doc.validate()
        self.assertEqual(doc.enabled_by, frappe.session.user)
        self.assertTrue(doc.enabled_on)

    def test_all_off_does_not_stamp(self):
        doc = self._policy(0, 0, 0)
        doc.validate()
        self.assertFalse(doc.enabled_by)
        self.assertFalse(doc.enabled_on)
