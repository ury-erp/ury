from random import choice, randint
import frappe
from frappe.utils import nowdate, get_datetime
from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening

def generate_pos_demo():
    company = frappe.db.get_single_value("Global Defaults", "demo_company")
    
    user = frappe.session.user if frappe.session.user else "Administrator"
    
    # Check for existing generated data (Idempotency)
    existing_openings = frappe.get_all("POS Opening Entry", filters={"company": company, "status": "Open"}, pluck="name")
    if existing_openings:
        return
        
    opening1 = create_pos_opening(company)
    create_pos_invoices(company, opening1, count=5)
    create_pos_closing(company, opening1)

    opening2 = create_pos_opening(company)
    create_pos_invoices(company, opening2, count=5)

def get_pos_profile(company):
    profiles = frappe.get_all(
        "POS Profile", filters={"company": company}, pluck="name"
    )
    return choice(profiles)

def get_pos_warehouse(pos_profile):
    return frappe.db.get_value("POS Profile", pos_profile, "warehouse")

def get_cashier_user():
    return "cashier@ury.com"

def get_customer():
    customers = frappe.get_all("Customer", pluck="name")
    return choice(customers)

def get_items():
    return frappe.get_all(
        "Item",
        filters={"is_stock_item": 1},
        fields=["name", "stock_uom"]
    )

def create_pos_opening(company):
    pos_profile = get_pos_profile(company)
    profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
    cashier = get_cashier_user() 
    opening = frappe.get_doc({
        "doctype": "POS Opening Entry",
        "company": company,
        "pos_profile": pos_profile,
        "restaurant": profile_doc.restaurant,
        "branch": getattr(profile_doc, "branch", None),
        "user": cashier,
        "period_start_date": nowdate(),
        "posting_date": nowdate(),
        "balance_details": [
            {
                "mode_of_payment": "Cash",
                "opening_amount": 1000
            }
        ]
    })
    opening.insert(ignore_permissions=True)
    opening.submit()
    return opening

def create_pos_invoices(company, opening, count=5):

    items = get_items()
    pos_profile = opening.pos_profile
    warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
    for i in range(count):

        item = choice(items)

        invoice = frappe.get_doc({
            "doctype": "POS Invoice",
            "company": company,
            "owner": opening.user,
            "customer": get_customer(),
            "pos_profile": pos_profile,
            "is_pos": 1,
            "posting_date": nowdate(),
            "items": [
                {
                    "item_code": item.name,
                    "qty": randint(1, 5),
                    "warehouse": warehouse,
                    "rate": randint(50, 200)
                }
            ]
        })

        
        invoice.append("payments", {
            "mode_of_payment": "Cash",
            "amount": 1
        })
        invoice.insert(ignore_permissions=True)
        
        invoice.payments[0].amount = invoice.grand_total
        invoice.paid_amount = invoice.grand_total
        invoice.creation = get_datetime(invoice.creation)
        invoice.submit()
        
        # Frappe insert() forces owner = session.user and save/submit writes it. Unconditionally override it AFTER.
        frappe.db.set_value("POS Invoice", invoice.name, "owner", opening.user, update_modified=False)

def create_pos_closing(company, opening):
    closing = make_closing_entry_from_opening(opening)
    closing.posting_date = nowdate()
    closing.insert(ignore_permissions=True)
    closing.submit()
    return closing