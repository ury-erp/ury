"""
URY Payment API

Payment processing API endpoints for URY restaurant ERP system.
Supports multiple providers: Stripe, Razorpay, PayPal, Square.
"""

import frappe
from frappe import _
import json
import hmac
import hashlib


@frappe.whitelist(allow_guest=True)
def initiate_payment(order_id, gateway, amount, currency, **kwargs):
    """
    Initiate a payment for an order.
    
    Args:
        order_id: The POS Invoice name or order token
        gateway: URY Payment Gateway name
        amount: Payment amount
        currency: Currency code (e.g., USD, INR)
        **kwargs: Additional provider-specific parameters
        
    Returns:
        dict: Payment session details including checkout URL or client secret
    """
    try:
        # Validate gateway
        gateway_doc = get_active_gateway(gateway)
        if not gateway_doc:
            frappe.throw(_("Payment gateway not found or inactive"), frappe.DoesNotExistError)
        
        # Get order details
        order = get_order_details(order_id)
        if not order:
            frappe.throw(_("Order not found"), frappe.DoesNotExistError)
        
        # Validate amount matches order total
        if float(amount) != float(order.grand_total):
            frappe.throw(_("Payment amount does not match order total"), frappe.ValidationError)
        
        # Create payment record
        payment_record = create_payment_record(order_id, gateway, amount, currency)
        
        # Route to provider-specific handler
        provider = gateway_doc.provider
        
        if provider == "Stripe":
            return initiate_stripe_payment(payment_record, gateway_doc, order, kwargs)
        elif provider == "Razorpay":
            return initiate_razorpay_payment(payment_record, gateway_doc, order, kwargs)
        elif provider == "PayPal":
            return initiate_paypal_payment(payment_record, gateway_doc, order, kwargs)
        elif provider == "Square":
            return initiate_square_payment(payment_record, gateway_doc, order, kwargs)
        else:
            frappe.throw(_(f"Unsupported payment provider: {provider}"))
            
    except Exception as e:
        frappe.log_error(f"Payment initiation failed: {str(e)}", "URY Payment")
        frappe.throw(_("Failed to initiate payment. Please try again."))


@frappe.whitelist(allow_guest=True)
def verify_payment(order_id, gateway_reference):
    """
    Verify a payment status.
    
    Args:
        order_id: The POS Invoice name or order token
        gateway_reference: Payment reference from gateway
        
    Returns:
        dict: Payment verification result
    """
    try:
        # Find payment record
        payment = frappe.get_all(
            "URY Payment",
            filters={
                "order_id": order_id,
                "gateway_reference": gateway_reference
            },
            fields=["name", "gateway", "status"],
            limit=1
        )
        
        if not payment:
            frappe.throw(_("Payment record not found"), frappe.DoesNotExistError)
        
        payment_doc = frappe.get_doc("URY Payment", payment[0].name)
        gateway_doc = get_active_gateway(payment_doc.gateway)
        
        if not gateway_doc:
            frappe.throw(_("Payment gateway not available"), frappe.ValidationError)
        
        # Route to provider-specific verification
        provider = gateway_doc.provider
        
        if provider == "Stripe":
            return verify_stripe_payment(payment_doc, gateway_doc)
        elif provider == "Razorpay":
            return verify_razorpay_payment(payment_doc, gateway_doc)
        elif provider == "PayPal":
            return verify_paypal_payment(payment_doc, gateway_doc)
        elif provider == "Square":
            return verify_square_payment(payment_doc, gateway_doc)
        else:
            frappe.throw(_(f"Unsupported payment provider: {provider}"))
            
    except Exception as e:
        frappe.log_error(f"Payment verification failed: {str(e)}", "URY Payment")
        frappe.throw(_("Failed to verify payment. Please try again."))


