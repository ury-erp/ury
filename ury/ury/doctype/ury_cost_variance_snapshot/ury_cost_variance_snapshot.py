# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYCostVarianceSnapshot(Document):
	"""Storage-only record of one cost/variance attribution result.

	Written exclusively by `ury.ury.api.ury_cost_variance_attribution.compute_variance`
	when called with `persist=True`. This controller intentionally has no
	validation or side-effect logic beyond field storage: it never creates,
	updates, or reads any real ERPNext accounting/ledger document (no
	``GL Entry``, no ``Journal Entry``, no ``Stock Entry``/``Stock Ledger
	Entry`` write). All figures are computed read-only in the API module
	before this doc is inserted.
	"""

	pass
