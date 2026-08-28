# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYStockMovement(Document):
	"""Storage-only record of a central-store/department stock movement event.

	Business rules live in ury.ury.api.ury_stock_service so they can be unit
	tested without a live site. This controller intentionally does not
	recompute or override anything the API module already validated, and it
	never creates or submits a real ERPNext Stock Entry.
	"""

	pass
