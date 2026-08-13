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
            tax_id = b_data.get("tax_id") or b_data.get("taxId")
            if tax_id:
                comp = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
                if comp:
                    frappe.db.set_value("Company", comp, "tax_id", tax_id)

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

@frappe.whitelist()
def create_setup_user(email, name, password=None, role="URY Cashier"):
    if frappe.db.exists("User", email):
        return {"status": "exists", "email": email}
    
    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": name,
        "enabled": 1,
        "send_welcome_email": 0,
        "user_type": "System User",
        "roles": [{"role": role}]
    })
    user.insert(ignore_permissions=True)
    if password:
        from frappe.utils.password import update_password
        update_password(user=email, pwd=password)
    return {"status": "created", "email": email}

@frappe.whitelist()
def submit_configure_data(data):
    if isinstance(data, str):
        data = frappe.parse_json(data)
        
    results = {}
    
    # Derive default company from site defaults or latest created company
    default_company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
    if not default_company:
        default_company = "Main Company"
        if not frappe.db.exists("Company", default_company):
            comp_doc = frappe.get_doc({
                "doctype": "Company",
                "company_name": default_company,
                "default_currency": "INR"
            })
            comp_doc.insert(ignore_permissions=True)
    
    # 1. Branch
    branch_name = default_company
    if data.get("branch"):
        b = data["branch"]
        branch_name = b.get("branchName") or default_company
        tax_id = b.get("taxId")
        if tax_id:
            frappe.db.set_value("Company", default_company, "tax_id", tax_id)

        if not frappe.db.exists("Branch", branch_name):
            branch_doc = frappe.get_doc({
                "doctype": "Branch",
                "branch": branch_name,
                "custom_invoice_series_prefix": b.get("invoicePrefix", "INV-"),
                "custom_aggregator_series_prefix": b.get("aggregatorPrefix", "AGG-"),
                "tax_id": tax_id,
                "user": [{"user": frappe.session.user}]
            })
            branch_doc.insert(ignore_permissions=True)
            results["branch"] = branch_doc.name
        else:
            if tax_id:
                frappe.db.set_value("Branch", branch_name, "tax_id", tax_id)
            results["branch"] = branch_name

    # 2. URY Rooms
    results["rooms"] = []
    first_room_name = None
    for r in data.get("rooms", []):
        r_name = r.get("name")
        if not r_name:
            continue
        if not first_room_name:
            first_room_name = r_name
            
        if not frappe.db.exists("URY Room", r_name):
            room_doc = frappe.get_doc({
                "doctype": "URY Room",
                "name": r_name,
                "branch": branch_name,
                "room_type": r.get("type", "AC")
            })
            room_doc.insert(ignore_permissions=True)
            results["rooms"].append(room_doc.name)
        else:
            results["rooms"].append(r_name)

    if not first_room_name:
        first_room_name = "Main Dining"
        if not frappe.db.exists("URY Room", first_room_name):
            room_doc = frappe.get_doc({
                "doctype": "URY Room",
                "name": first_room_name,
                "branch": branch_name,
                "room_type": "AC"
            })
            room_doc.insert(ignore_permissions=True)
            results["rooms"].append(room_doc.name)

    # 3. URY Restaurant (Required dependency for URY Table!)
    restaurant_name = default_company
    if not frappe.db.exists("URY Restaurant", restaurant_name):
        rest_doc = frappe.get_doc({
            "doctype": "URY Restaurant",
            "name": restaurant_name,
            "company": default_company,
            "branch": branch_name,
            "invoice_series_prefix": data.get("branch", {}).get("invoicePrefix", "INV-"),
            "aggregator_series_prefix": data.get("branch", {}).get("aggregatorPrefix", "AGG-"),
            "default_room": first_room_name
        })
        rest_doc.insert(ignore_permissions=True)
        results["restaurant"] = rest_doc.name
    else:
        results["restaurant"] = restaurant_name

    # 4. URY Tables (linked to Restaurant & Room!)
    results["tables"] = []
    # Shape mapping: UI 'Round' -> DB 'Circle'
    shape_map = {"Round": "Circle", "Square": "Square", "Rectangle": "Rectangle"}
    for t in data.get("tables", []):
        t_name = t.get("name")
        if not t_name:
            continue
        room_link = t.get("room") or first_room_name
        raw_shape = t.get("shape", "Square")
        mapped_shape = shape_map.get(raw_shape, "Square")
        
        if not frappe.db.exists("URY Table", t_name):
            table_doc = frappe.get_doc({
                "doctype": "URY Table",
                "name": t_name,
                "restaurant": restaurant_name,
                "restaurant_room": room_link,
                "branch": branch_name,
                "no_of_seats": int(t.get("seats", 4)),
                "table_shape": mapped_shape
            })
            table_doc.insert(ignore_permissions=True)
            results["tables"].append(table_doc.name)
        else:
            results["tables"].append(t_name)

    # 5. URY Menu Courses, ERPNext Item Creation (Pass 1) & URY Menu (Pass 2)
    menu_items_table = []
    item_group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
    
    if not frappe.db.exists("UOM", "Unit"):
        frappe.get_doc({"doctype": "UOM", "uom_name": "Unit", "must_be_whole_number": 0}).insert(ignore_permissions=True)
    uom = "Unit"

    results["created_items"] = []
    existing_courses = set(frappe.get_all("URY Menu Course", pluck="name"))
    
    for m in data.get("menuItems", []):
        item_title = m.get("name")
        course_title = m.get("course", "Main Course")
        item_price = float(m.get("price", 0))

        if not item_title:
            continue

        # 5a. Ensure URY Menu Course exists
        if course_title not in existing_courses:
            c_doc = frappe.get_doc({"doctype": "URY Menu Course", "course": course_title})
            c_doc.insert(ignore_permissions=True)
            existing_courses.add(course_title)

        # 5b. PASS 1: Create ERPNext Item DocType record with Maintain Stock (is_stock_item) = 0!
        if not frappe.db.exists("Item", item_title):
            item_doc = frappe.get_doc({
                "doctype": "Item",
                "item_code": item_title,
                "item_name": item_title,
                "item_group": item_group,
                "stock_uom": uom,
                "standard_rate": item_price,
                "is_stock_item": 0,  # Maintain Stock == 0
                "is_sales_item": 1
            })
            item_doc.insert(ignore_permissions=True)
            results["created_items"].append(item_doc.name)

        # Build child table row referencing the created ERPNext Item
        menu_items_table.append({
            "item": item_title,
            "item_name": item_title,
            "rate": item_price,
            "course": course_title
        })

    # 5c. PASS 2: Create URY Menu DocType record with the items
    menu_name = "Default Menu"
    if menu_items_table and not frappe.db.exists("URY Menu", menu_name):
        menu_doc = frappe.get_doc({
            "doctype": "URY Menu",
            "name": menu_name,
            "branch": branch_name,
            "enabled": 1,
            "items": menu_items_table
        })
        menu_doc.insert(ignore_permissions=True)
        results["menu"] = menu_doc.name
        
        # Link menu to restaurant
        frappe.db.set_value("URY Restaurant", restaurant_name, "active_menu", menu_name)
    elif frappe.db.exists("URY Menu", menu_name):
        results["menu"] = menu_name

    # 6. Mode of Payment
    results["payment_methods"] = []
    for p in data.get("paymentMethods", []):
        p_name = p.get("name")
        if not p_name:
            continue
        if not frappe.db.exists("Mode of Payment", p_name):
            pm_doc = frappe.get_doc({
                "doctype": "Mode of Payment",
                "mode_of_payment": p_name,
                "type": "General"
            })
            pm_doc.insert(ignore_permissions=True)
            results["payment_methods"].append(pm_doc.name)
        else:
            results["payment_methods"].append(p_name)

    # 7. System Users
    results["users"] = []
    for u in data.get("users", []):
        if not u.get("email"):
            continue
        res = create_setup_user(
            email=u.get("email"),
            name=u.get("name", "Cashier"),
            password=u.get("passwordPlaceholder"),
            role=u.get("role", "URY Cashier")
        )
        results["users"].append(res)
        
        try:
            b_doc = frappe.get_doc("Branch", branch_name)
            if not any(row.user == u.get("email") for row in b_doc.user):
                b_doc.append("user", {"user": u.get("email")})
                b_doc.save(ignore_permissions=True)
        except Exception:
            pass

    # 8. POS Profile & Warehouse
    try:
        warehouse_name = f"Finished Goods - {frappe.db.get_value('Company', default_company, 'abbr')}"
        if not frappe.db.exists("Warehouse", warehouse_name):
            w_doc = frappe.get_doc({
                "doctype": "Warehouse",
                "warehouse_name": "Finished Goods",
                "company": default_company,
                "is_group": 0
            })
            w_doc.insert(ignore_permissions=True)
        
        pos_profile_name = branch_name
        if not frappe.db.exists("POS Profile", pos_profile_name):
            company_doc = frappe.get_doc("Company", default_company)
            
            # Create Sales Taxes and Charges Template if tax rate > 0
            tax_config = data.get("taxConfig", {})
            tax_rate = float(tax_config.get("taxPercentage", 0))
            tax_type = tax_config.get("taxType", "Exclusive")
            tax_template_name = None
            
            if tax_rate > 0:
                template_title = f"{branch_name} Tax Template"
                existing_template = frappe.db.get_value("Sales Taxes and Charges Template", {"title": template_title, "company": default_company}, "name")
                if not existing_template:
                    tax_account = frappe.db.get_value("Account", {"company": default_company, "account_type": "Tax", "is_group": 0}, "name")
                    if not tax_account:
                        tax_account = company_doc.default_income_account or frappe.db.get_value("Account", {"company": default_company, "account_type": "Income Account", "is_group": 0}, "name")
                    
                    stc_doc = frappe.get_doc({
                        "doctype": "Sales Taxes and Charges Template",
                        "title": template_title,
                        "company": default_company,
                        "taxes": [{
                            "charge_type": "On Net Total",
                            "account_head": tax_account,
                            "description": f"Tax @ {tax_rate}%",
                            "rate": tax_rate,
                            "included_in_print_rate": 1 if tax_type == "Inclusive" else 0
                        }]
                    })
                    stc_doc.insert(ignore_permissions=True)
                    tax_template_name = stc_doc.name
                else:
                    tax_template_name = existing_template
            
            income_account = company_doc.default_income_account or frappe.db.get_value("Account", {"company": default_company, "account_type": "Income Account", "is_group": 0}, "name")
            expense_account = company_doc.default_expense_account or frappe.db.get_value("Account", {"company": default_company, "account_type": "Expense Account", "is_group": 0}, "name")
            cost_center = company_doc.cost_center or frappe.db.get_value("Cost Center", {"company": default_company, "is_group": 0}, "name")
            
            write_off_account = getattr(company_doc, "write_off_account", None) or frappe.db.get_value("Account", {"company": default_company, "account_type": "Write Off", "is_group": 0}, "name") or expense_account
            write_off_cost_center = getattr(company_doc, "cost_center", None) or cost_center
            
            menu_price_list = None
            if results.get("menu"):
                menu_price_list = frappe.db.get_value("URY Menu", results["menu"], "price_list") or results["menu"]
            elif frappe.db.exists("URY Menu", "Default Menu"):
                menu_price_list = frappe.db.get_value("URY Menu", "Default Menu", "price_list") or "Default Menu"

            selling_price_list = menu_price_list or frappe.db.get_value("Price List", {"selling": 1}, "name") or "Standard Selling"
            
            customer = frappe.db.get_value("Customer", {}, "name")
            
            # Fetch cashier users for applicable_for_users
            cashier_users = frappe.get_all("Has Role", filters={"role": "URY Cashier", "parenttype": "User"}, fields=["parent"])
            cashier_emails = {u.parent for u in cashier_users if u.parent not in ("Administrator", "Guest")}
            for res_u in results.get("users", []):
                if isinstance(res_u, dict) and res_u.get("email"):
                    cashier_emails.add(res_u["email"])

            meta = frappe.get_meta("POS Profile")
            table_fields = {df.fieldname: df for df in meta.get_table_fields()}
            
            raw_pos_dict = {
                "doctype": "POS Profile",
                "name": pos_profile_name,
                "pos_profile_name": pos_profile_name,
                "company": default_company,
                "warehouse": warehouse_name,
                "currency": company_doc.default_currency,
                "income_account": income_account,
                "expense_account": expense_account,
                "cost_center": cost_center,
                "write_off_account": write_off_account,
                "write_off_cost_center": write_off_cost_center,
                "selling_price_list": selling_price_list,
                "customer": customer,
                "update_stock": 1,
                "custom_kot_naming_series": "KOT-URY-",
                "kot_naming_series": "KOT-URY-",
                "custom_kot_warning_time": 15,
                "table_attention_time": 30,
                "role_allowed_for_billing": "URY Cashier",
                "transfer_role_permissions": "URY Manager",
                "restaurant": restaurant_name,
                "branch": branch_name,
                "payments": [{"mode_of_payment": pm, "default": 1 if i == 0 else 0} for i, pm in enumerate(results.get("payment_methods", []))],
                "applicable_for_users": [{"user": email, "default": 1} for email in cashier_emails]
            }

            pos_dict = {}
            for k, v in raw_pos_dict.items():
                if not meta.has_field(k) and k not in ("doctype", "name", "pos_profile_name"):
                    continue
                if k in table_fields:
                    df = table_fields[k]
                    child_meta = frappe.get_meta(df.options)
                    c_field = "role" if child_meta.has_field("role") else (child_meta.fields[0].fieldname if child_meta.fields else "name")
                    
                    if isinstance(v, str):
                        pos_dict[k] = [{c_field: v}]
                    elif isinstance(v, list):
                        cleaned_list = []
                        for item in v:
                            if isinstance(item, dict):
                                cleaned_list.append(item)
                            elif isinstance(item, str):
                                cleaned_list.append({c_field: item})
                        pos_dict[k] = cleaned_list
                    else:
                        pos_dict[k] = v
                else:
                    pos_dict[k] = v

            pos_doc = frappe.get_doc(pos_dict)
            
            if tax_template_name:
                if frappe.db.exists("URY Restaurant", f"{branch_name} Restaurant"):
                    frappe.db.set_value("URY Restaurant", f"{branch_name} Restaurant", "default_tax_template", tax_template_name)
                
            pos_doc.insert(ignore_permissions=True)
            results["pos_profile"] = pos_doc.name
        else:
            p_doc = frappe.get_doc("POS Profile", pos_profile_name)
            meta = frappe.get_meta("POS Profile")
            table_fields = {df.fieldname: df for df in meta.get_table_fields()}
            update_fields = {
                "custom_kot_naming_series": "KOT-URY-",
                "kot_naming_series": "KOT-URY-",
                "custom_kot_warning_time": 15,
                "table_attention_time": 30,
                "role_allowed_for_billing": "URY Cashier",
                "transfer_role_permissions": "URY Manager",
                "restaurant": restaurant_name,
                "branch": branch_name,
            }
            for k, v in update_fields.items():
                if not meta.has_field(k):
                    continue
                if k in table_fields:
                    df = table_fields[k]
                    child_meta = frappe.get_meta(df.options)
                    c_field = "role" if child_meta.has_field("role") else (child_meta.fields[0].fieldname if child_meta.fields else "name")
                    val = [{c_field: v}] if isinstance(v, str) else v
                    setattr(p_doc, k, val)
                else:
                    setattr(p_doc, k, v)
            p_doc.save(ignore_permissions=True)
            results["pos_profile"] = pos_profile_name
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Failed to create POS Profile")

    frappe.db.commit()
    return {"status": "success", "results": results}