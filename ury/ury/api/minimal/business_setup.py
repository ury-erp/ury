import frappe
from frappe import _

@frappe.whitelist(allow_guest=True)
def get_business_setup():
    company = frappe.get_all("Company", limit=1)
    if not company:
        frappe.throw(_("No Company found."))
    company_name = company[0].name

    # Fetch all branches instead of just the default one
    branches = frappe.get_all("Branch", fields=["*"])
    
    restaurant = frappe.get_doc("URY Restaurant", company_name) if frappe.db.exists("URY Restaurant", company_name) else None

    return {
        "status": "success",
        "data": {
            "branches": branches,
            "restaurant": restaurant.as_dict() if restaurant else None,
            "company": company_name
        }
    }

@frappe.whitelist(allow_guest=True)
def update_business_setup(branch=None, restaurant=None):
    if branch:
        if isinstance(branch, str):
            branch = frappe.parse_json(branch)
            
        branches_data = branch if isinstance(branch, list) else [branch]
        
        for b_data in branches_data:
            # Check if we should update or create
            branch_name = b_data.get("name") or b_data.get("branch")
            if branch_name and frappe.db.exists("Branch", branch_name):
                doc = frappe.get_doc("Branch", branch_name)
                doc.update(b_data)
                doc.save(ignore_permissions=True)
            elif branch_name:
                doc = frappe.new_doc("Branch")
                doc.branch = branch_name
                doc.update(b_data)
                doc.insert(ignore_permissions=True)
            
    if restaurant:
        if isinstance(restaurant, str):
            restaurant = frappe.parse_json(restaurant)
            
        restaurants_data = restaurant if isinstance(restaurant, list) else [restaurant]
        
        company = frappe.get_all("Company", limit=1)
        company_name = company[0].name if company else None
        
        for r_data in restaurants_data:
            restaurant_name = r_data.get("name") or r_data.get("restaurant_name") or company_name
            if restaurant_name and frappe.db.exists("URY Restaurant", restaurant_name):
                rdoc = frappe.get_doc("URY Restaurant", restaurant_name)
                rdoc.update(r_data)
                rdoc.save(ignore_permissions=True)
            elif restaurant_name:
                rdoc = frappe.new_doc("URY Restaurant")
                rdoc.name = restaurant_name
                if not r_data.get("company"):
                    rdoc.company = company_name
                rdoc.update(r_data)
                rdoc.insert(ignore_permissions=True)
            
    return {"status": "success"}