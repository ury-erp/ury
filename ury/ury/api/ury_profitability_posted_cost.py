"""Read complete fulfilment posting evidence for sold invoice items."""

from collections import Counter, defaultdict

import frappe
from frappe.utils import flt


def load_posted_costs(company, branch, invoice_lines):
	if not invoice_lines:
		return {}
	postings = _read_postings(company, branch, {line["parent"] for line in invoice_lines})
	if not postings:
		return {}

	# A shared posting cannot be charged in full to several fulfilments.
	references = {row["posting_reference"] for row in postings}
	linked_records = frappe.get_all(
		"URY Fulfilment Record",
		filters={"posting_reference": ["in", list(references)]},
		fields=["posting_reference"],
	)
	reference_counts = Counter(row["posting_reference"] for row in linked_records)
	groups = defaultdict(list)
	for posting in postings:
		groups[(posting["invoice"], posting["item_code"])].append(posting)
	costs = {}
	for line in invoice_lines:
		key = (line["parent"], line["item_code"])
		rows = groups.get(key, [])
		if not rows or any(reference_counts[row["posting_reference"]] != 1 for row in rows):
			continue
		if any(flt(row["qty"]) <= 0 for row in rows):
			continue
		posted_qty = sum(flt(row["qty"]) for row in rows)
		if flt(line["qty"]) <= 0 or abs(posted_qty - flt(line["qty"])) > 0.000001:
			continue
		costs[key] = sum(flt(row["posted_cost"]) for row in rows)
	return costs


def _read_postings(company, branch, invoices):
	fulfilment = frappe.qb.DocType("URY Fulfilment Record")
	kot = frappe.qb.DocType("URY KOT")
	entry = frappe.qb.DocType("Stock Entry")
	return (
		frappe.qb.from_(fulfilment)
		.join(kot).on(kot.name == fulfilment.kot)
		.join(entry).on(entry.name == fulfilment.posting_reference)
		.select(
			kot.invoice, fulfilment.item_code, fulfilment.qty, fulfilment.posting_reference,
			entry.total_outgoing_value.as_("posted_cost"),
		)
		.where(
			(fulfilment.company == company) & (fulfilment.branch == branch)
			& (fulfilment.posted_to_erpnext == 1)
			& (kot.branch == branch) & (kot.docstatus == 1) & kot.invoice.isin(list(invoices))
			& (entry.company == company) & (entry.docstatus == 1)
			& entry.purpose.isin(["Manufacture", "Material Issue"])
		)
		.run(as_dict=True)
	)
