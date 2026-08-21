import json
import os
from random import randint

import frappe
from frappe import _, scrub
from frappe.utils import add_days, getdate
from frappe.utils.telemetry import capture
from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry as wo_make_stock_entry



from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
from erpnext.accounts.utils import get_fiscal_year
from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_invoice
from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
from erpnext.stock.doctype.material_request.material_request import make_purchase_order
from erpnext.stock.doctype.material_request.material_request import make_stock_entry
from ury.setup.pos_demo import generate_pos_demo
from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt
from frappe.utils.telemetry import capture

demo_cache = {}

def setup_ury_demo_data(company):
    global demo_cache
    demo_cache.clear()
    capture("demo_data_creation_started", "ury")
    frappe.flags.mute_messages = True
    try:
        frappe.defaults.set_user_default("Company", company)
        frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
        
        process_masters(company)
        
        process_transactions(company)
        
        generate_pos_demo()

        admin = frappe.get_doc("User", "Administrator")
        admin.add_roles("URY Cashier", "URY Captain", "URY Manager")

        frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 0)
        frappe.cache.delete_keys("bootinfo")
        
        if hasattr(frappe.local, "message_log"):
            frappe.local.message_log = []
            
        # Removed status: ok to prevent early page reload
    except Exception as e:
        frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 0)
        frappe.log_error("Failed to create demo data")
        capture("demo_data_creation_failed", "ury", properties={"exception": frappe.get_traceback()})
        raise
    finally:
        frappe.flags.mute_messages = False

    capture("demo_data_creation_completed", "ury")



def ensure_master_records_exist():
    # Avoid N+1 queries by fetching existing records in bulk
    for uom in ["Nos", "Kg", "Box", "Gram", "Piece"]:
        if not frappe.db.exists("UOM", uom):
            try:
                frappe.get_doc({
                    "doctype": "UOM",
                    "uom_name": uom,
                    "must_be_whole_number": 1 if uom in ["Nos", "Piece", "Box"] else 0
                }).insert(ignore_permissions=True)
            except frappe.DuplicateEntryError:
                pass
            
    for pl in ["Standard Buying", "Standard Selling"]:
        if not frappe.db.exists("Price List", pl):
            try:
                frappe.get_doc({
                    "doctype": "Price List",
                    "price_list_name": pl,
                    "enabled": 1,
                    "buying": 1 if "Buying" in pl else 0,
                    "selling": 1 if "Selling" in pl else 0,
                    "currency": frappe.defaults.get_global_default("currency") or "INR"
                }).insert(ignore_permissions=True)
            except frappe.DuplicateEntryError:
                pass
            
    for gender in ["Male", "Female", "Other"]:
        if not frappe.db.exists("Gender", gender):
            try:
                frappe.get_doc({
                    "doctype": "Gender",
                    "gender": gender
                }).insert(ignore_permissions=True)
            except frappe.DuplicateEntryError:
                pass

def process_masters(company):
    ensure_master_records_exist()
    
    for doctype in frappe.get_hooks("ury_demo_master_doctypes"):
        data = read_data_file_using_hooks(doctype)
        if data:
            for item in json.loads(data):
                if item.get("doctype") == "Employee" and not item.get("company"):
                    item["company"] = company
                    
                replace_placeholders(item, company)
                try:
                    doc = frappe.get_doc(item)
                    if doc.doctype == "User":
                        doc.send_welcome_email = 0
                    doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
                    if doc.meta.is_submittable:
                        doc.submit()
                except Exception as e:
                    if type(e).__name__ in (
                        "ItemPriceDuplicateItem",
                        "DuplicateEntryError",
                        "NameError",
                    ) or "DuplicateEntryError" in type(e).__name__:
                        pass
                    else:
                        raise


def add_global_opening_stock(company, start_date):
    items = frappe.get_all("Item", filters={"is_stock_item": 1}, pluck="name")
    warehouses = frappe.get_all("Warehouse", filters={"company": company, "is_group": 0}, pluck="name")

    if not items or not warehouses:
        return

    for warehouse in warehouses:
        se_items = []
        for item in items:
            se_items.append({
                "item_code": item,
                "qty": 1000,
                "basic_rate": 100
            })
            
        se = frappe.get_doc({
            "doctype": "Stock Entry",
            "stock_entry_type": "Material Receipt",
            "company": company,
            "to_warehouse": warehouse,
            "posting_date": start_date,
            "set_posting_time": 1,
            "items": se_items
        })
        se.insert(ignore_permissions=True)
        se.submit()


