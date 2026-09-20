# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import MagicMock, patch

from ury.ury.api.service_requests import (
    acknowledge_service_requests,
    get_open_service_requests,
    notify_service_request,
    resolve_requests_for_invoice,
    resolve_service_request,
    service_request_channel,
)

MOD = "ury.ury.api.service_requests"


def _request_doc(name="SR-001", table="Table 7", status="Open"):
    doc = MagicMock()
    doc.doctype = "URY Service Request"
    doc.name = name
    doc.request_type = "Bill"
    doc.table = table
    doc.invoice = "POS-INV-100"
    doc.session = "SESSION-1"
    doc.status = status
    doc.requested_at = "2026-09-20 12:00:00"
    return doc


class TestNotifyServiceRequest(unittest.TestCase):
    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_publishes_on_branch_channel(self, mock_get_value, mock_publish):
        mock_get_value.return_value = "Branch 1"

        notify_service_request(_request_doc())

        mock_publish.assert_called_once()
        channel, payload = mock_publish.call_args[0]
        self.assertEqual(channel, "ury_service_request_Branch 1")
        self.assertEqual(payload["name"], "SR-001")
        self.assertEqual(payload["request_type"], "Bill")
        self.assertEqual(payload["table"], "Table 7")
        self.assertEqual(payload["branch"], "Branch 1")
        self.assertFalse(payload["repeat"])

    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_repeat_flag_is_carried(self, mock_get_value, mock_publish):
        mock_get_value.return_value = "Branch 1"

        notify_service_request(_request_doc(), repeat=True)

        self.assertTrue(mock_publish.call_args[0][1]["repeat"])

    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_accepts_a_name_and_loads_the_doc(self, mock_get_value, mock_get_doc, mock_publish):
        mock_get_value.return_value = "Branch 1"
        mock_get_doc.return_value = _request_doc()

        notify_service_request("SR-001")

        mock_get_doc.assert_called_once_with("URY Service Request", "SR-001")
        mock_publish.assert_called_once()

    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_table_without_branch_is_skipped(self, mock_get_value, mock_publish):
        mock_get_value.return_value = None

        notify_service_request(_request_doc())

        mock_publish.assert_not_called()

    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.publish_realtime", side_effect=Exception("socket down"))
    @patch(f"{MOD}.frappe.db.get_value")
    def test_publish_failure_never_propagates(self, mock_get_value, mock_publish, mock_log):
        # The request row is already committed; a dead realtime layer must not
        # turn the customer's tap into an error.
        mock_get_value.return_value = "Branch 1"

        notify_service_request(_request_doc())

        mock_log.assert_called_once()


class TestGetOpenServiceRequests(unittest.TestCase):
    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.getBranch")
    def test_returns_unresolved_requests_for_own_branch(self, mock_branch, mock_get_all):
        mock_branch.return_value = "Branch 1"
        mock_get_all.side_effect = [
            ["Table 7", "Table 8"],
            [{"name": "SR-001", "table": "Table 7", "requested_at": "2026-09-20 12:00:00"}],
        ]

        result = get_open_service_requests()

        table_filters = mock_get_all.call_args_list[0][1]["filters"]
        self.assertEqual(table_filters, {"branch": "Branch 1"})

        request_filters = mock_get_all.call_args_list[1][1]["filters"]
        self.assertEqual(request_filters["table"], ["in", ["Table 7", "Table 8"]])
        self.assertEqual(request_filters["status"], ["!=", "Resolved"])

        self.assertEqual(result[0]["branch"], "Branch 1")
        self.assertEqual(result[0]["requested_at"], "2026-09-20 12:00:00")

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.getBranch")
    def test_branch_without_tables_short_circuits(self, mock_branch, mock_get_all):
        mock_branch.return_value = "Branch 1"
        mock_get_all.return_value = []

        self.assertEqual(get_open_service_requests(), [])
        self.assertEqual(mock_get_all.call_count, 1)


