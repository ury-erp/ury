import frappe

def create_demo_data():
    """Setup URY demo data for restaurant"""

    # Check and create company if needed
    if not frappe.db.exists("Company", "Demo Restaurant"):
        print("Creating Demo Restaurant Company...")
        # First check if we can use existing company
        existing_company = frappe.db.get_value("Company", filters={}, fieldname="name")
        if existing_company:
            print(f"Using existing company: {existing_company}")
            company_name = existing_company
        else:
            # Create new company
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
    else:
        company_name = "Demo Restaurant"

    # Create Restaurant Areas
    areas = [
        {"area_name": "Main Dining", "description": "Main dining area", "sort_order": 1},
        {"area_name": "Terrace", "description": "Outdoor terrace", "sort_order": 2},
        {"area_name": "Bar", "description": "Bar counter", "sort_order": 3}
    ]

    for area in areas:
        if not frappe.db.exists("Restaurant Area", area["area_name"]):
            doc = frappe.get_doc({"doctype": "Restaurant Area", **area})
            doc.insert(ignore_permissions=True)
            print(f"Created area: {area['area_name']}")

    # Create Restaurant Tables
    tables = [
        {"table_name": "T01", "area": "Main Dining", "seating_capacity": 4, "shape": "Square"},
        {"table_name": "T02", "area": "Main Dining", "seating_capacity": 4, "shape": "Square"},
        {"table_name": "T03", "area": "Main Dining", "seating_capacity": 6, "shape": "Rectangle"},
        {"table_name": "T04", "area": "Main Dining", "seating_capacity": 2, "shape": "Round"},
        {"table_name": "T10", "area": "Terrace", "seating_capacity": 4, "shape": "Square"},
        {"table_name": "T11", "area": "Terrace", "seating_capacity": 6, "shape": "Rectangle"},
        {"table_name": "B01", "area": "Bar", "seating_capacity": 1, "shape": "Round"},
        {"table_name": "B02", "area": "Bar", "seating_capacity": 1, "shape": "Round"},
    ]

    for table in tables:
        if not frappe.db.exists("Restaurant Table", table["table_name"]):
            doc = frappe.get_doc({"doctype": "Restaurant Table", **table})
            doc.insert(ignore_permissions=True)
            print(f"Created table: {table['table_name']}")

    # Create Menu Categories
    categories = [
        {"category_name": "Appetizers", "sort_order": 1},
        {"category_name": "Main Courses", "sort_order": 2},
        {"category_name": "Desserts", "sort_order": 3},
        {"category_name": "Beverages", "sort_order": 4},
    ]

    for cat in categories:
        if not frappe.db.exists("Menu Category", cat["category_name"]):
            doc = frappe.get_doc({"doctype": "Menu Category", **cat})
            doc.insert(ignore_permissions=True)
            print(f"Created category: {cat['category_name']}")

    # Create Menu Items
    items = [
        {"item_name": "Caesar Salad", "item_code": "APP01", "category": "Appetizers", "rate": 12.99},
        {"item_name": "Soup of the Day", "item_code": "APP02", "category": "Appetizers", "rate": 8.99},
        {"item_name": "Grilled Salmon", "item_code": "MAIN01", "category": "Main Courses", "rate": 24.99},
        {"item_name": "Ribeye Steak", "item_code": "MAIN02", "category": "Main Courses", "rate": 32.99},
        {"item_name": "Pasta Carbonara", "item_code": "MAIN03", "category": "Main Courses", "rate": 18.99},
        {"item_name": "Chocolate Cake", "item_code": "DES01", "category": "Desserts", "rate": 8.99},
        {"item_name": "Ice Cream", "item_code": "DES02", "category": "Desserts", "rate": 6.99},
        {"item_name": "Coca Cola", "item_code": "BEV01", "category": "Beverages", "rate": 3.99},
        {"item_name": "Orange Juice", "item_code": "BEV02", "category": "Beverages", "rate": 4.99},
        {"item_name": "Coffee", "item_code": "BEV03", "category": "Beverages", "rate": 3.49},
    ]

    for item in items:
        if not frappe.db.exists("Menu Item", item["item_name"]):
            doc = frappe.get_doc({"doctype": "Menu Item", **item})
            doc.insert(ignore_permissions=True)
            print(f"Created item: {item['item_name']}")

    frappe.db.commit()
    print("\n✓ Demo data setup complete!")
    return "Demo setup completed successfully"