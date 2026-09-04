# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYKOTItemExecution(Document):
	"""Item-grain execution row for a single URY KOT line item.

	This doctype is additive to the existing KOT-level compatibility record.
	It stores the production lifecycle per `URY KOT Items` row so each KOT
	item can move independently through QUEUED -> IN_PREPARATION -> READY ->
	SERVED without affecting the current print/realtime path on `URY KOT`.
	"""

	pass
