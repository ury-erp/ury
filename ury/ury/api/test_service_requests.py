# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for URY Service Request API endpoints.

Tests cover the staff-facing endpoints (list_open_service_requests,
acknowledge_service_request, resolve_service_request) that are used by
floor staff to manage customer service requests.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime
from unittest.mock import patch, MagicMock

from ury.ury.api.service_requests import (
    list_open_service_requests,
    acknowledge_service_request,
    resolve_service_request,
)


class TestListOpenServiceRequests(FrappeTestCase):
    """Tests for list_open_service_requests() endpoint."""

    @patch("ury.ury.api.service_requests.frappe.get_all")
    def test_returns_empty_list_when_branch_is_none(self, mock_get_all):
        """Calling with None branch should short-circuit and return empty list."""
        result = list_open_service_requests(None)
        self.assertEqual(result, [])
        mock_get_all.assert_not_called()

    @patch("ury.ury.api.service_requests.frappe.get_all")
    def test_returns_empty_list_when_branch_is_empty_string(self, mock_get_all):
        """Calling with empty string branch should short-circuit and return empty list."""
        result = list_open_service_requests("")
        self.assertEqual(result, [])
        mock_get_all.assert_not_called()

    @patch("ury.ury.api.service_requests.frappe.get_all")
    def test_returns_empty_list_when_no_tables_in_branch(self, mock_get_all):
        """When the branch has no tables, should return empty list."""
        # First call to get_all returns no tables for the branch
        mock_get_all.return_value = []

        result = list_open_service_requests("Main Branch")

        # Should call get_all to fetch tables for the branch
        mock_get_all.assert_called_once_with(
            "URY Table", 
            filters={"branch": "Main Branch"}, 
            pluck="name"
        )
        self.assertEqual(result, [])

    @patch("ury.ury.api.service_requests.frappe.get_all")
    def test_returns_empty_list_when_no_open_requests(self, mock_get_all):
        """When branch has tables but no open/acknowledged requests, return empty list."""
        # First call returns tables, second call returns no requests
        mock_get_all.side_effect = [
            ["Table-1", "Table-2"],  # Tables in branch
            [],                       # No open/acknowledged requests
        ]

        result = list_open_service_requests("Main Branch")

        self.assertEqual(result, [])
        self.assertEqual(mock_get_all.call_count, 2)

    @patch("ury.ury.api.service_requests.frappe.get_all")
    def test_returns_open_requests_ordered_by_requested_at(self, mock_get_all):
        """Should return open and acknowledged requests, ordered oldest first."""
        mock_get_all.side_effect = [
            ["Table-1", "Table-2", "Table-3"],  # Tables in branch
            [
                frappe._dict({
                    "name": "SR-001",
                    "request_type": "Bill",
                    "table": "Table-1",
                    "status": "Open",
                    "requested_at": "2026-08-19 10:30:00",
                }),
                frappe._dict({
                    "name": "SR-002",
                    "request_type": "Assistance",
                    "table": "Table-2",
                    "status": "Acknowledged",
                    "requested_at": "2026-08-19 10:15:00",
                }),
            ],
        ]

        result = list_open_service_requests("Main Branch")

        self.assertEqual(len(result), 2)
        # Verify the correct fields are returned
        self.assertEqual(result[0]["name"], "SR-001")
        self.assertEqual(result[1]["name"], "SR-002")
        
        # Verify the query was made correctly
        call_args = mock_get_all.call_args_list[1]
        self.assertEqual(call_args[1]["filters"]["table"], ["in", ["Table-1", "Table-2", "Table-3"]])
        self.assertEqual(call_args[1]["filters"]["status"], ["in", ["Open", "Acknowledged"]])
        self.assertEqual(call_args[1]["order_by"], "requested_at asc")

    @patch("ury.ury.api.service_requests.frappe.get_all")
    def test_filters_by_status_open_and_acknowledged_only(self, mock_get_all):
        """Should only return Open and Acknowledged requests, not Resolved."""
        mock_get_all.side_effect = [
            ["Table-1"],
            [
                frappe._dict({
                    "name": "SR-001",
                    "request_type": "Bill",
                    "table": "Table-1",
                    "status": "Open",
                    "requested_at": "2026-08-19 10:30:00",
                }),
            ],
        ]

        result = list_open_service_requests("Main Branch")

        # Verify the status filter includes only Open and Acknowledged
        call_args = mock_get_all.call_args_list[1]
        status_filter = call_args[1]["filters"]["status"]
        self.assertEqual(status_filter, ["in", ["Open", "Acknowledged"]])
        self.assertEqual(len(result), 1)


