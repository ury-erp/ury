# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYSalesPlan(Document):
	"""Storage-only record of a governed restaurant demand plan.

	Business rules (lifecycle transitions, approval-snapshot freezing, and
	audit logging) live in ury.ury.api.ury_sales_plan so they can be unit
	tested without a live site. This controller intentionally does not
	recompute or override anything the API module already validated.
	"""

	pass
