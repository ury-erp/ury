"""Idempotent dev-seed data for POS Profile and URY Self Ordering Profile.

Populates the demo restaurant ("My Restaurant" branch/company) with a complete
POS Profile (payment modes, warehouse, price list, and the custom_* fields the
frontend PosProfilePage reads) and a URY Self Ordering Profile, so
`frontend/src/pages/Dashboard/PosProfilePage.tsx` and
`SelfOrderingProfilePage.tsx` render non-empty state on a fresh bench.

Field/doctype conventions here are taken from the existing setup-wizard flow
in `ury/ury/api/minimal/business_setup.py` (which creates the demo POS Profile
during "Just show me a demo"), the custom fields declared in
`ury/fixtures/custom_field.json`, and the fields read by the two frontend
pages themselves. Safe to call repeatedly: every write is gated on
`frappe.db.exists` (for new docs) or a "is this field already set" check (for
patching an existing profile).
"""

import frappe


def seed():
    """Entry point: seed/patch the demo POS Profile and Self Ordering Profile."""
    company_name = _get_demo_company()
    if not company_name:
        frappe.logger("dev_seed").warning("dev_seed.profiles: no Company found, skipping")
        return

    branch_name = _get_demo_branch(company_name)
    restaurant_name = _get_demo_restaurant(branch_name)

    pos_profile_name = _seed_pos_profile(company_name, branch_name, restaurant_name)
    _seed_self_ordering_profile(pos_profile_name, branch_name, restaurant_name)


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def _get_demo_company():
    if frappe.db.exists("Company", "My Restaurant"):
        return "My Restaurant"
    company = frappe.get_all("Company", limit=1, pluck="name")
    return company[0] if company else None


def _get_demo_branch(company_name):
    # Branch is a standalone doctype in this app (see ury/ury/api/minimal/business_setup.py
    # get_branches) -- it is not filtered by company at the schema level, so prefer a branch
    # whose name matches the company, otherwise take the first branch that exists.
    if frappe.db.exists("Branch", company_name):
        return company_name
    branch = frappe.get_all("Branch", limit=1, pluck="name")
    if branch:
        return branch[0]
    # No branch at all: create one named after the company (mirrors setup wizard behaviour).
    branch_doc = frappe.get_doc({"doctype": "Branch", "branch": company_name})
    branch_doc.insert(ignore_permissions=True)
    return branch_doc.name


def _get_demo_restaurant(branch_name):
    # business_setup.py names the restaurant "<branch> Restaurant"; fall back to any
    # URY Restaurant linked to this branch, then to any URY Restaurant at all.
    conventional_name = f"{branch_name} Restaurant"
    if frappe.db.exists("URY Restaurant", conventional_name):
        return conventional_name

    linked = frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")
    if linked:
        return linked

    any_restaurant = frappe.get_all("URY Restaurant", limit=1, pluck="name")
    if any_restaurant:
        return any_restaurant[0]

    restaurant_doc = frappe.get_doc(
        {
            "doctype": "URY Restaurant",
            "name": conventional_name,
            "company": frappe.db.get_value("Branch", branch_name, "company") or branch_name,
            "branch": branch_name,
        }
    )
    restaurant_doc.insert(ignore_permissions=True)
    return restaurant_doc.name


def _ensure_mode_of_payment(name):
    if not frappe.db.exists("Mode of Payment", name):
        frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": name, "type": "General"}).insert(
            ignore_permissions=True
        )
    return name


def _ensure_warehouse(company_name):
    abbr = frappe.db.get_value("Company", company_name, "abbr")
    warehouse_name = f"Finished Goods - {abbr}" if abbr else None
    if warehouse_name and frappe.db.exists("Warehouse", warehouse_name):
        return warehouse_name

    existing = frappe.db.get_value("Warehouse", {"company": company_name, "is_group": 0}, "name")
    if existing:
        return existing

    warehouse_doc = frappe.get_doc(
        {"doctype": "Warehouse", "warehouse_name": "Finished Goods", "company": company_name, "is_group": 0}
    )
    warehouse_doc.insert(ignore_permissions=True)
    return warehouse_doc.name


def _ensure_price_list():
    price_list = frappe.db.get_value("Price List", {"selling": 1}, "name")
    return price_list or "Standard Selling"


# ---------------------------------------------------------------------------
# POS Profile
# ---------------------------------------------------------------------------

