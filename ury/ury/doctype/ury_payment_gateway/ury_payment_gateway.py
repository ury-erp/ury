# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class URYPaymentGateway(Document):
    def validate(self):
        self.validate_credentials()
        self.set_webhook_url()
    
    def validate_credentials(self):
        """Validate that required credentials are provided for the selected provider."""
        if not self.active:
            return
        
        if self.provider in ["Stripe", "Razorpay", "PayPal", "Square"]:
            if not self.api_key:
                frappe.throw(f"API Key is required for {self.provider}")
            if not self.api_secret:
                frappe.throw(f"API Secret is required for {self.provider}")
    
    def set_webhook_url(self):
        """Auto-generate webhook URL based on provider."""
        if not self.gateway_name:
            return
        
        base_url = frappe.utils.get_url()
        provider_slug = self.provider.lower().replace(" ", "-")
        self.webhook_url = f"{base_url}/api/method/ury.ury_payment.api.handle_webhook?provider={provider_slug}"
    
    def get_credentials(self):
        """Get decrypted credentials for API calls."""
        return {
            "api_key": self.get_password("api_key"),
            "api_secret": self.get_password("api_secret"),
            "webhook_secret": self.get_password("webhook_secret"),
            "test_mode": self.test_mode
        }
