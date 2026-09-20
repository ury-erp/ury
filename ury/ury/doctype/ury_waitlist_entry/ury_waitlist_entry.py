# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# A guest waiting for a table.
#
# The queue is ordered by `joined_at` and nothing else. Not by creation, which
# would put a guest who was written down late behind one who arrived after
# them, and not by a position number, which every insertion would have to
# renumber and which two hosts editing at once would fight over.

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_datetime, now_datetime

# Statuses of an entry still in the queue: it is occupying a place and should
# be offered the next suitable table.
ACTIVE_STATUSES = ("Waiting", "Notified")

# What a status may become. Seating a guest who cancelled, or re-queueing a
# guest who has been seated, is a mistake rather than a correction — the
# correction is a new entry, which keeps the first one's history intact.
ALLOWED_TRANSITIONS = {
	"Waiting": {"Waiting", "Notified", "Seated", "Cancelled", "No Show"},
	"Notified": {"Notified", "Waiting", "Seated", "Cancelled", "No Show"},
	"Seated": {"Seated"},
	"Cancelled": {"Cancelled"},
	"No Show": {"No Show"},
}


class URYWaitlistEntry(Document):
	def validate(self):
		self.set_defaults()
		self.validate_party_size()
		self.validate_transition()
		self.validate_table()
		self.stamp_status_times()

	def set_defaults(self):
		if not self.joined_at:
			self.joined_at = now_datetime()
		if not self.status:
			self.status = "Waiting"

	def validate_party_size(self):
		if cint(self.no_of_pax) < 1:
			frappe.throw(_("A waiting party has at least one guest."))
		if cint(self.quoted_minutes or 0) < 0:
			frappe.throw(_("A quoted wait cannot be negative."))

	def validate_transition(self):
		if self.is_new():
			if self.status not in ACTIVE_STATUSES:
				# Adding someone to the queue as "Seated" records a seating
				# that never waited, which then skews every wait estimate
				# computed from this table.
				frappe.throw(_("A new waitlist entry starts as Waiting or Notified."))
			return

		before = self.get_doc_before_save()
		if not before or before.status == self.status:
			return
		if self.status not in ALLOWED_TRANSITIONS.get(before.status, set()):
			frappe.throw(
				_("A {0} entry cannot become {1}.").format(_(before.status), _(self.status))
			)

	def validate_table(self):
		if not self.table:
			if self.status == "Seated":
				frappe.throw(_("Choose the table this party was seated at."))
			return

		table = frappe.db.get_value(
			"URY Table", self.table, ["branch", "no_of_seats", "minimum_seating"], as_dict=True
		)
		if not table:
			frappe.throw(_("Table not found."))
		if table.branch != self.branch:
			frappe.throw(_("The table must belong to the same branch as the waiting party."))
		if cint(table.no_of_seats) and cint(self.no_of_pax) > cint(table.no_of_seats):
			frappe.throw(
				_("Table {0} seats {1}; this party is {2}.").format(
					self.table, table.no_of_seats, self.no_of_pax
				)
			)

	def stamp_status_times(self):
		before = self.get_doc_before_save() if not self.is_new() else None
		changed = not before or before.status != self.status

		if self.status == "Notified" and changed:
			self.notified_at = now_datetime()
		if self.status == "Seated" and changed:
			self.seated_at = now_datetime()

	def on_update(self):
		notify_waitlist_change(self)


# Channel is per-branch so a terminal only ever hears about its own queue.
WAITLIST_CHANNEL_PREFIX = "ury_waitlist"


def waitlist_channel(branch):
	return "{}_{}".format(WAITLIST_CHANNEL_PREFIX, branch)


def notify_waitlist_change(doc):
	"""Tell the branch's screens that the queue moved.

	A failed publish must never fail the save: the row is committed and every
	screen also reloads on its own, so the worst case is a late update rather
	than a host unable to write a guest down.
	"""
	try:
		frappe.publish_realtime(
			waitlist_channel(doc.branch),
			{
				"name": doc.name,
				"status": doc.status,
				"guest_name": doc.guest_name,
				"no_of_pax": cint(doc.no_of_pax),
				"table": doc.table,
				"branch": doc.branch,
			},
		)
	except Exception:
		try:
			frappe.log_error(frappe.get_traceback(), "Waitlist notification failed")
		except Exception:
			# No site or database context (unit tests): losing the log entry
			# must still not fail the host's save.
			pass


def waited_minutes(entry, now=None):
	"""How long this party has actually been waiting, in whole minutes.

	Measured to `seated_at` once they are seated, so a seated entry stops
	growing — a queue where yesterday's guests keep ageing is a queue whose
	averages mean nothing.
	"""
	joined = get_datetime(entry.get("joined_at"))
	if not joined:
		return 0
	end = get_datetime(entry.get("seated_at")) if entry.get("seated_at") else (now or now_datetime())
	return max(0, int((end - joined).total_seconds() // 60))