class TestAcknowledgeServiceRequest(FrappeTestCase):
    """Tests for acknowledge_service_request() endpoint."""

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    def test_changes_status_to_acknowledged(self, mock_get_doc, mock_has_perm):
        mock_has_perm.return_value = True
        """Should change request status to 'Acknowledged' and save."""
        mock_doc = MagicMock()
        mock_doc.name = "SR-001"
        mock_doc.status = "Open"
        mock_get_doc.return_value = mock_doc

        result = acknowledge_service_request("SR-001")

        # Verify the document was fetched and updated
        mock_get_doc.assert_called_once_with("URY Service Request", "SR-001")
        self.assertEqual(mock_doc.status, "Acknowledged")
        mock_doc.save.assert_called_once_with()

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    def test_returns_updated_status(self, mock_get_doc, mock_has_perm):
        mock_has_perm.return_value = True
        """Should return the updated request with new status."""
        mock_doc = MagicMock()
        mock_doc.name = "SR-002"
        mock_doc.status = "Open"
        mock_get_doc.return_value = mock_doc

        result = acknowledge_service_request("SR-002")

        self.assertEqual(result["name"], "SR-002")
        self.assertEqual(result["status"], "Acknowledged")

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    def test_saves_after_permission_check_passes(self, mock_get_doc, mock_has_perm):
        mock_has_perm.return_value = True
        """Should call save() once the explicit has_permission check passes."""
        mock_doc = MagicMock()
        mock_doc.name = "SR-003"
        mock_get_doc.return_value = mock_doc

        acknowledge_service_request("SR-003")

        # Verify save was called (permission gating is done explicitly via
        # has_permission(), not save()'s own ignore_permissions flag)
        mock_doc.save.assert_called_once_with()

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    def test_handles_already_acknowledged_request(self, mock_get_doc, mock_has_perm):
        mock_has_perm.return_value = True
        """Should handle acknowledging an already-acknowledged request."""
        mock_doc = MagicMock()
        mock_doc.name = "SR-004"
        mock_doc.status = "Acknowledged"
        mock_get_doc.return_value = mock_doc

        result = acknowledge_service_request("SR-004")

        # Should succeed even if already acknowledged
        self.assertEqual(result["status"], "Acknowledged")
        mock_doc.save.assert_called_once()


