# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# The queue at the door.
#
# The list itself is bookkeeping. What decides whether a host uses this
# instead of a paper pad is the answer to the only question a waiting guest
# asks — "how long?" — and that answer has to come from what this branch's
# tables are actually doing right now, not from a number someone typed into
# a settings page once.

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, now_datetime

from ury.ury_pos.api import getBranch
from ury.ury.doctype.ury_waitlist_entry.ury_waitlist_entry import (
	ACTIVE_STATUSES,
	waited_minutes,
	waitlist_channel,
)

# What a sitting takes when history cannot say. Only used by a branch with no
# settled dine-in invoices yet; after its first evening the real number takes
# over.
DEFAULT_TURN_MINUTES = 60

# How far back to look for that real number. Long enough to smooth a quiet
# Tuesday, short enough that a menu or service change shows up within a week.
TURN_SAMPLE_DAYS = 14

# A sitting longer than this is a table someone forgot to close, not a slow
# dinner, and averaging it in would quote every guest a wait of hours.
MAX_CREDIBLE_TURN_MINUTES = 240


def _branch(branch=None):
	"""Branch from the session, never from the caller.

	A waitlist holds guest names and phone numbers, so one branch reading
	another's queue turns a seating tool into a contact list — the same rule
	the reservations API follows.
	"""
	if frappe.session.user == "Administrator" and branch:
		return branch
	return getBranch()


def _suitable_tables(branch, pax):
	"""Tables this party could actually be seated at.

	A table too small cannot take them, and a table whose minimum seating is
	above the party size is one the restaurant does not want a couple sitting
	at on a busy night. Merged tables are excluded because the merge already
	decided what they are part of.
	"""
	pax = cint(pax)
	rows = frappe.get_all(
		"URY Table",
		filters={"branch": branch, "is_take_away": 0},
		fields=["name", "no_of_seats", "minimum_seating", "occupied",
				"latest_invoice_time", "restaurant_room", "merged_with"],
		limit_page_length=0,
	)
	return [
		row for row in rows
		if not row.merged_with
		and (not cint(row.no_of_seats) or cint(row.no_of_seats) >= pax)
		and (not cint(row.minimum_seating) or cint(row.minimum_seating) <= pax)
	]


def average_turn_minutes(branch):
	"""How long a table is actually held here, from settled invoices.

	Measured from the invoice being created to it being modified, which for a
	dine-in bill is the span between the first order and the settlement. It
	is not exact — a bill amended the next morning overstates it — so the
	absurd end is trimmed rather than trusted.
	"""
	row = frappe.db.sql(
		"""
		SELECT AVG(TIMESTAMPDIFF(MINUTE, `creation`, `modified`)) AS turn
		FROM `tabPOS Invoice`
		WHERE `branch` = %(branch)s
			AND `docstatus` = 1
			AND `order_type` = 'Dine In'
			AND `creation` >= DATE_SUB(CURDATE(), INTERVAL %(days)s DAY)
			AND TIMESTAMPDIFF(MINUTE, `creation`, `modified`) BETWEEN 1 AND %(cap)s
		""",
		{"branch": branch, "days": TURN_SAMPLE_DAYS, "cap": MAX_CREDIBLE_TURN_MINUTES},
		as_dict=True,
	)
	turn = cint((row[0].turn if row and row[0].turn else 0))
	return turn or DEFAULT_TURN_MINUTES


