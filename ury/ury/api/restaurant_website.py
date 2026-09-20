"""Public restaurant content and reservations. Never return customer records."""

import re
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, get_datetime, get_time, now_datetime

from ury.ury.doctype.ury_table_reservation.ury_table_reservation import BLOCKING_STATUSES
from ury.ury.doctype.ury_website.ury_website import DAYS, public_url


def website(slug, preview=False):
	name = frappe.db.get_value("URY Website", {"slug": str(slug or "")[:80]}, "name")
	if not name:
		frappe.throw(_("Page not found."), frappe.DoesNotExistError)
	doc = frappe.get_doc("URY Website", name)
	if preview:
		doc.check_permission("write")
	elif not doc.published:
		frappe.throw(_("Page not found."), frappe.DoesNotExistError)
	return doc


def page_content(slug, preview=False):
	doc = website(slug, preview=preview)
	keys = ("slug", "restaurant_name", "language", "theme", "eyebrow", "hero_title", "hero_description",
			"show_story", "story_title", "story", "show_menu", "menu_note", "address", "phone",
			"enable_reservations", "duration_minutes", "lead_minutes", "advance_days", "max_guests",
			"booking_note", "privacy_note", "seo_title", "seo_description")
	data = {key: doc.get(key) for key in keys}
	for key in ("logo", "hero_image", "story_image", "map_url", "instagram_url"):
		data[key] = public_url(doc.get(key), image=key not in ("map_url", "instagram_url"))
	data["phone_link"] = re.sub(r"[^+0-9]", "", doc.phone or "")
	data["gallery"] = [{"image": public_url(row.image, image=True), "caption": row.caption or ""}
					   for row in doc.gallery]
	data["hours"] = [{"day": row.day, "opens": get_time(row.opens).strftime("%H:%M"), "closes": get_time(row.closes).strftime("%H:%M")}
					 for row in sorted(doc.hours, key=lambda h: DAYS.index(h.day))]
	data["timezone"] = frappe.utils.get_system_timezone()
	data["today"] = str(now_datetime().date())
	data["last_day"] = str((now_datetime() + timedelta(days=cint(doc.advance_days))).date())
	data["menu_items"] = []
	data["currency"] = ""
	restaurant = frappe.get_doc("URY Restaurant", doc.restaurant)
	menu_name = doc.menu or restaurant.active_menu
	if doc.show_menu and menu_name:
		menu = frappe.get_doc("URY Menu", menu_name)
		if menu.enabled and menu.branch == restaurant.branch:
			data["currency"] = frappe.db.get_value("Price List", menu.price_list, "currency") or ""
			items = frappe.get_all("Item", filters={"name": ["in", [r.item for r in menu.items]], "disabled": 0},
								 fields=["name", "item_name", "image"])
			by_name = {item.name: item for item in items}
			data["menu_items"] = [{"name": row.item_name or by_name[row.item].item_name,
				"rate": row.rate, "course": row.course or "", "special": row.special_dish,
				"image": public_url(by_name[row.item].image, image=True)}
				for row in menu.items if not row.disabled and row.item in by_name]
	return data


def booking_window(doc, reserved_from, no_of_pax, now=None):
	if not doc.enable_reservations:
		frappe.throw(_("Online reservations are currently closed."))
	try:
		start = get_datetime(reserved_from)
		pax = int(str(no_of_pax))
	except (ValueError, TypeError, OverflowError):
		frappe.throw(_("Choose a valid date, time and number of guests."))
	if not reserved_from or start.tzinfo is not None or start.second or start.microsecond or start.minute % 15:
		frappe.throw(_("Choose a time in 15-minute intervals, in the restaurant's local time."))
	if not 1 <= pax <= cint(doc.max_guests):
		frappe.throw(_("The number of guests exceeds the online booking limit."))
	now = now or now_datetime()
	if start < now + timedelta(minutes=cint(doc.lead_minutes)) or start.date() > (now + timedelta(days=cint(doc.advance_days))).date():
		frappe.throw(_("This time is outside the advance booking window."))
	end = start + timedelta(minutes=cint(doc.duration_minutes))
	for date in (start.date(), start.date() - timedelta(days=1)):
		for row in doc.hours:
			if row.day != DAYS[date.weekday()]:
				continue
			opens = datetime.combine(date, get_time(row.opens))
			closes = datetime.combine(date, get_time(row.closes))
			if closes <= opens:
				closes += timedelta(days=1)
			if opens <= start and end <= closes:
				return start, end, pax
	frappe.throw(_("Choose a sitting that fits within the restaurant's opening hours."))


