# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Customer loyalty, on ERPNext's own ledger.
#
# This module deliberately builds almost nothing. ERPNext already ships a
# complete loyalty system — `Loyalty Program`, its tiered collection rules,
# and a `Loyalty Point Entry` ledger with expiry — and POS Invoice already
# accrues and redeems against it inside `on_submit`, provided the invoice
# carries a `loyalty_program`.
#
# What was missing was not the machinery. It was that nothing in URY ever set
# that field or showed a cashier a balance, so the whole system sat unused
# behind a phone number the POS was already collecting. Reimplementing points
# in a URY doctype would have created a second ledger to disagree with the
# accounting one — the exact failure mode the platform roadmap's "single
# source of truth" principle is about.
#
# So: read balances, attach the programme to the invoice, and let ERPNext do
# the arithmetic and the ledger entries.

import frappe
from frappe import _
from frappe.utils import flt

from erpnext.accounts.doctype.loyalty_program.loyalty_program import (
    get_loyalty_program_details_with_points,
)


def _company_for_profile(pos_profile):
    if not pos_profile:
        return None
    return frappe.db.get_value("POS Profile", pos_profile, "company")


def resolve_loyalty_program(customer, company):
    """The programme this customer collects on, or None.

    Reads the Customer's own `loyalty_program` first — that is where ERPNext
    keeps an explicit enrolment — and falls back to a single company-wide
    programme when exactly one is active. Ambiguity resolves to None rather
    than to a guess: enrolling a customer in the wrong programme quietly
    awards them someone else's tier.
    """
    if not customer:
        return None

    enrolled = frappe.db.get_value("Customer", customer, "loyalty_program")
    if enrolled:
        return enrolled

    filters = {"auto_opt_in": 1}
    if company:
        filters["company"] = company

    programs = frappe.get_all("Loyalty Program", filters=filters, pluck="name", limit=2)
    return programs[0] if len(programs) == 1 else None


@frappe.whitelist()
def get_customer_loyalty(customer, pos_profile=None):
    """Balance and redemption value for one customer.

    Returns a quiet, uniform "no programme" shape rather than throwing. Most
    customers in a restaurant are walk-ins with no loyalty at all, and this
    is called every time one is selected at the till — an exception would
    turn the common case into an error dialog.
    """
    company = _company_for_profile(pos_profile)
    program = resolve_loyalty_program(customer, company)

    if not program:
        return {
            "enrolled": False,
            "loyalty_program": None,
            "loyalty_points": 0,
            "conversion_factor": 0,
            "redeemable_amount": 0,
            "tier_name": None,
        }

    try:
        details = get_loyalty_program_details_with_points(
            customer, program, company=company, silent=True
        )
    except Exception:
        # A misconfigured programme (no collection rules, wrong company) must
        # not stop the cashier selecting the customer and taking the order.
        frappe.log_error(frappe.get_traceback(), "Loyalty lookup failed")
        return {
            "enrolled": False,
            "loyalty_program": program,
            "loyalty_points": 0,
            "conversion_factor": 0,
            "redeemable_amount": 0,
            "tier_name": None,
        }

    points = frappe.utils.cint(details.get("loyalty_points"))
    factor = flt(details.get("conversion_factor"))

    return {
        "enrolled": True,
        "loyalty_program": program,
        "loyalty_points": points,
        "conversion_factor": factor,
        "redeemable_amount": flt(points * factor),
        "tier_name": details.get("tier_name"),
    }


def apply_loyalty_to_invoice(invoice, redeem_points=None):
    """Attach the programme, and optionally a redemption, before submit.

    Called from `make_invoice`. Everything after this — checking the balance,
    converting points to money, writing the ledger entry — is ERPNext's
    `validate_loyalty_transaction` and `make_loyalty_point_entry`, which run
    on the invoice's own validate/submit. Duplicating any of it here would
    mean two answers to "how many points is this worth".

    Returns the number of points actually set up for redemption.
    """
    program = resolve_loyalty_program(invoice.customer, invoice.company)
    if not program:
        return 0

    # Set even when nothing is being redeemed: this is the field that makes
    # ERPNext *award* points on submit, which is the half of loyalty that
    # happens on every bill rather than only on the ones a customer spends.
    invoice.loyalty_program = program

    points = frappe.utils.cint(redeem_points)
    if points <= 0:
        invoice.redeem_loyalty_points = 0
        invoice.loyalty_points = 0
        invoice.loyalty_amount = 0
        return 0

    profile = frappe.db.get_value(
        "POS Profile", invoice.pos_profile,
        ["loyalty_program", "expense_account", "cost_center"],
        as_dict=True,
    ) or frappe._dict()

    invoice.redeem_loyalty_points = 1
    invoice.loyalty_points = points
    # ERPNext posts the redeemed value to these; without them the invoice
    # fails validation at submit with an accounting error the cashier cannot
    # act on.
    invoice.loyalty_redemption_account = (
        invoice.get("loyalty_redemption_account")
        or frappe.db.get_value("Loyalty Program", program, "expense_account")
    )
    invoice.loyalty_redemption_cost_center = (
        invoice.get("loyalty_redemption_cost_center")
        or frappe.db.get_value("Loyalty Program", program, "cost_center")
        or profile.cost_center
    )

    if not invoice.loyalty_redemption_account:
        frappe.throw(
            _("Loyalty Program {0} has no redemption account set, so points cannot be redeemed.").format(program),
            frappe.ValidationError,
        )

    return points
