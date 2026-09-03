# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import now_datetime, get_datetime


class URYTableReservation(Document):
    def validate(self):
        self.set_defaults()
        self.validate_mandatory_fields()
        self.validate_status_transitions()
        self.validate_table_branch()
        self.validate_conflicts()

    def set_defaults(self):
        if not self.reserved_at:
            self.reserved_at = now_datetime()
        if not self.reserved_by:
            self.reserved_by = frappe.session.user
        if not self.no_of_pax or self.no_of_pax < 1:
            self.no_of_pax = 1
        if not self.status:
            self.status = "Confirmed"

        # If branch not set, try to infer from table or room
        if not self.branch and self.reserved_table:
            t_branch = frappe.db.get_value("URY Table", self.reserved_table, "branch")
            if not t_branch:
                t_room = frappe.db.get_value("URY Table", self.reserved_table, "restaurant_room")
                if t_room:
                    t_branch = frappe.db.get_value("URY Room", t_room, "branch")
            self.branch = t_branch

        # If customer_name not set, try to fetch from customer
        if not self.customer_name and self.customer:
            self.customer_name = frappe.db.get_value("Customer", self.customer, "customer_name") or self.customer

        # If customer_phone not set, try to fetch mobile from Customer
        if not self.customer_phone and self.customer:
            self.customer_phone = frappe.db.get_value("Customer", self.customer, "mobile_number") or ""

    def validate_mandatory_fields(self):
        if not self.customer:
            frappe.throw(_("Please select a customer."))
        if not self.customer_phone:
            frappe.throw(_("Please enter the customer's phone number."))
        if not self.no_of_pax or int(self.no_of_pax) < 1:
            frappe.throw(_("Please enter a valid number of persons."))
        if not self.reserved_table:
            frappe.throw(_("Please select a table."))
        if not self.reserved_at:
            frappe.throw(_("Please select a reservation time."))

    def validate_table_branch(self):
        if self.reserved_table:
            table_branch = frappe.db.get_value("URY Table", self.reserved_table, "branch")
            if not table_branch:
                table_room = frappe.db.get_value("URY Table", self.reserved_table, "restaurant_room")
                if table_room:
                    table_branch = frappe.db.get_value("URY Room", table_room, "branch")

            if table_branch and self.branch and table_branch != self.branch:
                frappe.throw(_("Table {0} does not belong to branch {1}.").format(self.reserved_table, self.branch))
            if not self.branch:
                self.branch = table_branch

    def validate_status_transitions(self):
        if self.is_new():
            if self.status not in ("Requested", "Confirmed", "Active"):
                self.status = "Confirmed"
            return

        old_doc = self.get_doc_before_save()
        if not old_doc:
            return

        old_status = old_doc.status
        new_status = self.status

        if old_status == new_status:
            return

        allowed_transitions = {
            "Requested": ["Confirmed", "Cancelled"],
            "Active": ["Completed", "Cancelled", "No Show"],
            "Confirmed": ["Completed", "Cancelled", "No Show"],
            "Completed": [],
            "Cancelled": [],
            "No Show": [],
        }

        if new_status not in allowed_transitions.get(old_status, []):
            frappe.throw(
                _("Invalid status transition from {0} to {1}.").format(old_status, new_status)
            )

    def validate_conflicts(self):
        # Only Confirmed / Active reservations require conflict validation
        if self.status not in ("Confirmed", "Active"):
            return

        from ury.ury.api.table_reservation import validate_reservation_conflicts
        validate_reservation_conflicts(
            table=self.reserved_table,
            branch=self.branch,
            reserved_at=self.reserved_at,
            exclude_name=self.name,
        )