# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Item 5 (dashboard tier toggle) tests for
`ury.ury.api.ury_branch_stock_policy_ui`.

These are static/unit tests using mocks -- no bench/site required -- in the
same FrappeTestCase + mock pattern established by
`ury/ury/api/test_ury_stock_policy.py` and
`ury/ury/doctype/ury_branch_stock_policy/test_ury_branch_stock_policy.py`.

What is under test:

1. The read endpoint (`get_branch_stock_authority`) reports the right named
   tier for each of the four legal gate tuples, and only surfaces
   `enabled_by`/`enabled_on` when some gate is on.
2. The write endpoint (`set_branch_stock_authority_tier`):
   - rejects a caller without `System Manager`,
   - rejects any tier name outside the four legal ones (the server-side
     re-validation the task requires, independent of the frontend only
     being able to construct legal tiers),
   - on a legal tier + an authorized caller, writes exactly the matching
     gate tuple onto the doctype via `.save()` (so the controller's own
     validation/audit stamping still runs), and
   - lets a `frappe.throw` raised by the underlying `.save()` (e.g. the
     doctype controller rejecting an illegal combination) propagate
     verbatim rather than being caught/reworded.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_branch_stock_policy_ui import (
    STOCK_AUTHORITY_TIER_WRITE_ROLES,
    TIER_1_NATIVE,
    TIER_2_RESERVATIONS,
    TIER_3_PRODUCTION,
    TIER_4_FULL_ENFORCEMENT,
    get_branch_stock_authority,
    set_branch_stock_authority_tier,
)
from ury.ury.api.ury_stock_policy import clear_branch_stock_policy_cache

BRANCH = "Test Branch UI"


class TestGetBranchStockAuthority(FrappeTestCase):
    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=True)
    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_no_row_defaults_to_tier_1_with_no_audit_fields(self, mock_get_value, _perm):
        mock_get_value.return_value = None
        result = get_branch_stock_authority(BRANCH)
        self.assertEqual(result["tier"], TIER_1_NATIVE)
        self.assertIsNone(result["enabled_by"])
        self.assertIsNone(result["enabled_on"])

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.db.get_value")
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=True)
    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_reservations_only_tier_and_audit_fields_surfaced(
        self, mock_policy_get_value, _perm, mock_ui_get_value
    ):
        mock_policy_get_value.return_value = {
            "reservation_control_enabled": 1,
            "realtime_production_posting_enabled": 0,
            "closing_reconciliation_enabled": 0,
        }
        mock_ui_get_value.return_value = {"enabled_by": "manager@example.com", "enabled_on": "2026-01-01 10:00:00"}

        result = get_branch_stock_authority(BRANCH)

        self.assertEqual(result["tier"], TIER_2_RESERVATIONS)
        self.assertEqual(result["enabled_by"], "manager@example.com")
        self.assertEqual(result["enabled_on"], "2026-01-01 10:00:00")

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=True)
    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    def test_full_enforcement_tier(self, mock_get_value, _perm):
        mock_get_value.return_value = {
            "reservation_control_enabled": 1,
            "realtime_production_posting_enabled": 1,
            "closing_reconciliation_enabled": 1,
        }
        result = get_branch_stock_authority(BRANCH)
        self.assertEqual(result["tier"], TIER_4_FULL_ENFORCEMENT)

    def test_missing_branch_raises(self):
        with self.assertRaises(frappe.ValidationError):
            get_branch_stock_authority(None)

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=False)
    def test_no_read_permission_raises(self, _perm):
        with self.assertRaises(frappe.PermissionError):
            get_branch_stock_authority(BRANCH)


class TestSetBranchStockAuthorityTier(FrappeTestCase):
    def setUp(self):
        clear_branch_stock_policy_cache()

    def tearDown(self):
        clear_branch_stock_policy_cache()

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.get_roles", return_value=["URY Manager"])
    def test_non_system_manager_rejected(self, _roles):
        with self.assertRaises(frappe.PermissionError):
            set_branch_stock_authority_tier(BRANCH, TIER_2_RESERVATIONS, actor="manager@example.com")

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=True)
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.get_roles", return_value=list(STOCK_AUTHORITY_TIER_WRITE_ROLES))
    def test_illegal_tier_name_rejected_server_side(self, _roles, _perm):
        with self.assertRaises(frappe.ValidationError):
            set_branch_stock_authority_tier(
                BRANCH, "Some Illegal Tier Name", actor="sysmanager@example.com"
            )

    @patch("ury.ury.api.ury_stock_policy.frappe.db.get_value")
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.db.get_value")
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.db.exists", return_value=False)
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.new_doc")
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=True)
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.get_roles", return_value=list(STOCK_AUTHORITY_TIER_WRITE_ROLES))
    def test_legal_tier_writes_exact_gate_tuple_and_saves(
        self, _roles, _perm, mock_new_doc, mock_exists, mock_ui_get_value, mock_policy_get_value
    ):
        doc = MagicMock()
        mock_new_doc.return_value = doc

        # After save(), the read-back should see the tier we just set.
        mock_policy_get_value.return_value = {
            "reservation_control_enabled": 1,
            "realtime_production_posting_enabled": 1,
            "closing_reconciliation_enabled": 0,
        }
        mock_ui_get_value.return_value = {"enabled_by": "sysmanager@example.com", "enabled_on": "2026-01-01 10:00:00"}

        result = set_branch_stock_authority_tier(
            BRANCH, TIER_3_PRODUCTION, actor="sysmanager@example.com"
        )

        doc.set.assert_any_call("reservation_control_enabled", 1)
        doc.set.assert_any_call("realtime_production_posting_enabled", 1)
        doc.set.assert_any_call("closing_reconciliation_enabled", 0)
        doc.save.assert_called_once_with(ignore_permissions=False)
        self.assertEqual(result["tier"], TIER_3_PRODUCTION)

    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.db.exists", return_value=True)
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.get_doc")
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.has_permission", return_value=True)
    @patch("ury.ury.api.ury_branch_stock_policy_ui.frappe.get_roles", return_value=list(STOCK_AUTHORITY_TIER_WRITE_ROLES))
    def test_backend_rejection_from_save_propagates_verbatim(
        self, _roles, _perm, mock_get_doc, _exists
    ):
        doc = MagicMock()
        doc.save.side_effect = frappe.ValidationError("Realtime Production Posting requires Reservation Control")
        mock_get_doc.return_value = doc

        with self.assertRaisesRegex(frappe.ValidationError, "Realtime Production Posting requires"):
            set_branch_stock_authority_tier(BRANCH, TIER_3_PRODUCTION, actor="sysmanager@example.com")

    def test_missing_branch_raises(self):
        with self.assertRaises(frappe.ValidationError):
            set_branch_stock_authority_tier(None, TIER_1_NATIVE, actor="sysmanager@example.com")
