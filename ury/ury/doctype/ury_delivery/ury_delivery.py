# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# One order, out of the building.
#
# The dangerous state here is not a late delivery — it is an order that is
# nobody's, sitting between "the kitchen has it" and "a driver took it" with
# no row saying so. Every transition below exists to make that state either
# impossible or visible.

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, get_datetime, now_datetime

# Still out in the world: it is on the board and somebody has to finish it.
OPEN_STATUSES = ("Pending", "Assigned", "On The Way")

# Finished, one way or another.
CLOSED_STATUSES = ("Delivered", "Failed", "Returned")

# What a status may become. A delivery cannot go back to Pending once a driver
# has it: reassigning is a driver change, which keeps the same row and its
# clock rather than pretending the order was just placed.
ALLOWED_TRANSITIONS = {
	"Pending": {"Pending", "Assigned", "Failed"},
	"Assigned": {"Assigned", "On The Way", "Pending", "Failed"},
	"On The Way": {"On The Way", "Delivered", "Failed", "Returned"},
	"Delivered": {"Delivered"},
	"Failed": {"Failed"},
	"Returned": {"Returned"},
}

# A delivery that has taken longer than this is late enough to chase, whatever
# the zone promised — used by the board to colour a row red.
HARD_LATE_MINUTES = 90


class URYDelivery(Document):
	def validate(self):
		self.set_defaults()
		self.validate_transition()
		self.validate_driver()
		self.validate_failure_reason()
		self.stamp_times()

	def set_defaults(self):
		if not self.ordered_at:
			self.ordered_at = now_datetime()
		if not self.status:
			self.status = "Pending"

	def validate_transition(self):
		before = self.get_doc_before_save() if not self.is_new() else None
		if self.is_new():
			if self.status not in ("Pending", "Assigned"):
				frappe.throw(_("A new delivery starts as Pending or Assigned."))
			return
		if not before or before.status == self.status:
			return
		if self.status not in ALLOWED_TRANSITIONS.get(before.status, set()):
			frappe.throw(
				_("A {0} delivery cannot become {1}.").format(_(before.status), _(self.status))
			)

	def validate_driver(self):
		if self.status in ("Assigned", "On The Way") and not self.driver:
			# The whole point of the board is that every order on the road has
			# a name against it.
			frappe.throw(_("Assign a driver before moving this delivery out."))

		if not self.driver:
			return

		driver = frappe.db.get_value("URY Driver", self.driver, ["branch", "active"], as_dict=True)
		if not driver:
			frappe.throw(_("Driver not found."))
		if driver.branch != self.branch:
			frappe.throw(_("The driver must belong to the same branch as the order."))
		if not cint(driver.active) and self.status in OPEN_STATUSES:
			frappe.throw(_("This driver is not active."))

	def validate_failure_reason(self):
		if self.status in ("Failed", "Returned") and not (self.failure_reason or "").strip():
			# A failure with no reason teaches nobody anything, and these are
			# exactly the rows a manager reads at the end of the week.
			frappe.throw(_("Say why this delivery failed."))

	def stamp_times(self):
		before = self.get_doc_before_save() if not self.is_new() else None
		changed = not before or before.status != self.status

		if not changed:
			return
		if self.status == "Assigned" and not self.assigned_at:
			self.assigned_at = now_datetime()
		if self.status == "On The Way" and not self.departed_at:
			self.departed_at = now_datetime()
		if self.status in CLOSED_STATUSES and not self.closed_at:
			self.closed_at = now_datetime()

	@property
	def cash_outstanding(self):
		"""Money this driver is carrying for this order, if any.

		A delivery that failed carries nothing: the food came back and so did
		the money, so counting it against the driver would have them hand in
		cash they were never given.
		"""
		if not cint(self.cash_on_delivery) or cint(self.cash_settled):
			return 0.0
		if self.status != "Delivered":
			return 0.0
		return flt(self.order_total) + flt(self.delivery_fee)


def elapsed_minutes(delivery, now=None):
	"""How long this order has been out, to delivery or to now."""
	ordered = get_datetime(delivery.get("ordered_at"))
	if not ordered:
		return 0
	end = get_datetime(delivery.get("closed_at")) if delivery.get("closed_at") else (now or now_datetime())
	return max(0, int((end - ordered).total_seconds() // 60))


def lateness(delivery, now=None):
	"""Whether this order is late, and against what promise.

	`promised` is what the customer was actually told. A delivery with no
	promise recorded is still judged against the hard limit, because an order
	nobody quoted is not an order nobody has to deliver.
	"""
	minutes = elapsed_minutes(delivery, now=now)
	promised = cint(delivery.get("promised_minutes") or 0)

	if promised and minutes > promised:
		return {"late": True, "minutes": minutes, "over_by": minutes - promised, "against": "promise"}
	if minutes > HARD_LATE_MINUTES:
		return {"late": True, "minutes": minutes, "over_by": minutes - HARD_LATE_MINUTES,
				"against": "limit"}
	return {"late": False, "minutes": minutes, "over_by": 0, "against": None}