def _minutes_until_free(table, turn, now):
	"""When this table is likely to come free, in minutes from now.

	`latest_invoice_time` is a Time field with no date, so a table seated at
	23:30 and read at 00:10 reads as minus fourteen hours — the same trap the
	service line fell into. A negative gap means the clock crossed midnight.
	"""
	if not cint(table.get("occupied")):
		return 0

	seated = table.get("latest_invoice_time")
	if not seated:
		# Occupied with no seating time recorded. Assume a whole sitting
		# rather than "free now": quoting zero and then making a guest wait
		# is worse than quoting long and seating them early.
		return turn

	try:
		now_at = get_datetime(now)
		seated_at = get_datetime(f"{now_at.date()} {seated}")
		elapsed = int((now_at - seated_at).total_seconds() // 60)
	except Exception:
		return turn

	if elapsed < 0:
		elapsed += 24 * 60
	return max(0, turn - elapsed)


def estimate_wait(branch, pax, ahead=None, now=None):
	"""Minutes this party should be told to expect, and why.

	The model is deliberately simple enough to explain to a host: line the
	suitable tables up by when each comes free, then hand them out to the
	parties already waiting before this one. Whatever table this party ends
	up with is their wait. When the queue is longer than the number of
	suitable tables, the later parties wait for a second and third turn of
	the same tables.
	"""
	now = now or now_datetime()
	turn = average_turn_minutes(branch)
	tables = _suitable_tables(branch, pax)

	if not tables:
		# No table in this branch can seat this party at all. Saying "no
		# tables" is the honest answer; quoting a wait implies one exists.
		return {"minutes": None, "reason": "no_suitable_table", "turn_minutes": turn,
				"suitable_tables": 0, "ahead": cint(ahead or 0)}

	if ahead is None:
		ahead = len(active_entries(branch, fitting_pax=pax))

	free_at = sorted(_minutes_until_free(table, turn, now) for table in tables)
	position = cint(ahead)

	# Parties beyond the number of tables wait for a table to turn again.
	rounds, index = divmod(position, len(free_at))
	minutes = free_at[index] + rounds * turn

	return {
		"minutes": minutes,
		"reason": "free_now" if minutes == 0 else "next_table",
		"turn_minutes": turn,
		"suitable_tables": len(tables),
		"ahead": position,
	}


def active_entries(branch, fitting_pax=None):
	"""Everyone still in the queue, oldest first.

	`fitting_pax` narrows it to parties competing for the same tables as a
	party of that size: a table for two coming free does not shorten the wait
	of the family of eight in front of you.
	"""
	rows = frappe.get_all(
		"URY Waitlist Entry",
		filters={"branch": branch, "status": ["in", ACTIVE_STATUSES]},
		fields=["name", "guest_name", "no_of_pax", "joined_at", "status"],
		order_by="joined_at asc",
		limit_page_length=0,
	)
	if fitting_pax is None:
		return rows
	return [row for row in rows if cint(row.no_of_pax) >= cint(fitting_pax)]


@frappe.whitelist()
def get_waitlist(branch=None, include_closed=0):
	"""The queue, with each party's position, real wait and current estimate."""
	branch = _branch(branch)
	now = now_datetime()

	filters = {"branch": branch}
	if cint(include_closed):
		filters["joined_at"] = [">=", frappe.utils.today()]
	else:
		filters["status"] = ["in", ACTIVE_STATUSES]

	rows = frappe.get_all(
		"URY Waitlist Entry",
		filters=filters,
		fields=["name", "guest_name", "mobile_number", "no_of_pax", "branch",
				"restaurant_room", "status", "joined_at", "notified_at",
				"seated_at", "table", "quoted_minutes", "notes", "source"],
		order_by="joined_at asc",
		limit_page_length=0,
	)

	active = [row for row in rows if row.status in ACTIVE_STATUSES]
	turn = average_turn_minutes(branch)

	for index, row in enumerate(active):
		ahead = sum(
			1 for other in active[:index] if cint(other.no_of_pax) >= cint(row.no_of_pax)
		)
		row["position"] = index + 1
		row["estimate"] = estimate_wait(branch, row.no_of_pax, ahead=ahead, now=now)

	for row in rows:
		row["waited_minutes"] = waited_minutes(row, now=now)

	return {"entries": rows, "turn_minutes": turn, "branch": branch}


@frappe.whitelist()
def get_wait_quote(no_of_pax, branch=None):
	"""What to tell a party of this size before they decide to wait."""
	return estimate_wait(_branch(branch), cint(no_of_pax))


@frappe.whitelist()
def join_waitlist(guest_name, no_of_pax, mobile_number=None, restaurant_room=None,
				  notes=None, quoted_minutes=None, source="Walk-in", branch=None):
	"""Write a party down at the door."""
	branch = _branch(branch)

	if quoted_minutes in (None, ""):
		# Record what the guest was told even when the host just accepted the
		# suggestion, so the quote can later be compared with the real wait.
		quote = estimate_wait(branch, no_of_pax)
		quoted_minutes = quote["minutes"]

	doc = frappe.get_doc({
		"doctype": "URY Waitlist Entry",
		"guest_name": guest_name,
		"mobile_number": mobile_number,
		"no_of_pax": cint(no_of_pax),
		"branch": branch,
		"restaurant_room": restaurant_room,
		"notes": notes,
		"quoted_minutes": cint(quoted_minutes or 0),
		"source": source if source in ("Walk-in", "Phone", "Staff") else "Walk-in",
		"joined_at": now_datetime(),
		"status": "Waiting",
	})
	doc.insert()
	return {"name": doc.name, "quoted_minutes": cint(doc.quoted_minutes)}


@frappe.whitelist()
def set_status(entry, status, table=None):
	"""Move a party along: notified, seated, gone."""
	doc = frappe.get_doc("URY Waitlist Entry", entry)
	doc.check_permission("write")

	if table:
		doc.table = table
	doc.status = status
	doc.save()

	return {"name": doc.name, "status": doc.status, "table": doc.table}


@frappe.whitelist()
def suggest_tables(entry):
	"""Tables that could take this party now, soonest first.

	Free tables first, then the ones closest to turning, because a host
	deciding where to put a party wants both answers in one list.
	"""
	doc = frappe.get_doc("URY Waitlist Entry", entry)
	doc.check_permission("read")

	now = now_datetime()
	turn = average_turn_minutes(doc.branch)
	tables = _suitable_tables(doc.branch, doc.no_of_pax)

	rows = [{
		"name": table.name,
		"no_of_seats": cint(table.no_of_seats),
		"restaurant_room": table.restaurant_room,
		"occupied": bool(cint(table.occupied)),
		"free_in_minutes": _minutes_until_free(table, turn, now),
		"preferred_room": bool(doc.restaurant_room and table.restaurant_room == doc.restaurant_room),
	} for table in tables]

	rows.sort(key=lambda row: (not row["preferred_room"], row["free_in_minutes"], row["name"]))
	return rows


def announce_table_free(table):
	"""Tell the branch's screens that a table came free, and who is next.

	Called when a bill is settled. Wrapped in its own failure handling for
	the same reason the service request broadcast is: a host missing a
	notification is an inconvenience, a guest unable to pay is not.
	"""
	try:
		row = frappe.db.get_value(
			"URY Table", table, ["branch", "no_of_seats", "restaurant_room"], as_dict=True
		)
		if not row or not row.branch:
			return

		waiting = frappe.get_all(
			"URY Waitlist Entry",
			filters={"branch": row.branch, "status": "Waiting"},
			fields=["name", "guest_name", "no_of_pax", "restaurant_room", "joined_at"],
			order_by="joined_at asc",
			limit_page_length=0,
		)
		seats = cint(row.no_of_seats)
		next_party = next(
			(entry for entry in waiting if not seats or cint(entry.no_of_pax) <= seats), None
		)
		if not next_party:
			return

		frappe.publish_realtime(
			waitlist_channel(row.branch),
			{
				"event": "table_free",
				"table": table,
				"branch": row.branch,
				"restaurant_room": row.restaurant_room,
				"name": next_party.name,
				"guest_name": next_party.guest_name,
				"no_of_pax": cint(next_party.no_of_pax),
			},
		)
	except Exception:
		try:
			frappe.log_error(frappe.get_traceback(), "Waitlist table announcement failed")
		except Exception:
			pass


@frappe.whitelist()
def get_waitlist_summary(branch=None):
	"""Today's queue in numbers, including whether the quotes were honest."""
	branch = _branch(branch)
	rows = frappe.get_all(
		"URY Waitlist Entry",
		filters={"branch": branch, "joined_at": [">=", frappe.utils.today()]},
		fields=["status", "joined_at", "seated_at", "quoted_minutes", "no_of_pax"],
		limit_page_length=0,
	)

	seated = [row for row in rows if row.status == "Seated" and row.seated_at]
	waits = [waited_minutes(row) for row in seated]
	quoted = [cint(row.quoted_minutes) for row in seated if cint(row.quoted_minutes)]

	return {
		"waiting": sum(1 for row in rows if row.status in ACTIVE_STATUSES),
		"guests_waiting": sum(cint(row.no_of_pax) for row in rows if row.status in ACTIVE_STATUSES),
		"seated_today": len(seated),
		"left_today": sum(1 for row in rows if row.status in ("Cancelled", "No Show")),
		"average_wait": int(sum(waits) / len(waits)) if waits else 0,
		"average_quote": int(sum(quoted) / len(quoted)) if quoted else 0,
		"turn_minutes": average_turn_minutes(branch),
	}
