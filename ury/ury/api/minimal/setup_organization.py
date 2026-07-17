import frappe
from frappe import _
from functools import wraps
from frappe.desk.page.setup_wizard.setup_wizard import update_system_settings, create_or_update_user
from erpnext.setup.setup_wizard.setup_wizard import setup_complete as erpnext_setup_complete
from frappe.auth import LoginManager
from frappe.utils import getdate, nowdate

def check_setup_lock():
    # Only allow this if setup isn't complete
    if frappe.db.get_single_value("System Settings", "setup_complete"):
        frappe.throw(_("Setup has already been completed."), frappe.PermissionError)

def setup_api(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        check_setup_lock()
        # Elevate privileges to Administrator for the duration of the setup
        original_user = frappe.session.user
        frappe.set_user("Administrator")
        frappe.flags.ignore_permissions = True
        try:
            return fn(*args, **kwargs)
        finally:
            frappe.flags.ignore_permissions = False
            if frappe.session.user == "Administrator" and original_user:
                frappe.set_user(original_user)
    return wrapper

@frappe.whitelist(allow_guest=True, methods=["POST"])
@setup_api
def setup_organization(**kwargs):
    # Extract data from kwargs or frappe.form_dict
    data = frappe._dict(kwargs)
    
    # Map possible alternative UI field names to expected keys
    if not data.get("company_name"):
        data.company_name = data.get("business_name")
    if not data.get("user_name"):
        data.user_name = data.get("full_name")
    if not data.get("password"):
        data.password = data.get("admin_password")
    if not data.get("abbr"):
        data.abbr = data.get("abbreviation")
    
    required_fields = ["company_name", "abbr", "country", "currency", "email", "user_name", "password"]
    for field in required_fields:
        if not data.get(field):
            frappe.throw(_("Missing field: {0}").format(field))

    # Generate dynamic Fiscal Year dates if not provided
    today = getdate(nowdate())
    if today.month >= 4:
        fy_start = f"{today.year}-04-01"
        fy_end = f"{today.year+1}-03-31"
    else:
        fy_start = f"{today.year-1}-04-01"
        fy_end = f"{today.year}-03-31"

    # Construct the exact dictionary expected by ERPNext & Frappe's Setup Wizard
    args = frappe._dict({
        "company_name": data.company_name,
        "company_abbr": data.abbr,
        "country": data.country,
        "currency": data.currency,
        "timezone": data.get("timezone", "Asia/Kolkata"),
        "language": data.get("language", "English"),
        "full_name": data.user_name,
        "email": data.email,
        "password": data.password,
        "chart_of_accounts": data.get("chart_of_accounts", "Standard"),
        "fy_start_date": data.get("fy_start_date", fy_start),
        "fy_end_date": data.get("fy_end_date", fy_end),
        "domain": data.get("domain", "Services"),
        "set_default": 1
    })

    # 1. Update Frappe System Settings & create the User with System Manager status
    update_system_settings(args)
    create_or_update_user(args)

    # Re-fetch user to assign complete roles
    user = frappe.get_doc("User", data.email)
    roles = frappe.get_all("Role", filters={"disabled": 0, "is_custom": 0}, pluck="name")
    
    # Explicitly ensure Cashier roles are granted even if marked as custom
    for target_role in ["URY Cashier", "Cashier"]:
        if frappe.db.exists("Role", target_role) and target_role not in roles:
            roles.append(target_role)

    for role in roles:
        if role not in ["Guest", "All", "Employee"] and role not in [r.role for r in user.roles]:
            user.append("roles", {"role": role})
    user.save(ignore_permissions=True)

    # 2. Complete ERPNext specific setup (Company, Defaults, Fixtures)
    # This securely invokes the official erpnext system configuration
    erpnext_setup_complete(args)

    # 3. Provision URY Business Defaults exactly mimicking Company profile
    # Create Default Branch
    if not frappe.db.exists("Branch", data.company_name):
        branch = frappe.new_doc("Branch")
        branch.branch = data.company_name
        branch.insert(ignore_permissions=True)

    # Create Default Operations Room automatically
    default_room_name = f"Default Room - {data.abbr}"
    if not frappe.db.exists("URY Room", default_room_name):
        room = frappe.new_doc("URY Room")
        room.name = default_room_name
        room.branch = data.company_name
        room.insert(ignore_permissions=True)

    # Create Default Restaurant matching the standard Branch and Room
    if not frappe.db.exists("URY Restaurant", data.company_name):
        restaurant = frappe.new_doc("URY Restaurant")
        restaurant.name = data.company_name
        restaurant.company = data.company_name
        restaurant.branch = data.company_name
        restaurant.default_room = default_room_name
        # Generates basic defaults, frontend allows editing
        restaurant.invoice_series_prefix = f"{data.abbr}-POS-"
        restaurant.insert(ignore_permissions=True)

    # 4. Generate POS Profile with Default parameters linking Admin User
    pos_profile_name = f"Default Profile - {data.abbr}"
    if not frappe.db.exists("POS Profile", pos_profile_name):
        pos_profile = frappe.new_doc("POS Profile")
        pos_profile.name = pos_profile_name
        pos_profile.company = data.company_name
        pos_profile.currency = data.currency
        pos_profile.branch = data.company_name
        pos_profile.restaurant = data.company_name
        
        # Link the administrator user automatically
        pos_profile.append("applicable_for_users", {
            "user": data.email,
            "default": 1
        })
        
        # Default Cash Payment
        if frappe.db.exists("Mode of Payment", "Cash"):
            pos_profile.append("payments", {
                "mode_of_payment": "Cash",
                "default": 1
            })

        cost_center = frappe.get_all("Cost Center", filters={"company": data.company_name, "is_group": 0}, skip_permissions=True, limit=1)
        if cost_center:
            pos_profile.write_off_cost_center = cost_center[0].name
            pos_profile.cost_center = cost_center[0].name

        round_off_account = frappe.get_all("Account", filters={"company": data.company_name, "account_type": "Round Off", "is_group": 0}, skip_permissions=True, limit=1)
        if round_off_account:
            pos_profile.write_off_account = round_off_account[0].name
        
        # Avoid explicit warehouse errors
        pos_profile.update_stock = 0 
        pos_profile.validate_stock_on_save = 0
        pos_profile.insert(ignore_permissions=True)

    # 5. Mark setup as perfectly completed in global settings
    frappe.db.set_single_value("System Settings", "setup_complete", 1)

    # 4. Generate Session Cookie & Log the user deeply in without the login page
    login_manager = LoginManager()
    login_manager.run_post_login_hooks = True
    login_manager.login_as(data.email)
    frappe.local.login_manager = login_manager

    return {
        "status": "success",
        "home_url": "/pos/setup",
        "message": "System setup completely mimicking ERPNext has been successfully completed."
    }