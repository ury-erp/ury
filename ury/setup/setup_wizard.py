# Copyright (c) 2024
# License: GNU General Public License v3

import frappe
from frappe import _
from ury.setup.demo import setup_ury_demo_data
from ury.setup.demo import setup_ury_demo_data
from erpnext.setup.setup_wizard.operations.install_fixtures import create_bank_account


@frappe.whitelist()
def setup_ury_or_erpnext_demo(args):
    setup_ury_demo = args.get("setup_ury_demo")

    if setup_ury_demo:
        company = create_demo_company()

        # 🔥 VERY IMPORTANT: switch defaults
        frappe.defaults.set_user_default("Company", company)
        frappe.db.set_default("company", company)
        frappe.db.set_default("demo_data_type", "ury")

        # Removed early setup_complete to avoid breaking Frappe's setup router
        from ury.setup.demo import setup_ury_demo_data
        setup_ury_demo_data(company)

        return



def create_demo_company():
    """
    Creates demo company using ERPNext's official logic.
    DO NOT customize unless ERPNext changes upstream.
    """

    # Use first real company as template
    company = frappe.db.get_all("Company")[0].name
    company_doc = frappe.get_doc("Company", company)

    # Create demo company
    demo_company = frappe.new_doc("Company")
    demo_company.company_name = f"{company_doc.company_name} (Demo)"
    demo_company.abbr = f"{company_doc.abbr}D"
    demo_company.enable_perpetual_inventory = 1
    demo_company.default_currency = company_doc.default_currency
    demo_company.country = company_doc.country
    demo_company.chart_of_accounts_based_on = "Standard Template"
    demo_company.chart_of_accounts = company_doc.chart_of_accounts
    demo_company.insert(ignore_permissions=True)

    # Set demo company defaults
    frappe.db.set_single_value(
        "Global Defaults",
        "demo_company",
        demo_company.name,
    )
    frappe.db.set_default("company", demo_company.name)

    # Create default bank account (ERPNext internal API)
    bank_account = create_bank_account(
        {"company_name": demo_company.name},
        demo=True,
    )

    frappe.db.set_value(
        "Company",
        demo_company.name,
        "default_bank_account",
        bank_account.name,
    )

    frappe.db.commit()

    return demo_company.name