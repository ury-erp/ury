"""
URY Customer API

Customer-facing API endpoints for URY restaurant ERP system.
These endpoints support guest access for QR table ordering, 
online ordering, and kiosk applications.
"""

import frappe
from frappe import _


@frappe.whitelist(allow_guest=True)
def get_public_menu(restaurant, order_type=None):
    """
    Get public menu for a restaurant.
    
    This endpoint is accessible without authentication and provides
    menu items for customer-facing applications.
    
    Args:
        restaurant: Restaurant name (URY Restaurant)
        order_type: Optional order type to filter menu items
        
    Returns:
        list: Menu items with details
    """
    try:
        # Validate restaurant exists and accepts online orders
        restaurant_doc = frappe.get_doc("URY Restaurant", restaurant)
        
        if not restaurant_doc:
            frappe.throw(_("Restaurant not found"), frappe.DoesNotExistError)
            
        # Check if restaurant accepts online orders
        if not restaurant_doc.accepts_online_orders:
            frappe.throw(
                _("This restaurant is not accepting online orders at the moment"),
                frappe.PermissionError
            )
        
        # Get the active menu for the restaurant
        menu_name = restaurant_doc.active_menu
        if not menu_name:
            frappe.throw(_("No active menu found for this restaurant"), frappe.ValidationError)
        
        # Get menu items
        menu_items = frappe.get_all(
            "URY Menu Item",
            filters={"parent": menu_name, "disabled": 0},
            fields=[
                "item",
                "item_name",
                "rate",
                "item_image",
                "course",
                "special_dish",
                "description"
            ],
            order_by="idx"
        )
        
        # Format response
        items = []
        for item in menu_items:
            items.append({
                "item": item.item,
                "item_name": item.item_name,
                "rate": float(item.rate) if item.rate else 0,
                "item_image": item.item_image or None,
                "course": item.course or "",
                "special_dish": item.special_dish or 0,
                "description": item.description or ""
            })
        
        return items
        
    except frappe.DoesNotExistError:
        frappe.throw(_("Restaurant not found"), frappe.DoesNotExistError)
    except Exception as e:
        frappe.log_error(f"Error fetching public menu: {str(e)}", "URY Customer API")
        frappe.throw(_("Failed to load menu. Please try again."), frappe.ValidationError)


@frappe.whitelist(allow_guest=True)
def get_restaurant_info(slug):
    """
    Get restaurant information by slug.
    
    Args:
        slug: Restaurant slug (URL-friendly identifier)
        
    Returns:
        dict: Restaurant details
    """
    try:
        restaurant = frappe.get_all(
            "URY Restaurant",
            filters={"slug": slug, "accepts_online_orders": 1},
            fields=[
                "name",
                "restaurant_name",
                "branch",
                "company",
                "active_menu",
                "default_tax_template",
                "slug",
                "logo",
                "opening_hours"
            ],
            limit=1
        )
        
        if not restaurant:
            frappe.throw(_("Restaurant not found"), frappe.DoesNotExistError)
            
        return restaurant[0]
        
    except Exception as e:
        frappe.log_error(f"Error fetching restaurant info: {str(e)}", "URY Customer API")
        frappe.throw(_("Failed to load restaurant information"), frappe.ValidationError)


@frappe.whitelist(allow_guest=True)
def get_order_status(order_token):
    """
    Get order status by token.
    
    Args:
        order_token: Unique order token for tracking
        
    Returns:
        dict: Order status details
    """
    try:
        # Find POS Invoice by customer_order_token
        invoice = frappe.get_all(
            "POS Invoice",
            filters={"customer_order_token": order_token},
            fields=[
                "name",
                "status",
                "fulfillment_status",
                "order_source",
                "restaurant",
                "table",
                "customer_name",
                "contact_mobile",
                "grand_total",
                "creation",
                "modified"
            ],
            limit=1
        )
        
        if not invoice:
            frappe.throw(_("Order not found"), frappe.DoesNotExistError)
        
        order = invoice[0]
        
        return {
            "order_token": order_token,
            "invoice_id": order.name,
            "status": order.status,
            "fulfillment_status": order.fulfillment_status or "Placed",
            "order_source": order.order_source or "QR",
            "restaurant": order.restaurant,
            "table": order.table,
            "customer_name": order.customer_name,
            "contact_mobile": order.contact_mobile,
            "grand_total": float(order.grand_total) if order.grand_total else 0,
            "created_at": order.creation,
            "updated_at": order.modified
        }
        
    except Exception as e:
        frappe.log_error(f"Error fetching order status: {str(e)}", "URY Customer API")
        frappe.throw(_("Failed to load order status"), frappe.ValidationError)


@frappe.whitelist(allow_guest=True)
def validate_table_token(token):
    """
    Validate QR table token and return table context.
    
    Args:
        token: Signed JWT token containing table information
        
    Returns:
        dict: Table context (restaurant, table, room, menu)
    """
    try:
        import jwt
        from frappe.utils import get_url
        
        # Verify token with Frappe secret
        secret = frappe.local.conf.get("encryption_key", "URY_Secret_Key")
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        
        restaurant = payload.get("r")  # restaurant
        table = payload.get("t")       # table
        expiry = payload.get("exp")    # expiry timestamp
        
        # Check if token is expired
        import time
        if expiry and expiry < time.time():
            frappe.throw(_("QR code has expired. Please ask staff for a new code."), 
                        frappe.PermissionError)
        
        # Get table details
        table_doc = frappe.get_doc("URY Table", table)
        if not table_doc:
            frappe.throw(_("Table not found"), frappe.DoesNotExistError)
        
        # Get restaurant details
        restaurant_doc = frappe.get_doc("URY Restaurant", restaurant)
        
        return {
            "restaurant": restaurant,
            "restaurant_name": restaurant_doc.restaurant_name,
            "table": table,
            "table_name": table_doc.table_name or table,
            "room": table_doc.room,
            "menu": restaurant_doc.active_menu,
            "valid": True
        }
        
    except jwt.ExpiredSignatureError:
        frappe.throw(_("QR code has expired. Please ask staff for a new code."),
                    frappe.PermissionError)
    except jwt.InvalidTokenError:
        frappe.throw(_("Invalid QR code"), frappe.PermissionError)
    except Exception as e:
        frappe.log_error(f"Error validating table token: {str(e)}", "URY Customer API")
        frappe.throw(_("Failed to validate table token"), frappe.ValidationError)
