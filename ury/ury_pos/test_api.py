import unittest
from unittest.mock import patch, MagicMock
import frappe
from ury.ury_pos.api import merge_bills
from ury.ury_pos.api import create_customer
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock
from ury.ury_pos.api import searchPosInvoice
from ury.ury_pos.api import get_split_group, getPosInvoiceItems
from ury.ury_pos.api import getRestaurantMenu, resolve_restaurant_menu
from ury.ury_pos.api import submit_checklist
import json
from datetime import date, datetime


class TestGetRestaurantMenuPhase1(unittest.TestCase):
    """Phase 1 regression: getRestaurantMenu() must remain a thin wrapper
    around resolve_restaurant_menu() with byte-identical behavior for
    existing (staff) callers."""

    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.resolve_restaurant_menu")
    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    def test_getRestaurantMenu_delegates_with_resolved_branch_and_cashier(
        self, mock_get_roles, mock_get_doc, mock_resolve, mock_getBranch
    ):
        mock_get_roles.return_value = ["URY Cashier"]

        mock_role = MagicMock()
        mock_role.role = "URY Cashier"
        mock_pos_profile = MagicMock()
        mock_pos_profile.role_allowed_for_billing = [mock_role]
        mock_get_doc.return_value = mock_pos_profile

        mock_getBranch.return_value = "Branch A"
        mock_resolve.return_value = {"items": [], "modified_time": None, "name": "Menu A"}

        result = getRestaurantMenu("Test POS Profile", room="Room 1", order_type="Dine In")

        mock_resolve.assert_called_once_with("Branch A", "Room 1", "Dine In", True)
        self.assertEqual(result, {"items": [], "modified_time": None, "name": "Menu A"})

    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    def test_getRestaurantMenu_non_cashier_role(self, mock_get_roles, mock_get_doc, mock_getBranch):
        mock_get_roles.return_value = ["Some Other Role"]
        mock_pos_profile = MagicMock()
        mock_pos_profile.role_allowed_for_billing = []
        mock_get_doc.return_value = mock_pos_profile
        mock_getBranch.return_value = "Branch A"

        with patch("ury.ury_pos.api.resolve_restaurant_menu") as mock_resolve:
            mock_resolve.return_value = {"items": [], "modified_time": None, "name": "Menu A"}
            getRestaurantMenu("Test POS Profile")
            mock_resolve.assert_called_once_with("Branch A", None, None, False)