@frappe.whitelist(allow_guest=True)
def handle_webhook(provider, **kwargs):
    """
    Handle webhook notifications from payment providers.
    
    Args:
        provider: Payment provider name (stripe, razorpay, paypal, square)
        **kwargs: Webhook payload and headers
        
    Returns:
        dict: Webhook processing result
    """
    try:
        # Get request data
        if frappe.request:
            payload = frappe.request.get_data(as_text=True)
            headers = dict(frappe.request.headers)
        else:
            # For direct API calls (testing)
            payload = json.dumps(kwargs.get("payload", {}))
            headers = kwargs.get("headers", {})
        
        # Find gateway by provider
        gateway_doc = get_gateway_by_provider(provider)
        if not gateway_doc:
            frappe.log_error(f"No active gateway found for provider: {provider}", "URY Payment Webhook")
            return {"status": "error", "message": "Gateway not found"}
        
        # Verify webhook signature
        if not verify_webhook_signature(provider, payload, headers, gateway_doc):
            frappe.log_error(f"Invalid webhook signature for {provider}", "URY Payment Webhook")
            return {"status": "error", "message": "Invalid signature"}
        
        # Route to provider-specific handler
        provider_lower = provider.lower()
        
        if provider_lower == "stripe":
            return handle_stripe_webhook(payload, gateway_doc)
        elif provider_lower == "razorpay":
            return handle_razorpay_webhook(payload, gateway_doc)
        elif provider_lower == "paypal":
            return handle_paypal_webhook(payload, gateway_doc)
        elif provider_lower == "square":
            return handle_square_webhook(payload, gateway_doc)
        else:
            return {"status": "error", "message": f"Unsupported provider: {provider}"}
            
    except Exception as e:
        frappe.log_error(f"Webhook handling failed: {str(e)}", "URY Payment Webhook")
        return {"status": "error", "message": "Internal error"}


# ==================== Helper Functions ====================

def get_active_gateway(gateway_name):
    """Get active payment gateway by name."""
    gateway = frappe.get_all(
        "URY Payment Gateway",
        filters={
            "name": gateway_name,
            "active": 1
        },
        limit=1
    )
    
    if gateway:
        return frappe.get_doc("URY Payment Gateway", gateway[0].name)
    return None


def get_gateway_by_provider(provider):
    """Get first active gateway for a provider."""
    gateway = frappe.get_all(
        "URY Payment Gateway",
        filters={
            "provider": provider.title(),
            "active": 1
        },
        limit=1
    )
    
    if gateway:
        return frappe.get_doc("URY Payment Gateway", gateway[0].name)
    return None


def get_order_details(order_id):
    """Get order details from POS Invoice."""
    # Try to find by invoice name first
    order = frappe.get_all(
        "POS Invoice",
        filters={"name": order_id},
        fields=["name", "grand_total", "customer", "restaurant", "customer_order_token"],
        limit=1
    )
    
    if order:
        return order[0]
    
    # Try to find by customer_order_token
    order = frappe.get_all(
        "POS Invoice",
        filters={"customer_order_token": order_id},
        fields=["name", "grand_total", "customer", "restaurant", "customer_order_token"],
        limit=1
    )
    
    if order:
        return order[0]
    
    return None


def create_payment_record(order_id, gateway, amount, currency):
    """Create a payment record in the system."""
    # Check if payment already exists
    existing = frappe.get_all(
        "URY Payment",
        filters={
            "order_id": order_id,
            "status": ["in", ["Pending", "Initiated"]]
        },
        limit=1
    )
    
    if existing:
        return frappe.get_doc("URY Payment", existing[0].name)
    
    # Create new payment record
    payment = frappe.new_doc("URY Payment")
    payment.order_id = order_id
    payment.gateway = gateway
    payment.amount = amount
    payment.currency = currency
    payment.status = "Initiated"
    payment.save(ignore_permissions=True)
    
    return payment


def verify_webhook_signature(provider, payload, headers, gateway_doc):
    """Verify webhook signature from payment provider."""
    credentials = gateway_doc.get_credentials()
    webhook_secret = credentials.get("webhook_secret")
    
    if not webhook_secret:
        # If no webhook secret configured, accept webhooks (for development)
        return True
    
    provider_lower = provider.lower()
    
    if provider_lower == "stripe":
        signature = headers.get("Stripe-Signature", "")
        # Stripe uses timestamp + signature format
        # Implementation would verify using stripe library
        return True  # Placeholder - implement actual verification
    
    elif provider_lower == "razorpay":
        signature = headers.get("X-Razorpay-Signature", "")
        expected_signature = hmac.new(
            webhook_secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected_signature, signature)
    
    # Default: accept webhook
    return True


