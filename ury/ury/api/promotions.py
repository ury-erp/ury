# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Offers and coupons at the counter.
#
# Nothing here calculates a discount. ERPNext's Pricing Rule engine already
# decides what an offer is worth, applies it through the invoice, and posts
# the accounting; a second implementation in the POS would be a second answer
# to "what does this bill come to", and the two would disagree on the night
# somebody needs them not to. This module is the part ERPNext does not have:
# knowing which offers are live *right now* at this branch, putting a coupon
# on a bill safely, and leaving a trail of who did it.

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime, today

from ury.ury.doctype.ury_audit_log.ury_audit_log import record_event

# Pricing Rule keeps time-of-day offers in these fields. A rule with neither
# runs all day, which is the common case and must not be filtered out.
TIME_FIELDS = ("valid_from", "valid_upto")


def _invoice_for_write(invoice):
	"""The draft bill a coupon may still be put on.

	A submitted invoice is settled money: changing what it charges after the
	fact is an amendment, not a coupon, and it goes through the amendment
	path where it leaves an audit trail of its own.
	"""
	doc = frappe.get_doc("POS Invoice", invoice)
	doc.check_permission("write")
	if doc.docstatus != 0:
		frappe.throw(_("This bill is already settled. A coupon cannot be added to it."))
	return doc


def _totals(doc):
	return {
		"grand_total": flt(doc.grand_total),
		"rounded_total": flt(doc.rounded_total),
		"discount_amount": flt(doc.discount_amount),
		"net_total": flt(doc.net_total),
		"coupon_code": doc.coupon_code,
		"applied_rules": [row.pricing_rule for row in (doc.get("pricing_rules") or [])],
	}


def _within_time_window(rule, now):
	"""Whether a rule with a from/to date is live at this moment."""
	if rule.get("valid_from") and getdate(rule["valid_from"]) > getdate(now):
		return False
	if rule.get("valid_upto") and getdate(rule["valid_upto"]) < getdate(now):
		return False
	return True


@frappe.whitelist()
def get_active_offers(pos_profile=None, branch=None, company=None):
	"""Offers a cashier can tell a guest about, right now.

	Coupon-based rules are listed separately from automatic ones: the first
	group is what a guest has to ask for, the second is already in the price
	and mentioning it as an offer would promise a second discount.
	"""
	now = now_datetime()

	if not company and pos_profile:
		company = frappe.db.get_value("POS Profile", pos_profile, "company")

	filters = {"disable": 0, "selling": 1}
	if company:
		filters["company"] = company

	rules = frappe.get_all(
		"Pricing Rule",
		filters=filters,
		fields=["name", "title", "apply_on", "price_or_product_discount", "rate_or_discount",
				"discount_percentage", "discount_amount", "coupon_code_based", "min_qty",
				"min_amt", "valid_from", "valid_upto", "currency", "applicable_for"],
		order_by="title asc",
		limit_page_length=0,
	)

	live = [rule for rule in rules if _within_time_window(rule, now)]

	return {
		"automatic": [rule for rule in live if not cint(rule.coupon_code_based)],
		"coupon": [rule for rule in live if cint(rule.coupon_code_based)],
		"as_of": str(now),
		"company": company,
	}


@frappe.whitelist()
def check_coupon(coupon_code, invoice=None):
	"""Is this code real, live, and not used up — before anything is written.

	Answered as data rather than by throwing, because the cashier is typing
	a code a guest read off a phone screen and a wrong character is the
	normal case, not an error worth a red dialog.
	"""
	name = frappe.db.get_value("Coupon Code", {"coupon_code": coupon_code}, "name") \
		or frappe.db.get_value("Coupon Code", coupon_code, "name")
	if not name:
		return {"valid": False, "reason": "unknown"}

	coupon = frappe.get_doc("Coupon Code", name)

	if coupon.valid_from and getdate(coupon.valid_from) > getdate(today()):
		return {"valid": False, "reason": "not_started", "valid_from": str(coupon.valid_from)}
	if coupon.valid_upto and getdate(coupon.valid_upto) < getdate(today()):
		return {"valid": False, "reason": "expired", "valid_upto": str(coupon.valid_upto)}
	if cint(coupon.maximum_use) and cint(coupon.used) >= cint(coupon.maximum_use):
		return {"valid": False, "reason": "exhausted"}

	if coupon.customer and invoice:
		# A coupon issued to one customer must not be spent on another's bill,
		# and the POS is exactly where that would otherwise happen.
		customer = frappe.db.get_value("POS Invoice", invoice, "customer")
		if customer and customer != coupon.customer:
			return {"valid": False, "reason": "other_customer"}

	return {
		"valid": True,
		"name": coupon.name,
		"coupon_code": coupon.coupon_code,
		"description": coupon.description,
		"pricing_rule": coupon.pricing_rule,
		"remaining_uses": (cint(coupon.maximum_use) - cint(coupon.used))
			if cint(coupon.maximum_use) else None,
	}


@frappe.whitelist()
def apply_coupon(invoice, coupon_code):
	"""Put a coupon on a draft bill and let ERPNext reprice it.

	The recalculation is ERPNext's `save`, not arithmetic done here, so the
	total the cashier reads is produced by the same code that will post the
	sale. The audit entry records the before and after totals, because a
	coupon is a discount and a discount is the thing an owner asks about.
	"""
	doc = _invoice_for_write(invoice)

	check = check_coupon(coupon_code, invoice=invoice)
	if not check["valid"]:
		frappe.throw(_("This coupon cannot be used: {0}").format(_(check["reason"])))

	before = flt(doc.grand_total)
	doc.coupon_code = check["name"]
	doc.ignore_pricing_rule = 0
	doc.save()

	record_event(
		"Coupon Applied",
		reference_doctype="POS Invoice",
		reference_name=doc.name,
		amount=flt(before) - flt(doc.grand_total),
		old_value=str(before),
		new_value=str(flt(doc.grand_total)),
		details={"coupon": check["coupon_code"], "pricing_rule": check.get("pricing_rule")},
		branch=doc.branch,
		pos_profile=doc.pos_profile,
	)

	return _totals(doc)


@frappe.whitelist()
def remove_coupon(invoice):
	"""Take a coupon back off a draft bill.

	Recorded as its own event: a coupon applied and removed within a minute
	is a mis-scan, but a pattern of them on one till is not, and neither is
	visible if removal leaves no trace.
	"""
	doc = _invoice_for_write(invoice)
	if not doc.coupon_code:
		return _totals(doc)

	previous = doc.coupon_code
	before = flt(doc.grand_total)

	doc.coupon_code = None
	doc.save()

	record_event(
		"Coupon Removed",
		reference_doctype="POS Invoice",
		reference_name=doc.name,
		amount=flt(doc.grand_total) - flt(before),
		old_value=str(before),
		new_value=str(flt(doc.grand_total)),
		details={"coupon": previous},
		branch=doc.branch,
		pos_profile=doc.pos_profile,
	)

	return _totals(doc)
