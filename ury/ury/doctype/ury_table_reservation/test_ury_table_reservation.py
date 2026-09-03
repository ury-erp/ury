# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime, add_to_date, get_datetime
from datetime import timedelta
from ury.ury.api.table_reservation import (
    create_table_reservation,
    update_table_reservation,
    update_reservation_status,
    check_table_reservation,
    get_branch_reservation_settings,
)
from ury.ury.api.reservation_scheduler import process_reservation_no_shows
from ury.ury.report.average_table_time.average_table_time import (
    get_branch_reservation_duration,
)


class TestURYTableReservation(FrappeTestCase):
    def setUp(self):
        cust_group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name") or "Individual"
        territory = frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories"
        restaurant = "KFC"
        self.branch = "KFC"

        # Create test customer if not exists
        if not frappe.db.exists("Customer", "_Test Reservation Customer"):
            cust = frappe.get_doc({
                "doctype": "Customer",
                "customer_name": "_Test Reservation Customer",
                "customer_group": cust_group,
                "territory": territory,
                "mobile_number": "9876543210",
            })
            cust.insert(ignore_permissions=True)

        if not frappe.db.exists("Customer", "_Test Customer B"):
            cust_b = frappe.get_doc({
                "doctype": "Customer",
                "customer_name": "_Test Customer B",
                "customer_group": cust_group,
                "territory": territory,
                "mobile_number": "9876543211",
            })
            cust_b.insert(ignore_permissions=True)

        # Ensure branch exists and has reservation settings
        if not frappe.db.exists("Branch", self.branch):
            br = frappe.get_doc({
                "doctype": "Branch",
                "branch": self.branch,
                "user": [{"doctype": "URY User", "user": "Administrator"}],
                "custom_enable_reservation": 1,
                "custom_buffer_time": 30,
                "custom_grace_period": 15,
            })
            br.insert(ignore_permissions=True)
        else:
            frappe.db.set_value("Branch", self.branch, {
                "custom_enable_reservation": 1,
                "custom_buffer_time": 30,
                "custom_grace_period": 15,
            })

        # Create test room if not exists
        if not frappe.db.exists("URY Room", "_Test Reservation Room"):
            room = frappe.get_doc({
                "doctype": "URY Room",
                "name": "_Test Reservation Room",
                "room_name": "_Test Reservation Room",
                "branch": self.branch,
            })
            room.insert(ignore_permissions=True)

        # Create test table if not exists
        if not frappe.db.exists("URY Table", "_Test Reservation Table 1"):
            table = frappe.get_doc({
                "doctype": "URY Table",
                "name": "_Test Reservation Table 1",
                "table_name": "_Test Reservation Table 1",
                "restaurant": restaurant,
                "restaurant_room": "_Test Reservation Room",
                "branch": self.branch,
                "no_of_seats": 4,
                "occupied": 0,
            })
            table.insert(ignore_permissions=True)

        # Clean up existing test reservations
        frappe.db.sql(
            "DELETE FROM `tabURY Table Reservation` WHERE reserved_table = '_Test Reservation Table 1'"
        )
        frappe.db.commit()

    def tearDown(self):
        frappe.db.sql(
            "DELETE FROM `tabURY Table Reservation` WHERE reserved_table = '_Test Reservation Table 1'"
        )
        frappe.db.commit()

    def test_create_reservation_with_mandatory_fields(self):
        res_time = (now_datetime() + timedelta(days=1)).strftime("%Y-%m-%d 19:00:00")
        res_id = create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Reservation Customer",
            customer_name="Test Res Customer",
            customer_phone="9876543210",
            no_of_pax=4,
            reserved_at=res_time,
            notes="Birthday dinner",
            branch=self.branch,
        )
        self.assertTrue(res_id)
        doc = frappe.get_doc("URY Table Reservation", res_id)
        self.assertEqual(doc.status, "Confirmed")
        self.assertEqual(doc.customer_phone, "9876543210")
        self.assertEqual(doc.no_of_pax, 4)

    def test_same_table_same_time_conflict(self):
        res_time = (now_datetime() + timedelta(days=2)).strftime("%Y-%m-%d 20:00:00")
        create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Reservation Customer",
            customer_name="Customer A",
            customer_phone="9876543210",
            no_of_pax=2,
            reserved_at=res_time,
            branch=self.branch,
        )

        # Attempting to book exact same time should throw exception
        with self.assertRaises(frappe.ValidationError):
            create_table_reservation(
                table="_Test Reservation Table 1",
                customer="_Test Customer B",
                customer_name="Customer B",
                customer_phone="9876543211",
                no_of_pax=2,
                reserved_at=res_time,
                branch=self.branch,
            )

    def test_overlapping_time_window_conflict_with_buffer(self):
        # Reservation 1: 10:00 PM (22:00). With 90 min duration -> ends at 23:30.
        # Customer B attempts 11:00 PM (23:00) -> overlaps dining window!
        base_date = (now_datetime() + timedelta(days=3)).strftime("%Y-%m-%d")
        res1_time = f"{base_date} 22:00:00"
        res2_time = f"{base_date} 23:00:00"

        create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Reservation Customer",
            customer_name="Customer A",
            customer_phone="9876543210",
            no_of_pax=2,
            reserved_at=res1_time,
            branch=self.branch,
        )

        with self.assertRaises(frappe.ValidationError):
            create_table_reservation(
                table="_Test Reservation Table 1",
                customer="_Test Customer B",
                customer_name="Customer B",
                customer_phone="9876543211",
                no_of_pax=2,
                reserved_at=res2_time,
                branch=self.branch,
            )

    def test_non_conflicting_reservations_with_buffer_spacing(self):
        # Reservation 1: 18:00 (6:00 PM). Duration 90 mins -> ends at 19:30. Buffer is 30 mins.
        # Reservation 2: 20:00 (8:00 PM). Buffer starts at 19:30 -> Exact fit without conflict!
        base_date = (now_datetime() + timedelta(days=4)).strftime("%Y-%m-%d")
        res1_time = f"{base_date} 18:00:00"
        res2_time = f"{base_date} 20:00:00"

        res1_id = create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Reservation Customer",
            customer_name="Customer A",
            customer_phone="9876543210",
            no_of_pax=2,
            reserved_at=res1_time,
            branch=self.branch,
        )
        res2_id = create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Customer B",
            customer_name="Customer B",
            customer_phone="9876543211",
            no_of_pax=2,
            reserved_at=res2_time,
            branch=self.branch,
        )
        self.assertTrue(res1_id)
        self.assertTrue(res2_id)

    def test_edit_reservation_and_cancel_flow(self):
        base_date = (now_datetime() + timedelta(days=5)).strftime("%Y-%m-%d")
        res_time = f"{base_date} 19:00:00"

        res_id = create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Reservation Customer",
            customer_name="Customer A",
            customer_phone="9876543210",
            no_of_pax=2,
            reserved_at=res_time,
            branch=self.branch,
        )

        # Update notes and pax
        update_table_reservation(
            reservation_name=res_id,
            no_of_pax=6,
            notes="Changed to 6 persons",
        )

        doc = frappe.get_doc("URY Table Reservation", res_id)
        self.assertEqual(doc.no_of_pax, 6)
        self.assertEqual(doc.comments, "Changed to 6 persons")

        # Cancel reservation
        update_reservation_status(res_id, "Cancelled")
        doc.reload()
        self.assertEqual(doc.status, "Cancelled")

        # Now creating a new reservation for the same slot should succeed
        res_new_id = create_table_reservation(
            table="_Test Reservation Table 1",
            customer="_Test Customer B",
            customer_name="Customer B",
            customer_phone="9876543211",
            no_of_pax=2,
            reserved_at=res_time,
            branch=self.branch,
        )
        self.assertTrue(res_new_id)

    def test_automatic_no_show_handling(self):
        # Create a past reservation whose grace period has expired (e.g. 2 hours ago)
        past_time = (now_datetime() - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")

        doc = frappe.get_doc({
            "doctype": "URY Table Reservation",
            "branch": self.branch,
            "reserved_table": "_Test Reservation Table 1",
            "customer": "_Test Reservation Customer",
            "customer_name": "Late Customer",
            "customer_phone": "9876543210",
            "no_of_pax": 2,
            "reserved_at": past_time,
            "status": "Confirmed",
        })
        doc.insert(ignore_permissions=True, ignore_links=True)
        frappe.db.commit()

        # Run the background no-show task
        process_reservation_no_shows()

        doc.reload()
        self.assertEqual(doc.status, "No Show")
