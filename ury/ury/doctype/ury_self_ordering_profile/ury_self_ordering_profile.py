# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class URYSelfOrderingProfile(Document):
    def before_insert(self):
        # Per-profile secret used to sign stateless QR table/pickup tokens
        # (see ury/ury/api/self_ordering.py). Never exposed via the API.
        if not self.qr_signing_secret:
            self.qr_signing_secret = frappe.generate_hash(length=48)
