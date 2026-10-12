"""Server-owned POS billing adjustments and a scoped payment quote."""

import frappe
from frappe import _
from frappe.utils import cint, flt

from ury.ury.doctype.staff_discount_policy.staff_discount_policy import get_applicable_policy


def _restore_policy_rates(invoice):
    """Remove our previous line discounts before resolving the current policy."""
    for item in invoice.get("items") or []:
        previous = flt(item.get("custom_staff_policy_discount"))
        if previous and flt(item.qty):
            item.rate = flt(item.get("custom_staff_policy_base_rate")) or flt(item.rate) + previous / flt(item.qty)
            item.discount_percentage = flt(item.get("custom_staff_policy_base_discount_percentage"))
            item.custom_staff_policy_discount = 0
            item.custom_staff_policy_base_rate = 0
            item.custom_staff_policy_base_discount_percentage = 0
    invoice.staff_discount_policy = None
    invoice.custom_staff_discount_amount = 0


def _remove_service_charge(invoice):
    invoice.set(
        "taxes",
        [row for row in (invoice.get("taxes") or []) if not row.get("custom_is_service_charge")],
    )
    invoice.custom_service_charge_amount = 0


def _eligible_lines(invoice, policy):
    allowed = {row.item_group for row in (policy.get("eligible_item_groups") or [])}
    lines = []
    for item in invoice.get("items") or []:
        if not item.item_code or item.get("is_disposable") or flt(item.qty) <= 0 or flt(item.rate) <= 0:
            continue
        group = frappe.get_cached_value("Item", item.item_code, "item_group")
        if not allowed or group in allowed:
            lines.append(item)
    return lines


def _resolve_policy(invoice):
    from ury.ury.hooks.ury_pos_invoice import _employee_for_user

    employee = _employee_for_user(invoice.get("cashier"))
    groups = {
        frappe.get_cached_value("Item", item.item_code, "item_group")
        for item in (invoice.get("items") or [])
        if item.item_code and not item.get("is_disposable")
    }
    groups.discard(None)
    policy = get_applicable_policy(
        customer=invoice.get("customer"),
        employee=employee,
        branch=invoice.get("branch"),
        item_group=list(groups) if groups else [""],
    )
    return policy, employee


def _policy_allowance(invoice, policy, employee, lock=False):
    from ury.ury.hooks.ury_pos_invoice import _period_to_date_discount

    if lock:
        # Serialise settlements sharing this policy; the period sum then sees
        # every earlier committed invoice before this transaction submits.
        frappe.db.sql(
            "SELECT name FROM `tabStaff Discount Policy` WHERE name = %s FOR UPDATE",
            policy["name"],
        )

    allowed = float("inf")
    transaction_cap = flt(policy.get("per_transaction_cap"))
    if transaction_cap:
        allowed = min(allowed, transaction_cap)

    period_remaining = None
    period_cap = flt(policy.get("period_cap"))
    if period_cap and policy.get("period") not in (None, "None"):
        customer_group = None
        matching_employee = None
        if policy.get("applies_to") == "Customer Group":
            customer_group = frappe.db.get_value("Customer", invoice.customer, "customer_group")
        else:
            matching_employee = employee
        used = _period_to_date_discount(
            policy["name"], invoice.name,
            customer_group=customer_group,
            employee=matching_employee,
            period=policy.get("period"),
        )
        period_remaining = max(0, period_cap - used)
        allowed = min(allowed, period_remaining)
    return allowed, period_remaining


