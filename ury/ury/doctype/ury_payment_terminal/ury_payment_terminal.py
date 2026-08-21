# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class URYPaymentTerminal(Document):
    # Provider-driving logic (start/status/cancel transaction) lives in the
    # PaymentTerminalProvider interface (ury.ury.api.payment_terminal), not
    # in this doctype controller.
    pass
