import frappe
from frappe.utils import now_datetime, add_to_date, today, getdate, nowdate
import random
from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening
from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import consolidate_pos_invoices
from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

def daily_pos_open():
    """Run at 11am everyday"""
    frappe.set_user("Administrator")
    
    pos_profiles = frappe.get_all("POS Profile", filters={"disabled": 0})
    
    for pos_profile_info in pos_profiles:
        try:
            open_pos(pos_profile_info.name)
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: POS Open Failed for {pos_profile_info.name}")
            frappe.db.rollback()

def open_pos(pos_profile_name):
    pos_profile = frappe.get_doc("POS Profile", pos_profile_name)
    
    # Check if already open
    existing_openings = frappe.get_all("POS Opening Entry", filters={
        "pos_profile": pos_profile_name,
        "status": "Open",
        "docstatus": 1
    })
    
    if existing_openings:
        return # Already open

    cashier = None
    
    if pos_profile.custom_enable_multiple_cashier:
        for user_details in pos_profile.applicable_for_users:
            if user_details.custom_main_cashier:
                cashier = user_details.user
                break
        if not cashier:
            return  # No main cashier found
    else:
        # get any user
        if pos_profile.applicable_for_users:
            cashier = pos_profile.applicable_for_users[0].user
        else:
            return # No users configured

    opening = frappe.new_doc("POS Opening Entry")
    opening.pos_profile = pos_profile.name
    opening.company = pos_profile.company
    opening.branch = pos_profile.branch
    opening.period_start_date = now_datetime()
    opening.user = cashier
    
    for pm in pos_profile.payments:
        opening.append("balance_details", {
            "mode_of_payment": pm.mode_of_payment,
            "opening_amount": 0 # Defaulting to 0 since we don't know cash amount
        })
        
    opening.flags.ignore_permissions = True
    opening.insert(ignore_permissions=True)
    opening.submit()


def simulate_pos_invoices():
    """Run every 15 mins during business hours"""
    frappe.set_user("Administrator")
    
    # 1. Take some random orders for open POS
    take_random_orders()
    
    # 2. Auto pay unprinted invoices older than 20 mins
    auto_pay_invoices()


def take_random_orders():
    openings = frappe.get_all(
        "POS Opening Entry",
        filters={"status": "Open", "docstatus": 1},
        fields=["name", "company", "branch", "pos_profile", "user"]
    )

    for opening_info in openings:
        try:
            create_order_for_opening(opening_info)
            frappe.db.commit()
        except Exception as e:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: Order creation failed for {opening_info.name}")
            frappe.db.rollback()

def create_order_for_opening(opening_info):
    pos_profile = frappe.get_doc("POS Profile", opening_info.pos_profile)
    restaurant = frappe.get_doc("URY Restaurant", pos_profile.restaurant)

    items = get_random_menu_items(pos_profile)
    if not items:
        return

    order_type = random.choice(["Dine In", "Take Away", "Delivery", "Phone In"])

    table = None
    room = None

    if order_type == "Dine In":
        free_tables = frappe.get_all(
            "URY Table",
            filters={
                "branch": opening_info.branch,
                "occupied": 0
            },
            fields=["name", "restaurant_room"]
        )
        if free_tables:
            table_info = random.choice(free_tables)
            table = table_info.name
            room = table_info.restaurant_room
        else:
            order_type = "Take Away" # fallback

    customer = get_random_customer()
    if not customer:
        return
        
    mobile_number = frappe.get_value("Customer", customer, "mobile_number")

    invoice = frappe.new_doc("POS Invoice")
    
    # Dynamic naming series handling
    if order_type == "Aggregators" and restaurant.aggregator_series_prefix:
        invoice.naming_series = restaurant.aggregator_series_prefix
    else:
        invoice.naming_series = restaurant.invoice_series_prefix
        
    invoice.update({
        "customer": customer,
        "mobile_number": mobile_number,
        "pos_profile": pos_profile.name,
        "company": opening_info.company,
        "branch": opening_info.branch,
        "restaurant": restaurant.name,
        "order_type": order_type,
        "restaurant_table": table,
        "custom_restaurant_room": room,
        "waiter": opening_info.user,
        "cashier": opening_info.user,
        "owner": opening_info.user,
        "is_pos": 1,
        "invoice_created": 1,
        "update_stock": 1,
        "pos_opening_entry": opening_info.name
    })

    for i in items:
        invoice.append("items", i)

    invoice.append("payments", {
        "mode_of_payment": pos_profile.payments[0].mode_of_payment,
        "amount": 0
    })

    invoice.flags.ignore_permissions = True
    invoice.insert(ignore_permissions=True)
    
    # Fix owner which is overwritten by Administrator during insert
    frappe.db.set_value("POS Invoice", invoice.name, "owner", opening_info.user)