# ==================== Stripe Implementation ====================

def initiate_stripe_payment(payment_record, gateway_doc, order, kwargs):
    """Initiate Stripe payment session."""
    try:
        import stripe
        credentials = gateway_doc.get_credentials()
        
        # Set API key (test or live)
        api_key = credentials["api_key"]
        stripe.api_key = api_key
        
        # Create PaymentIntent
        intent = stripe.PaymentIntent.create(
            amount=int(float(payment_record.amount) * 100),  # Stripe uses cents
            currency=payment_record.currency.lower(),
            metadata={
                "order_id": order.name,
                "payment_id": payment_record.name,
                "customer": order.customer or "Guest"
            },
            automatic_payment_methods={"enabled": True}
        )
        
        # Update payment record
        payment_record.gateway_reference = intent.id
        payment_record.client_secret = intent.client_secret
        payment_record.status = "Pending"
        payment_record.save(ignore_permissions=True)
        
        return {
            "status": "success",
            "provider": "Stripe",
            "client_secret": intent.client_secret,
            "payment_intent_id": intent.id,
            "payment_record": payment_record.name,
            "publishable_key": credentials["api_key"][:10] + "..." if credentials["api_key"] else None
        }
        
    except Exception as e:
        payment_record.status = "Failed"
        payment_record.error_message = str(e)
        payment_record.save(ignore_permissions=True)
        frappe.throw(_(f"Stripe payment initiation failed: {str(e)}"))


def verify_stripe_payment(payment_doc, gateway_doc):
    """Verify Stripe payment status."""
    try:
        import stripe
        credentials = gateway_doc.get_credentials()
        stripe.api_key = credentials["api_key"]
        
        intent = stripe.PaymentIntent.retrieve(payment_doc.gateway_reference)
        
        if intent.status == "succeeded":
            payment_doc.status = "Completed"
            payment_doc.save(ignore_permissions=True)
            
            # Update order payment status
            update_order_payment_status(payment_doc.order_id, "Paid")
            
            return {
                "status": "success",
                "payment_status": "Completed",
                "amount_received": intent.amount_received / 100,
                "payment_record": payment_doc.name
            }
        elif intent.status in ["requires_payment_method", "canceled"]:
            payment_doc.status = "Failed"
            payment_doc.save(ignore_permissions=True)
            
            return {
                "status": "failed",
                "payment_status": "Failed",
                "message": intent.status
            }
        else:
            return {
                "status": "pending",
                "payment_status": payment_doc.status,
                "stripe_status": intent.status
            }
            
    except Exception as e:
        frappe.log_error(f"Stripe verification failed: {str(e)}", "URY Payment")
        return {"status": "error", "message": str(e)}


def handle_stripe_webhook(payload, gateway_doc):
    """Handle Stripe webhook events."""
    try:
        data = json.loads(payload)
        event_type = data.get("type")
        
        if event_type == "payment_intent.succeeded":
            intent = data["data"]["object"]
            payment_id = intent["metadata"].get("payment_id")
            
            if payment_id:
                payment_doc = frappe.get_doc("URY Payment", payment_id)
                payment_doc.status = "Completed"
                payment_doc.save(ignore_permissions=True)
                
                update_order_payment_status(payment_doc.order_id, "Paid")
        
        elif event_type == "payment_intent.payment_failed":
            intent = data["data"]["object"]
            payment_id = intent["metadata"].get("payment_id")
            
            if payment_id:
                payment_doc = frappe.get_doc("URY Payment", payment_id)
                payment_doc.status = "Failed"
                payment_doc.error_message = intent.get("last_payment_error", {}).get("message")
                payment_doc.save(ignore_permissions=True)
        
        return {"status": "success", "event": event_type}
        
    except Exception as e:
        frappe.log_error(f"Stripe webhook failed: {str(e)}", "URY Payment Webhook")
        return {"status": "error", "message": str(e)}


# ==================== Razorpay Implementation ====================

