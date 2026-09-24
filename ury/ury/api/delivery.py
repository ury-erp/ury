# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# The dispatch board, and the money that leaves the building with it.
#
# Two things a delivery operation loses without this: orders, and cash. An
# order with no driver against it is found when the customer rings; cash a
# driver collected is found when the till is short. Both are answered here by
# making the state explicit rather than by trusting anyone's memory.

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime, today

from ury.ury_pos.api import getBranch
from ury.ury.api.driver_app import is_stale, position_age_minutes
from ury.ury.doctype.ury_delivery.ury_delivery import (
	CLOSED_STATUSES,
	OPEN_STATUSES,
	elapsed_minutes,
	lateness,
)


def _branch(branch=None):
	"""Branch from the session, never from the caller.

	A delivery row carries a customer's address and phone number.
	"""
	if frappe.session.user == "Administrator" and branch:
		return branch
	return getBranch()


@frappe.whitelist()
def get_zones(branch=None, active_only=1):
	"""Zones a phone order can be taken for."""
	filters = {"branch": _branch(branch)}
	if cint(active_only):
		filters["active"] = 1

	return frappe.get_list(
		"URY Delivery Zone",
		filters=filters,
		fields=["name", "zone_name", "delivery_fee", "minimum_order", "estimated_minutes",
				"landmarks", "active"],
		order_by="zone_name asc",
		limit_page_length=0,
	)


@frappe.whitelist()
def quote_delivery(zone, order_amount=0):
	"""Fee, minimum and time for a zone, before the order is taken.

	Refusing an order that is under the minimum belongs here, at the point
	where it can still be changed, rather than at the door where the only
	options left are to argue or to eat the cost.
	"""
	row = frappe.db.get_value(
		"URY Delivery Zone", zone,
		["name", "zone_name", "delivery_fee", "minimum_order", "estimated_minutes", "active"],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("Delivery zone not found."))
	if not cint(row.active):
		return {"deliverable": False, "reason": "zone_inactive", "zone": row.zone_name}

	amount = flt(order_amount)
	if flt(row.minimum_order) and amount < flt(row.minimum_order):
		return {
			"deliverable": False,
			"reason": "below_minimum",
			"zone": row.zone_name,
			"minimum_order": flt(row.minimum_order),
			"short_by": flt(row.minimum_order) - amount,
		}

	return {
		"deliverable": True,
		"zone": row.zone_name,
		"delivery_fee": flt(row.delivery_fee),
		"estimated_minutes": cint(row.estimated_minutes),
		"minimum_order": flt(row.minimum_order),
	}


@frappe.whitelist()
def create_delivery(invoice, address, zone=None, customer_name=None, mobile_number=None,
					cash_on_delivery=0, notes=None, promised_minutes=None, branch=None):
	"""Put an order on the board.

	The totals are read from the invoice rather than accepted from the
	caller: what a driver is carrying has to be what the bill says, or the
	cash reconciliation at the end of the shift is fiction.
	"""
	branch = _branch(branch)
	bill = frappe.db.get_value(
		"POS Invoice", invoice, ["name", "branch", "grand_total", "rounded_total", "customer"],
		as_dict=True,
	)
	if not bill:
		frappe.throw(_("Invoice not found."))
	if bill.branch and bill.branch != branch:
		frappe.throw(_("This invoice belongs to another branch."))

	existing = frappe.db.get_value("URY Delivery", {"invoice": invoice}, "name")
	if existing:
		# Not an error: two people at the counter pressing the same button is
		# how this happens, and the answer is the row that already exists.
		return {"name": existing, "already_on_board": True}

	zone_row = frappe.db.get_value(
		"URY Delivery Zone", zone, ["delivery_fee", "estimated_minutes"], as_dict=True
	) if zone else None

	doc = frappe.get_doc({
		"doctype": "URY Delivery",
		"invoice": invoice,
		"branch": branch,
		"zone": zone,
		"customer_name": customer_name or bill.customer,
		"mobile_number": mobile_number,
		"address": address,
		"status": "Pending",
		"ordered_at": now_datetime(),
		"promised_minutes": cint(promised_minutes) or (cint(zone_row.estimated_minutes) if zone_row else 0),
		"delivery_fee": flt(zone_row.delivery_fee) if zone_row else 0,
		"order_total": flt(bill.rounded_total) or flt(bill.grand_total),
		"cash_on_delivery": cint(cash_on_delivery),
		"notes": notes,
	})
	doc.insert()

	return {"name": doc.name, "already_on_board": False}


