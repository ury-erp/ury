# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class URYPaymentTerminalTransaction(Document):
    # Simple transaction log written by PaymentTerminalProvider
    # implementations (ury.ury.api.payment_terminal). No business logic
    # here beyond the standard Document lifecycle.
    pass