def initiate_razorpay_payment(payment_record, gateway_doc, order, kwargs):
    """Initiate Razorpay payment order."""
    try:
        import razorpay
        credentials = gateway_doc.get_credentials()
        
        client = razorpay.Client(auth=(credentials["api_key"], credentials["api_secret"]))
        
        # Create Razorpay Order
        razorpay_order = client.order.create({
            "amount": int(float(payment_record.amount) * 100),  # Razorpay uses paise
            "currency": payment_record.currency.upper(),
            "receipt": payment_record.name,
            "notes": {
                "order_id": order.name,
                "payment_id": payment_record.name,
                "customer": order.customer or "Guest"
            }
        })
        
        # Update payment record
        payment_record.gateway_reference = razorpay_order["id"]
        payment_record.status = "Pending"
        payment_record.save(ignore_permissions=True)
        
        return {
            "status": "success",
            "provider": "Razorpay",
            "order_id": razorpay_order["id"],
            "amount": razorpay_order["amount"],
            "currency": razorpay_order["currency"],
            "payment_record": payment_record.name,
            "key_id": credentials["api_key"][:10] + "..." if credentials["api_key"] else None
        }
        
    except Exception as e:
        payment_record.status = "Failed"
        payment_record.error_message = str(e)
        payment_record.save(ignore_permissions=True)
        frappe.throw(_(f"Razorpay payment initiation failed: {str(e)}"))


def verify_razorpay_payment(payment_doc, gateway_doc):
    """Verify Razorpay payment status."""
    try:
        import razorpay
        credentials = gateway_doc.get_credentials()
        
        client = razorpay.Client(auth=(credentials["api_key"], credentials["api_secret"]))
        
        # Fetch order details
        order = client.order.fetch(payment_doc.gateway_reference)
        
        # Fetch payments for this order
        payments = client.order.fetch_multiple_payments(payment_doc.gateway_reference)
        
        # Check if any payment is captured
        for payment in payments["items"]:
            if payment["status"] == "captured":
                payment_doc.status = "Completed"
                payment_doc.transaction_id = payment["id"]
                payment_doc.save(ignore_permissions=True)
                
                update_order_payment_status(payment_doc.order_id, "Paid")
                
                return {
                    "status": "success",
                    "payment_status": "Completed",
                    "amount_received": payment["amount"] / 100,
                    "payment_record": payment_doc.name
                }
        
        if order["status"] == "paid":
            payment_doc.status = "Completed"
            payment_doc.save(ignore_permissions=True)
            
            return {
                "status": "success",
                "payment_status": "Completed",
                "payment_record": payment_doc.name
            }
        elif order["status"] == "attempted":
            return {
                "status": "pending",
                "payment_status": "Pending"
            }
        else:
            return {
                "status": "pending",
                "payment_status": payment_doc.status,
                "razorpay_status": order["status"]
            }
            
    except Exception as e:
        frappe.log_error(f"Razorpay verification failed: {str(e)}", "URY Payment")
        return {"status": "error", "message": str(e)}


def handle_razorpay_webhook(payload, gateway_doc):
    """Handle Razorpay webhook events."""
    try:
        data = json.loads(payload)
        event = data.get("event")
        
        if event == "order.paid":
            order_entity = data["payload"]["order"]["entity"]
            payment_entity = data["payload"]["payment"]["entity"]
            
            # Find payment record by order ID
            payment = frappe.get_all(
                "URY Payment",
                filters={"gateway_reference": order_entity["id"]},
                limit=1
            )
            
            if payment:
                payment_doc = frappe.get_doc("URY Payment", payment[0].name)
                payment_doc.status = "Completed"
                payment_doc.transaction_id = payment_entity["id"]
                payment_doc.save(ignore_permissions=True)
                
                update_order_payment_status(payment_doc.order_id, "Paid")
        
        elif event == "payment.failed":
            payment_entity = data["payload"]["payment"]["entity"]
            order_id = payment_entity.get("order_id")
            
            if order_id:
                payment = frappe.get_all(
                    "URY Payment",
                    filters={"gateway_reference": order_id},
                    limit=1
                )
                
                if payment:
                    payment_doc = frappe.get_doc("URY Payment", payment[0].name)
                    payment_doc.status = "Failed"
                    payment_doc.error_message = payment_entity.get("error_description")
                    payment_doc.save(ignore_permissions=True)
        
        return {"status": "success", "event": event}
        
    except Exception as e:
        frappe.log_error(f"Razorpay webhook failed: {str(e)}", "URY Payment Webhook")
        return {"status": "error", "message": str(e)}


