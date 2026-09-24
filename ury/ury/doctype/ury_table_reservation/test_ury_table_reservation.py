"""Tests for the one thing a reservation system must never get wrong.

Promising one table to two guests is the failure that makes staff stop
trusting the system and go back to a paper book, so the overlap rules are
what is checked here — including the two edges where a naive implementation
gets it wrong in opposite directions.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

BRANCH = None
TABLE = None


class TestReservationClashes(FrappeTestCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        global BRANCH, TABLE
        TABLE = frappe.db.get_value("URY Table", {"is_take_away": 0}, "name")
        if TABLE:
            BRANCH = frappe.db.get_value("URY Table", TABLE, "branch")

    def setUp(self):
        if not TABLE:
            self.skipTest("This site has no dine-in table to reserve.")
        self.start = add_to_date(now_datetime(), hours=3)
        self._made = []

    def tearDown(self):
        for name in self._made:
            if frappe.db.exists("URY Table Reservation", name):
                frappe.delete_doc("URY Table Reservation", name, force=1, ignore_permissions=True)
        frappe.db.commit()

    # `table=TABLE` as a default would bind at class-definition time, when the
    # global is still None — every booking would then be table-less and the
    # clash tests would pass by never testing a clash. A sentinel keeps the
    # lookup at call time.
    _USE_DEFAULT_TABLE = object()

    def _book(self, guest, start, end=None, table=_USE_DEFAULT_TABLE, status="Confirmed"):
        if table is self._USE_DEFAULT_TABLE:
            table = TABLE
        doc = frappe.get_doc({
            "doctype": "URY Table Reservation",
            "guest_name": guest,
            "branch": BRANCH,
            "table": table,
            "no_of_pax": 2,
            "reserved_from": start,
            "reserved_to": end,
            "status": status,
        })
        doc.insert(ignore_permissions=True)
        self._made.append(doc.name)
        return doc

    def test_a_default_duration_is_applied(self):
        """A booking with no end time still occupies a window, or it clashes
        with nothing and the whole check is decorative."""
        doc = self._book("Default", self.start)
        self.assertIsNotNone(doc.reserved_to)
        self.assertGreater(doc.reserved_to, doc.reserved_from)

    def test_an_overlapping_booking_is_refused(self):
        self._book("First", self.start)
        with self.assertRaises(frappe.ValidationError):
            self._book("Overlap", add_to_date(self.start, minutes=30))

    def test_two_sittings_that_merely_touch_are_allowed(self):
        """One ends at 20:00, the next starts at 20:00. Calling that a clash
        costs a turn on every table every night."""
        first = self._book("Early", self.start)
        second = self._book("Late", first.reserved_to)
        self.assertTrue(second.name)

    def test_a_cancelled_booking_releases_the_table(self):
        first = self._book("Cancelled", self.start)
        first.status = "Cancelled"
        first.save(ignore_permissions=True)

        replacement = self._book("Replacement", self.start)
        self.assertTrue(replacement.name)

    def test_a_no_show_releases_the_table(self):
        first = self._book("Absent", self.start)
        first.status = "No Show"
        first.save(ignore_permissions=True)

        self.assertTrue(self._book("WalkIn", self.start).name)

    def test_a_booking_without_a_table_never_clashes(self):
        """"A table for four at eight" holds no particular table, so two of
        them are perfectly normal."""
        self._book("Unassigned A", self.start, table=None)
        self.assertTrue(self._book("Unassigned B", self.start, table=None).name)

    def test_an_end_before_its_start_is_refused(self):
        with self.assertRaises(frappe.ValidationError):
            self._book("Backwards", self.start, add_to_date(self.start, hours=-1))

    def test_editing_a_booking_does_not_clash_with_itself(self):
        doc = self._book("Self", self.start)
        doc.no_of_pax = 4
        doc.save(ignore_permissions=True)
        self.assertEqual(doc.no_of_pax, 4)