def process_transactions(company):
    from erpnext.accounts.utils import FiscalYearError

    try:
        start_date = get_fiscal_year(date=getdate())[1]
    except FiscalYearError:
        # User might have setup fiscal year for previous or upcoming years
        active_fiscal_years = frappe.db.get_all("Fiscal Year", filters={"disabled": 0}, as_list=1)
        if active_fiscal_years:
            start_date = frappe.db.get_value("Fiscal Year", active_fiscal_years[0][0], "year_start_date")
        else:
            frappe.throw(_("There are no active Fiscal Years for which Demo Data can be generated."))

    add_global_opening_stock(company, start_date)

    for doctype in frappe.get_hooks("ury_demo_transaction_doctypes"):
        data = read_data_file_using_hooks(doctype)
        if data:
            for item in json.loads(data):
                replace_placeholders(item, company)
                create_transaction(item, company, start_date)
    convert_production_plan_to_work_orders()
    convert_material_requests()
    convert_order_to_invoices()


def create_transaction(doctype, company, start_date):
    document_type = doctype.get("doctype")
    warehouse = get_warehouse(company)
    if document_type == "Purchase Order":
        posting_date = get_random_date(start_date, 1, 25)
    else:
        posting_date = get_random_date(start_date, 31, 350)
    doctype.update(
        {
        "company": company,
        "set_posting_time": 1,
        "transaction_date": posting_date,
        "posting_date": posting_date,
        "reference_date": posting_date,
        "schedule_date": posting_date,
        "delivery_date": posting_date,
        "set_warehouse": warehouse
        }
    )
    if document_type == "Material Request":
        for item in doctype.get("items", []):
            item["warehouse"] = get_warehouse(company)
            if doctype.get("material_request_type") == "Material Transfer":
                w1, w2 = get_two_warehouses(company)
                item["from_warehouse"] = w1
                item["warehouse"] = w2
    if document_type == "Purchase Order":
        for item in doctype.get("items", []):
            if not item.get("rate"):
                item["rate"] = 100
    doc = frappe.get_doc(doctype)
    doc.save(ignore_permissions=True)
    doc.submit()

def convert_order_to_invoices():
    for document in ["Purchase Order", "Sales Order"]:
        # Keep some sales orders intentionally unbilled/unpaid, but process all purchase orders
        kwargs = {"filters": {"docstatus": 1}, "fields": ["name", "transaction_date"]}
        if document == "Sales Order":
            kwargs["limit"] = 8
            
        for i, order in enumerate(frappe.db.get_all(document, **kwargs)):
            if document == "Purchase Order":
                # Skip already processed
                if frappe.db.exists("Purchase Receipt Item", {"purchase_order": order.name}) \
                or frappe.db.exists("Purchase Invoice Item", {"purchase_order": order.name}):
                    continue

                mode = randint(1, 3)

                # CASE 1: Only Purchase Receipt
                if mode == 1:
                    pr = make_purchase_receipt(order.name)
                    pr.set_posting_time = 1
                    pr.posting_date = order.transaction_date
                    pr.insert(ignore_permissions=True)
                    pr.submit()
                    continue

                # CASE 2: Direct Purchase Invoice (no PR)
                elif mode == 2:
                    invoice = make_purchase_invoice(order.name)

                # CASE 3: PR → PI flow
                else:
                    pr = make_purchase_receipt(order.name)
                    pr.set_posting_time = 1
                    pr.posting_date = order.transaction_date
                    pr.insert(ignore_permissions=True)
                    pr.submit()

                    # IMPORTANT: create invoice from PO, not PR
                    invoice = make_purchase_invoice(order.name)
            elif document == "Sales Order":
                invoice = make_sales_invoice(order.name)
                # Ury overrides order_type options for POS
                invoice.order_type = "Dine In"
            
            if not invoice.get("items"):
                continue

            invoice.set_posting_time = 1
            invoice.posting_date = order.transaction_date
            invoice.due_date = order.transaction_date
            invoice.bill_date = order.transaction_date

            if invoice.get("payment_schedule"):
                invoice.payment_schedule[0].due_date = order.transaction_date

            if document == "Sales Order" and i % 3 == 0:
                invoice.update_stock = 1
            else:
                invoice.update_stock = 0
            # Leave some invoices fully billed to allow for Completed status
            if i % 3 != 0:
                for item in invoice.items:
                    item.qty = max(1, int(item.qty * 0.7))
            invoice.submit()
            
            if i % 2 != 0:
                payment = get_payment_entry(invoice.doctype, invoice.name)
                payment.posting_date = order.transaction_date
                payment.reference_no = invoice.name
                payment.reference_date = order.transaction_date

                amount = invoice.outstanding_amount or invoice.grand_total

                if amount <= 0:
                    continue

                for ref in payment.references:
                    ref.allocated_amount = amount

                    # force totals
                payment.paid_amount = amount
                payment.received_amount = amount

                payment.set_amounts()
                payment.insert(ignore_permissions=True)
                payment.submit()


