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
        mock_doc.save.assert_called_once_with(ignore_permissions=True)

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
    def test_saves_with_ignore_permissions(self, mock_get_doc, mock_has_perm):
        mock_has_perm.return_value = True
        """Should save with ignore_permissions=True to bypass permission checks."""
        mock_doc = MagicMock()
        mock_doc.name = "SR-003"
        mock_get_doc.return_value = mock_doc

        acknowledge_service_request("SR-003")

        # Verify save was called with ignore_permissions=True
        mock_doc.save.assert_called_once_with(ignore_permissions=True)

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
        mock_doc.save.assert_called_once_with(ignore_permissions=True)

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
    def test_saves_with_ignore_permissions(self, mock_now, mock_get_doc, mock_session, mock_has_perm):
        mock_has_perm.return_value = True
        """Should save with ignore_permissions=True to bypass permission checks."""
        mock_now.return_value = "2026-08-19 14:45:30"
        mock_session.user = "Captain"

        mock_doc = MagicMock()
        mock_doc.name = "SR-005"
        mock_get_doc.return_value = mock_doc

        resolve_service_request("SR-005")

        # Verify save was called with ignore_permissions=True
        mock_doc.save.assert_called_once_with(ignore_permissions=True)

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