@frappe.whitelist()
def get_board(branch=None, include_closed=0):
	"""Every delivery that is still somebody's problem, oldest first.

	Ordered oldest first on purpose: a board sorted newest first hides the
	order that has been waiting an hour behind the ones that just arrived.
	"""
	branch = _branch(branch)
	now = now_datetime()

	filters = {"branch": branch}
	if cint(include_closed):
		filters["ordered_at"] = [">=", today()]
	else:
		filters["status"] = ["in", OPEN_STATUSES]

	rows = frappe.get_list(
		"URY Delivery",
		filters=filters,
		fields=["name", "invoice", "branch", "zone", "customer_name", "mobile_number", "address",
				"latitude", "longitude", "status", "driver", "promised_minutes", "ordered_at",
				"assigned_at", "departed_at", "closed_at", "delivery_fee", "order_total",
				"cash_on_delivery", "cash_settled", "failure_reason", "notes"],
		order_by="ordered_at asc",
		limit_page_length=0,
	)

	for row in rows:
		row["elapsed_minutes"] = elapsed_minutes(row, now=now)
		row["lateness"] = lateness(row, now=now)

	return {
		"deliveries": rows,
		"branch": branch,
		"unassigned": sum(1 for row in rows if row["status"] == "Pending"),
		"late": sum(1 for row in rows if row["lateness"]["late"] and row["status"] in OPEN_STATUSES),
	}


@frappe.whitelist()
def get_drivers(branch=None, active_only=1):
	"""Drivers, each with what they are carrying right now.

	"How many orders does Ali have" is the question a dispatcher asks before
	every assignment, and answering it from a separate screen is how one
	driver ends up with five orders and another with none.
	"""
	branch = _branch(branch)
	filters = {"branch": branch}
	if cint(active_only):
		filters["active"] = 1

	drivers = frappe.get_list(
		"URY Driver",
		filters=filters,
		fields=["name", "driver_name", "mobile_number", "vehicle", "active",
				"last_latitude", "last_longitude", "position_updated_at", "position_accuracy"],
		order_by="driver_name asc",
		limit_page_length=0,
	)

	open_rows = frappe.get_all(
		"URY Delivery",
		filters={"branch": branch, "status": ["in", OPEN_STATUSES], "driver": ["!=", ""]},
		fields=["driver", "name"],
		limit_page_length=0,
	)
	load = {}
	for row in open_rows:
		load[row.driver] = load.get(row.driver, 0) + 1

	cash_rows = frappe.get_all(
		"URY Delivery",
		filters={"branch": branch, "cash_on_delivery": 1, "cash_settled": 0,
				 "status": "Delivered", "driver": ["!=", ""]},
		fields=["driver", "order_total", "delivery_fee"],
		limit_page_length=0,
	)
	cash = {}
	for row in cash_rows:
		cash[row.driver] = cash.get(row.driver, 0) + flt(row.order_total) + flt(row.delivery_fee)

	now = now_datetime()
	for driver in drivers:
		driver["open_deliveries"] = load.get(driver.name, 0)
		driver["cash_held"] = flt(cash.get(driver.name, 0))
		# The age travels with the position, always. A dot on a map with no
		# timestamp is read as "now" no matter how old it is.
		age = position_age_minutes(driver, now=now)
		driver["position_age_minutes"] = age
		driver["position_stale"] = is_stale(age)

	return drivers


@frappe.whitelist()
def assign_driver(delivery, driver):
	"""Hand an order to a driver.

	Assigning does not move the order out — that is a second, deliberate
	press when the driver actually leaves — because the gap between the two
	is where a bag sits on the pass with a name on it and nobody carrying it.
	"""
	doc = frappe.get_doc("URY Delivery", delivery)
	doc.check_permission("write")
	doc.driver = driver
	if doc.status == "Pending":
		doc.status = "Assigned"
	doc.save()
	return _row(doc)


@frappe.whitelist()
def set_delivery_status(delivery, status, failure_reason=None):
	"""Move an order along the board."""
	doc = frappe.get_doc("URY Delivery", delivery)
	doc.check_permission("write")
	doc.status = status
	if failure_reason is not None:
		doc.failure_reason = failure_reason
	doc.save()
	return _row(doc)