def _apply_staff_policy(invoice, lock=False):
    _restore_policy_rates(invoice)
    if flt(invoice.get("additional_discount_percentage")) or flt(invoice.get("discount_amount")):
        return {"reason": "manual_discount"}

    policy, employee = _resolve_policy(invoice)
    if not policy:
        return {"reason": "no_applicable_policy"}
    lines = _eligible_lines(invoice, policy)
    if not lines:
        return {"reason": "no_eligible_items"}
    eligible_total = sum(flt(item.rate) * flt(item.qty) for item in lines)
    if policy.get("discount_type") == "Percentage":
        percentage = flt(policy.get("discount_percentage"))
        if percentage <= 0 or percentage > 100:
            frappe.throw(_("Staff Discount Policy percentage must be between 0 and 100."))
        requested = eligible_total * percentage / 100
    else:
        requested = flt(policy.get("discount_amount"))
    allowance, remaining = _policy_allowance(invoice, policy, employee, lock=lock)
    target = min(max(0, requested), eligible_total, allowance)
    if target <= 0:
        return {"reason": "period_limit_reached", "remaining_limit": remaining}

    applied = 0
    for index, item in enumerate(lines):
        amount = flt(item.rate) * flt(item.qty)
        share = target - applied if index == len(lines) - 1 else target * amount / eligible_total
        precision = item.precision("rate")
        new_rate = max(0, flt(flt(item.rate) - share / flt(item.qty), precision))
        actual = flt((flt(item.rate) - new_rate) * flt(item.qty), 2)
        item.custom_staff_policy_base_rate = flt(item.rate)
        item.custom_staff_policy_base_discount_percentage = flt(item.get("discount_percentage"))
        item.rate = new_rate
        if not new_rate:
            item.discount_percentage = 100
        elif item.get("pricing_rules") and flt(item.get("discount_percentage")):
            reference_rate = flt(item.get("rate_with_margin")) or flt(item.get("price_list_rate"))
            if reference_rate:
                item.discount_percentage = flt(
                    100 * (reference_rate - new_rate) / reference_rate,
                    item.precision("discount_percentage"),
                )
        item.custom_staff_policy_discount = actual
        applied += actual

    if applied <= 0:
        return {"reason": "rounding_zero"}
    invoice.staff_discount_policy = policy["name"]
    invoice.custom_staff_discount_amount = flt(applied, 2)
    return {
        "name": policy["name"],
        "policy_name": policy.get("policy_name"),
        "discount_type": policy.get("discount_type"),
        "value": flt(policy.get("discount_percentage") if policy.get("discount_type") == "Percentage" else policy.get("discount_amount")),
        "amount": flt(applied, 2),
        "remaining_limit": None if remaining is None else max(0, flt(remaining - applied, 2)),
    }


def _service_charge(invoice, profile):
    if not cint(profile.get("custom_enable_service_charge")):
        return 0
    if invoice.get("order_type") != "Dine In" or profile.get("custom_service_charge_order_types") != "Dine In":
        return 0
    percentage = flt(profile.get("custom_service_charge_percentage"))
    if percentage <= 0 or percentage > 100:
        frappe.throw(_("Set a service charge percentage between 0 and 100 in POS Profile."))
    account = profile.get("custom_service_charge_payable_account")
    if not account:
        frappe.throw(_("Set a Waiter Service Payable Account in POS Profile."))
    account_info = frappe.db.get_value("Account", account, ["company", "root_type", "is_group"], as_dict=True)
    if not account_info or account_info.company != invoice.company or account_info.root_type != "Liability" or account_info.is_group:
        frappe.throw(_("The waiter service account must be a liability ledger in the invoice company."))

    employee = invoice.get("custom_waiter_employee")
    employee_info = frappe.db.get_value("Employee", employee, ["status", "branch"], as_dict=True) if employee else None
    if not employee_info or employee_info.status != "Active" or employee_info.branch != invoice.get("branch"):
        frappe.throw(_("Assign an active waiter employee in this branch before charging waiter service."))

    # The first calculation applies any native manual invoice discount and tax.
    # The charge is based on the resulting pre-tax net total; appended last as
    # an Actual charge so no tax row can tax this charge.
    base = max(0, flt(invoice.net_total))
    amount = flt(base * percentage / 100, invoice.precision("grand_total"))
    if amount:
        invoice.append("taxes", {
            "charge_type": "Actual",
            "account_head": account,
            "description": _("Waiter Service {0}%").format(percentage),
            "tax_amount": amount,
            "cost_center": profile.get("cost_center"),
            "custom_is_service_charge": 1,
        })
        invoice.custom_service_charge_amount = amount
    return amount


