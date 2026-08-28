# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYKOTExecution(Document):
	"""Storage-only record of one KOT's production-execution lifecycle.

	Scope decision (per V3-50's "attached to a KOT, KOT item, or later
	execution record" language): this is a KOT-level record -- one row per
	`URY KOT`, not per KOT line item. KOT-level was chosen over item-level
	because the currently-live `URY KOT`/`ury_kot_generate.py` routing
	(explicitly preserved, not modified by this task) already resolves one
	KOT per matching Production Unit for a whole set of matched order items,
	and `URY KOT.order_status`/`serve_kot` operate at the KOT-document level
	today, not per item. Item-level granularity is left to a later task if a
	future contract requires partial-KOT start/ready/serve; this module's
	`kot` field and idempotency-key scope are written so that a later
	item-level record could be introduced additively without changing this
	doctype's existing rows.

	All lifecycle rules (state machine, idempotency-key dedup, atomic
	concurrency-safe transitions, manager-override gating) live in
	ury.ury.api.ury_kot_execution_service so they can be unit tested without
	a live site. This controller does not recompute or override anything the
	service module already validated, and it never touches `URY KOT`'s own
	schema, `ury_kot.py`'s on-submit printing/realtime, ERPNext Job Card,
	Work Order, or stock/warehouse doctypes.
	"""

	pass
