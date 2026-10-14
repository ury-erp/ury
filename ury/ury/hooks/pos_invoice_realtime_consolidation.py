"""Opt-in: consolidate each paid POS Invoice into its own Sales Invoice.

Enabled via POS Profile.custom_consolidate_on_payment (default 0). When on,
``on_submit`` of a paid POS Invoice creates a single-row POS Invoice Merge
Log and submits it — same path as shift-close consolidation, but one sale
→ one Sales Invoice with immediate GL.

Shift close then picks up those Sales Invoices via ERPNext's
``get_invoices`` Sales Invoice branch when ``is_created_using_pos`` is set
on the consolidated document (see CustomPOSInvoiceMergeLog override).
"""

from __future__ import annotations

import frappe
from frappe.utils import nowdate, nowtime


def consolidate_on_payment(doc, method=None):
	"""POS Invoice on_submit: optionally merge this invoice alone into a SI."""
	if doc.doctype != "POS Invoice":
		return
	if cint_docstatus(doc) != 1:
		return
	if doc.get("consolidated_invoice"):
		return
	# Unpaid / credit POS invoices wait until they are settled.
	if (doc.get("status") or "") not in ("Paid", "Consolidated"):
		if flt_outstanding(doc) > 0:
			return

	pos_profile = doc.get("pos_profile")
	if not pos_profile:
		return
	if not frappe.db.get_value(
		"POS Profile", pos_profile, "custom_consolidate_on_payment"
	):
		return

	# Already merged by a concurrent path (e.g. close raced with pay).
	if frappe.db.get_value("POS Invoice", doc.name, "consolidated_invoice"):
		return

	_create_and_submit_merge_log(doc)


def _create_and_submit_merge_log(doc):
	merge_log = frappe.new_doc("POS Invoice Merge Log")
	merge_log.posting_date = doc.posting_date or nowdate()
	merge_log.posting_time = doc.posting_time or nowtime()
	merge_log.company = doc.company
	merge_log.customer = doc.customer
	merge_log.append(
		"pos_invoices",
		{
			"pos_invoice": doc.name,
			"customer": doc.customer,
			"grand_total": doc.grand_total,
			"is_return": cint_is_return(doc),
			"posting_date": doc.posting_date,
		},
	)
	# Mark for closing reconciliation: Sales Invoice branch of get_invoices.
	merge_log.flags.ury_realtime_consolidation = True
	merge_log.insert(ignore_permissions=True)
	merge_log.submit()


def cint_docstatus(doc):
	from frappe.utils import cint

	return cint(doc.docstatus)


def cint_is_return(doc):
	from frappe.utils import cint

	return cint(doc.get("is_return"))


def flt_outstanding(doc):
	from frappe.utils import flt

	return flt(doc.get("outstanding_amount"))
