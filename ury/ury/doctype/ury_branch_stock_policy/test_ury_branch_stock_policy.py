# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Item 1 hardening tests: `URY Branch Stock Policy.on_update` / `on_trash`
must invalidate the request-scoped tier memo in `ury_stock_policy`.

These are static/unit tests using mocks -- no bench/site required to reason
about them -- following the FrappeTestCase + mock pattern established in
ury/ury/api/test_ury_feature_flags.py.

This is a hardening change, not a bug fix: the read-then-write-then-read-
stale sequence this closes is not reachable in the web request path today
(see tracks/sa-pos-followups-and-ux/ITEMS_1_2_3.md Item 1). It removes a
latent correctness hazard for migration/background-job processes and for
bench test-suite isolation.
"""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_stock_policy import (
    clear_branch_stock_policy_cache,
    get_branch_stock_policy,
)
from ury.ury.doctype.ury_branch_stock_policy.ury_branch_stock_policy import (
    URYBranchStockPolicy,
)

ALL_OFF_ROW = {
    "reservation_control_enabled": 0,
    "realtime_production_posting_enabled": 0,
    "closing_reconciliation_enabled": 0,
}

RESERVATION_ON_ROW = {
    "reservation_control_enabled": 1,
    "realtime_production_posting_enabled": 0,
    "closing_reconciliation_enabled": 0,
}


def _make_doc(branch):
    """A bare, unsaved controller instance -- enough to call on_update/
    on_trash directly without touching the database."""
    doc = URYBranchStockPolicy(
        {"doctype": "URY Branch Stock Policy", "branch": branch}
    )
    return doc


class TestURYBranchStockPolicyCacheInvalidation(FrappeTestCase):
    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_on_update_invalidates_stale_memo_for_its_branch(self, mock_get_value):
        # Populate the memo for branch B with the all-off row.
        mock_get_value.return_value = ALL_OFF_ROW
        policy = get_branch_stock_policy("Branch B")
        self.assertFalse(policy.reservation_control_enabled)

        # A write to branch B's policy row.
        _make_doc("Branch B").on_update()

        # The underlying data has since changed; the next read must not
        # see the old memoised value.
        mock_get_value.return_value = RESERVATION_ON_ROW
        policy = get_branch_stock_policy("Branch B")
        self.assertTrue(policy.reservation_control_enabled)

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_on_update_is_branch_scoped(self, mock_get_value):
        # Populate memos for both branch B and branch C with all-off.
        mock_get_value.return_value = ALL_OFF_ROW
        get_branch_stock_policy("Branch B")
        get_branch_stock_policy("Branch C")

        # Only branch B is written.
        _make_doc("Branch B").on_update()

        # Branch B's memo was dropped -- a changed row is now visible.
        mock_get_value.return_value = RESERVATION_ON_ROW
        self.assertTrue(
            get_branch_stock_policy("Branch B").reservation_control_enabled
        )

        # Branch C's memo must have survived branch B's invalidation: even
        # though `frappe.db.get_value` would now return the "on" row too,
        # the still-cached "off" value for C must still be served.
        self.assertFalse(
            get_branch_stock_policy("Branch C").reservation_control_enabled
        )

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_on_trash_clears_the_same_entry(self, mock_get_value):
        mock_get_value.return_value = ALL_OFF_ROW
        get_branch_stock_policy("Branch B")

        _make_doc("Branch B").on_trash()

        mock_get_value.return_value = RESERVATION_ON_ROW
        self.assertTrue(
            get_branch_stock_policy("Branch B").reservation_control_enabled
        )

    def test_invalidator_raising_does_not_break_on_update(self):
        # Simulate the invalidator itself misbehaving (in production it
        # already swallows all exceptions -- ury_stock_policy.py:229-230 --
        # this asserts the controller does not add a new failure mode on
        # top of that contract, i.e. a document save is never broken by
        # cache-invalidation failing).
        doc = _make_doc("Branch B")
        with patch(
            "ury.ury.api.ury_stock_policy.clear_branch_stock_policy_cache",
            side_effect=Exception("boom"),
        ):
            try:
                doc.on_update()
                doc.on_trash()
            except Exception as exc:  # pragma: no cover - failure path
                self.fail(
                    "on_update/on_trash must not propagate an exception "
                    f"from the cache invalidator, got: {exc!r}"
                )
