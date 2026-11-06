# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class URYOrderingSession(Document):
	# Session creation, token hashing, and expiry logic live in
	# ury/ury/api/self_ordering.py (added in a later phase), not here.
	pass
