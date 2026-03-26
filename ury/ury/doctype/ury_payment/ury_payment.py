# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class URYPayment(Document):
    def validate(self):
        self.validate_amount()
        self.validate_status_transition()
    
    def validate_amount(self):
        """Validate that amount is positive."""
        if self.amount <= 0:
            frappe.throw("Payment amount must be greater than zero")
    
    def validate_status_transition(self):
        """Validate status transitions."""
        if self.is_new():
            return
        
        valid_transitions = {
            "Initiated": ["Pending", "Failed", "Cancelled"],
            "Pending": ["Completed", "Failed", "Cancelled"],
            "Completed": ["Refunded"],
            "Failed": ["Initiated"],
            "Cancelled": ["Initiated"],
            "Refunded": []
        }
        
        old_status = self.get_doc_before_save().status if self.get_doc_before_save() else None
        
        if old_status and self.status != old_status:
            if self.status not in valid_transitions.get(old_status, []):
                frappe.throw(
                    f"Invalid status transition from {old_status} to {self.status}"
                )
