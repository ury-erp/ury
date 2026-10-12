"""
Tests for the kitchen display's operational endpoints.

These cover the guards rather than the happy path plumbing: every one of these
endpoints is reachable by any logged-in kitchen user, and the interesting
question is what happens when the arguments do not belong to them.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.api.ury_kot_display import (
    recall_kot,
    set_item_availability,
    set_kot_item_prepared,
    start_kot_prep,
)


def _kot(branch="Branch A", production="Grill", order_status="Ready For Prepare", start_time_prep=None):
    doc = MagicMock()
    doc.branch = branch
    doc.production = production
    doc.order_status = order_status
    doc.start_time_prep = start_time_prep
    return doc


class TestKOTItemPrepared(FrappeTestCase):
    """`set_kot_item_prepared` writes one child row of one ticket."""

    @patch("ury.ury.api.ury_kot_display.frappe.publish_realtime")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.db.exists")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_row_must_belong_to_the_ticket(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch,
        mock_exists, mock_set_value, mock_publish,
    ):
        """A row name from another ticket must not be writable.

        Without this check, any row in the system could be flipped by pairing
        it with a KOT the caller legitimately has write access to.
        """
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot()
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"
        mock_exists.return_value = None  # the row is not on this ticket

        with self.assertRaisesRegex(frappe.ValidationError, "not part of this ticket"):
            set_kot_item_prepared("KOT-001", "URYKOTITM-FOREIGN", 1)

        mock_set_value.assert_not_called()
        mock_publish.assert_not_called()

    @patch("ury.ury.api.ury_kot_display.frappe.publish_realtime")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.db.exists")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_unmarking_clears_attribution(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch,
        mock_exists, mock_set_value, mock_publish,
    ):
        """Undoing a plated item must not leave a stale cook and timestamp."""
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot()
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"
        mock_exists.return_value = "URYKOTITM-001"

        set_kot_item_prepared("KOT-001", "URYKOTITM-001", 0)

        values = mock_set_value.call_args[0][2]
        self.assertEqual(values["prepared"], 0)
        self.assertIsNone(values["prepared_at"])
        self.assertIsNone(values["prepared_by"])

    @patch("ury.ury.api.ury_kot_display.frappe.publish_realtime")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.db.exists")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_broadcasts_on_the_station_channel(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch,
        mock_exists, mock_set_value, mock_publish,
    ):
        """Other screens on the same station are what make this shared state."""
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot(branch="Branch A", production="Grill")
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"
        mock_exists.return_value = "URYKOTITM-001"

        set_kot_item_prepared("KOT-001", "URYKOTITM-001", 1)

        channel, payload = mock_publish.call_args[0]
        self.assertEqual(channel, "kot_item_update_Branch A_Grill")
        self.assertEqual(payload["prepared"], 1)
        self.assertEqual(payload["prepared_by"], "cook@test.com")

    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_other_branch_is_rejected(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch
    ):
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot(branch="Branch B")
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        with self.assertRaises(frappe.PermissionError):
            set_kot_item_prepared("KOT-001", "URYKOTITM-001", 1)


class TestStartPrep(FrappeTestCase):

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_second_call_keeps_the_original_start(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value
    ):
        """Cooking began at the first tap; a second one must not move it."""
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot(start_time_prep="10:00:00")
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        result = start_kot_prep("KOT-001")

        self.assertEqual(result["start_time_prep"], "10:00:00")
        mock_set_value.assert_not_called()

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_records_who_claimed_it(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value
    ):
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot(start_time_prep=None)
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        start_kot_prep("KOT-001")

        values = mock_set_value.call_args[0][2]
        self.assertEqual(values["prepared_by"], "cook@test.com")
        self.assertTrue(values["start_time_prep"])


class TestRecall(FrappeTestCase):

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_only_a_served_ticket_can_be_recalled(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value
    ):
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot(order_status="Ready For Prepare")
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        with self.assertRaisesRegex(frappe.ValidationError, "served ticket"):
            recall_kot("KOT-001")

        mock_set_value.assert_not_called()

    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.get_doc")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    def test_recall_clears_serve_timings(
        self, mock_session, mock_get_doc, mock_has_permission, mock_get_branch, mock_set_value
    ):
        """A mis-tap must not leave a production time in the shift average."""
        mock_session.user = "cook@test.com"
        mock_get_doc.return_value = _kot(order_status="Served")
        mock_has_permission.return_value = True
        mock_get_branch.return_value = "Branch A"

        recall_kot("KOT-001")

        values = mock_set_value.call_args[0][2]
        self.assertEqual(values["order_status"], "Ready For Prepare")
        self.assertIsNone(values["start_time_serv"])
        self.assertIsNone(values["production_time"])


class TestItemAvailability(FrappeTestCase):
    """Taking a dish off the menu ("86") is branch-scoped and permissioned."""

    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    def test_requires_menu_write_permission(self, mock_get_branch, mock_has_permission):
        mock_get_branch.return_value = "Branch A"
        mock_has_permission.return_value = False

        with self.assertRaises(frappe.PermissionError):
            set_item_availability("ITEM-001", 0)

    @patch("ury.ury.api.ury_kot_display.frappe.get_all")
    @patch("ury.ury.api.ury_kot_display.frappe.db.get_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    def test_rejects_a_menu_from_another_branch(
        self, mock_get_branch, mock_has_permission, mock_get_value, mock_get_all
    ):
        """An explicit `menu` argument must be one of this branch's own."""
        mock_get_branch.return_value = "Branch A"
        mock_has_permission.return_value = True
        mock_get_value.side_effect = ["Restaurant A", "Menu A"]
        mock_get_all.return_value = []

        with self.assertRaisesRegex(frappe.ValidationError, "does not belong to this branch"):
            set_item_availability("ITEM-001", 0, menu="Menu Of Another Branch")

    @patch("ury.ury.api.ury_kot_display.frappe.get_all")
    @patch("ury.ury.api.ury_kot_display.frappe.db.get_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    def test_unknown_item_is_rejected(
        self, mock_get_branch, mock_has_permission, mock_get_value, mock_get_all
    ):
        mock_get_branch.return_value = "Branch A"
        mock_has_permission.return_value = True
        mock_get_value.side_effect = ["Restaurant A", "Menu A"]
        # No child menus, and no matching URY Menu Item rows.
        mock_get_all.return_value = []

        with self.assertRaisesRegex(frappe.ValidationError, "not on this branch's menu"):
            set_item_availability("ITEM-NOT-ON-MENU", 0)

    @patch("ury.ury.api.ury_kot_display.frappe.publish_realtime")
    @patch("ury.ury.api.ury_kot_display.frappe.utils.now")
    @patch("ury.ury.api.ury_kot_display.frappe.db.set_value")
    @patch("ury.ury.api.ury_kot_display.frappe.get_all")
    @patch("ury.ury.api.ury_kot_display.frappe.db.get_value")
    @patch("ury.ury.api.ury_kot_display.frappe.has_permission")
    @patch("ury.ury.api.ury_kot_display.frappe.session")
    @patch("ury.ury.api.ury_kot_display.getBranch")
    def test_touches_the_menu_so_tills_refetch(
        self, mock_get_branch, mock_session, mock_has_permission, mock_get_value,
        mock_get_all, mock_set_value, mock_now, mock_publish,
    ):
        """The POS and kiosk poll `URY Menu.modified` to decide to refetch.

        Only a child row changes here, so the parent's timestamp has to be
        moved explicitly or the change would never reach a till.
        """
        mock_get_branch.return_value = "Branch A"
        mock_session.user = "cook@test.com"
        mock_has_permission.return_value = True
        mock_get_value.side_effect = ["Restaurant A", "Menu A"]
        mock_now.return_value = "2026-09-18 12:00:00"

        def get_all(doctype, **kwargs):
            if doctype in ("Menu for Room", "Order Type Menu"):
                return []
            return [frappe._dict({"name": "ROW-1", "parent": "Menu A"})]

        mock_get_all.side_effect = get_all

        result = set_item_availability("ITEM-001", 0)

        self.assertEqual(result["menus"], ["Menu A"])
        menu_writes = [
            c for c in mock_set_value.call_args_list if c[0][0] == "URY Menu"
        ]
        self.assertTrue(menu_writes, "the parent menu's modified was not touched")
        self.assertEqual(menu_writes[0][0][2], "modified")

        channel, payload = mock_publish.call_args[0]
        self.assertEqual(channel, "menu_availability_Branch A")
        self.assertEqual(payload["available"], 0)
