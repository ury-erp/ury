"""
URY Customer API

Customer-facing API endpoints for URY restaurant ERP system.
These endpoints support guest access for QR table ordering, 
online ordering, and kiosk applications.
"""

import frappe
from frappe import _
import json
import uuid
from datetime import datetime


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


@frappe.whitelist(allow_guest=True)
def create_customer_order(
    restaurant,
    items,
    customer_name=None,
    customer_phone=None,
    table=None,
    table_token=None,
    order_type="Dine In",
    order_source="QR",
    comments=None,
    scheduled_time=None
):
    """
    Create an order from customer-facing applications.
    
    This endpoint is accessible without authentication and creates
    a POS Invoice with auto-assigned cashier from active POS Opening.
    
    Args:
        restaurant: Restaurant name (URY Restaurant)
        items: List of order items [{item_code, qty, comment}]
        customer_name: Optional customer name
        customer_phone: Optional customer phone
        table: Optional table name (for dine-in)
        table_token: Optional QR token (validates table context)
        order_type: Type of order (Dine In, Take Away, etc.)
        order_source: Source of order (QR, Online, Kiosk)
        comments: Optional order comments
        scheduled_time: Optional scheduled pickup time
        
    Returns:
        dict: Order details including order_token for tracking
    """
    try:
        # Validate restaurant
        restaurant_doc = frappe.get_doc("URY Restaurant", restaurant)
        if not restaurant_doc or not restaurant_doc.accepts_online_orders:
            frappe.throw(
                _("This restaurant is not accepting orders at the moment"),
                frappe.ValidationError
            )
        
        # Validate table token if provided
        if table_token:
            token_data = validate_table_token(table_token)
            if token_data.get("restaurant") != restaurant:
                frappe.throw(_("Invalid table token for this restaurant"), frappe.PermissionError)
            if not table:
                table = token_data.get("table")
        
        # Auto-assign cashier from active POS Opening
        cashier = get_active_cashier(restaurant)
        if not cashier:
            frappe.throw(
                _("Restaurant is not ready to accept orders. Please ask staff to open POS."),
                frappe.ValidationError
            )
        
        # Get or create customer
        customer = get_or_create_customer(customer_name, customer_phone)
        
        # Generate unique order token
        order_token = str(uuid.uuid4())[:8].upper()
        
        # Create POS Invoice
        invoice = frappe.new_doc("POS Invoice")
        invoice.naming_series = restaurant_doc.invoice_series_prefix
        invoice.is_pos = 1
        invoice.update_stock = 1
        invoice.restaurant = restaurant
        invoice.branch = restaurant_doc.branch
        invoice.restaurant_table = table
        invoice.customer = customer
        invoice.order_type = order_type
        invoice.cashier = cashier
        invoice.pos_profile = get_pos_profile_for_cashier(cashier, restaurant)
        
        # Set customer ordering fields
        invoice.fulfillment_status = "Placed"
        invoice.order_source = order_source
        invoice.customer_order_token = order_token
        if scheduled_time:
            invoice.scheduled_pickup_time = scheduled_time
        if comments:
            invoice.custom_comments = comments
        
        # Set price list and taxes
        invoice.selling_price_list = frappe.db.get_value(
            "Price List",
            {"restaurant_menu": restaurant_doc.active_menu, "enabled": 1},
            "name"
        )
        invoice.taxes_and_charges = restaurant_doc.default_tax_template
        
        # Parse items if JSON string
        if isinstance(items, str):
            items = json.loads(items)
        
        # Add items to invoice
        for item_data in items:
            item_code = item_data.get("item_code") or item_data.get("item")
            qty = item_data.get("qty", 1)
            comment = item_data.get("comment", "")
            
            # Get item price
            price_list_rate = frappe.db.get_value(
                "Item Price",
                {"item_code": item_code, "price_list": invoice.selling_price_list},
                "price_list_rate"
            ) or 0
            
            # Get course from menu
            course = frappe.db.get_value(
                "URY Menu Item",
                {"item": item_code, "parent": restaurant_doc.active_menu},
                "course"
            )
            
            invoice.append("items", {
                "item_code": item_code,
                "qty": qty,
                "rate": price_list_rate,
                "price_list_rate": price_list_rate,
                "comment": comment,
                "custom_course": course,
                "cost_center": frappe.db.get_value("POS Profile", invoice.pos_profile, "cost_center")
            })
        
        # Save invoice
        invoice.save()
        
        # Trigger KOT generation
        try:
            from ury.ury.api.ury_kot_generate import kot_execute
            kot_execute(invoice.name, customer, table, items, [], comments)
        except Exception as e:
            frappe.log_error(f"KOT generation failed: {str(e)}", "Customer Order")
        
        # Mark table as occupied
        if table:
            frappe.db.set_value("URY Table", table, "occupied", 1)
        
        frappe.db.commit()
        
        # Publish realtime event for new order
        frappe.publish_realtime(
            "new_customer_order",
            {
                "order_token": order_token,
                "restaurant": restaurant,
                "table": table,
                "order_source": order_source
            }
        )
        
        return {
            "order_token": order_token,
            "invoice_id": invoice.name,
            "status": "success",
            "message": "Order placed successfully",
            "grand_total": invoice.grand_total,
            "customer_name": customer_name,
            "table": table,
            "fulfillment_status": "Placed"
        }
        
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(f"Error creating customer order: {str(e)}", "URY Customer API")
        frappe.throw(_("Failed to place order. Please try again."), frappe.ValidationError)