def get_random_date(start_date, start_range, end_range):
    random_date = add_days(start_date, randint(start_range, end_range))
    if getdate(random_date) > getdate():
        return getdate()
    return random_date


def read_data_file_using_hooks(doctype):
    filepath = os.path.join(os.path.dirname(__file__), "demo_data", scrub(doctype) + ".json")
    if not os.path.exists(filepath):
        return None
    with open(filepath) as f:
        return f.read()


def convert_material_requests():
    material_requests = frappe.db.get_all(
        "Material Request",
        filters={"docstatus": 1},
        fields=["name", "material_request_type"]
    )
    for mr in material_requests:
        if mr.material_request_type == "Purchase":
            # Create Purchase Order
            po = make_purchase_order(mr.name)
            if not po.get("items"):
                continue
            po.supplier = get_supplier()
            for item in po.items:
                item.schedule_date = po.transaction_date
                if not item.rate:
                    item.rate = 100
            po.set_missing_values()
            po.calculate_taxes_and_totals()
            po.insert(ignore_permissions=True)
            po.submit()
        elif mr.material_request_type == "Material Transfer":
            # Create Stock Entry
            se = make_stock_entry(mr.name)
            if not se.get("items"):
                continue
            se.insert(ignore_permissions=True)
            se.submit()

def convert_production_plan_to_work_orders():
    production_plans = frappe.db.get_all(
        "Production Plan",
        filters={"docstatus": 1},
        fields=["name", "company"]
    )
    for i, plan in enumerate(production_plans):
        plan_doc = frappe.get_doc("Production Plan", plan.name)
        for idx, item in enumerate(plan_doc.po_items):
            if frappe.db.exists("Work Order", {"production_plan": plan.name, "production_plan_item": item.name}):
                continue
            wo = frappe.new_doc("Work Order")
            wo.production_item = item.item_code
            wo.bom_no = item.bom_no
            wo.qty = item.planned_qty
            wo.company = plan.company
            wo.wip_warehouse = get_warehouse(plan.company)
            wo.fg_warehouse = get_warehouse(plan.company)
            wo.production_plan = plan.name
            wo.production_plan_item = item.name
            wo.planned_start_date = getattr(plan_doc, "posting_date", None) or getattr(plan_doc, "transaction_date", None) or getdate()
            wo.insert(ignore_permissions=True)
            wo.submit()

            if i == 0 and idx == 0:
                se_dict = wo_make_stock_entry(wo.name, "Material Transfer for Manufacture", wo.qty)
                se = frappe.get_doc(se_dict)
                for se_item in se.items:
                    # Provide a source warehouse that guarantees no validation error.
                    se_item.s_warehouse = get_warehouse(plan.company)
                if se.items:
                    se.insert(ignore_permissions=True)
                    se.submit()

def get_two_warehouses(company):
    w1 = get_warehouse(company)
    w2 = get_warehouse(company)
    while w1 == w2:
        w2 = get_warehouse(company)
    return w1, w2


def get_bom_for_item(item_code, company):
    key = f"bom_{item_code}_{company}"
    if key not in demo_cache:
        bom = frappe.db.get_value(
            "BOM",
            {
                "item": item_code,
                "company": company,
                "is_default": 1
            }
        )
        if not bom:
            frappe.throw(f"No default BOM found for Item {item_code}")
        demo_cache[key] = bom
    return demo_cache[key]