def auto_pay_invoices():
    invoices = frappe.get_all(
        "POS Invoice",
        filters={
            "docstatus": 0,
            "invoice_printed": 0
        },
        fields=["name", "creation", "pos_profile"]
    )
    
    for inv in invoices:
        wait_until = add_to_date(inv.creation, minutes=random.randint(20, 30))

        if now_datetime() < wait_until:
            continue
            
        try:
            invoice = frappe.get_doc("POS Invoice", inv.name)
            
            # Set printed first, since payment can only be done after printing
            invoice.invoice_printed = 1
            invoice.flags.ignore_permissions = True
            invoice.save(ignore_permissions=True)
            
            # Remove zero payments and add full payment
            invoice.set("payments", [])
            pos_profile = frappe.get_doc("POS Profile", invoice.pos_profile)
            if pos_profile.payments:
                payment_row = random.choice(pos_profile.payments)
                invoice.append("payments", {
                    "mode_of_payment": payment_row.mode_of_payment,
                    "amount": invoice.grand_total
                })
                
            invoice.flags.ignore_ury_invoice_validation = True
            invoice.save(ignore_permissions=True)
            invoice.submit()
            frappe.db.commit()
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: Auto Pay failed for {inv.name}")
            frappe.db.rollback()


def daily_pos_close():
    """Run at 11pm everyday"""
    frappe.set_user("Administrator")
    
    # Ignore strict party checks in case random Mode of Payments map to Receivable accounts
    frappe.flags.party_not_required_for_receivable_payable = True
    
    # Fix any invoices created by Administrator instead of cashier
    frappe.db.sql("""
        UPDATE `tabPOS Invoice`
        SET owner = cashier
        WHERE owner = 'Administrator' AND is_pos = 1 AND docstatus < 2 AND cashier is not null
    """)
    
    # 1. Force flush remaining draft invoices
    auto_pay_invoices()

    # 2. Close POS
    openings = frappe.get_all(
        "POS Opening Entry",
        filters={"status": "Open", "docstatus": 1},
        fields=["name"]
    )
    
    closing_entries = []

    for opening_info in openings:
        try:
            opening = frappe.get_doc("POS Opening Entry", opening_info.name)
            closing = make_closing_entry_from_opening(opening)
            closing.flags.ignore_permissions = True
            closing.insert(ignore_permissions=True)
            closing.submit()
            closing_entries.append(closing)
            frappe.db.commit()
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: POS Close failed for {opening_info.name}")
            frappe.db.rollback()
            
    # Consolidation happens automatically inside closing.submit()


def daily_manufacturing_supply_flow():
    """Run at 10:30am everyday"""
    frappe.set_user("Administrator")
    daily_production_plan()
    daily_material_request_and_purchase()