class TestResolveServiceRequest(unittest.TestCase):
    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.now_datetime")
    @patch(f"{MOD}.getBranch")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.get_doc")
    def test_resolving_stamps_and_broadcasts(
        self, mock_get_doc, mock_get_value, mock_branch, mock_now, mock_publish
    ):
        doc = _request_doc()
        mock_get_doc.return_value = doc
        mock_get_value.return_value = "Branch 1"
        mock_branch.return_value = "Branch 1"
        mock_now.return_value = "2026-09-20 12:05:00"

        result = resolve_service_request("SR-001")

        self.assertEqual(doc.status, "Resolved")
        self.assertEqual(doc.resolved_at, "2026-09-20 12:05:00")
        doc.save.assert_called_once()
        self.assertEqual(result["status"], "Resolved")
        self.assertEqual(mock_publish.call_args[0][0], "ury_service_request_Branch 1")

    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.getBranch")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.get_doc")
    def test_acknowledging_does_not_stamp_resolution(
        self, mock_get_doc, mock_get_value, mock_branch, mock_publish
    ):
        doc = _request_doc()
        mock_get_doc.return_value = doc
        mock_get_value.return_value = "Branch 1"
        mock_branch.return_value = "Branch 1"

        resolve_service_request("SR-001", "Acknowledged")

        self.assertEqual(doc.status, "Acknowledged")
        self.assertNotIn("resolved_at", doc.__dict__)

    @patch(f"{MOD}.frappe.get_doc")
    def test_rejects_a_status_that_is_not_the_cashiers_to_set(self, mock_get_doc):
        import frappe

        with self.assertRaises(frappe.ValidationError):
            resolve_service_request("SR-001", "Open")
        mock_get_doc.assert_not_called()

    @patch(f"{MOD}.getBranch")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.get_doc")
    def test_rejects_a_request_from_another_branch(self, mock_get_doc, mock_get_value, mock_branch):
        import frappe

        mock_get_doc.return_value = _request_doc()
        mock_get_value.return_value = "Branch 2"
        mock_branch.return_value = "Branch 1"

        with self.assertRaises(frappe.PermissionError):
            resolve_service_request("SR-001")


class TestResolveRequestsForInvoice(unittest.TestCase):
    @patch(f"{MOD}.frappe.publish_realtime")
    @patch(f"{MOD}.now_datetime")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.get_all")
    def test_settling_the_bill_clears_the_alert(
        self, mock_get_all, mock_get_doc, mock_get_value, mock_now, mock_publish
    ):
        mock_get_all.return_value = ["SR-001"]
        doc = _request_doc()
        mock_get_doc.return_value = doc
        mock_get_value.return_value = "Branch 1"
        mock_now.return_value = "2026-09-20 12:05:00"

        resolve_requests_for_invoice("POS-INV-100")

        self.assertEqual(doc.status, "Resolved")
        doc.save.assert_called_once_with(ignore_permissions=True)
        self.assertEqual(mock_publish.call_args[0][0], "ury_service_request_Branch 1")

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.get_all")
    def test_invoice_without_requests_does_nothing(self, mock_get_all, mock_get_doc):
        mock_get_all.return_value = []

        resolve_requests_for_invoice("POS-INV-100")

        mock_get_doc.assert_not_called()

    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_all", side_effect=Exception("db gone"))
    def test_failure_never_breaks_the_submit(self, mock_get_all, mock_log):
        # This runs inside POS Invoice on_submit: a bookkeeping problem with
        # an alert must not roll back a real payment.
        resolve_requests_for_invoice("POS-INV-100")

        mock_log.assert_called_once()


class TestAcknowledgeServiceRequests(unittest.TestCase):
    @patch(f"{MOD}.resolve_service_request")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_acknowledges_only_the_unseen_ones(self, mock_get_value, mock_resolve):
        # Reopening the panel must not re-save and re-broadcast rows the
        # cashier has already seen.
        mock_get_value.side_effect = ["Open", "Acknowledged"]
        mock_resolve.return_value = {"name": "SR-001", "status": "Acknowledged"}

        result = acknowledge_service_requests(["SR-001", "SR-002"])

        mock_resolve.assert_called_once_with("SR-001", "Acknowledged")
        self.assertEqual(len(result), 1)

    @patch(f"{MOD}.resolve_service_request")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_accepts_a_json_encoded_list(self, mock_get_value, mock_resolve):
        # Frappe serialises list arguments over HTTP.
        mock_get_value.return_value = "Open"
        mock_resolve.return_value = {"name": "SR-001", "status": "Acknowledged"}

        acknowledge_service_requests('["SR-001"]')

        mock_resolve.assert_called_once_with("SR-001", "Acknowledged")

    @patch(f"{MOD}.resolve_service_request")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_a_foreign_row_does_not_sink_the_whole_list(self, mock_get_value, mock_resolve):
        import frappe

        mock_get_value.return_value = "Open"
        mock_resolve.side_effect = [
            frappe.PermissionError("other branch"),
            {"name": "SR-002", "status": "Acknowledged"},
        ]

        result = acknowledge_service_requests(["SR-001", "SR-002"])

        self.assertEqual(result, [{"name": "SR-002", "status": "Acknowledged"}])


class TestChannelName(unittest.TestCase):
    def test_channel_is_namespaced_per_branch(self):
        self.assertEqual(service_request_channel("Branch 1"), "ury_service_request_Branch 1")
