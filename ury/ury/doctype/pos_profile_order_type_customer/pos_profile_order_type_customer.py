# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class POSProfileOrderTypeCustomer(Document):
	# Duplicate and disabled-customer checks run on the parent POS Profile
	# (ury.ury_pos.default_customer.validate_order_type_customers) so they also
	# catch unsaved rows.
	pass