def daily_production_plan():
    company_bom_map = {}
    
    boms = frappe.get_all("BOM", filters={"is_active": 1, "is_default": 1}, fields=["name", "item", "company"])
    
    for bom in boms:
        if bom.company not in company_bom_map:
            company_bom_map[bom.company] = []
        company_bom_map[bom.company].append(bom)

    for company, bom_list in company_bom_map.items():
        try:
            # Check if production plan already exists for today
            existing_pp = frappe.get_all("Production Plan", filters={"posting_date": today(), "company": company})
            if existing_pp:
                continue

            pp = frappe.new_doc("Production Plan")
            pp.company = company
            pp.posting_date = today()
            
            for bom in bom_list:
                pp.append("po_items", {
                    "item_code": bom.item,
                    "bom_no": bom.name,
                    "planned_qty": 1  # 1 quantity by default
                })

            pp.flags.ignore_permissions = True
            pp.insert(ignore_permissions=True)
            
            # Fetch generic warehouse for FG
            # Just take the first active warehouse for the company
            default_warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
            if default_warehouse:
                for row in pp.po_items:
                    row.warehouse = default_warehouse
            
            pp.get_items_for_work_order()
            pp.save()
            
            try:
                pp.make_work_order()
            except Exception:
                frappe.log_error(frappe.get_traceback(), "Demo script: PP make work order failed.")
                
            pp.submit()
            
            work_orders = frappe.get_all("Work Order", filters={"production_plan": pp.name}, pluck="name")
            
            for wo_name in work_orders:
                wo = frappe.get_doc("Work Order", wo_name)
                wo.skip_transfer = 1
                wo.flags.ignore_permissions = True
                wo.submit()
                
                from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
                ste = make_stock_entry(wo.name, "Manufacture")
                ste.flags.ignore_permissions = True
                ste.insert(ignore_permissions=True)
                ste.submit()
                
            frappe.db.commit()
            
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: Production plan failed for {company}")
            frappe.db.rollback()


def daily_material_request_and_purchase():
    # Only pick production plans posted today
    pps = frappe.get_all("Production Plan", filters={"docstatus": 1, "posting_date": today()}, pluck="name")
    
    for pp_name in pps:
        try:
            pp = frappe.get_doc("Production Plan", pp_name)
            if not pp.mr_items:
                pp.make_material_request()
                pp.reload()
            frappe.db.commit()
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: Material Request creation failed for {pp_name}")
            frappe.db.rollback()

    # Process all pending Material Requests
    material_requests = frappe.get_all("Material Request", filters={"material_request_type": "Purchase", "docstatus": 1, "per_ordered": ["<", 100]}, pluck="name")

    supplier = get_random_supplier()
    if not supplier:
        return

    for mr_name in material_requests:
        try:
            from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_order
            po = make_purchase_order(mr_name)
            po.supplier = supplier
            
            # Need schedule date
            schedule_date = today()
            for item in po.items:
                item.schedule_date = schedule_date

            po.flags.ignore_permissions = True
            po.insert(ignore_permissions=True)
            po.submit()
            
            pr = frappe.new_doc("Purchase Receipt")
            pr.supplier = po.supplier
            pr.company = po.company
            pr.posting_date = today()

            for item in po.items:
                pr.append("items", {
                    "item_code": item.item_code,
                    "qty": item.qty,
                    "warehouse": item.warehouse,
                    "purchase_order": po.name,
                    "purchase_order_item": item.name
                })
            
            pr.flags.ignore_permissions = True
            pr.insert(ignore_permissions=True)
            pr.submit()

            pi = make_purchase_invoice(pr.name)
            pi.flags.ignore_permissions = True
            pi.insert(ignore_permissions=True)
            pi.submit()

            frappe.db.commit()
        except Exception:
            frappe.log_error(frappe.get_traceback(), f"Demo Script: Purchasing flow failed for {mr_name}")
            frappe.db.rollback()


# --- Utilities ---

def get_random_menu_items(pos_profile):
    branch = pos_profile.branch
    restaurant = frappe.db.get_value("URY Restaurant", {"branch": branch}, "name")
    if not restaurant:
        return []

    menu = frappe.db.get_value("URY Restaurant", restaurant, "active_menu")
    if not menu:
        return []

    menu_items = frappe.get_all("URY Menu Item", filters={"parent": menu, "disabled": 0}, fields=["item", "rate"])
    if not menu_items:
        return []

    max_items = min(len(menu_items), 5)
    min_items = min(1, max_items)
    
    if max_items == 0:
        return []

    selected = random.sample(menu_items, random.randint(min_items, max_items))

    return [{"item_code": s.item, "qty": random.randint(1, 3), "rate": s.rate} for s in selected]

def get_random_customer():
    customers = frappe.get_all("Customer", filters={"disabled": 0}, pluck="name")
    return random.choice(customers) if customers else None

def get_random_supplier():
    suppliers = frappe.get_all("Supplier", filters={"disabled": 0}, pluck="name")
    return random.choice(suppliers) if suppliers else None
