# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYIssueWastage(Document):
	"""Storage-only record of a captured/approved material wastage amount.

	Business rules (capture bound, approval gate, valuation hook, permission
	and scope checks) live in ury.ury.api.ury_wastage so they can be unit
	tested without a live site. This controller intentionally does not
	recompute or override anything the API module already validated.
	"""

	pass
