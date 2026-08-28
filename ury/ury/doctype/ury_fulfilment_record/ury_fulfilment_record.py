# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYFulfilmentRecord(Document):
	"""Storage-only record of one (kot, item_code) fulfilment event.

	Business rules (reservation-consumption, KOT-execution-state gating,
	idempotency dedup) live in the fulfilment service modules that write
	this doctype -- `ury.ury.api.ury_preproduced_fulfilment_service` (V3-71,
	`fulfilment_type=PRE_PRODUCED`) and `ury.ury.api.ury_mto_fulfilment_service`
	(V3-72, `fulfilment_type=MTO`, uses the `batch_key` field for its
	exactly-once micro-batch idempotency dedup) -- so they can be unit
	tested without a live site. This controller intentionally does not
	recompute or override anything either service module already
	validated. Both writers share this single doctype rather than each
	defining their own, per V3-72's task instructions.

	`posted_to_erpnext` is always False for every row either of this
	doctype's current writers ever creates -- neither module calls a real
	ERPNext stock-mutation API (no ``Stock Entry``, no
	``frappe.db.set_value`` on ``Bin``). Flipping stock authority to this
	fulfilment layer is exclusively V3-73's job, gated by the evidence bar
	in the V3-70 transition checklist.
	"""

	pass