def table_state(table, reservations, start, end, pax, now, duration_minutes=90):
	if table.merged_with or cint(table.no_of_seats) < pax or cint(table.minimum_seating) > pax:
		return "unavailable"
	if any(not r.table for r in reservations):
		# Assign staff bookings before selling more space online.
		return "unavailable"
	if any(r.table == table.name for r in reservations):
		return "reserved"
	if table.occupied and start < now + timedelta(minutes=duration_minutes):
		return "unavailable"
	return "available"


def table_availability(doc, start, end, pax, lock=False):
	branch = frappe.db.get_value("URY Restaurant", doc.restaurant, "branch")
	# Current reads after the branch lock also work under REPEATABLE READ.
	suffix = " FOR UPDATE" if lock else ""
	tables = frappe.db.sql("""SELECT name, no_of_seats, minimum_seating, restaurant_room,
		table_shape, occupied, merged_with FROM `tabURY Table`
		WHERE restaurant = %s AND branch = %s AND is_take_away = 0
		ORDER BY no_of_seats, name""" + suffix, (doc.restaurant, branch), as_dict=True)
	reservations = frappe.db.sql("""SELECT `table` FROM `tabURY Table Reservation`
		WHERE branch = %(branch)s AND status IN %(statuses)s
		AND reserved_from < %(end)s AND reserved_to > %(start)s""" + suffix,
		{"branch": branch, "statuses": BLOCKING_STATUSES, "start": start, "end": end}, as_dict=True)
	now = now_datetime()
	return [{"id": table.name, "seats": table.no_of_seats, "room": table.restaurant_room,
			 "shape": table.table_shape, "status": table_state(table, reservations, start, end, pax, now, cint(doc.duration_minutes) or 90)}
			for table in tables]


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=60, seconds=60)
def availability(slug, reserved_from, no_of_pax):
	doc = website(slug)
	start, end, pax = booking_window(doc, reserved_from, no_of_pax)
	return {"tables": table_availability(doc, start, end, pax), "until": str(end)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=8, seconds=3600)
def reserve(slug, reserved_from, no_of_pax, table, guest_name, mobile_number, request_id,
			consent=None, notes=None, company_website=None):
	if company_website or str(consent) not in ("1", "true", "True"):
		frappe.throw(_("Please accept the reservation privacy notice."))
	guest_name = str(guest_name or "").strip()
	mobile_number = str(mobile_number or "").strip()
	if not 2 <= len(guest_name) <= 120 or not re.fullmatch(r"\+?[0-9 ()-]{7,25}", mobile_number) or len(re.sub(r"\D", "", mobile_number)) < 7:
		frappe.throw(_("Enter your name and a valid phone number."))
	if len(str(notes or "")) > 500 or not re.fullmatch(r"[a-f0-9]{32}", str(request_id or "")):
		frappe.throw(_("Invalid reservation details. Refresh the page and try again."))
	doc = website(slug)
	branch = frappe.db.get_value("URY Restaurant", doc.restaurant, "branch")
	frappe.db.sql("SELECT name FROM `tabBranch` WHERE name = %s FOR UPDATE", branch)
	existing = frappe.db.sql("""SELECT name, status, guest_name, mobile_number, `table`, reserved_from, no_of_pax
		FROM `tabURY Table Reservation` WHERE website_request_id = %s FOR UPDATE""", request_id, as_dict=True)
	if existing:
		row = existing[0]
		if (row.guest_name, row.mobile_number, row.table, get_datetime(row.reserved_from), row.no_of_pax) != (guest_name, mobile_number, table, get_datetime(reserved_from), cint(no_of_pax)):
			frappe.throw(_("This request has already been used. Refresh the page."))
		return {"reference": row.name, "status": row.status}
	# An exact retry remains recoverable even when the advance window elapsed.
	start, end, pax = booking_window(doc, reserved_from, no_of_pax)
	tables = table_availability(doc, start, end, pax, lock=True)
	if not any(t["id"] == table and t["status"] == "available" for t in tables):
		frappe.throw(_("This table is no longer available. Please choose another table."))
	reservation = frappe.get_doc({"doctype": "URY Table Reservation", "guest_name": guest_name,
		"mobile_number": mobile_number, "branch": branch, "table": table,
		"no_of_pax": pax, "reserved_from": start, "reserved_to": end, "status": "Requested",
		"notes": str(notes or ""), "website_request_id": request_id})
	# Guest permission bypass is limited to validated booking fields above.
	reservation.insert(ignore_permissions=True)
	return {"reference": reservation.name, "status": reservation.status}