def get_cash_account(company):
    key = f"cash_account_{company}"
    if key not in demo_cache:
        demo_cache[key] = frappe.db.get_value(
            "Account",
            {"company": company, "account_type": "Cash", "is_group": 0},
            "name"
        )
    return demo_cache[key]


def get_write_off_account(company):
    key = f"write_off_account_{company}"
    if key not in demo_cache:
        account = frappe.db.get_value(
            "Account",
            {
                "company": company,
                "root_type": "Expense",
                "is_group": 0
            },
            "name"
        )
        if not account:
            frappe.throw("No Expense Account found for Write Off")
        demo_cache[key] = account
    return demo_cache[key]

def get_cost_center(company):
    key = f"cost_center_{company}"
    if key not in demo_cache:
        demo_cache[key] = frappe.db.get_value(
            "Cost Center",
            {"company": company, "is_group": 0},
            "name"
        )
    return demo_cache[key]

def get_receivable_account(company):
    key = f"receivable_account_{company}"
    if key not in demo_cache:
        acc = frappe.db.get_value("Company", company, "default_receivable_account")
        if not acc:
            acc = frappe.db.get_value("Account", {"company": company, "account_type": "Receivable", "is_group": 0}, "name")
        demo_cache[key] = acc
    return demo_cache[key]

def get_payable_account(company):
    key = f"payable_account_{company}"
    if key not in demo_cache:
        acc = frappe.db.get_value("Company", company, "default_payable_account")
        if not acc:
            acc = frappe.db.get_value("Account", {"company": company, "account_type": "Payable", "is_group": 0}, "name")
        demo_cache[key] = acc
    return demo_cache[key]

def get_bank_account(company):
    key = f"bank_account_{company}"
    if key not in demo_cache:
        acc = frappe.db.get_value("Company", company, "default_bank_account")
        if not acc:
            acc = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 0}, "name")
        if not acc:
            parent_bank = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}, "name")
            if parent_bank:
                doc = frappe.get_doc({
                    "doctype": "Account",
                    "account_name": "Demo Bank",
                    "parent_account": parent_bank,
                    "company": company,
                    "account_type": "Bank",
                    "is_group": 0
                })
                doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
                acc = doc.name
            else:
                acc = frappe.db.get_value("Account", {"company": company, "is_group": 0}, "name")
        demo_cache[key] = acc
    return demo_cache[key]


def replace_placeholders(data, company):
    if isinstance(data, dict):
        for key, value in data.items():
            if value == "__CASH_ACCOUNT__":
                data[key] = get_cash_account(company)
            elif value == "__BANK_ACCOUNT__":
                data[key] = get_bank_account(company)
            elif value == "__RECEIVABLE_ACCOUNT__":
                data[key] = get_receivable_account(company)
            elif value == "__PAYABLE_ACCOUNT__":
                data[key] = get_payable_account(company)
            elif value == "__WRITE_OFF_ACCOUNT__":
                data[key] = get_write_off_account(company)
            elif value == "__COST_CENTER__":
                data[key] = get_cost_center(company)
            elif value == "__WAREHOUSE__":
                data[key] = get_warehouse(company)
            elif value == "__COMPANY__":
                data[key] = company
            elif isinstance(value, str) and value.startswith("__BOM_FOR_"):
                item_code = value.replace("__BOM_FOR_", "").replace("__", "")
                data[key] = get_bom_for_item(item_code, company)
            else:
                replace_placeholders(value, company)
    elif isinstance(data, list):
        for item in data:
            replace_placeholders(item, company)


def get_warehouse(company):
    key = f"warehouses_{company}"
    if key not in demo_cache:
        warehouses = frappe.db.get_all("Warehouse", {"company": company, "is_group": 0})
        if not warehouses:
            frappe.throw(_("No warehouses found for the demo company. Please create at least one warehouse."))
        demo_cache[key] = warehouses
    warehouses = demo_cache[key]
    return warehouses[randint(0, len(warehouses) - 1)].name

def get_supplier():
    key = "suppliers"
    if key not in demo_cache:
        demo_cache[key] = frappe.db.get_all("Supplier", pluck="name")
    suppliers = demo_cache[key]
    return suppliers[randint(0, len(suppliers) - 1)]