def _seed_pos_profile(company_name, branch_name, restaurant_name):
    company_doc = frappe.get_doc("Company", company_name)

    income_account = company_doc.default_income_account or frappe.db.get_value(
        "Account", {"company": company_name, "account_type": "Income Account", "is_group": 0}, "name"
    )
    expense_account = company_doc.default_expense_account or frappe.db.get_value(
        "Account", {"company": company_name, "account_type": "Cost of Goods Sold", "is_group": 0}, "name"
    )
    cost_center = getattr(company_doc, "cost_center", None) or frappe.db.get_value(
        "Cost Center", {"company": company_name, "is_group": 0}, "name"
    )
    write_off_account = getattr(company_doc, "write_off_account", None) or expense_account
    write_off_cost_center = cost_center

    warehouse_name = _ensure_warehouse(company_name)
    selling_price_list = _ensure_price_list()

    cash_mode = _ensure_mode_of_payment("Cash")
    card_mode = _ensure_mode_of_payment("Card")
    upi_mode = _ensure_mode_of_payment("UPI")

    customer = frappe.db.get_value("Customer", {}, "name")

    # Cashiers to attach as applicable_for_users -- mirrors business_setup.py's convention
    # of collecting every URY Cashier user.
    cashier_users = frappe.get_all(
        "Has Role", filters={"role": "URY Cashier", "parenttype": "User"}, fields=["parent"]
    )
    cashier_emails = sorted({u.parent for u in cashier_users if u.parent not in ("Administrator", "Guest")})

    pos_profile_name = branch_name

    checklist_items = [
        {"item_label": "Cash Drawer Counted", "applies_to": "Opening", "is_mandatory": 1},
        {"item_label": "POS Terminal Powered On", "applies_to": "Opening", "is_mandatory": 1},
        {"item_label": "Closing Cash Reconciled", "applies_to": "Closing", "is_mandatory": 1},
        {"item_label": "Shift Handover Notes Logged", "applies_to": "Both", "is_mandatory": 0},
    ]

    fields = {
        "company": company_name,
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
        "print_format": frappe.db.get_value("Print Format", {"doc_type": "POS Invoice"}, "name"),
        "branch": branch_name,
        "restaurant": restaurant_name,
        "paid_limit": 50000,
        "table_attention_time": 30,
        "role_allowed_for_billing": "URY Cashier",
        "transfer_role_permissions": "URY Manager",
        "custom_kot_naming_series": "KOT-URY-",
        "custom_enable_discount": 1,
        "custom_multiple_cashier_configuration": 0,
        "custom_enable_kot_reprint": 1,
        "custom_daily_pos_close": 1,
        "custom_edit_order_type": 1,
        "custom_reset_order_number_daily": 1,
        "disabled": 0,
    }

    meta = frappe.get_meta("POS Profile")
    fields = {k: v for k, v in fields.items() if meta.has_field(k) and v not in (None, "")}

    if not frappe.db.exists("POS Profile", pos_profile_name):
        doc_dict = {"doctype": "POS Profile", "name": pos_profile_name, **fields}
        doc_dict["payments"] = [
            {"mode_of_payment": cash_mode, "default": 1},
            {"mode_of_payment": card_mode, "default": 0},
            {"mode_of_payment": upi_mode, "default": 0},
        ]
        if meta.has_field("applicable_for_users") and cashier_emails:
            doc_dict["applicable_for_users"] = [
                {"user": email, "default": 1 if i == 0 else 0} for i, email in enumerate(cashier_emails)
            ]
        if meta.has_field("custom_checklist_items"):
            doc_dict["custom_checklist_items"] = checklist_items

        pos_doc = frappe.get_doc(doc_dict)
        pos_doc.insert(ignore_permissions=True)
        return pos_doc.name

    # Existing profile (e.g. created by the setup wizard's "Just show me a demo" flow):
    # patch in anything missing rather than duplicating.
    pos_doc = frappe.get_doc("POS Profile", pos_profile_name)
    dirty = False

    for fieldname, value in fields.items():
        if not pos_doc.get(fieldname):
            pos_doc.set(fieldname, value)
            dirty = True

    if not pos_doc.get("payments"):
        pos_doc.set(
            "payments",
            [
                {"mode_of_payment": cash_mode, "default": 1},
                {"mode_of_payment": card_mode, "default": 0},
                {"mode_of_payment": upi_mode, "default": 0},
            ],
        )
        dirty = True

    if meta.has_field("applicable_for_users") and not pos_doc.get("applicable_for_users") and cashier_emails:
        pos_doc.set(
            "applicable_for_users",
            [{"user": email, "default": 1 if i == 0 else 0} for i, email in enumerate(cashier_emails)],
        )
        dirty = True

    if meta.has_field("custom_checklist_items") and not pos_doc.get("custom_checklist_items"):
        pos_doc.set("custom_checklist_items", checklist_items)
        dirty = True

    if dirty:
        pos_doc.save(ignore_permissions=True)

    return pos_doc.name


# ---------------------------------------------------------------------------
# Self Ordering Profile
# ---------------------------------------------------------------------------

def _seed_self_ordering_profile(pos_profile_name, branch_name, restaurant_name):
    profile_name = f"{branch_name} Self Ordering"

    if frappe.db.exists("URY Self Ordering Profile", profile_name):
        return profile_name

    default_customer = frappe.db.get_value("Customer", {}, "name")

    doc = frappe.get_doc(
        {
            "doctype": "URY Self Ordering Profile",
            "name": profile_name,
            "profile_name": profile_name,
            "restaurant": restaurant_name,
            "branch": branch_name,
            "pos_profile": pos_profile_name,
            "default_customer": default_customer,
            "enabled": 1,
            "enable_qr_table_ordering": 1,
            "enable_qr_pickup_ordering": 1,
            "enable_kiosk_ordering": 0,
            "allow_add_to_running_table": 1,
            "enable_product_detail_page": 1,
            "show_item_images": 1,
            "show_item_descriptions": 1,
            "enable_item_notes": 1,
            "enable_request_bill": 1,
            "enable_customer_payment": 0,
            "enable_payment_link": 0,
            "enable_pay_at_counter": 1,
            "session_idle_timeout_minutes": 30,
        }
    )
    doc.insert(ignore_permissions=True)
    return doc.name