class TestMergeBillsSEC07(unittest.TestCase):

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.rollback")
    def test_merge_bills_no_permission_primary(self, mock_rollback, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_secondary = MagicMock()
        mock_get_doc.side_effect = [mock_primary, mock_secondary]
        
        # Primary doc fails permission check
        mock_has_permission.side_effect = lambda doctype, ptype, doc: doc == mock_secondary
        
        with self.assertRaises(frappe.PermissionError):
            merge_bills("INV-01", "INV-02")
            
        mock_rollback.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.rollback")
    def test_merge_bills_no_permission_secondary(self, mock_rollback, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_secondary = MagicMock()
        mock_get_doc.side_effect = [mock_primary, mock_secondary]
        
        # Secondary doc fails permission check
        mock_has_permission.side_effect = lambda doctype, ptype, doc: doc == mock_primary
        
        with self.assertRaises(frappe.PermissionError):
            merge_bills("INV-01", "INV-02")
            
        mock_rollback.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.rollback")
    @patch("ury.ury_pos.api.frappe.throw")
    @patch("ury.ury_pos.api.frappe.log_error")
    def test_merge_bills_different_branches(self, mock_log_error, mock_throw, mock_rollback, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_primary.branch = "Branch A"
        mock_primary.docstatus = 0
        mock_secondary = MagicMock()
        mock_secondary.branch = "Branch B"
        mock_secondary.docstatus = 0
        mock_get_doc.side_effect = [mock_primary, mock_secondary]
        
        mock_has_permission.return_value = True
        
        # In api.py, frappe.throw is called, which we mock to raise an Exception.
        # But api.py has a generic `except Exception as e:` that swallows it and logs it.
        # So we just verify that frappe.throw was called appropriately.
        mock_throw.side_effect = Exception("Cannot merge bills from different branches.")
        
        merge_bills("INV-01", "INV-02")
        
        mock_throw.assert_called_once_with("Cannot merge bills from different branches.", frappe.PermissionError)
        mock_rollback.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.set_value")
    @patch("ury.ury_pos.api.frappe.db.commit")
    def test_merge_bills_success(self, mock_commit, mock_set_value, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_primary.name = "INV-01"
        mock_primary.branch = "Branch A"
        mock_primary.docstatus = 0
        mock_primary.custom_merged_pos_invoice = None
        mock_primary.items = [MagicMock(item_code="Item 1")]
        
        mock_secondary = MagicMock()
        mock_secondary.name = "INV-02"
        mock_secondary.branch = "Branch A"
        mock_secondary.docstatus = 0
        mock_secondary.custom_merged_pos_invoice = None
        mock_secondary.items = [MagicMock(item_code="Item 2")]
        
        # When update_merge_details calls frappe.get_doc again
        def get_doc_side_effect(doctype, name):
            if name == "INV-01":
                return mock_primary
            elif name == "INV-02":
                return mock_secondary
            return MagicMock()
            
        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        
        result = merge_bills("INV-01", "INV-02")
        
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["name"], "INV-01")
        mock_commit.assert_called_once()
        self.assertEqual(mock_set_value.call_count, 2)
        mock_primary.save.assert_called_once_with(ignore_version=True)
        mock_secondary.save.assert_called_once_with(ignore_version=True)

if __name__ == "__main__":
    unittest.main()

class TestSearchPosInvoiceBranchScoping(FrappeTestCase):

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.session")
    def test_normal_user_branch_a(self, mock_session, mock_get_branch, mock_enrich, mock_get_all):
        # Normal Branch A user → sees only Branch A invoices.
        mock_session.user = "cashier@branch_a.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = [{"name": "INV-001"}]
        mock_enrich.side_effect = lambda x: x
        
        result = searchPosInvoice("INV", "Recently Paid")
        
        self.assertEqual(result["data"][0]["name"], "INV-001")
        
        # Verify get_all was called with "branch": "Branch A"
        called_args = mock_get_all.call_args[1]
        self.assertEqual(called_args["filters"]["branch"], "Branch A")
        self.assertEqual(called_args["filters"]["status"], "Paid")

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.session")
    def test_normal_user_branch_b_unbilled(self, mock_session, mock_get_branch, mock_enrich, mock_get_all):
        # Normal Branch B user → sees only Branch B invoices.
        mock_session.user = "cashier@branch_b.com"
        mock_get_branch.return_value = "Branch B"
        mock_get_all.return_value = []
        mock_enrich.side_effect = lambda x: x
        
        searchPosInvoice("CUST", "Unbilled")
        
        # Verify get_all was called with "branch": "Branch B" and unbilled statuses
        called_args = mock_get_all.call_args[1]
        self.assertEqual(called_args["filters"]["branch"], "Branch B")
        self.assertEqual(called_args["filters"]["status"], "draft")
        self.assertEqual(called_args["filters"]["invoice_printed"], 0)

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.session")
    def test_search_text_cannot_bypass_branch(self, mock_session, mock_get_branch, mock_enrich, mock_get_all):
        # Search text cannot bypass the branch filter.
        mock_session.user = "cashier@branch_a.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_all.return_value = []
        mock_enrich.side_effect = lambda x: x
        
        # User tries to search for a branch B invoice explicitly
        searchPosInvoice("Branch B Invoice", "Draft")
        
        # The filter must still forcefully include branch A
        called_args = mock_get_all.call_args[1]
        self.assertEqual(called_args["filters"]["branch"], "Branch A")
        
        # Ensure the query went into or_filters, not the main branch filters
        self.assertEqual(called_args["or_filters"][0][2], "%branch b invoice%")

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api._enrich_split_group_meta")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.session")
    def test_administrator_without_branch(self, mock_session, mock_get_roles, mock_get_branch, mock_enrich, mock_get_all):
        # Administrator without branch mapping should not have branch filter
        mock_session.user = "Administrator"
        mock_get_roles.return_value = ["Administrator"]
        mock_get_branch.side_effect = frappe.ValidationError("No branch")
        mock_get_all.return_value = []
        mock_enrich.side_effect = lambda x: x
        
        searchPosInvoice("TEST", "Recently Paid")
        
        called_args = mock_get_all.call_args[1]
        # Should NOT contain branch in filters
        self.assertNotIn("branch", called_args["filters"])
# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

class TestURYPosAPI(FrappeTestCase):
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_get_split_group_unauthorized(self, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Test Branch"
        mock_get_doc.return_value = mock_invoice
        
        # Scenario 1: No read permission
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            get_split_group("POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))
        
        # Scenario 2: Wrong branch
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Other Branch"
        with self.assertRaises(frappe.PermissionError) as context:
            get_split_group("POS-INV-001")
        self.assertIn("outside your active branch", str(context.exception))
        
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.get_doc")
    def test_getPosInvoiceItems_unauthorized(self, mock_get_doc, mock_has_permission, mock_getBranch):
        mock_invoice = MagicMock()
        mock_invoice.branch = "Test Branch"
        mock_get_doc.return_value = mock_invoice
        
        # Scenario 1: No read permission
        mock_has_permission.return_value = False
        with self.assertRaises(frappe.PermissionError) as context:
            getPosInvoiceItems("POS-INV-001")
        self.assertIn("Not permitted to view this order", str(context.exception))
        
        # Scenario 2: Wrong branch
        mock_has_permission.return_value = True
        mock_getBranch.return_value = "Other Branch"
        with self.assertRaises(frappe.PermissionError) as context:
            getPosInvoiceItems("POS-INV-001")
        self.assertIn("outside your active branch", str(context.exception))


class TestCreateCustomerLinkId(unittest.TestCase):
    """Regression: success payload must expose Customer link `name`, which
    can differ from display `customer_name` under series naming."""

    @patch("ury.ury_pos.api.validate_phone_number")
    @patch("ury.ury_pos.api.frappe.db.commit")
    @patch("ury.ury_pos.api.frappe.db.exists", return_value=True)
    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    def test_returns_inserted_name_distinct_from_display(
        self, mock_has_permission, mock_get_doc, _mock_exists, mock_commit, mock_validate
    ):
        mock_has_permission.return_value = True
        customer_doc = MagicMock()
        customer_doc.name = None

        def _insert(*_args, **_kwargs):
            # Simulate naming series assigning a link id ≠ display name.
            customer_doc.name = "CUST-00042"

        customer_doc.insert.side_effect = _insert
        mock_get_doc.return_value = customer_doc

        result = create_customer("Alice Restaurant Guest", "+919876543210")

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["name"], "CUST-00042")
        self.assertEqual(result["customer_name"], "Alice Restaurant Guest")
        self.assertNotEqual(result["name"], result["customer_name"])
        mock_commit.assert_called_once()
        mock_validate.assert_called_once()


import frappe
import unittest
from ury.ury_pos.api import create_customer
from ury.ury.tests.factories import make_user

class TestUryPosApi(unittest.TestCase):
    def setUp(self):
        # Create a test user without Customer creation rights
        if not frappe.db.exists("User", "test_unauthorized_user@example.com"):
            user = frappe.get_doc({
                "doctype": "User",
                "email": "test_unauthorized_user@example.com",
                "first_name": "Test Unauthorized",
                "send_welcome_email": 0
            })
            user.insert(ignore_permissions=True)
            # Remove any roles to ensure no permissions
            user.roles = []
            user.save(ignore_permissions=True)

        # Create a test user with Customer creation rights
        if not frappe.db.exists("User", "test_authorized_user@example.com"):
            make_user(
                email="test_authorized_user@example.com",
                roles=["System Manager"],
                first_name="Test Authorized",
            )

    def tearDown(self):
        frappe.set_user("Administrator")
        
        # Cleanup created customers
        if frappe.db.exists("Customer", "Test Auth Customer"):
            frappe.delete_doc("Customer", "Test Auth Customer", ignore_permissions=True, force=1)

    def test_unauthorized_create_customer(self):
        frappe.set_user("test_unauthorized_user@example.com")
        
        with self.assertRaises(frappe.PermissionError):
            create_customer("Test Unauth Customer", "1234567890")
            
        self.assertFalse(frappe.db.exists("Customer", "Test Unauth Customer"))

    def test_authorized_create_customer(self):
        frappe.set_user("Administrator")
        
        result = create_customer("Test Auth Customer", "+919876543210")
        
        self.assertEqual(result.get("status"), "success")
        self.assertTrue(frappe.db.exists("Customer", "Test Auth Customer"))



class TestGetAllowedPosProfiles(unittest.TestCase):
    @patch("ury.ury_pos.api.frappe.get_all")
    def test_no_company_returns_empty(self, mock_get_all):
        from ury.ury_pos.api import _get_allowed_pos_profiles

        result = _get_allowed_pos_profiles("", "cashier@example.com")
        self.assertEqual(result, [])
        mock_get_all.assert_not_called()

    @patch("ury.ury_pos.api.frappe.get_all")
    def test_open_profile_included_when_no_users(self, mock_get_all):
        from ury.ury_pos.api import _get_allowed_pos_profiles

        mock_get_all.side_effect = [
            [{"name": "POS-Profile-1"}],
            [],
            [{
                "name": "POS-Profile-1",
                "company": "Test Co",
                "branch": "Branch A",
                "restaurant": "Rest A",
                "custom_enable_multiple_cashier": 0,
                "custom_daily_pos_close": 0,
            }],
        ]

        result = _get_allowed_pos_profiles("Test Co", "cashier@example.com")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["name"], "POS-Profile-1")

    @patch("ury.ury_pos.api.frappe.get_all")
    def test_matching_user_included(self, mock_get_all):
        from ury.ury_pos.api import _get_allowed_pos_profiles

        mock_get_all.side_effect = [
            [{"name": "POS-Profile-1"}],
            [{"parent": "POS-Profile-1", "user": "cashier@example.com"}],
            [{
                "name": "POS-Profile-1",
                "company": "Test Co",
                "branch": "Branch A",
                "restaurant": "Rest A",
                "custom_enable_multiple_cashier": 0,
                "custom_daily_pos_close": 0,
            }],
        ]

        result = _get_allowed_pos_profiles("Test Co", "cashier@example.com")
        self.assertEqual(len(result), 1)

    @patch("ury.ury_pos.api.frappe.get_all")
    def test_other_user_excluded(self, mock_get_all):
        from ury.ury_pos.api import _get_allowed_pos_profiles

        mock_get_all.side_effect = [
            [{"name": "POS-Profile-1"}],
            [{"parent": "POS-Profile-1", "user": "other@example.com"}],
            [],
        ]

        result = _get_allowed_pos_profiles("Test Co", "cashier@example.com")
        self.assertEqual(result, [])


class TestGetPOSOpeningScreenData(unittest.TestCase):
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.validate_pos_close")
    @patch("ury.ury_pos.api.getPosProfile")
    @patch("ury.ury_pos.api._get_allowed_pos_profiles")
    @patch("ury.ury_pos.api.frappe.db.get_default")
    @patch("ury.ury_pos.api.frappe.defaults.get_user_default")
    @patch("ury.ury_pos.api.frappe.session")
    def test_returns_full_context(
        self,
        mock_session,
        mock_user_default,
        mock_global_default,
        mock_allowed,
        mock_get_pos_profile,
        mock_validate_close,
        mock_has_permission,
        mock_get_all,
    ):
        from ury.ury_pos.api import get_pos_opening_screen_data

        mock_session.user = "cashier@example.com"
        mock_user_default.return_value = "Test Co"
        mock_global_default.return_value = None
        mock_allowed.return_value = [{"name": "POS-Profile-1", "company": "Test Co"}]
        mock_get_pos_profile.return_value = {
            "pos_profile": "POS-Profile-1",
            "branch": "Branch A",
            "company": "Test Co",
            "restaurant": "Rest A",
            "multiple_cashier": 1,
            "owner": "owner@example.com",
            "custom_daily_pos_close": 1,
        }

        mock_pos_doc = MagicMock()
        mock_pos_doc.payments = [
            MagicMock(mode_of_payment="Cash"),
            MagicMock(mode_of_payment="Card"),
        ]

        def get_doc_side_effect(doctype, name):
            if doctype == "POS Profile" and name == "POS-Profile-1":
                return mock_pos_doc
            return MagicMock()

        with patch(
            "ury.ury_pos.api._get_main_cashier_status"
        ) as mock_multi_cashier, patch(
            "ury.ury_pos.api.frappe.get_doc", side_effect=get_doc_side_effect
        ):
            mock_validate_close.return_value = "Success"
            mock_has_permission.side_effect = lambda doctype, perm: perm == "create" or perm == "submit"
            mock_multi_cashier.return_value = {
                "enabled": True,
                "main_cashier_configured": True,
                "main_cashier_open": True,
            }
            mock_get_all.return_value = [
                {"name": "POS-OPE-0001", "company": "Test Co", "pos_profile": "POS-Profile-1", "status": "Open"}
            ]

            result = get_pos_opening_screen_data()

        self.assertEqual(result["user"], "cashier@example.com")
        self.assertEqual(result["company"], "Test Co")
        self.assertEqual(len(result["allowed_profiles"]), 1)
        self.assertEqual(result["allowed_profiles"][0]["name"], "POS-Profile-1")
        self.assertEqual(result["selected_profile"], "POS-Profile-1")
        self.assertEqual(result["branch"], "Branch A")
        self.assertEqual(result["restaurant"], "Rest A")
        self.assertTrue(result["multi_cashier"]["enabled"])
        self.assertTrue(result["multi_cashier"]["main_cashier_configured"])
        self.assertTrue(result["multi_cashier"]["main_cashier_open"])
        self.assertEqual(len(result["payment_modes"]), 2)
        self.assertEqual(result["payment_modes"][0]["opening_amount"], 0.0)
        self.assertFalse(result["daily_close_pending"])
        self.assertTrue(result["permissions"]["create"])
        self.assertTrue(result["permissions"]["submit"])
        self.assertEqual(len(result["open_entries"]), 1)

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.getPosProfile")
    @patch("ury.ury_pos.api._get_allowed_pos_profiles")
    @patch("ury.ury_pos.api.frappe.db.get_default")
    @patch("ury.ury_pos.api.frappe.defaults.get_user_default")
    @patch("ury.ury_pos.api.frappe.session")
    def test_handles_missing_company_and_profile_gracefully(
        self,
        mock_session,
        mock_user_default,
        mock_global_default,
        mock_allowed,
        mock_get_pos_profile,
        mock_has_permission,
        mock_get_all,
    ):
        from ury.ury_pos.api import get_pos_opening_screen_data

        mock_session.user = "cashier@example.com"
        mock_user_default.return_value = None
        mock_global_default.return_value = None
        mock_allowed.return_value = []
        mock_get_pos_profile.side_effect = Exception("No branch")
        mock_has_permission.return_value = False
        mock_get_all.return_value = []

        result = get_pos_opening_screen_data()

        self.assertIsNone(result["company"])
        self.assertEqual(result["allowed_profiles"], [])
        self.assertIsNone(result["selected_profile"])
        self.assertEqual(result["payment_modes"], [])
        self.assertFalse(result["permissions"]["create"])
        self.assertFalse(result["permissions"]["submit"])
        self.assertEqual(result["open_entries"], [])

class TestSubmitChecklistSEC10(FrappeTestCase):
    """Test cases for submit_checklist function."""

    def _create_mock_log_doc(self):
        """Create a properly-configured MagicMock for log_doc that maintains an items list."""
        # Create a real list to hold items
        items_list = []

        # Create the mock document
        mock_log_doc = MagicMock()
        mock_log_doc.name = "URY-POS-CHECKLIST-LOG-001"
        mock_log_doc.status = None  # Will be set by submit_checklist
        mock_log_doc.completed_by = None
        mock_log_doc.completed_at = None

        # Configure the items property to return the real list
        mock_log_doc.items = items_list

        # Mock the set() method to reset items when called with "items"
        def mock_set(key, value):
            if key == "items":
                items_list.clear()
                mock_log_doc.items = items_list

        mock_log_doc.set = mock_set

        # Mock the append() method to actually append to the items list
        def mock_append(key, value):
            if key == "items":
                items_list.append(frappe._dict(value))

        mock_log_doc.append = mock_append

        return mock_log_doc

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.utils.now")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_all_mandatory_checked(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_db_exists, mock_now, mock_new_doc, mock_get_all
    ):
        """Test that submit_checklist returns status='Complete' when all mandatory items are checked."""
        # Setup mocks
        mock_session.user = "test_user@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_db_exists.return_value = True
        mock_now.return_value = "2025-01-15 10:30:00"

        # Mock configured items - all mandatory
        mock_configured_items = [
            MagicMock(item_label="Opening Check", is_mandatory=True),
            MagicMock(item_label="Stock Count", is_mandatory=True),
        ]

        # Mock existing log query returns empty (no existing log).
        mock_get_all.side_effect = [mock_configured_items, [], [], [], []]

        # Mock new document creation with properly-configured mock
        mock_log_doc = self._create_mock_log_doc()
        mock_log_doc.name = "URY-POS-CHECKLIST-LOG-001"
        mock_new_doc.return_value = mock_log_doc

        # Prepare checklist items - all checked
        items = json.dumps([
            {"item_label": "Opening Check", "is_checked": True, "remarks": ""},
            {"item_label": "Stock Count", "is_checked": True, "remarks": ""},
        ])

        # Call the function
        result = submit_checklist(
            pos_profile="POS-Profile-001",
            checklist_type="Opening",
            items=items
        )

        # Assertions
        # Verify that all mandatory items were appended
        self.assertEqual(len(mock_log_doc.items), 2)
        # Verify that both items have is_mandatory=True and is_checked=True
        for item in mock_log_doc.items:
            self.assertTrue(item.is_mandatory)
            self.assertTrue(item.is_checked)
        # Verify status is "Complete" because all mandatory items are checked
        self.assertEqual(result["status"], "Complete")
        self.assertEqual(mock_log_doc.status, "Complete")
        self.assertEqual(result["name"], "URY-POS-CHECKLIST-LOG-001")
        mock_log_doc.save.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.utils.now")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_mandatory_unchecked(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_db_exists, mock_now, mock_new_doc, mock_get_all
    ):
        """Test that submit_checklist returns status='In Progress' when at least one mandatory item is unchecked."""
        # Setup mocks
        mock_session.user = "test_user@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_db_exists.return_value = True
        mock_now.return_value = "2025-01-15 10:30:00"

        # Mock configured items - mix of mandatory and optional
        mock_configured_items = [
            MagicMock(item_label="Opening Check", is_mandatory=True),
            MagicMock(item_label="Stock Count", is_mandatory=True),
            MagicMock(item_label="Optional Verification", is_mandatory=False),
        ]

        # Mock existing log query returns empty (no existing log).
        # Call order: URY Checklist Item, Dependent Checklist, URY POS Checklist Log.
        mock_get_all.side_effect = [mock_configured_items, [], []]

        # Mock new document creation with properly-configured mock
        mock_log_doc = self._create_mock_log_doc()
        mock_log_doc.name = "URY-POS-CHECKLIST-LOG-002"
        mock_new_doc.return_value = mock_log_doc

        # Prepare checklist items - one mandatory unchecked
        items = json.dumps([
            {"item_label": "Opening Check", "is_checked": True, "remarks": ""},
            {"item_label": "Stock Count", "is_checked": False, "remarks": "Pending"},
            {"item_label": "Optional Verification", "is_checked": False, "remarks": ""},
        ])

        # Call the function
        result = submit_checklist(
            pos_profile="POS-Profile-001",
            checklist_type="Opening",
            items=items
        )

        # Assertions
        # Verify that all items were appended
        self.assertEqual(len(mock_log_doc.items), 3)
        # Verify that mandatory items have correct is_mandatory flag
        opening_check = mock_log_doc.items[0]
        stock_count = mock_log_doc.items[1]
        optional_verification = mock_log_doc.items[2]

        self.assertTrue(opening_check.is_mandatory)
        self.assertTrue(opening_check.is_checked)

        self.assertTrue(stock_count.is_mandatory)
        self.assertFalse(stock_count.is_checked)  # This one is unchecked

        self.assertFalse(optional_verification.is_mandatory)
        self.assertFalse(optional_verification.is_checked)

        # Verify status is "In Progress" because at least one mandatory item is unchecked
        self.assertEqual(result["status"], "In Progress")
        self.assertEqual(mock_log_doc.status, "In Progress")
        self.assertEqual(result["name"], "URY-POS-CHECKLIST-LOG-002")
        mock_log_doc.save.assert_called_once()

    @patch("ury.ury_pos.api.frappe.throw")
    @patch("ury.ury_pos.api.frappe.db.get_value")
    @patch("ury.ury_pos.api.getBranch")
    def test_validate_checklist_branch_cross_branch_rejection(
        self, mock_get_branch, mock_db_get_value, mock_throw
    ):
        """Test that submit_checklist raises PermissionError when user's branch doesn't match POS Profile branch."""
        # Setup mocks for _validate_checklist_branch (no mock of the validation function itself)
        mock_get_branch.return_value = "Branch A"  # Session user's branch

        # Mock frappe.db.get_value to return the POS Profile's branch (different from session user's)
        mock_db_get_value.return_value = "Branch B"

        # Make frappe.throw actually raise the exception
        def throw_side_effect(message, exception_class=None):
            if exception_class:
                raise exception_class(message)
            else:
                raise frappe.ValidationError(message)

        mock_throw.side_effect = throw_side_effect

        # Prepare minimal checklist items
        items = json.dumps([
            {"item_label": "Opening Check", "is_checked": True, "remarks": ""},
        ])

        # Call the function and expect it to raise PermissionError
        with self.assertRaises(frappe.PermissionError):
            submit_checklist(
                pos_profile="POS-Profile-Branch-B",
                checklist_type="Opening",
                items=items
            )