def get_active_cashier(restaurant):
    """
    Get active cashier from POS Opening Entry for the restaurant's branch.
    
    Args:
        restaurant: Restaurant name
        
    Returns:
        str: User ID of active cashier, or None if no active POS
    """
    try:
        branch = frappe.db.get_value("URY Restaurant", restaurant, "branch")
        if not branch:
            return None
        
        # Find active POS Opening Entry for this branch
        pos_opening = frappe.get_all(
            "POS Opening Entry",
            filters={
                "branch": branch,
                "status": "Open",
                "docstatus": 1
            },
            fields=["user"],
            limit=1,
            order_by="creation desc"
        )
        
        if pos_opening:
            return pos_opening[0].user
        
        # Fallback: Get any user with URY Cashier role for this branch
        cashier_users = frappe.get_all(
            "User",
            filters={
                "enabled": 1,
                "branch": branch
            },
            fields=["name"],
            limit=1
        )
        
        if cashier_users:
            return cashier_users[0].name
            
        return None
        
    except Exception as e:
        frappe.log_error(f"Error getting active cashier: {str(e)}", "URY Customer API")
        return None


def get_pos_profile_for_cashier(cashier, restaurant):
    """
    Get POS Profile for a cashier at a restaurant.
    
    Args:
        cashier: User ID
        restaurant: Restaurant name
        
    Returns:
        str: POS Profile name
    """
    try:
        branch = frappe.db.get_value("URY Restaurant", restaurant, "branch")
        
        pos_profile = frappe.get_all(
            "POS Profile",
            filters={
                "branch": branch,
                "disabled": 0
            },
            fields=["name"],
            limit=1
        )
        
        if pos_profile:
            return pos_profile[0].name
            
        # Fallback: Get any POS Profile for this branch
        pos_profile = frappe.get_all(
            "POS Profile",
            filters={"branch": branch},
            fields=["name"],
            limit=1
        )
        
        return pos_profile[0].name if pos_profile else None
        
    except Exception as e:
        frappe.log_error(f"Error getting POS profile: {str(e)}", "URY Customer API")
        return None


def get_or_create_customer(name, phone):
    """
    Get existing customer or create a new one.
    
    Args:
        name: Customer name
        phone: Customer phone
        
    Returns:
        str: Customer ID
    """
    try:
        if phone:
            # Search by phone
            existing = frappe.get_all(
                "Customer",
                filters={"mobile_number": phone},
                fields=["name"],
                limit=1
            )
            if existing:
                return existing[0].name
        
        # Create new customer
        if not name:
            name = "Guest Customer"
        
        customer = frappe.new_doc("Customer")
        customer.customer_name = name
        customer.customer_type = "Individual"
        customer.customer_group = "Individual"
        customer.territory = "All Territories"
        if phone:
            customer.mobile_number = phone
        customer.save(ignore_permissions=True)
        
        return customer.name
        
    except Exception as e:
        frappe.log_error(f"Error creating customer: {str(e)}", "URY Customer API")
        # Return default guest customer
        return "Guest"


@frappe.whitelist()
def update_fulfillment_status(order_token, new_status, notes=None):
    """
    Update the fulfillment status of an order.
    
    Args:
        order_token: Order token
        new_status: New fulfillment status
        notes: Optional notes about the status change
        
    Returns:
        dict: Updated order details
    """
    try:
        # Find invoice by token
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"customer_order_token": order_token},
            "name"
        )
        
        if not invoice_name:
            frappe.throw(_("Order not found"), frappe.DoesNotExistError)
        
        invoice = frappe.get_doc("POS Invoice", invoice_name)
        old_status = invoice.fulfillment_status
        
        # Update status
        invoice.fulfillment_status = new_status
        invoice.save()
        
        # Log the status change
        frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": "POS Invoice",
            "reference_name": invoice.name,
            "content": f"Status changed from {old_status} to {new_status}. {notes or ''}"
        }).insert(ignore_permissions=True)
        
        # Publish realtime update
        frappe.publish_realtime(
            f"order_status_{order_token}",
            {
                "order_token": order_token,
                "fulfillment_status": new_status,
                "previous_status": old_status,
                "timestamp": frappe.utils.now()
            }
        )
        
        return {
            "order_token": order_token,
            "fulfillment_status": new_status,
            "previous_status": old_status,
            "updated_at": frappe.utils.now()
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating fulfillment status: {str(e)}", "URY Customer API")
        frappe.throw(_("Failed to update order status"), frappe.ValidationError)
