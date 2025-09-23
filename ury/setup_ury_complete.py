#!/usr/bin/env python3
import frappe
import json
from frappe.utils import nowdate

def setup_ury_restaurant():
    """Complete URY setup with all required data"""

    print("Starting URY Restaurant Setup...")

    # 1. First create Branch if not exists
    if not frappe.db.exists("Branch", "Main Branch"):
        print("Creating Branch...")
        branch = frappe.get_doc({
            "doctype": "Branch",
            "branch": "Main Branch",
            "user": []  # Empty table for now, will add users later
        })
        branch.insert(ignore_permissions=True)
        frappe.db.commit()
        print("✓ Branch created")

    # 2. Create URY Room (required for restaurant)
    if not frappe.db.exists("URY Room", "Dining Hall"):
        print("Creating URY Room...")
        room = frappe.get_doc({
            "doctype": "URY Room",
            "name": "Dining Hall",
            "branch": "Main Branch",
            "room_type": "AC"
        })
        room.insert(ignore_permissions=True)
        frappe.db.commit()
        print("✓ URY Room created")

    # 3. Get or create Company
    company_name = frappe.db.get_value("Company", filters={}, fieldname="name")
    if not company_name:
        print("Creating Company...")
        company = frappe.get_doc({
            "doctype": "Company",
            "company_name": "Demo Restaurant",
            "abbr": "DR",
            "default_currency": "USD",
            "country": "United States"
        })
        company.insert(ignore_permissions=True)
        company_name = "Demo Restaurant"
        frappe.db.commit()
        print("✓ Company created")
    else:
        print(f"✓ Using existing company: {company_name}")

    # 4. Create URY Restaurant
    if not frappe.db.exists("URY Restaurant", "Main Restaurant"):
        print("Creating URY Restaurant...")
        restaurant = frappe.get_doc({
            "doctype": "URY Restaurant",
            "name": "Main Restaurant",
            "company": company_name,
            "invoice_series_prefix": "REST",
            "branch": "Main Branch",
            "default_room": "Dining Hall"
        })
        restaurant.insert(ignore_permissions=True)
        frappe.db.commit()
        print("✓ URY Restaurant created")

    # 5. Create URY Tables
    tables = [
        {"name": "T01", "restaurant": "Main Restaurant", "seating_capacity": 4},
        {"name": "T02", "restaurant": "Main Restaurant", "seating_capacity": 4},
        {"name": "T03", "restaurant": "Main Restaurant", "seating_capacity": 6},
        {"name": "T04", "restaurant": "Main Restaurant", "seating_capacity": 2},
        {"name": "T05", "restaurant": "Main Restaurant", "seating_capacity": 8},
        {"name": "B01", "restaurant": "Main Restaurant", "seating_capacity": 1},
        {"name": "B02", "restaurant": "Main Restaurant", "seating_capacity": 1},
        {"name": "B03", "restaurant": "Main Restaurant", "seating_capacity": 1},
    ]

    print("\nCreating URY Tables...")
    created_tables = 0
    for table_data in tables:
        table_name = f"{table_data['restaurant']}-{table_data['name']}"
        if not frappe.db.exists("URY Table", {"restaurant": table_data["restaurant"], "table_name": table_data["name"]}):
            try:
                table = frappe.get_doc({
                    "doctype": "URY Table",
                    "restaurant": table_data["restaurant"],
                    "table_name": table_data["name"],
                    "seating_capacity": table_data["seating_capacity"],
                    "status": "Available"
                })
                table.insert(ignore_permissions=True)
                created_tables += 1
            except Exception as e:
                print(f"  ! Error creating table {table_data['name']}: {str(e)}")
    frappe.db.commit()
    print(f"✓ {created_tables} URY Tables created")

    # 6. Create URY Menu
    if not frappe.db.exists("URY Menu", "Main Menu"):
        print("\nCreating URY Menu...")
        menu = frappe.get_doc({
            "doctype": "URY Menu",
            "menu_name": "Main Menu",
            "active": 1,
            "restaurant": "Main Restaurant"
        })
        menu.insert(ignore_permissions=True)
        frappe.db.commit()
        print("✓ URY Menu created")

    # 7. Create URY Menu Items
    menu_items = [
        # Appetizers
        {"item_name": "Caesar Salad", "item_code": "APP001", "rate": 12.99, "description": "Classic Caesar salad"},
        {"item_name": "Garlic Bread", "item_code": "APP002", "rate": 6.99, "description": "Toasted garlic bread"},
        {"item_name": "Soup of the Day", "item_code": "APP003", "rate": 8.99, "description": "Chef's special soup"},

        # Main Courses
        {"item_name": "Grilled Salmon", "item_code": "MAIN001", "rate": 24.99, "description": "Atlantic salmon with vegetables"},
        {"item_name": "Ribeye Steak", "item_code": "MAIN002", "rate": 32.99, "description": "12oz ribeye with sides"},
        {"item_name": "Pasta Carbonara", "item_code": "MAIN003", "rate": 18.99, "description": "Classic carbonara"},
        {"item_name": "Chicken Parmesan", "item_code": "MAIN004", "rate": 19.99, "description": "Breaded chicken with marinara"},
        {"item_name": "Vegetarian Pizza", "item_code": "MAIN005", "rate": 16.99, "description": "Fresh vegetable pizza"},

        # Desserts
        {"item_name": "Chocolate Cake", "item_code": "DES001", "rate": 8.99, "description": "Rich chocolate cake"},
        {"item_name": "Ice Cream", "item_code": "DES002", "rate": 5.99, "description": "Vanilla, chocolate or strawberry"},
        {"item_name": "Tiramisu", "item_code": "DES003", "rate": 9.99, "description": "Classic Italian dessert"},

        # Beverages
        {"item_name": "Coca Cola", "item_code": "BEV001", "rate": 3.99, "description": "Classic Coke"},
        {"item_name": "Orange Juice", "item_code": "BEV002", "rate": 4.99, "description": "Fresh orange juice"},
        {"item_name": "Coffee", "item_code": "BEV003", "rate": 3.49, "description": "Fresh brewed coffee"},
        {"item_name": "Tea", "item_code": "BEV004", "rate": 2.99, "description": "Hot tea"},
        {"item_name": "Water", "item_code": "BEV005", "rate": 0.00, "description": "Bottled water"},
    ]

    print("\nCreating URY Menu Items...")
    created_items = 0
    for item_data in menu_items:
        if not frappe.db.exists("URY Menu Item", item_data["item_name"]):
            try:
                # First create the Item in ERPNext
                if not frappe.db.exists("Item", item_data["item_code"]):
                    item = frappe.get_doc({
                        "doctype": "Item",
                        "item_code": item_data["item_code"],
                        "item_name": item_data["item_name"],
                        "item_group": "Products",
                        "stock_uom": "Nos",
                        "is_stock_item": 0,
                        "is_sales_item": 1,
                        "description": item_data["description"]
                    })
                    item.insert(ignore_permissions=True)

                # Then create URY Menu Item
                menu_item = frappe.get_doc({
                    "doctype": "URY Menu Item",
                    "item_name": item_data["item_name"],
                    "item": item_data["item_code"],
                    "rate": item_data["rate"],
                    "description": item_data["description"],
                    "menu": "Main Menu"
                })
                menu_item.insert(ignore_permissions=True)
                created_items += 1
            except Exception as e:
                print(f"  ! Error creating item {item_data['item_name']}: {str(e)}")
    frappe.db.commit()
    print(f"✓ {created_items} URY Menu Items created")

    # 8. Create URY Users (Cashier, Captain, etc.)
    ury_users = [
        {"username": "cashier1", "role": "URY Cashier", "full_name": "John Cashier"},
        {"username": "captain1", "role": "URY Captain", "full_name": "Jane Captain"},
        {"username": "manager1", "role": "URY Manager", "full_name": "Mike Manager"},
    ]

    print("\nCreating URY Users...")
    created_users = 0
    for user_data in ury_users:
        email = f"{user_data['username']}@restaurant.local"
        if not frappe.db.exists("User", email):
            try:
                user = frappe.get_doc({
                    "doctype": "User",
                    "email": email,
                    "first_name": user_data["full_name"],
                    "send_welcome_email": 0,
                    "roles": [{"role": user_data["role"]}]
                })
                user.insert(ignore_permissions=True)

                # Also create URY User record
                ury_user = frappe.get_doc({
                    "doctype": "URY User",
                    "user": email,
                    "restaurant": "Main Restaurant",
                    "cashier_password": "1234"  # Simple PIN for POS
                })
                ury_user.insert(ignore_permissions=True)
                created_users += 1
            except Exception as e:
                print(f"  ! Error creating user {user_data['username']}: {str(e)}")
    frappe.db.commit()
    print(f"✓ {created_users} URY Users created")

    # 9. Configure URY Settings if exists
    try:
        if frappe.db.exists("Single", {"doctype": "URY Settings"}):
            print("\nConfiguring URY Settings...")
            settings = frappe.get_doc("URY Settings")
            settings.company = company_name
            settings.default_customer = "Guest"
            settings.allow_negative_stock = 1
            settings.save(ignore_permissions=True)
            frappe.db.commit()
            print("✓ URY Settings configured")
    except Exception as e:
        print(f"! Could not configure URY Settings: {str(e)}")

    print("\n" + "="*50)
    print("✓✓✓ URY Restaurant Setup Complete! ✓✓✓")
    print("="*50)
    print("\nYou can now access:")
    print("- ERPNext: http://localhost:8000")
    print("- URY POS: http://localhost:8000/urypos")
    print("- Kitchen Display: http://localhost:8000/URYMosaic")
    print("\nTest Users Created:")
    print("- Cashier: cashier1@restaurant.local (PIN: 1234)")
    print("- Captain: captain1@restaurant.local")
    print("- Manager: manager1@restaurant.local")
    print("\nRestaurant: Main Restaurant")
    print("Tables: T01-T05, B01-B03")
    print("Menu: Main Menu with 16 items")

if __name__ == "__main__":
    frappe.init(site="frontend")
    frappe.connect()
    frappe.set_user("Administrator")
    setup_ury_restaurant()
    frappe.destroy()