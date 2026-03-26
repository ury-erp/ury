"""
Patch: Add Customer Ordering Fields to POS Invoice

This patch adds the necessary custom fields to ERPNext's POS Invoice DocType
to support customer-facing ordering (QR, Online, Kiosk).

Fields added:
- fulfillment_status: Tracks order fulfillment state
- order_source: Indicates where the order originated
- customer_order_token: Unique token for guest order tracking
- scheduled_pickup_time: For scheduled orders
- payment_gateway: Which payment gateway was used
- payment_gateway_ref: External payment reference
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    """Create custom fields for customer ordering on POS Invoice"""
    
    custom_fields = {
        "POS Invoice": [
            {
                "fieldname": "fulfillment_status",
                "label": "Fulfillment Status",
                "fieldtype": "Select",
                "options": "\nPlaced\nConfirmed\nPreparing\nReady\nServed\nPicked Up\nOut for Delivery\nDelivered\nCancelled",
                "default": "Placed",
                "insert_after": "status",
                "module": "URY Customer",
                "description": "Current fulfillment state of the order",
                "allow_on_submit": 1,
            },
            {
                "fieldname": "order_source",
                "label": "Order Source",
                "fieldtype": "Select",
                "options": "\nPOS\nQR\nOnline\nKiosk\nWhatsApp",
                "default": "POS",
                "insert_after": "fulfillment_status",
                "module": "URY Customer",
                "description": "Where this order originated from",
            },
            {
                "fieldname": "customer_order_token",
                "label": "Customer Order Token",
                "fieldtype": "Data",
                "insert_after": "order_source",
                "module": "URY Customer",
                "description": "Unique token for guest order tracking",
                "read_only": 1,
                "unique": 1,
            },
            {
                "fieldname": "customer_ordering_section",
                "label": "Customer Ordering",
                "fieldtype": "Section Break",
                "insert_after": "customer_order_token",
                "module": "URY Customer",
                "collapsible": 1,
            },
            {
                "fieldname": "scheduled_pickup_time",
                "label": "Scheduled Pickup Time",
                "fieldtype": "Datetime",
                "insert_after": "customer_ordering_section",
                "module": "URY Customer",
                "description": "When customer wants to pick up the order",
            },
            {
                "fieldname": "payment_gateway",
                "label": "Payment Gateway",
                "fieldtype": "Data",
                "insert_after": "scheduled_pickup_time",
                "module": "URY Customer",
                "description": "Which payment gateway processed the payment",
            },
            {
                "fieldname": "payment_gateway_ref",
                "label": "Payment Gateway Reference",
                "fieldtype": "Data",
                "insert_after": "payment_gateway",
                "module": "URY Customer",
                "description": "External payment reference ID",
            },
        ]
    }
    
    try:
        create_custom_fields(custom_fields)
        frappe.db.commit()
        frappe.logger().info("Customer ordering custom fields created successfully")
    except Exception as e:
        frappe.logger().error(f"Error creating customer ordering custom fields: {str(e)}")
        raise