class TestResolveServiceRequest(FrappeTestCase):
    """Tests for resolve_service_request() endpoint."""

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_changes_status_to_resolved(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should change request status to 'Resolved' and save."""
        resolved_time = "2026-08-19 14:45:30"
        mock_now.return_value = resolved_time
        mock_session.user = "Captain John"

        mock_doc = MagicMock()
        mock_doc.name = "SR-001"
        mock_doc.status = "Open"
        mock_get_doc.return_value = mock_doc

        result = resolve_service_request("SR-001")

        # Verify the document was fetched and updated
        mock_get_doc.assert_called_once_with("URY Service Request", "SR-001")
        self.assertEqual(mock_doc.status, "Resolved")
        mock_doc.save.assert_called_once_with()

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_sets_resolved_at_timestamp(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should set resolved_at to current datetime."""
        resolved_time = "2026-08-19 14:45:30"
        mock_now.return_value = resolved_time
        mock_session.user = "Captain John"

        mock_doc = MagicMock()
        mock_doc.name = "SR-002"
        mock_get_doc.return_value = mock_doc

        resolve_service_request("SR-002")

        # Verify resolved_at was set
        self.assertEqual(mock_doc.resolved_at, resolved_time)

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_sets_resolved_by_current_user(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should set resolved_by to the current authenticated user."""
        mock_now.return_value = "2026-08-19 14:45:30"
        mock_session.user = "captain@ury.localhost"

        mock_doc = MagicMock()
        mock_doc.name = "SR-003"
        mock_get_doc.return_value = mock_doc

        resolve_service_request("SR-003")

        # Verify resolved_by was set to current user
        self.assertEqual(mock_doc.resolved_by, "captain@ury.localhost")

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_returns_updated_status(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should return the updated request with Resolved status."""
        mock_now.return_value = "2026-08-19 14:45:30"
        mock_session.user = "Captain Jane"

        mock_doc = MagicMock()
        mock_doc.name = "SR-004"
        mock_doc.status = "Open"
        mock_get_doc.return_value = mock_doc

        result = resolve_service_request("SR-004")

        self.assertEqual(result["name"], "SR-004")
        self.assertEqual(result["status"], "Resolved")

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_saves_after_permission_check_passes(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should call save() once the explicit has_permission check passes."""
        mock_now.return_value = "2026-08-19 14:45:30"
        mock_session.user = "Captain"

        mock_doc = MagicMock()
        mock_doc.name = "SR-005"
        mock_get_doc.return_value = mock_doc

        resolve_service_request("SR-005")

        # Verify save was called (permission gating is done explicitly via
        # has_permission(), not save()'s own ignore_permissions flag)
        mock_doc.save.assert_called_once_with()

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_handles_resolving_acknowledged_request(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should handle resolving an acknowledged request."""
        mock_now.return_value = "2026-08-19 14:50:00"
        mock_session.user = "Captain"

        mock_doc = MagicMock()
        mock_doc.name = "SR-006"
        mock_doc.status = "Acknowledged"
        mock_get_doc.return_value = mock_doc

        result = resolve_service_request("SR-006")

        self.assertEqual(result["status"], "Resolved")
        self.assertEqual(mock_doc.resolved_at, "2026-08-19 14:50:00")
        self.assertEqual(mock_doc.resolved_by, "Captain")
        mock_doc.save.assert_called_once()

    @patch("ury.ury.api.service_requests.frappe.has_permission")
    @patch("ury.ury.api.service_requests.frappe.session")
    @patch("ury.ury.api.service_requests.frappe.get_doc")
    @patch("ury.ury.api.service_requests.now_datetime")
    def test_handles_resolving_already_resolved_request(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should handle re-resolving an already-resolved request (updates timestamp and user)."""
        first_time = "2026-08-19 14:30:00"
        second_time = "2026-08-19 14:45:30"

        mock_now.return_value = second_time
        mock_session.user = "Captain Jane"

        mock_doc = MagicMock()
        mock_doc.name = "SR-007"
        mock_doc.status = "Resolved"
        mock_doc.resolved_at = first_time
        mock_doc.resolved_by = "Captain John"
        mock_get_doc.return_value = mock_doc

        result = resolve_service_request("SR-007")

        # Should update the timestamp and user even if already resolved
        self.assertEqual(mock_doc.resolved_at, second_time)
        self.assertEqual(mock_doc.resolved_by, "Captain Jane")
        mock_doc.save.assert_called_once()


class TestServiceRequestRealPermissionBoundary(FrappeTestCase):
    """Real (non-mocked) coverage of the frappe.PermissionError guards in
    acknowledge_service_request() and resolve_service_request().

    Every test above mocks frappe.has_permission itself (always True), so the
    actual doctype-level 'write' permission check on URY Service Request has
    never run for real against a real session/role-permission table -- same
    class of gap as round 3's branch-operational-state/service-line findings.
    Builds a real Branch -> URY Room -> URY Restaurant -> URY Table -> URY
    Service Request fixture chain (per each doctype's own required-field
    list) rather than mocking get_doc, so the has_permission(doc=req) call
    evaluates against a real document.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from ury.ury.tests.factories import make_branch

        cls.branch = make_branch(branch="P4R4 SR Branch")
        company = frappe.db.get_value("Company", {}, "name") or "_Test Company"

        # Both URY Room and URY Restaurant use "autoname": "prompt"/"Prompt"
        # (confirmed by reading their doctype JSON), so `name` must be set
        # explicitly -- omitting it hits Frappe's own "Please set the
        # document name" ValidationError before this fixture is ever
        # created, not a bug in the guard under test.
        if frappe.db.exists("URY Room", "P4R4 SR Room"):
            cls.room = frappe.get_doc("URY Room", "P4R4 SR Room")
        else:
            cls.room = frappe.get_doc({
                "doctype": "URY Room",
                "name": "P4R4 SR Room",
                "room_name": "P4R4 SR Room",
                "branch": cls.branch.name,
            }).insert(ignore_permissions=True, ignore_mandatory=True)

        if frappe.db.exists("URY Restaurant", {"branch": cls.branch.name}):
            cls.restaurant = frappe.get_doc("URY Restaurant", {"branch": cls.branch.name})
        else:
            cls.restaurant = frappe.get_doc({
                "doctype": "URY Restaurant",
                "name": "P4R4 SR Restaurant",
                "company": company,
                "invoice_series_prefix": "P4R4SR",
                "branch": cls.branch.name,
                "default_room": cls.room.name,
            }).insert(ignore_permissions=True, ignore_mandatory=True)

        # URY Table also autonames via "prompt" -- confirmed via its
        # doctype JSON's autoname field, not assumed.
        if frappe.db.exists("URY Table", "P4R4 SR Table"):
            cls.table = frappe.get_doc("URY Table", "P4R4 SR Table")
        else:
            cls.table = frappe.get_doc({
                "doctype": "URY Table",
                "name": "P4R4 SR Table",
                "restaurant": cls.restaurant.name,
                "restaurant_room": cls.room.name,
                "branch": cls.branch.name,
            }).insert(ignore_permissions=True, ignore_mandatory=True)

        cls.request = frappe.get_doc({
            "doctype": "URY Service Request",
            "request_type": "Assistance",
            "table": cls.table.name,
            "status": "Open",
        }).insert(ignore_permissions=True, ignore_mandatory=True)

        email = "p4r4-roleless-svcreq@ury.test"
        if frappe.db.exists("User", email):
            frappe.delete_doc("User", email, force=True, ignore_permissions=True)
        cls.roleless_user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "P4R4RolelessSvcReq",
            "send_welcome_email": 0,
            "enabled": 1,
        }).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")
        # Reset status mutated by a prior (possibly-successful) test run so
        # each test starts from a known state.
        frappe.db.set_value("URY Service Request", self.request.name, "status", "Open")

    def test_roleless_user_denied_acknowledge_for_real(self):
        frappe.set_user(self.roleless_user.name)
        with self.assertRaises(frappe.PermissionError):
            acknowledge_service_request(self.request.name)

    def test_roleless_user_denied_resolve_for_real(self):
        frappe.set_user(self.roleless_user.name)
        with self.assertRaises(frappe.PermissionError):
            resolve_service_request(self.request.name)

    def test_administrator_may_acknowledge_for_real(self):
        frappe.set_user("Administrator")
        result = acknowledge_service_request(self.request.name)
        self.assertEqual(result["status"], "Acknowledged")

    def test_administrator_may_resolve_for_real(self):
        frappe.set_user("Administrator")
        result = resolve_service_request(self.request.name)
        self.assertEqual(result["status"], "Resolved")