def prepare_invoice_billing(invoice, lock=False):
    """Recompute all URY adjustments from invoice and POS Profile documents."""
    profile = frappe.get_cached_doc("POS Profile", invoice.pos_profile)
    if profile.company != invoice.company or profile.get("branch") != invoice.get("branch"):
        frappe.throw(_("POS Profile does not match the invoice company and branch."))
    manual_percentage = flt(invoice.get("additional_discount_percentage"))
    if manual_percentage or flt(invoice.get("discount_amount")):
        if not manual_percentage:
            frappe.throw(_("Manual amount discounts must use the authorised POS discount flow."), frappe.PermissionError)
        from ury.ury.doctype.ury_order.ury_order import _validate_additional_discount

        _validate_additional_discount(manual_percentage, invoice.pos_profile)
        invoice.apply_discount_on = "Net Total"
    _remove_service_charge(invoice)
    policy = _apply_staff_policy(invoice, lock=lock)
    invoice.calculate_taxes_and_totals()
    if policy.get("name"):
        actual_discount = 0
        for item in invoice.get("items") or []:
            if flt(item.get("custom_staff_policy_base_rate")):
                actual = flt(
                    (flt(item.custom_staff_policy_base_rate) - flt(item.rate)) * flt(item.qty),
                    2,
                )
                if actual < 0:
                    frappe.throw(_("Staff discount changed the item rate unexpectedly."))
                item.custom_staff_policy_discount = actual
                actual_discount += actual
        actual_discount = flt(actual_discount, 2)
        if actual_discount > flt(policy["amount"]) + 0.005:
            frappe.throw(_("Staff discount exceeds its authorised limit after invoice recalculation."))
        invoice.custom_staff_discount_amount = policy["amount"] = actual_discount
    charge = _service_charge(invoice, profile)
    if charge:
        invoice.calculate_taxes_and_totals()
    return {"policy": policy, "service_charge": charge, "service_charge_percentage": flt(profile.get("custom_service_charge_percentage")) if charge else 0}


@frappe.whitelist()
def get_invoice_billing_quote(invoice, manual_discount_percentage=None):
    """Preview the exact server-calculated amount for one accessible draft."""
    if not invoice:
        frappe.throw(_("Invoice is required."))
    from ury.ury.doctype.ury_order.ury_order import get_order_invoice

    identity = frappe.db.get_value("POS Invoice", invoice, ["order_type", "restaurant_table"], as_dict=True)
    if not identity:
        frappe.throw(_("Invoice not found."))
    doc = get_order_invoice(table=identity.restaurant_table, invoiceNo=invoice, order_type=identity.order_type, is_payment="Payments")
    if doc.name != invoice or cint(doc.docstatus):
        frappe.throw(_("Only an accessible draft invoice can be quoted."), frappe.PermissionError)
    from ury.ury.doctype.ury_order.ury_order import _validate_additional_discount

    manual = _validate_additional_discount(manual_discount_percentage, doc.pos_profile)
    doc.additional_discount_percentage = manual
    if manual:
        doc.apply_discount_on = "Net Total"
    else:
        doc.discount_amount = 0
    result = prepare_invoice_billing(doc)
    quote = {
        **result,
        "subtotal": flt(doc.net_total) + flt(doc.get("custom_staff_discount_amount")) + flt(doc.discount_amount),
        "manual_discount_amount": flt(doc.discount_amount),
        "tax_amount": flt(doc.total_taxes_and_charges) - flt(doc.get("custom_service_charge_amount")),
        "grand_total": flt(doc.grand_total),
        "rounded_total": flt(doc.rounded_total) or flt(doc.grand_total),
        "currency": doc.currency,
    }
    if doc.get("custom_merged_pos_invoice"):
        merged_name = doc.custom_merged_pos_invoice
        merged_identity = frappe.db.get_value(
            "POS Invoice", merged_name, ["order_type", "restaurant_table"], as_dict=True,
        )
        if not merged_identity:
            frappe.throw(_("Merged invoice not found."))
        merged = get_order_invoice(
            table=merged_identity.restaurant_table, invoiceNo=merged_name,
            order_type=merged_identity.order_type, is_payment="Payments",
        )
        if merged.name != merged_name or cint(merged.docstatus) or merged.branch != doc.branch:
            frappe.throw(_("Merged invoice is not an accessible draft in this branch."), frappe.PermissionError)
        merged_result = prepare_invoice_billing(merged)
        quote["subtotal"] += flt(merged.net_total) + flt(merged.get("custom_staff_discount_amount")) + flt(merged.discount_amount)
        quote["manual_discount_amount"] += flt(merged.discount_amount)
        quote["tax_amount"] += flt(merged.total_taxes_and_charges) - flt(merged.get("custom_service_charge_amount"))
        quote["service_charge"] += merged_result["service_charge"]
        quote["grand_total"] += flt(merged.grand_total)
        quote["rounded_total"] += flt(merged.rounded_total) or flt(merged.grand_total)
        quote["merged_policy"] = merged_result["policy"]
    return quote