@frappe.whitelist()
def clear_demo_data():

    frappe.only_for("System Manager")
    
    demo_data_type = frappe.db.get_default("demo_data_type")
    if demo_data_type == "erpnext":
        frappe.db.set_default("demo_data_type", "")
        from erpnext.setup.demo import clear_demo_data as erpnext_clear_demo_data
        return erpnext_clear_demo_data()

    capture("demo_data_erased", "ury")
    frappe.flags.mute_messages = True
    try:
        global_company = frappe.db.get_single_value("Global Defaults", "demo_company")
        demo_companies = frappe.db.get_all("Company", filters={"name": ["like", "%(Demo)%"]}, pluck="name")
        
        if global_company and global_company not in demo_companies:
            demo_companies.append(global_company)
            
        if not demo_companies:
            # Maybe the company is not ending with (Demo) but set in global defaults
            pass
            
        for company in demo_companies:
            try:
                create_transaction_deletion_record(company)
                clear_masters(company)
                delete_company(company)
            except Exception as e:
                frappe.log_error(f"Failed to erase demo data for company {company}")
                
        default_company = frappe.db.get_single_value("Global Defaults", "default_company")
        if default_company in demo_companies:
            frappe.db.set_default("company", "")
        else:
            frappe.db.set_default("company", default_company)
        frappe.db.set_default("demo_data_type", "")
        
        if hasattr(frappe.local, "message_log"):
            frappe.local.message_log = []
            
    except Exception:
        frappe.db.rollback()
        frappe.log_error("Failed to erase demo data")
        frappe.throw(
            _("Failed to erase demo data, please delete the demo company manually."),
            title=_("Could Not Delete Demo Data"),
        )
    finally:
        frappe.flags.mute_messages = False


def create_transaction_deletion_record(company):
    transaction_deletion_record = frappe.new_doc("Transaction Deletion Record")
    transaction_deletion_record.company = company
    transaction_deletion_record.process_in_single_transaction = True
    transaction_deletion_record.save(ignore_permissions=True)
    transaction_deletion_record.submit()
    transaction_deletion_record.start_deletion_tasks()


def clear_masters(company):
    # Explicitly nuke dynamic dependencies to evade LinkExistsError blocks before hitting strictly ordered JSON
    for pos_profile in frappe.get_all("POS Profile", filters={"company": company}, pluck="name"):
        frappe.delete_doc("POS Profile", pos_profile, force=1, ignore_permissions=True)
        
    for price_list in frappe.get_all("Price List", filters={"price_list_name": ["like", "%Demo%"]}, pluck="name"):
        frappe.delete_doc("Price List", price_list, force=1, ignore_permissions=True)

    for doctype in frappe.get_hooks("ury_demo_master_doctypes")[::-1]:
        data = read_data_file_using_hooks(doctype)
        if data:
            for item in json.loads(data):
                clear_demo_record(item, company)


def clear_demo_record(document, company):
    document_type = document.get("doctype")
    del document["doctype"]

    if document_type == "User":
        filters = {"name": document.get("email")}
    else:
        valid_columns = frappe.get_meta(document_type).get_valid_columns()

        filters = {}
        for key, value in document.items():
            if key in valid_columns:
                if isinstance(value, str):
                    if value == "__COMPANY__":
                        filters[key] = company
                    elif value.startswith("__"):
                        # Skip dynamic placeholders in filters to avoid mismatch
                        continue
                    else:
                        filters[key] = value
                else:
                    filters[key] = value

    if not filters:
        return

    # Use frappe.db.get_value to silently check existence instead of getting noisy UI msgprint dumps
    docname = frappe.db.get_value(document_type, filters, "name")
    if docname:
        docstatus = frappe.db.get_value(document_type, docname, "docstatus")
        if docstatus == 1:
            frappe.db.set_value(document_type, docname, "docstatus", 2)
        frappe.delete_doc(document_type, docname, force=1, ignore_permissions=True)


def delete_company(company):
    frappe.db.set_single_value("Global Defaults", "demo_company", "")
    for user_perm in frappe.db.get_all("User Permission", filters={"allow": "Company", "for_value": company}, pluck="name"):
        frappe.delete_doc("User Permission", user_perm, force=1, ignore_permissions=True)
    frappe.delete_doc("Company", company, force=1, ignore_permissions=True)