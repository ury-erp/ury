# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYStockReservation(Document):
	"""Storage-only record of one atomically-reserved item/warehouse capacity slice.

	Business rules (capacity checks, atomic all-or-nothing composite
	reservation, release/fulfil/cancel/expiry transitions) live in
	ury.ury.api.ury_reservation_service so they can be unit tested without a
	live site. This controller intentionally does not recompute or override
	anything the API module already validated, and it never mutates ERPNext
	Bin/Stock Ledger rows -- a reservation is purely a subtraction layer read
	back by the projection/availability formulas, never a write to durable
	stock truth.

	A single `create_reservation` call may insert several rows sharing one
	`reservation_group` value (one row per BOM component for a composite/MTO
	item, or a single row for a plain stock item) -- see
	ury_reservation_service module docstring for why grouping, rather than a
	child table, was chosen.
	"""

	pass
