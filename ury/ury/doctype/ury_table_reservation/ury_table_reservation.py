# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, now_datetime

# How long a table is held when nobody says otherwise.
#
# Ninety minutes is a full dinner sitting in most restaurants. It matters
# because it decides what counts as a clash: too short and two bookings
# overlap in reality while the system calls them fine, too long and a
# restaurant loses turns it could have sold.
DEFAULT_DURATION_MINUTES = 90

# Statuses that still hold a table. A cancelled or no-show booking releases
# it, and a completed one is history.
BLOCKING_STATUSES = ("Requested", "Confirmed", "Seated")


class URYTableReservation(Document):
	def validate(self):
		self.set_defaults()
		self.validate_window()
		self.validate_table_belongs_to_branch()
		self.validate_no_clash()
		self.validate_capacity()

	def set_defaults(self):
		if not self.reserved_to and self.reserved_from:
			self.reserved_to = add_to_date(
				get_datetime(self.reserved_from), minutes=DEFAULT_DURATION_MINUTES
			)
		if self.table and not self.restaurant_room:
			self.restaurant_room = frappe.db.get_value("URY Table", self.table, "restaurant_room")

	def validate_window(self):
		if get_datetime(self.reserved_to) <= get_datetime(self.reserved_from):
			frappe.throw(_("A reservation must end after it starts."))

		if self.is_new() and get_datetime(self.reserved_from) < now_datetime():
			# Recording a booking that already happened is a real thing staff
			# do (a walk-in they want on the sheet), so this is only blocked
			# for genuinely new bookings far in the past, not by a minute.
			if get_datetime(self.reserved_from) < add_to_date(now_datetime(), hours=-12):
				frappe.throw(_("This reservation starts more than 12 hours in the past."))

	def validate_table_belongs_to_branch(self):
		if not self.table:
			return
		table_branch = frappe.db.get_value("URY Table", self.table, "branch")
		if table_branch != self.branch:
			frappe.throw(
				_("Table {0} does not belong to branch {1}.").format(self.table, self.branch)
			)

	def validate_no_clash(self):
		"""Refuse a second booking on the same table at the same time.

		This is the whole point of the doctype. Without it a reservation
		system is a notepad: two guests are promised one table, and the
		restaurant finds out when the second one arrives.

		Overlap is strict — `from < other.to AND to > other.from` — so two
		sittings that merely touch (one ends at 20:00, the next starts at
		20:00) are allowed. Treating a touch as a clash would cost a turn on
		every table every night.
		"""
		if self.status not in BLOCKING_STATUSES:
			return

		# Public and staff bookings share this lock, including unassigned bookings.
		frappe.db.sql("SELECT name FROM `tabBranch` WHERE name = %s FOR UPDATE", self.branch)
		if not self.table:
			return

		clash = frappe.db.sql(
			"""
			SELECT name
			FROM `tabURY Table Reservation`
			WHERE `table` = %(table)s
			  AND name != %(name)s
			  AND status IN %(statuses)s
			  AND %(reserved_from)s < reserved_to
			  AND %(reserved_to)s > reserved_from
			LIMIT 1
			FOR UPDATE
			""",
			{
				"table": self.table,
				"name": self.name or "",
				"statuses": BLOCKING_STATUSES,
				"reserved_from": self.reserved_from,
				"reserved_to": self.reserved_to,
			},
			as_dict=True,
		)

		if clash:
			frappe.throw(
				_("This table is already reserved for the selected time."),
				frappe.ValidationError,
			)

	def validate_capacity(self):
		"""Warn, never block, when a party is larger than the table.

		Staff pull chairs across. A system that refuses to seat five people
		at a four-top is a system staff work around by not using it.
		"""
		if not self.table or not self.no_of_pax:
			return
		seats = frappe.db.get_value("URY Table", self.table, "no_of_seats")
		if seats and self.no_of_pax > seats:
			frappe.msgprint(
				_("Table {0} seats {1}, and this booking is for {2}.").format(
					self.table, seats, self.no_of_pax
				),
				indicator="orange",
				alert=True,
			)