class TestDependentChecklistBridge(FrappeTestCase):
    """Role-based Dependent Checklist (grillax port) surfaced through the
    legacy get_checklist/submit_checklist contract used by all POS frontends.
    Goals expand into their Quality Goal objectives; submissions create (or
    update) the user's Quality Review with per-objective statuses."""

    GOAL = "Opening Checklist Goal"

    def _dependent_rows(self, goal=None, option="POS Opening Entry", role="Cashier"):
        return [frappe._dict({
            "quality_checklist": goal or self.GOAL,
            "select_2": option,
            "role": role,
        })]

    def _goal_doc(self, goal=None, objectives=("Objective 1", "Objective 2")):
        doc = MagicMock()
        doc.objectives = [
            frappe._dict({"objective": o, "target": None, "uom": None})
            for o in objectives
        ]
        return doc

    def _review_doc(self, rows):
        doc = MagicMock()
        doc.reviews = [
            frappe._dict({"objective": o, "status": s, "review": r or ""})
            for o, s, *rest in rows
            for r in [rest[0] if rest else ""]
        ]
        return doc

    def _get_doc_side_effect(self, goal_objectives=None, review_rows=None):
        goal_objectives = goal_objectives or {}
        def side_effect(doctype, name=None):
            if doctype == "Quality Review":
                return self._review_doc(review_rows or [])
            return self._goal_doc(
                objectives=goal_objectives.get(name, ("Objective 1", "Objective 2"))
            )
        return side_effect

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_get_checklist_surfaces_objectives_as_items(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """A role-matched goal with no Quality Review yet expands into one
        mandatory item per Quality Goal objective (not the goal doc name),
        each carrying the goal for submit-time review creation."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = None  # no Quality Review yet
        mock_get_doc.side_effect = self._get_doc_side_effect()
        # Call order: URY Checklist Item, Dependent Checklist,
        # POS Opening Entry (period date), URY POS Checklist Log
        mock_get_all.side_effect = [[], self._dependent_rows(), [], []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(
            [item["item_label"] for item in result["items"]],
            ["Objective 1", "Objective 2"],
        )
        for item in result["items"]:
            self.assertEqual(item["is_mandatory"], 1)
            self.assertEqual(item["goal"], self.GOAL)
        self.assertNotEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_get_checklist_resurfaces_failed_alongside_unanswered(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """A Failed objective does not resurface; only objectives with no
        explicit result come back (unanswered first)."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = "QR-0001"
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Failed", "Printer broken"), ("Objective 2", "Open")]
        )
        mock_get_all.side_effect = [[], self._dependent_rows(), [frappe._dict({"posting_date": date.today()})], []]

        result = get_checklist("POS-Profile-001", "Opening")

        # Only the objective with no explicit result resurfaces; the Failed
        # one is a valid final response and stays hidden.
        self.assertEqual(
            [item["item_label"] for item in result["items"]], ["Objective 2"]
        )
        self.assertIsNone(result["items"][0]["status"])
        self.assertNotEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_get_checklist_submitted_with_failures_completes_gate(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """A submitted checklist completes the gate even with failed
        objectives -- FAIL is a valid final response and must not resurface
        or keep the user in the gate."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = "QR-0001"
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Failed", "Printer broken"), ("Objective 2", "Passed")]
        )
        mock_get_all.side_effect = [[], self._dependent_rows(), [frappe._dict({"posting_date": date.today()})], []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(result["items"], [])
        self.assertEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_get_checklist_open_objective_stays_pending(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """An objective still Open (no explicit result) keeps the gate open
        and resurfaces unanswered."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = "QR-0001"
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Passed"), ("Objective 2", "Open")]
        )
        mock_get_all.side_effect = [[], self._dependent_rows(), [frappe._dict({"posting_date": date.today()})], []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(
            [item["item_label"] for item in result["items"]], ["Objective 2"]
        )
        self.assertIsNone(result["items"][0]["status"])
        self.assertNotEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_get_checklist_complete_when_all_objectives_passed(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """When every objective on the user's review is Passed, nothing
        surfaces and the gate reports Complete."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = "QR-0001"
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Passed"), ("Objective 2", "Passed")]
        )
        mock_get_all.side_effect = [[], self._dependent_rows(), [frappe._dict({"posting_date": date.today()})], []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(result["items"], [])
        self.assertEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_get_checklist_ignores_goals_for_other_roles(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles
    ):
        """Goals whose Role is not assigned to the user never surface."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "waiter@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Waiter", "All"]
        mock_get_all.side_effect = [[], self._dependent_rows(role="Cashier"), []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(result["items"], [])
        self.assertEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_creates_quality_review(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists,
        mock_get_roles, mock_new_doc, mock_get_doc
    ):
        """Submitting checked objective items creates a Quality Review whose
        review rows mirror the user's checkboxes."""
        from ury.ury_pos.api import submit_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        # exists() during submit -> no review yet; final goals_pending
        # re-check -> the just-created review.
        mock_db_exists.side_effect = [None, "QR-0001"]
        mock_get_all.side_effect = [
            [],  # URY Checklist Item
            self._dependent_rows(),  # Dependent Checklist
            [],  # POS Opening Entry (period date -> today)
            [],  # URY POS Checklist Log
        ]

        review_doc = MagicMock()
        review_doc.reviews = []
        mock_new_doc.return_value = review_doc
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Passed"), ("Objective 2", "Passed")]
        )

        items = json.dumps([
            {"item_label": "Objective 1", "goal": self.GOAL, "status": "Passed", "remarks": "Done"},
            {"item_label": "Objective 2", "goal": self.GOAL, "status": "Passed", "remarks": ""},
        ])
        result = submit_checklist("POS-Profile-001", "Opening", items)

        mock_new_doc.assert_called_once_with("Quality Review")
        self.assertEqual(review_doc.goal, self.GOAL)
        self.assertEqual(review_doc.branch, "Branch A")
        self.assertEqual(review_doc.employee, "cashier@example.com")
        rows = [call.args[1] for call in review_doc.append.call_args_list if call.args[0] == "reviews"]
        self.assertEqual(
            [(row["objective"], row["status"], row["review"]) for row in rows],
            [("Objective 1", "Passed", "Done"), ("Objective 2", "Passed", "")],
        )
        review_doc.insert.assert_called_once()
        self.assertEqual(result["status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_updates_existing_review(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists,
        mock_get_roles, mock_new_doc, mock_get_doc
    ):
        """A resubmission must update the existing Quality Review (statuses
        folded into existing rows, missing objectives appended) instead of
        creating a duplicate."""
        from ury.ury_pos.api import submit_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.side_effect = ["QR-0001", "QR-0001"]
        mock_get_all.side_effect = [
            [],  # URY Checklist Item
            self._dependent_rows(),  # Dependent Checklist
            [],  # POS Opening Entry
            [],  # URY POS Checklist Log
        ]

        existing = self._review_doc([("Objective 1", "Open"), ("Objective 2", "Passed")])
        existing.append = MagicMock()
        mock_get_doc.side_effect = lambda doctype, name=None: (
            existing if doctype == "Quality Review" else self._goal_doc()
        )

        # Resubmit only ONE objective -- objectives already on the review that
        # aren't in this payload must be left alone, not re-appended.
        items = json.dumps([
            {"item_label": "Objective 1", "goal": self.GOAL, "status": "Passed", "remarks": "Fixed"},
        ])
        result = submit_checklist("POS-Profile-001", "Opening", items)

        mock_new_doc.assert_not_called()
        existing.append.assert_not_called()
        self.assertEqual(
            [(row.objective, row.status) for row in existing.reviews],
            [("Objective 1", "Passed"), ("Objective 2", "Passed")],
        )
        existing.save.assert_called_once()
        self.assertEqual(result["status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_marks_failed_objective(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists,
        mock_get_roles, mock_new_doc, mock_get_doc
    ):
        """An explicit FAIL with remarks is persisted on the review row, and a
        fully-answered review (Passed or Failed) completes the checklist."""
        from ury.ury_pos.api import submit_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        # exists() calls: submit-loop review lookup -> none; final
        # submitted-check -> the recorded review.
        mock_db_exists.side_effect = [None, "QR-0001"]
        mock_get_all.side_effect = [
            [],  # URY Checklist Item
            self._dependent_rows(),  # Dependent Checklist
            [],  # POS Opening Entry
            [],  # URY POS Checklist Log
        ]

        review_doc = MagicMock()
        review_doc.reviews = []
        mock_new_doc.return_value = review_doc
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Passed"), ("Objective 2", "Failed")]
        )

        items = json.dumps([
            {"item_label": "Objective 1", "goal": self.GOAL, "status": "Passed", "remarks": ""},
            {"item_label": "Objective 2", "goal": self.GOAL, "status": "Failed", "remarks": "Printer broken"},
        ])
        result = submit_checklist("POS-Profile-001", "Opening", items)

        rows = [call.args[1] for call in review_doc.append.call_args_list if call.args[0] == "reviews"]
        self.assertEqual(
            [(row["objective"], row["status"]) for row in rows],
            [("Objective 1", "Passed"), ("Objective 2", "Failed")],
        )
        # FAIL is a VALID response: the submission succeeds and the
        # checklist counts as submitted/completed for the user.
        self.assertEqual(result["status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_failed_without_remarks_throws(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists,
        mock_get_roles, mock_new_doc, mock_get_doc
    ):
        """A FAIL without a remark is rejected before anything is written."""
        from ury.ury_pos.api import submit_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_get_all.side_effect = [
            [],  # URY Checklist Item
            self._dependent_rows(),  # Dependent Checklist
            [],  # POS Opening Entry
            [],  # URY POS Checklist Log
        ]

        items = json.dumps([
            {"item_label": "Objective 1", "goal": self.GOAL, "status": "Failed", "remarks": "  "},
        ])
        self.assertRaises(frappe.ValidationError, submit_checklist, "POS-Profile-001", "Opening", items)
        mock_new_doc.assert_not_called()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.new_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_checklist_unchecked_objective_stays_pending(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists,
        mock_get_roles, mock_new_doc, mock_get_doc
    ):
        """A legacy payload without an explicit status (is_checked only) maps
        False -> Open, which keeps the overall status In Progress."""
        from ury.ury_pos.api import submit_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = None  # no Passed/Failed review on re-check
        mock_get_all.side_effect = [
            [],  # URY Checklist Item
            self._dependent_rows(),  # Dependent Checklist
            [],  # POS Opening Entry
            [],  # URY POS Checklist Log
        ]

        review_doc = MagicMock()
        review_doc.reviews = []
        mock_new_doc.return_value = review_doc
        mock_get_doc.side_effect = self._get_doc_side_effect(
            review_rows=[("Objective 1", "Passed"), ("Objective 2", "Open")]
        )

        items = json.dumps([
            {"item_label": "Objective 1", "goal": self.GOAL, "is_checked": True, "remarks": ""},
            {"item_label": "Objective 2", "goal": self.GOAL, "is_checked": False, "remarks": ""},
        ])
        result = submit_checklist("POS-Profile-001", "Opening", items)

        rows = [call.args[1] for call in review_doc.append.call_args_list if call.args[0] == "reviews"]
        self.assertEqual(
            [(row["objective"], row["status"]) for row in rows],
            [("Objective 1", "Passed"), ("Objective 2", "Open")],
        )
        self.assertEqual(result["status"], "In Progress")

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_dependent_option_maps_to_checklist_type(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """'POS Opening Entry' and 'Order Taking' rows surface for the Opening
        checklist; 'POS Closing Entry' and 'RM Checklist' rows surface for the
        Closing checklist -- as objective items, nothing leaks across types."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = None  # no Quality Review yet
        rows = [
            frappe._dict({"quality_checklist": "Closing Goal", "select_2": "POS Closing Entry", "role": "Cashier"}),
            frappe._dict({"quality_checklist": "Order Taker Goal", "select_2": "Order Taking", "role": "Cashier"}),
            frappe._dict({"quality_checklist": "RM Goal", "select_2": "RM Checklist", "role": "Cashier"}),
        ]
        mock_get_all.side_effect = [
            [], rows, [], [],  # Opening fetch
            [], rows, [], [],  # Closing fetch
        ]

        def get_doc_side_effect(doctype, name=None):
            doc = MagicMock()
            doc.objectives = [frappe._dict({"objective": f"{name} Objective", "target": None, "uom": None})]
            return doc
        mock_get_doc.side_effect = get_doc_side_effect

        opening = get_checklist("POS-Profile-001", "Opening")
        self.assertEqual(
            [item["item_label"] for item in opening["items"]], ["Order Taker Goal Objective"]
        )
        self.assertNotEqual(opening["log_status"], "Complete")

        closing = get_checklist("POS-Profile-001", "Closing")
        self.assertEqual(
            sorted(item["item_label"] for item in closing["items"]),
            ["Closing Goal Objective", "RM Goal Objective"],
        )

    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_order_taking_goal_ignored_for_other_roles(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles
    ):
        """An 'Order Taking' goal must not surface for users without the
        configured role, even though the option now maps to Opening."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "waiter@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Waiter", "All"]
        rows = [
            frappe._dict({"quality_checklist": "Order Taker Goal", "select_2": "Order Taking", "role": "Cashier"}),
        ]
        mock_get_all.side_effect = [[], rows, []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(result["items"], [])
        self.assertEqual(result["log_status"], "Complete")

    # ---- Role sequence (RM -> Cashier -> Order Taker; reverse for closing) ----

    def _sequence_rows(self):
        return [
            frappe._dict({"quality_checklist": "RM Opening Goal", "select_2": "RM Opening Checklist", "role": "Restaurant Manager"}),
            frappe._dict({"quality_checklist": self.GOAL, "select_2": "POS Opening Entry", "role": "Cashier"}),
            frappe._dict({"quality_checklist": "OT Opening Goal", "select_2": "Order Taker Opening Checklist", "role": "URY Captain"}),
        ]

    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_opening_blocked_until_rm_checklist_passed(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles
    ):
        """Cashier's opening gate stays closed -- with the RM named as the
        blocker -- until the RM checklist has a fully-Passed review."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = None  # nothing Passed yet
        mock_get_all.side_effect = [[], self._sequence_rows(), []]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertEqual(result["items"], [])
        self.assertIsNone(result["log_status"])
        self.assertEqual(result["blocked_by"]["role_label"], "Restaurant Manager")
        self.assertEqual(result["blocked_by"]["goals"], ["RM Opening Goal"])

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_opening_unblocked_once_rm_passed(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """With the RM review Passed, the blocker clears and the cashier's
        own goal surfaces."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        # exists() calls: RM goal submitted -> own goal pending -> own
        # review lookup (none yet).
        mock_db_exists.side_effect = ["QR-RM", None, None]
        mock_get_doc.side_effect = self._get_doc_side_effect()
        mock_get_all.side_effect = [
            [], self._sequence_rows(), [frappe._dict({"posting_date": date.today()})], [],
        ]

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertIsNone(result["blocked_by"])
        self.assertEqual(
            [item["item_label"] for item in result["items"]], ["Objective 1", "Objective 2"]
        )
        self.assertNotEqual(result["log_status"], "Complete")

    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_submit_blocked_until_predecessor_passed(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles
    ):
        """The API itself refuses submissions while a predecessor role's
        checklist is unfinished (no frontend bypass)."""
        from ury.ury_pos.api import submit_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        mock_db_exists.return_value = None
        mock_get_all.side_effect = [[], self._sequence_rows(), []]

        items = json.dumps([
            {"item_label": "Objective 1", "status": "Passed", "remarks": ""},
        ])
        self.assertRaises(
            frappe.PermissionError, submit_checklist, "POS-Profile-001", "Opening", items
        )

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_closing_blocker_runs_in_reverse(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """Closing runs Order Taker -> Cashier -> RM: the RM is blocked by
        the (descending-rank) predecessors, the Order Taker is not."""
        from ury.ury_pos.api import get_checklist

        rows = [
            frappe._dict({"quality_checklist": "OT Closing Goal", "select_2": "Order Taker Closing Checklist", "role": "URY Captain"}),
            frappe._dict({"quality_checklist": "Cashier Closing Goal", "select_2": "POS Closing Entry", "role": "Cashier"}),
            frappe._dict({"quality_checklist": "RM Closing Goal", "select_2": "RM Closing Checklist", "role": "Restaurant Manager"}),
        ]
        mock_get_branch.return_value = "Branch A"
        mock_get_all.side_effect = [
            [], rows, [], [],  # RM fetch
            [], rows, [], [],  # Order Taker fetch
        ]
        mock_get_doc.side_effect = self._get_doc_side_effect()
        mock_db_exists.return_value = None

        # RM: both Order Taker and Cashier steps must finish first.
        mock_session.user = "rm@example.com"
        mock_get_roles.return_value = ["Restaurant Manager"]
        mock_db_exists.return_value = None
        result = get_checklist("POS-Profile-001", "Closing")
        self.assertEqual(result["blocked_by"]["role_label"], "Order Taker")

        # Order Taker: no predecessors in the closing sequence.
        mock_session.user = "captain@example.com"
        mock_get_roles.return_value = ["URY Captain"]
        mock_db_exists.return_value = None
        result = get_checklist("POS-Profile-001", "Closing")
        self.assertIsNone(result["blocked_by"])


    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.get_roles")
    @patch("ury.ury_pos.api.frappe.db.exists")
    @patch("ury.ury_pos.api.frappe.get_all")
    @patch("ury.ury_pos.api.frappe.session")
    @patch("ury.ury_pos.api.getBranch")
    @patch("ury.ury_pos.api._validate_checklist_branch")
    def test_opening_failed_predecessor_does_not_block(
        self, mock_validate_branch, mock_get_branch, mock_session, mock_get_all, mock_db_exists, mock_get_roles, mock_get_doc
    ):
        """A predecessor checklist SUBMITTED with failures (any PASS/FAIL
        mix) satisfies the hierarchy -- the next role proceeds."""
        from ury.ury_pos.api import get_checklist

        mock_session.user = "cashier@example.com"
        mock_get_branch.return_value = "Branch A"
        mock_get_roles.return_value = ["Cashier", "All"]
        # RM goal: a submitted (Failed) review exists -> hierarchy satisfied.
        mock_db_exists.side_effect = ["QR-FAILED", None, None]
        mock_get_all.side_effect = [[], self._sequence_rows(), [frappe._dict({"posting_date": date.today()})], []]
        mock_get_doc.side_effect = self._get_doc_side_effect()

        result = get_checklist("POS-Profile-001", "Opening")

        self.assertIsNone(result["blocked_by"])
        # The cashier's own objectives surface: the hierarchy moved on even
        # though the RM checklist contained a failure.
        self.assertEqual(
            [item["item_label"] for item in result["items"]],
            ["Objective 1", "Objective 2"],
        )


class TestPhaseHierarchyHooks(FrappeTestCase):
	"""The POS Opening/Closing Entry documents are the LAST step of each
	checklist sequence -- every configured role goal must be SUBMITTED
	(role-level, any PASS/FAIL mix) before the document passes its hook:

	- Opening: RM -> Cashier -> Order Taker all submitted, then open.
	- Closing: Order Taker -> Cashier -> RM all submitted, then close.
	"""

	OPENING_ROWS = [
		frappe._dict({
			"quality_checklist": "RM Opening Checklist",
			"select_2": "RM Opening Checklist",
			"role": "Restaurant Manager",
		}),
		frappe._dict({
			"quality_checklist": "Cashier Opening Checklist",
			"select_2": "Order Taking",
			"role": "Cashier",
		}),
		frappe._dict({
			"quality_checklist": "OT Opening Checklist",
			"select_2": "Order Taker Opening Checklist",
			"role": "Order Taker",
		}),
	]

	CLOSING_ROWS = [
		frappe._dict({
			"quality_checklist": "OT Closing Checklist",
			"select_2": "Order Taker Closing Checklist",
			"role": "Order Taker",
		}),
		frappe._dict({
			"quality_checklist": "Cashier Closing Checklist",
			"select_2": "POS Closing Entry",
			"role": "Cashier",
		}),
		frappe._dict({
			"quality_checklist": "RM Closing Checklist",
			"select_2": "RM Closing Checklist",
			"role": "Restaurant Manager",
		}),
		frappe._dict({
			"quality_checklist": "Unranked Side Quest",
			"select_2": "RM Closing Checklist",
			"role": "Accounts User",
		}),
	]

	def setUp(self):
		self.submitted = set()

	def _exists_side_effect(self, doctype=None, filters=None, *args, **kwargs):
		# Real _goal_submitted: frappe.db.exists("Quality Review", {goal,
		# branch, date, status in [Passed, Failed]}). Role-level: no owner.
		# frappe internals also call exists(doctype, name) during insert --
		# pretend those references resolve.
		if isinstance(filters, dict):
			return filters.get("goal") in self.submitted
		return True

	def _get_all_side_effect(self, doctype, **kwargs):
		# Real _goal_submitted_since: frappe.get_all(..., pluck="name").
		filters = kwargs.get("filters") or {}
		return ["QR-1"] if filters.get("goal") in self.submitted else []

	class _ClosingDoc:
		pos_profile = "POS-MAIN"
		period_start_date = datetime(2026, 10, 6, 8, 0, 0)

		def __init__(self):
			self.quality_checklist = []

		def append(self, field, row):
			self.assert_field = field
			self.quality_checklist.append(row)

	# -- Opening hook ------------------------------------------------------

	@patch("ury.ury.hooks.pos_opening.frappe.get_doc")
	@patch("ury.ury.hooks.pos_opening._phase_dependent_rows")
	@patch("ury.ury_pos.api.frappe.db.exists")
	def test_opening_blocked_until_cashier_submitted(
		self, mock_exists, mock_rows, mock_get_doc
	):
		"""RM submitted is no longer enough: the Cashier and Order Taker
		steps must be submitted too before the POS Opening Entry saves."""
		from ury.ury.hooks.pos_opening import update_daily_checklists

		mock_get_doc.return_value = frappe._dict(branch="Branch A")
		mock_rows.return_value = self.OPENING_ROWS
		mock_exists.side_effect = self._exists_side_effect
		self.submitted = {"RM Opening Checklist"}

		doc = frappe._dict(pos_profile="POS-MAIN", posting_date=date.today())
		with self.assertRaises(frappe.ValidationError) as cm:
			update_daily_checklists(doc, None)
		self.assertIn("Cashier Opening Checklist", str(cm.exception))
		self.assertIn("OT Opening Checklist", str(cm.exception))

	@patch("ury.ury.hooks.pos_opening.frappe.get_doc")
	@patch("ury.ury.hooks.pos_opening._phase_dependent_rows")
	@patch("ury.ury_pos.api.frappe.db.exists")
	def test_opening_blocked_until_one_ot_submitted(
		self, mock_exists, mock_rows, mock_get_doc
	):
		from ury.ury.hooks.pos_opening import update_daily_checklists

		mock_get_doc.return_value = frappe._dict(branch="Branch A")
		mock_rows.return_value = self.OPENING_ROWS
		mock_exists.side_effect = self._exists_side_effect
		self.submitted = {"RM Opening Checklist", "Cashier Opening Checklist"}

		doc = frappe._dict(pos_profile="POS-MAIN", posting_date=date.today())
		with self.assertRaises(frappe.ValidationError) as cm:
			update_daily_checklists(doc, None)
		self.assertIn("OT Opening Checklist", str(cm.exception))

	@patch("ury.ury.hooks.pos_opening.frappe.get_doc")
	@patch("ury.ury.hooks.pos_opening._phase_dependent_rows")
	@patch("ury.ury_pos.api.frappe.db.exists")
	def test_opening_passes_when_full_hierarchy_submitted(
		self, mock_exists, mock_rows, mock_get_doc
	):
		"""RM + Cashier + Order Taker all submitted -> the shift can open.
		One OT review satisfies the OT step (role-level gate)."""
		from ury.ury.hooks.pos_opening import update_daily_checklists

		mock_get_doc.return_value = frappe._dict(branch="Branch A")
		mock_rows.return_value = self.OPENING_ROWS
		mock_exists.side_effect = self._exists_side_effect
		self.submitted = {
			"RM Opening Checklist",
			"Cashier Opening Checklist",
			"OT Opening Checklist",
		}

		doc = frappe._dict(pos_profile="POS-MAIN", posting_date=date.today())
		update_daily_checklists(doc, None)  # must not raise

	# -- Closing hook ------------------------------------------------------

	@patch("ury.ury.hooks.pos_closing.frappe.get_doc")
	@patch("ury.ury.hooks.pos_closing._phase_dependent_rows")
	@patch("ury.ury_pos.api.frappe.get_all")
	def test_closing_blocked_until_cashier_and_rm_submitted(
		self, mock_get_all, mock_rows, mock_get_doc
	):
		"""Order Taker submitted is no longer enough: the Cashier AND the
		RM closing steps must be submitted before the POS Closing Entry
		validates."""
		from ury.ury.hooks.pos_closing import validate_daily_checklists

		mock_get_doc.return_value = frappe._dict(branch="Branch A")
		mock_rows.return_value = self.CLOSING_ROWS
		mock_get_all.side_effect = self._get_all_side_effect
		self.submitted = {"OT Closing Checklist"}

		doc = self._ClosingDoc()
		with self.assertRaises(frappe.ValidationError) as cm:
			validate_daily_checklists(doc, None)
		self.assertIn("Cashier Closing Checklist", str(cm.exception))
		self.assertIn("RM Closing Checklist", str(cm.exception))

	@patch("ury.ury.hooks.pos_closing.frappe.get_doc")
	@patch("ury.ury.hooks.pos_closing._phase_dependent_rows")
	@patch("ury.ury_pos.api.frappe.get_all")
	def test_closing_blocked_until_rm_submitted(
		self, mock_get_all, mock_rows, mock_get_doc
	):
		from ury.ury.hooks.pos_closing import validate_daily_checklists

		mock_get_doc.return_value = frappe._dict(branch="Branch A")
		mock_rows.return_value = self.CLOSING_ROWS
		mock_get_all.side_effect = self._get_all_side_effect
		self.submitted = {"OT Closing Checklist", "Cashier Closing Checklist"}

		doc = self._ClosingDoc()
		with self.assertRaises(frappe.ValidationError) as cm:
			validate_daily_checklists(doc, None)
		self.assertIn("RM Closing Checklist", str(cm.exception))

	@patch("ury.ury.hooks.pos_closing.frappe.get_doc")
	@patch("ury.ury.hooks.pos_closing._phase_dependent_rows")
	@patch("ury.ury_pos.api.frappe.get_all")
	def test_closing_passes_when_full_hierarchy_submitted(
		self, mock_get_all, mock_rows, mock_get_doc
	):
		"""OT + Cashier + RM submitted -> the shift can close. Submitted
		goals are recorded on the document; unranked roles stay outside
		the sequence."""
		from ury.ury.hooks.pos_closing import validate_daily_checklists

		mock_get_doc.return_value = frappe._dict(branch="Branch A")
		mock_rows.return_value = self.CLOSING_ROWS
		mock_get_all.side_effect = self._get_all_side_effect
		self.submitted = {
			"OT Closing Checklist",
			"Cashier Closing Checklist",
			"RM Closing Checklist",
		}

		doc = self._ClosingDoc()
		validate_daily_checklists(doc, None)  # must not raise

		recorded = [row["checklist"] for row in doc.quality_checklist]
		self.assertEqual(
			recorded,
			[
				"OT Closing Checklist",
				"Cashier Closing Checklist",
				"RM Closing Checklist",
			],
		)
		self.assertTrue(
			all(row["check_2"] == 1 for row in doc.quality_checklist)
		)

	def test_submit_action_also_enforces_checklist_gate(self):
		"""Regression for the real bypass: the POS opening screen creates the
		entry with .submit(), and frappe v16 runs `before_save` hooks ONLY
		for the save action -- the submit action runs `validate` +
		`before_submit`. The gate must therefore fire on before_submit too
		(wired in ury/hooks.py), or the cashier can open the shift before
		the Order Taker submitted."""
		# Real profile name: the other validate hooks (set_cashier_room,
		# stock_count_gate) resolve it through cached paths the mock cannot
		# cover; the checklist assertions below only depend on the rows and
		# review-existence mocks.
		doc = frappe.get_doc({
			"doctype": "POS Opening Entry",
			"company": "URY",
			"pos_profile": "URY",
			"user": "cashier@example.com",
			"period_start_date": datetime(2026, 10, 6, 8, 0, 0),
			"posting_date": date(2026, 10, 6),
		})
		# Link validation runs before the before_submit hooks this test
		# targets, and the placeholder company/profile/user above only exist
		# on the authoring dev site -- skip link integrity here (the subject
		# is hook firing, not references). ERPNext's own validate hook unpacks
		# a POS Profile row that equally doesn't exist on a bare CI site.
		doc._validate_links = lambda: None
		doc.validate_pos_profile_and_cashier = lambda: None
		self.submitted = {"RM Opening Checklist", "Cashier Opening Checklist"}
		# Patch only around submit(): get_doc is also used by frappe internals
		# during insert, so mock just the hook's POS Profile lookup.
		real_get_doc = frappe.get_doc

		def fake_get_doc(doctype, name=None, *args, **kwargs):
			if doctype == "POS Profile":
				return frappe._dict(branch="Branch A")
			if name is None and not args and not kwargs:
				return real_get_doc(doctype)
			return real_get_doc(doctype, name, *args, **kwargs)

		with patch("ury.ury.hooks.pos_opening.frappe.get_doc") as mock_get_doc, \
			patch("ury.ury.hooks.pos_opening._phase_dependent_rows") as mock_rows, \
			patch("ury.ury_pos.api.frappe.db.exists") as mock_exists:
			mock_get_doc.side_effect = fake_get_doc
			mock_rows.return_value = self.OPENING_ROWS
			mock_exists.side_effect = self._exists_side_effect
			with self.assertRaises(frappe.ValidationError) as cm:
				doc.submit()
		self.assertIn("OT Opening Checklist", str(cm.exception))

	def test_opening_hook_wired_to_save_and_submit_actions(self):
		"""Guard the wiring itself: if the gate is dropped from either
		action, one of the two creation paths (desk save vs POS submit)
		bypasses the hierarchy."""
		from ury import hooks as ury_hooks

		events = ury_hooks.doc_events["POS Opening Entry"]
		for action in ("before_save", "before_submit"):
			wired = events.get(action)
			wired = [wired] if isinstance(wired, str) else (wired or [])
			self.assertIn(
				"ury.ury.hooks.pos_opening.update_daily_checklists", wired
			)
