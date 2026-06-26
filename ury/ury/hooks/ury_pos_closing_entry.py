import frappe

def before_save(doc, method):
    sub_pos_close_check(doc, method)

def validate(doc, method):
    calculate_closing_amount(doc, method)
    validate_cashier(doc, method)


def sub_pos_close_check(doc, method):
    cashier = None
    multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
    if multiple_cashier:
        # Use lightweight query instead of full get_doc
        sub_cashier = frappe.db.get_value(
            "POS Profile User",
            {"parent": doc.pos_profile, "custom_main_cashier": 0},
            "user",
        )
        cashier = sub_cashier

        if frappe.session.user != cashier:
            branch = frappe.db.get_value("POS Profile", doc.pos_profile, "branch")
            has_open = frappe.db.exists(
                "POS Opening Entry",
                {"branch": branch, "user": cashier, "status": "Open", "docstatus": 1},
            )
            if has_open:
                frappe.throw("Sub Cashier POS must be closed", title="Sub Cashier POS Closing Required")
    else:
        pass

def calculate_closing_amount(doc, method):
    multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
    if multiple_cashier:
        sub_pos_closing = frappe.get_all(
            "Sub POS Closing",
            filters=[
                ["posting_date", "<=", doc.posting_date],
                ["period_start_date", ">=", doc.period_start_date],
                ["docstatus", "=", 1]
            ],
            fields=["name"]
        )
        if sub_pos_closing:
            parent = sub_pos_closing[0].name
            modes = [d.mode_of_payment for d in doc.payment_reconciliation]
            # Batch-fetch all sub-closing amounts in one query
            if modes:
                sub_amounts = {
                    r[0]: r[1]
                    for r in frappe.db.get_values(
                        "Sub POS Closing Payment",
                        {"parent": parent, "mode_of_payment": ("in", modes)},
                        ["mode_of_payment", "closing_amount"],
                    )
                }
            else:
                sub_amounts = {}

            for closing_details in doc.payment_reconciliation:
                sub_closing_amount = sub_amounts.get(closing_details.mode_of_payment, 0) or 0
                main_closing_amount = closing_details.custom_closing_amount or 0
                total_closing_amount = sub_closing_amount + main_closing_amount
                closing_details.closing_amount = total_closing_amount
                closing_details.difference = total_closing_amount - closing_details.expected_amount
        else:
            frappe.throw("No Sub POS Closing entries found between the given dates")
    else:
        pass

def validate_cashier(doc, method):
    cashier = None
    multiple_cashier = frappe.db.get_value("POS Profile", doc.pos_profile, "custom_enable_multiple_cashier")
    if multiple_cashier:
        # Use lightweight query instead of full get_doc
        sub_cashier = frappe.db.get_value(
            "POS Profile User",
            {"parent": doc.pos_profile, "custom_main_cashier": 0},
            "user",
        )
        cashier = sub_cashier

        if frappe.session.user == cashier:
            frappe.throw("Sub Cashiers are not allowed to make POS Closing Entries.")
    else:
        pass