# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# The page a driver keeps open while they are out.
#
# There is no driver app and most drivers have no account, so a signed link
# is the whole of the authentication: it names one driver, it is checked
# against the site key on every request, and it can do nothing except read
# that driver's own open deliveries, move them along, and report where the
# phone says it is.
#
# What this deliberately does not do is track anybody. Position is accepted
# only while that driver has an order out, and is stored as one current point
# per driver — no history, nothing between shifts, cleared daily. A dispatcher
# needs to know where tonight's order is; nobody needs to know where a driver
# was last Tuesday.

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, get_datetime, now_datetime

from ury.ury.signed_links import read_token, signed_url
from ury.ury.doctype.ury_delivery.ury_delivery import OPEN_STATUSES, elapsed_minutes

DRIVER_SCOPE = "driver"

# A phone reports every few seconds while moving. This is the ceiling per
# minute per IP: generous enough for one driver on a bad connection retrying,
# far below what it would take to fill a table with points.
POSITION_LIMIT_PER_MINUTE = 40

# A position older than this is not where the driver is, it is where they
# were. The board shows the age rather than hiding it, and the map fades it.
STALE_AFTER_MINUTES = 5

# Positions are wiped this many hours after they were reported. Long enough
# to survive a shift that runs past midnight, short enough that the table
# never becomes a location history of anybody.
KEEP_POSITION_HOURS = 12


def _invalid():
	return _("This driver link is not valid.")


def driver_from_token(token):
	"""The driver this link names, or a refusal."""
	_scope, reference = read_token(token, (DRIVER_SCOPE,), _invalid())
	row = frappe.db.get_value(
		"URY Driver", reference, ["name", "driver_name", "branch", "active"], as_dict=True
	)
	if not row:
		frappe.throw(_invalid(), frappe.DoesNotExistError)
	if not cint(row.active):
		# A driver who has left should not keep a working link, and the link
		# is already printed or saved on their phone by then.
		frappe.throw(_("This driver is no longer active."), frappe.PermissionError)
	return row


@frappe.whitelist()
def get_driver_link(driver):
	"""Staff-only: the link to give one driver.

	Permission is checked against the driver record itself, so whoever may
	manage drivers may issue links and nobody else.
	"""
	doc = frappe.get_doc("URY Driver", driver)
	doc.check_permission("read")
	return {"url": signed_url("/driver", DRIVER_SCOPE, doc.name), "driver": doc.name,
			"driver_name": doc.driver_name}


def _open_deliveries(driver):
	rows = frappe.get_all(
		"URY Delivery",
		filters={"driver": driver, "status": ["in", OPEN_STATUSES]},
		fields=["name", "invoice", "customer_name", "mobile_number", "address", "status",
				"latitude", "longitude", "order_total", "delivery_fee", "cash_on_delivery",
				"ordered_at", "promised_minutes", "notes"],
		order_by="ordered_at asc",
		limit_page_length=0,
	)
	now = now_datetime()
	for row in rows:
		row["elapsed_minutes"] = elapsed_minutes(row, now=now)
	return rows


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=60, seconds=60)
def driver_state(token):
	"""Public (signed): this driver's orders, and whether to report position.

	`tracking` is the answer to a question the phone asks constantly, and it
	is the server that decides: no open delivery, no tracking. That way the
	policy lives in one place rather than in a browser the driver could leave
	open all night.
	"""
	driver = driver_from_token(token)
	deliveries = _open_deliveries(driver.name)

	return {
		"driver": driver.name,
		"driver_name": driver.driver_name,
		"tracking": bool(deliveries),
		"deliveries": deliveries,
		"server_time": str(now_datetime()),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=POSITION_LIMIT_PER_MINUTE, seconds=60)
def report_position(token, latitude, longitude, accuracy=None):
	"""Public (signed): where the phone says the driver is.

	Refused when the driver has nothing out. The phone is told so in the
	reply rather than being left to guess, so it can stop asking the device
	for a location it is not allowed to send.
	"""
	driver = driver_from_token(token)

	if not _open_deliveries(driver.name):
		return {"tracking": False, "reason": "no_open_delivery"}

	lat, lng = flt(latitude), flt(longitude)
	if not (-90 <= lat <= 90) or not (-180 <= lng <= 180) or (lat == 0 and lng == 0):
		# Null Island is what a broken sensor reports, not a place anyone is.
		frappe.throw(_("That position is not valid."))

	frappe.db.set_value(
		"URY Driver",
		driver.name,
		{
			"last_latitude": lat,
			"last_longitude": lng,
			"position_accuracy": flt(accuracy or 0),
			"last_seen_at": now_datetime(),
		},
		update_modified=False,
	)

	return {"tracking": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60)
def driver_set_status(token, delivery, status, failure_reason=None):
	"""Public (signed): the driver moves their own order along.

	The delivery is checked against the driver in the link, so a link can
	only ever touch that driver's own work — the one thing a stolen or
	forwarded link must not be able to do is close someone else's order.
	"""
	driver = driver_from_token(token)

	doc = frappe.get_doc("URY Delivery", delivery)
	if doc.driver != driver.name:
		frappe.throw(_invalid(), frappe.PermissionError)
	if status not in ("On The Way", "Delivered", "Failed", "Returned"):
		frappe.throw(_("That status cannot be set from a driver's phone."))

	doc.status = status
	if failure_reason is not None:
		doc.failure_reason = failure_reason
	doc.save(ignore_permissions=True)

	return {"name": doc.name, "status": doc.status}


def position_age_minutes(driver_row, now=None):
	"""How old this driver's position is, or None when there is none."""
	seen = driver_row.get("last_seen_at")
	if not seen:
		return None
	return max(0, int(((now or now_datetime()) - get_datetime(seen)).total_seconds() // 60))


def is_stale(age_minutes):
	"""Whether a position is old enough that it means "was", not "is"."""
	return age_minutes is None or age_minutes > STALE_AFTER_MINUTES


def clear_old_positions():
	"""Daily: forget where everybody was.

	Runs from the scheduler. The data has no value the morning after and
	every day it is kept is a day it can be asked for.
	"""
	frappe.db.sql(
		"""
		UPDATE `tabURY Driver`
		SET `last_latitude` = NULL, `last_longitude` = NULL,
			`position_accuracy` = NULL, `last_seen_at` = NULL
		WHERE `last_seen_at` IS NOT NULL
			AND `last_seen_at` < DATE_SUB(NOW(), INTERVAL %(hours)s HOUR)
		""",
		{"hours": KEEP_POSITION_HOURS},
	)
