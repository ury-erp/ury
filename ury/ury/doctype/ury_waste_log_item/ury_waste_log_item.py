# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class URYWasteLogItem(Document):
	# Valuation and totalling belong to the parent (URY Waste Log), which
	# knows the branch and therefore the warehouse the rate comes from.
	pass