@frappe.whitelist()
def settle_driver_cash(driver, branch=None):
	"""Mark everything this driver is carrying as handed in.

	Settled per driver rather than per order because that is how the handover
	actually happens: the driver comes back, empties their pocket once, and
	the count either matches or it does not. The amount is returned so the
	person taking it can check it against what is in their hand.
	"""
	branch = _branch(branch)
	rows = frappe.get_all(
		"URY Delivery",
		filters={"branch": branch, "driver": driver, "cash_on_delivery": 1,
				 "cash_settled": 0, "status": "Delivered"},
		fields=["name", "order_total", "delivery_fee"],
		limit_page_length=0,
	)
	if not rows:
		return {"settled": 0, "amount": 0.0}

	amount = 0.0
	stamp = now_datetime()
	for row in rows:
		doc = frappe.get_doc("URY Delivery", row.name)
		doc.check_permission("write")
		doc.cash_settled = 1
		doc.cash_settled_at = stamp
		doc.save()
		amount += flt(row.order_total) + flt(row.delivery_fee)

	return {"settled": len(rows), "amount": flt(amount), "driver": driver}


@frappe.whitelist()
def get_delivery_summary(branch=None, from_date=None):
	"""Today's delivery operation in numbers, including what is still owed."""
	branch = _branch(branch)
	now = now_datetime()

	rows = frappe.get_list(
		"URY Delivery",
		filters={"branch": branch, "ordered_at": [">=", from_date or today()]},
		fields=["name", "status", "ordered_at", "closed_at", "promised_minutes",
				"order_total", "delivery_fee", "cash_on_delivery", "cash_settled", "driver"],
		limit_page_length=0,
	)

	delivered = [row for row in rows if row["status"] == "Delivered"]
	times = [elapsed_minutes(row, now=now) for row in delivered]
	late = [row for row in delivered if lateness(row, now=now)["late"]]

	cash_out = sum(
		flt(row["order_total"]) + flt(row["delivery_fee"])
		for row in rows
		if cint(row["cash_on_delivery"]) and not cint(row["cash_settled"])
		and row["status"] == "Delivered"
	)

	return {
		"orders": len(rows),
		"open": sum(1 for row in rows if row["status"] in OPEN_STATUSES),
		"delivered": len(delivered),
		"failed": sum(1 for row in rows if row["status"] in ("Failed", "Returned")),
		"average_minutes": int(sum(times) / len(times)) if times else 0,
		"late": len(late),
		"on_time_rate": round((len(delivered) - len(late)) * 100 / len(delivered)) if delivered else None,
		"cash_with_drivers": flt(cash_out),
		"closed_statuses": list(CLOSED_STATUSES),
	}


def _row(doc):
	return {
		"name": doc.name,
		"status": doc.status,
		"driver": doc.driver,
		"assigned_at": str(doc.assigned_at or ""),
		"departed_at": str(doc.departed_at or ""),
		"closed_at": str(doc.closed_at or ""),
	}


@frappe.whitelist()
def set_delivery_location(delivery, latitude, longitude):
	"""Drop a pin for an order.

	Addresses here are landmarks rather than coordinates — "behind the blue
	mosque, second lane" is a real address and no geocoder will turn it into
	a point. So the pin is placed by the person taking the order, who is
	talking to the customer while they do it.
	"""
	doc = frappe.get_doc("URY Delivery", delivery)
	doc.check_permission("write")

	lat, lng = flt(latitude), flt(longitude)
	if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
		frappe.throw(_("That position is not valid."))

	doc.latitude = lat
	doc.longitude = lng
	doc.save()
	return {"name": doc.name, "latitude": flt(doc.latitude), "longitude": flt(doc.longitude)}


@frappe.whitelist()
def get_deliverable_invoices(branch=None):
	"""Today's delivery bills that are not on the board yet.

	Without this the board can only ever show orders somebody remembered to
	add, which is the failure it exists to prevent.
	"""
	branch = _branch(branch)

	invoices = frappe.get_list(
		"POS Invoice",
		filters={
			"branch": branch,
			"posting_date": today(),
			"order_type": ["in", ["Delivery", "Phone In"]],
		},
		fields=["name", "customer", "grand_total", "rounded_total", "order_type", "creation"],
		order_by="creation desc",
		limit_page_length=50,
	)
	if not invoices:
		return []

	on_board = set(
		row.invoice for row in frappe.get_all(
			"URY Delivery",
			filters={"invoice": ["in", [invoice.name for invoice in invoices]]},
			fields=["invoice"],
			limit_page_length=0,
		)
	)
	return [invoice for invoice in invoices if invoice.name not in on_board]