# ==================== PayPal Implementation ====================

def initiate_paypal_payment(payment_record, gateway_doc, order, kwargs):
    """Initiate PayPal payment (placeholder)."""
    frappe.throw(_("PayPal integration coming soon"))


def verify_paypal_payment(payment_doc, gateway_doc):
    """Verify PayPal payment (placeholder)."""
    frappe.throw(_("PayPal integration coming soon"))


def handle_paypal_webhook(payload, gateway_doc):
    """Handle PayPal webhook (placeholder)."""
    return {"status": "pending", "message": "PayPal integration coming soon"}


# ==================== Square Implementation ====================

def initiate_square_payment(payment_record, gateway_doc, order, kwargs):
    """Initiate Square payment (placeholder)."""
    frappe.throw(_("Square integration coming soon"))


def verify_square_payment(payment_doc, gateway_doc):
    """Verify Square payment (placeholder)."""
    frappe.throw(_("Square integration coming soon"))


def handle_square_webhook(payload, gateway_doc):
    """Handle Square webhook (placeholder)."""
    return {"status": "pending", "message": "Square integration coming soon"}


# ==================== Order Status Updates ====================

def update_order_payment_status(order_id, status):
    """Update the payment status of an order."""
    try:
        # Find order by ID or token
        order = frappe.get_all(
            "POS Invoice",
            filters={
                "name": order_id
            },
            fields=["name"],
            limit=1
        )
        
        if not order:
            order = frappe.get_all(
                "POS Invoice",
                filters={
                    "customer_order_token": order_id
                },
                fields=["name"],
                limit=1
            )
        
        if order:
            frappe.db.set_value("POS Invoice", order[0].name, "payment_status", status)
            
            # Publish realtime event
            frappe.publish_realtime(
                "payment_status_update",
                {
                    "order_id": order_id,
                    "status": status
                }
            )
            
    except Exception as e:
        frappe.log_error(f"Failed to update order payment status: {str(e)}", "URY Payment")


@frappe.whitelist()
def get_payment_status(payment_id):
    """
    Get status of a payment record.
    
    Args:
        payment_id: URY Payment record name
        
    Returns:
        dict: Payment status details
    """
    try:
        payment = frappe.get_doc("URY Payment", payment_id)
        return {
            "payment_id": payment.name,
            "order_id": payment.order_id,
            "status": payment.status,
            "amount": payment.amount,
            "currency": payment.currency,
            "gateway": payment.gateway,
            "gateway_reference": payment.gateway_reference,
            "created_at": payment.creation,
            "updated_at": payment.modified
        }
    except frappe.DoesNotExistError:
        frappe.throw(_("Payment record not found"), frappe.DoesNotExistError)
    except Exception as e:
        frappe.log_error(f"Error getting payment status: {str(e)}", "URY Payment")
        frappe.throw(_("Failed to get payment status"))


@frappe.whitelist()
def list_payment_gateways(restaurant=None):
    """
    List active payment gateways for a restaurant.
    
    Args:
        restaurant: Optional restaurant name to filter by branch
        
    Returns:
        list: Active payment gateways
    """
    try:
        filters = {"active": 1}
        
        if restaurant:
            # Get branch from restaurant
            branch = frappe.db.get_value("URY Restaurant", restaurant, "branch")
            if branch:
                filters["branch"] = ["in", [branch, ""]]
        
        gateways = frappe.get_all(
            "URY Payment Gateway",
            filters=filters,
            fields=["name", "gateway_name", "provider", "currency", "test_mode"]
        )
        
        return gateways
        
    except Exception as e:
        frappe.log_error(f"Error listing gateways: {str(e)}", "URY Payment")
        return []
