"""The dashboard's purchases: supplier bills that bring stock into a warehouse.

A restaurant buys from a supplier, the goods arrive, and the bill is paid now
or later. In ERPNext that is a Purchase Invoice with "Update Stock" on: one
document receives the goods into the warehouse and records what is owed to
the supplier. Paying on the spot marks it paid against the chosen mode of
payment; paying later records a Payment Entry against it from its page.

Every read goes through frappe.get_list / check_permission, so a user sees
and changes only what their roles allow on Purchase Invoice, Supplier and
Item — this module adds no permission of its own.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

PAGE_SIZES = (20, 50, 100)
SEARCH_LIMIT = 20

# Filter value -> conditions. Draft and Cancelled are docstatus; the rest are
# ERPNext's own Purchase Invoice statuses.
STATUS_FILTERS = {
	"Draft": {"docstatus": 0},
	"Unpaid": {"docstatus": 1, "status": ["in", ["Unpaid", "Overdue", "Partly Paid"]]},
	"Overdue": {"docstatus": 1, "status": "Overdue"},
	"Paid": {"docstatus": 1, "status": "Paid"},
	"Return": {"docstatus": 1, "status": ["in", ["Return", "Debit Note Issued"]]},
	"Cancelled": {"docstatus": 2},
}

LIST_FIELDS = [
	"name", "supplier", "supplier_name", "posting_date", "bill_no", "set_warehouse",
	"grand_total", "rounded_total", "outstanding_amount", "status", "docstatus",
	"currency", "is_return", "owner",
]


# --------------------------------------------------------------------------- setup


@frappe.whitelist()
def get_purchase_setup(branch=None):
	"""What the purchase form needs before the first keystroke."""
	frappe.has_permission("Purchase Invoice", "read", throw=True)

	company, default_warehouse = _company_and_warehouse(branch)
	warehouses = frappe.get_list(
		"Warehouse",
		filters={"company": company, "is_group": 0, "disabled": 0},
		fields=["name", "warehouse_name"],
		order_by="warehouse_name asc",
		limit_page_length=0,
	)
	if default_warehouse not in {w.name for w in warehouses}:
		default_warehouse = warehouses[0].name if warehouses else None

	modes = []
	for mode in frappe.get_list(
		"Mode of Payment", filters={"enabled": 1}, fields=["name", "type"], order_by="name asc"
	):
		# A mode that cannot pay a supplier for this company is not offered,
		# rather than failing at submit: no account, or one that is not cash or
		# bank (a POS "credit" mode posts to receivables).
		if _payable_account(mode.name, company):
			modes.append({"name": mode.name, "type": mode.type})

	return {
		"company": company,
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
		"warehouses": [{"name": w.name, "label": w.warehouse_name or w.name} for w in warehouses],
		"default_warehouse": default_warehouse,
		"modes_of_payment": modes,
		"today": nowdate(),
		"permissions": {
			"create": bool(frappe.has_permission("Purchase Invoice", "create")),
			"submit": bool(frappe.has_permission("Purchase Invoice", "submit")),
			"cancel": bool(frappe.has_permission("Purchase Invoice", "cancel")),
			"delete": bool(frappe.has_permission("Purchase Invoice", "delete")),
			"create_supplier": bool(frappe.has_permission("Supplier", "create")),
			"pay": bool(frappe.has_permission("Payment Entry", "create")),
		},
	}


@frappe.whitelist()
def search_suppliers(term=None):
	term = (term or "").strip()
	or_filters = None
	if term:
		like = f"%{term}%"
		or_filters = [
			["Supplier", "name", "like", like],
			["Supplier", "supplier_name", "like", like],
			["Supplier", "mobile_no", "like", like],
		]
	return frappe.get_list(
		"Supplier",
		filters={"disabled": 0},
		or_filters=or_filters,
		fields=["name", "supplier_name", "mobile_no", "supplier_group"],
		order_by="supplier_name asc",
		limit_page_length=SEARCH_LIMIT,
	)


@frappe.whitelist(methods=["POST"])
def create_supplier(supplier_name, mobile_no=None):
	"""Add a supplier from the purchase form without leaving it."""
	frappe.has_permission("Supplier", "create", throw=True)

	supplier_name = (supplier_name or "").strip()
	if not supplier_name:
		frappe.throw(_("Supplier name is required"))
	existing = frappe.db.get_value("Supplier", {"supplier_name": supplier_name}, "name")
	if existing:
		frappe.throw(_("A supplier named {0} already exists").format(supplier_name))

	group = frappe.db.get_single_value("Buying Settings", "supplier_group") or frappe.db.get_value(
		"Supplier Group", {"is_group": 0}, "name"
	) or "All Supplier Groups"

	supplier = frappe.get_doc({
		"doctype": "Supplier",
		"supplier_name": supplier_name,
		"supplier_group": group,
		"supplier_type": "Company",
		"mobile_no": (mobile_no or "").strip() or None,
	}).insert()
	return {
		"name": supplier.name,
		"supplier_name": supplier.supplier_name,
		"mobile_no": supplier.get("mobile_no"),
		"supplier_group": supplier.supplier_group,
	}


@frappe.whitelist()
def search_items(term=None, warehouse=None, supplier=None):
	"""Purchasable items with the price last paid and the stock on hand."""
	term = (term or "").strip()
	or_filters = None
	if term:
		like = f"%{term}%"
		or_filters = [
			["Item", "name", "like", like],
			["Item", "item_name", "like", like],
			["Item", "item_group", "like", like],
		]
	items = frappe.get_list(
		"Item",
		filters={"disabled": 0, "is_purchase_item": 1, "has_variants": 0, "is_fixed_asset": 0},
		or_filters=or_filters,
		fields=[
			"name", "item_name", "item_group", "stock_uom", "purchase_uom", "is_stock_item",
			"image", "last_purchase_rate", "valuation_rate",
		],
		order_by="item_name asc",
		limit_page_length=SEARCH_LIMIT,
	)
	if not items:
		return []

	codes = [i.name for i in items]
	uoms = {}
	for row in frappe.get_all(
		"UOM Conversion Detail",
		filters={"parent": ["in", codes], "parenttype": "Item"},
		fields=["parent", "uom", "conversion_factor"],
		order_by="idx asc",
	):
		uoms.setdefault(row.parent, []).append({"uom": row.uom, "conversion_factor": flt(row.conversion_factor)})

	stock = {}
	if warehouse:
		stock = dict(frappe.get_all(
			"Bin",
			filters={"item_code": ["in", codes], "warehouse": warehouse},
			fields=["item_code", "actual_qty"],
			as_list=True,
		))

	supplier_rates = _last_supplier_rates(supplier, codes) if supplier else {}

	result = []
	for item in items:
		item_uoms = uoms.get(item.name) or []
		if not any(u["uom"] == item.stock_uom for u in item_uoms):
			item_uoms.insert(0, {"uom": item.stock_uom, "conversion_factor": 1.0})
		default_uom = item.purchase_uom if any(u["uom"] == item.purchase_uom for u in item_uoms) else item.stock_uom
		last = supplier_rates.get(item.name)
		result.append({
			"item_code": item.name,
			"item_name": item.item_name,
			"item_group": item.item_group,
			"stock_uom": item.stock_uom,
			"default_uom": default_uom,
			"uoms": item_uoms,
			"is_stock_item": cint(item.is_stock_item),
			"image": item.image,
			# Per stock unit; the form scales it by the chosen unit's factor.
			"last_rate": flt(last.rate if last else (item.last_purchase_rate or item.valuation_rate)),
			"last_rate_from_supplier": bool(last),
			"actual_qty": flt(stock.get(item.name)) if warehouse else None,
		})
	return result


# --------------------------------------------------------------------------- list


def _list_filters(branch=None, from_date=None, to_date=None, status=None, supplier=None,
				  warehouse=None):
	filters = [["Purchase Invoice", "docstatus", "in", [0, 1, 2]]]
	company = _branch_company(branch)
	if company:
		filters.append(["Purchase Invoice", "company", "=", company])
	if from_date:
		filters.append(["Purchase Invoice", "posting_date", ">=", getdate(from_date)])
	if to_date:
		filters.append(["Purchase Invoice", "posting_date", "<=", getdate(to_date)])
	if supplier:
		filters.append(["Purchase Invoice", "supplier", "=", supplier])
	if warehouse:
		filters.append(["Purchase Invoice", "set_warehouse", "=", warehouse])
	if status and status in STATUS_FILTERS:
		for field, value in STATUS_FILTERS[status].items():
			op, val = (value[0], value[1]) if isinstance(value, list) else ("=", value)
			filters.append(["Purchase Invoice", field, op, val])
	elif not status:
		# Cancelled bills are noise in the everyday list; they have a filter.
		filters.append(["Purchase Invoice", "docstatus", "!=", 2])
	return filters


@frappe.whitelist()
def get_purchases(branch=None, from_date=None, to_date=None, status=None, supplier=None,
				  warehouse=None, search=None, page=1, page_size=20):
	frappe.has_permission("Purchase Invoice", "read", throw=True)

	page = max(cint(page), 1)
	page_size = cint(page_size) if cint(page_size) in PAGE_SIZES else PAGE_SIZES[0]
	filters = _list_filters(branch, from_date, to_date, status, supplier, warehouse)

	or_filters = None
	term = (search or "").strip()
	if term:
		like = f"%{term}%"
		or_filters = [
			["Purchase Invoice", "name", "like", like],
			["Purchase Invoice", "supplier_name", "like", like],
			["Purchase Invoice", "bill_no", "like", like],
		]

	totals = frappe.get_list(
		"Purchase Invoice",
		filters=filters,
		or_filters=or_filters,
		fields=["count(name) as count", "sum(grand_total) as amount", "sum(outstanding_amount) as outstanding"],
	)[0]
	rows = frappe.get_list(
		"Purchase Invoice",
		filters=filters,
		or_filters=or_filters,
		fields=LIST_FIELDS,
		order_by="posting_date desc, creation desc",
		start=(page - 1) * page_size,
		page_length=page_size,
	)
	for row in rows:
		row.status = _display_status(row)

	return {
		"rows": rows,
		"total": cint(totals.count),
		"amount": flt(totals.amount),
		"outstanding": flt(totals.outstanding),
		"page": page,
		"page_size": page_size,
	}


@frappe.whitelist()
def get_purchase_summary(branch=None, from_date=None, to_date=None):
	"""Headline figures for the period, plus what is still owed overall."""
	frappe.has_permission("Purchase Invoice", "read", throw=True)

	submitted = _list_filters(branch, from_date, to_date) + [["Purchase Invoice", "docstatus", "=", 1]]
	period = frappe.get_list(
		"Purchase Invoice",
		filters=submitted,
		fields=["count(name) as count", "sum(base_grand_total) as amount"],
	)[0]

	# Debt does not reset with the period: a bill from last month is still owed.
	owed_filters = _list_filters(branch) + [
		["Purchase Invoice", "docstatus", "=", 1],
		["Purchase Invoice", "outstanding_amount", ">", 0],
	]
	owed = frappe.get_list(
		"Purchase Invoice",
		filters=owed_filters,
		fields=["count(name) as count", "sum(outstanding_amount) as amount"],
	)[0]
	overdue = frappe.get_list(
		"Purchase Invoice",
		filters=owed_filters + [["Purchase Invoice", "due_date", "<", getdate(nowdate())]],
		fields=["count(name) as count", "sum(outstanding_amount) as amount"],
	)[0]
	drafts = frappe.get_list(
		"Purchase Invoice",
		filters=_list_filters(branch, status="Draft"),
		fields=["count(name) as count"],
	)[0]

	top = frappe.get_list(
		"Purchase Invoice",
		filters=submitted,
		fields=["supplier", "supplier_name", "sum(base_grand_total) as amount", "count(name) as count"],
		group_by="supplier",
		order_by="amount desc",
		limit_page_length=5,
	)

	return {
		"purchases_amount": flt(period.amount),
		"purchases_count": cint(period.count),
		"outstanding_amount": flt(owed.amount),
		"outstanding_count": cint(owed.count),
		"overdue_amount": flt(overdue.amount),
		"overdue_count": cint(overdue.count),
		"draft_count": cint(drafts.count),
		"top_suppliers": [
			{"supplier": r.supplier, "supplier_name": r.supplier_name, "amount": flt(r.amount), "count": cint(r.count)}
			for r in top
		],
	}


# --------------------------------------------------------------------------- detail


@frappe.whitelist()
def get_purchase_detail(name):
	doc = frappe.get_doc("Purchase Invoice", name)
	doc.check_permission("read")

	payments = frappe.get_all(
		"Payment Entry Reference",
		filters={"reference_doctype": "Purchase Invoice", "reference_name": doc.name, "docstatus": 1},
		fields=["parent", "allocated_amount"],
	)
	payment_rows = []
	for ref in payments:
		pe = frappe.db.get_value(
			"Payment Entry", ref.parent, ["posting_date", "mode_of_payment", "reference_no"], as_dict=True
		) or frappe._dict()
		payment_rows.append({
			"name": ref.parent,
			"posting_date": pe.posting_date,
			"mode_of_payment": pe.mode_of_payment,
			"reference_no": pe.reference_no,
			"amount": flt(ref.allocated_amount),
		})
	if cint(doc.is_paid) and flt(doc.paid_amount):
		payment_rows.insert(0, {
			"name": None,
			"posting_date": doc.posting_date,
			"mode_of_payment": doc.mode_of_payment,
			"reference_no": None,
			"amount": flt(doc.paid_amount),
		})

	return {
		"name": doc.name,
		"status": _display_status(doc),
		"docstatus": doc.docstatus,
		"is_return": cint(doc.is_return),
		"company": doc.company,
		"supplier": doc.supplier,
		"supplier_name": doc.supplier_name,
		"posting_date": doc.posting_date,
		"due_date": doc.due_date,
		"bill_no": doc.bill_no,
		"bill_date": doc.bill_date,
		"warehouse": doc.set_warehouse or (doc.items[0].warehouse if doc.items else None),
		"update_stock": cint(doc.update_stock),
		"is_paid": cint(doc.is_paid),
		"mode_of_payment": doc.get("mode_of_payment"),
		"remarks": doc.remarks if doc.remarks and doc.remarks != "No Remarks" else None,
		"currency": doc.currency,
		"created_by": _user_name(doc.owner),
		"creation": doc.creation,
		"modified": doc.modified,
		"items": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"qty": flt(row.qty),
				"uom": row.uom,
				"stock_uom": row.stock_uom,
				"conversion_factor": flt(row.conversion_factor) or 1.0,
				"rate": flt(row.rate),
				"amount": flt(row.amount),
				"warehouse": row.warehouse,
			}
			for row in doc.items
		],
		"taxes": [
			{"description": row.description, "amount": flt(row.tax_amount)}
			for row in doc.get("taxes") or []
			if flt(row.tax_amount)
		],
		"totals": {
			"total": flt(doc.total),
			"discount_amount": flt(doc.discount_amount),
			"total_taxes": flt(doc.total_taxes_and_charges),
			"grand_total": flt(doc.grand_total),
			"rounding_adjustment": flt(doc.rounding_adjustment),
			"rounded_total": flt(doc.rounded_total),
			"paid_amount": flt(doc.grand_total) - flt(doc.outstanding_amount) if doc.docstatus == 1 else 0,
			"outstanding_amount": flt(doc.outstanding_amount),
		},
		"payments": payment_rows,
		"permissions": {
			"write": doc.docstatus == 0 and bool(doc.has_permission("write")),
			"submit": doc.docstatus == 0 and bool(doc.has_permission("submit")),
			"cancel": doc.docstatus == 1 and bool(doc.has_permission("cancel")),
			"delete": doc.docstatus == 0 and bool(doc.has_permission("delete")),
			"pay": doc.docstatus == 1 and flt(doc.outstanding_amount) > 0 and not cint(doc.is_return)
			and bool(frappe.has_permission("Payment Entry", "create")),
			"print": doc.docstatus != 2 and bool(doc.has_permission("print")),
		},
	}


# --------------------------------------------------------------------------- write


@frappe.whitelist(methods=["POST"])
def save_purchase(data, submit=0):
	"""Create a purchase, or update a draft, and optionally submit it.

	``data``: supplier, posting_date, warehouse, items[{item_code, qty, rate,
	uom}], and optionally name (to update a draft), bill_no, bill_date,
	due_date, discount_amount, remarks, and pay_now + mode_of_payment.
	"""
	data = frappe._dict(frappe.parse_json(data) if isinstance(data, str) else data)
	submit = cint(submit)

	if data.get("name"):
		doc = frappe.get_doc("Purchase Invoice", data.name)
		doc.check_permission("write")
		if doc.docstatus != 0:
			frappe.throw(_("Only a draft purchase can be edited"))
		_check_not_modified(doc, data.get("modified"))
	else:
		frappe.has_permission("Purchase Invoice", "create", throw=True)
		doc = frappe.new_doc("Purchase Invoice")

	_fill(doc, data)

	if doc.is_new():
		doc.insert()
	else:
		doc.save()

	if submit:
		doc.check_permission("submit")
		doc.submit()

	return {"name": doc.name, "docstatus": doc.docstatus, "status": _display_status(doc)}


@frappe.whitelist(methods=["POST"])
def submit_purchase(name):
	doc = frappe.get_doc("Purchase Invoice", name)
	doc.check_permission("submit")
	if doc.docstatus != 0:
		frappe.throw(_("Only a draft purchase can be submitted"))
	doc.submit()
	return {"name": doc.name, "status": _display_status(doc)}


@frappe.whitelist(methods=["POST"])
def cancel_purchase(name, reason=None):
	doc = frappe.get_doc("Purchase Invoice", name)
	doc.check_permission("cancel")
	if doc.docstatus != 1:
		frappe.throw(_("Only a submitted purchase can be cancelled"))

	linked = frappe.get_all(
		"Payment Entry Reference",
		filters={"reference_doctype": "Purchase Invoice", "reference_name": doc.name, "docstatus": 1},
		pluck="parent",
	)
	if linked:
		# ERPNext would unlink the payments silently and leave them floating
		# as supplier advances; making the user cancel them first keeps the
		# cash book honest.
		frappe.throw(
			_("This purchase has payments recorded against it ({0}). Cancel the payments first.").format(
				", ".join(sorted(set(linked)))
			)
		)

	doc.cancel()
	reason = (reason or "").strip()
	if reason:
		doc.add_comment("Info", _("Cancelled: {0}").format(reason))
	return {"name": doc.name, "status": _display_status(doc)}


@frappe.whitelist(methods=["POST"])
def delete_purchase(name):
	doc = frappe.get_doc("Purchase Invoice", name)
	doc.check_permission("delete")
	if doc.docstatus != 0:
		frappe.throw(_("Only a draft purchase can be deleted"))
	frappe.delete_doc("Purchase Invoice", doc.name)
	return {"deleted": True}


@frappe.whitelist(methods=["POST"])
def record_payment(name, mode_of_payment, amount=None, reference_no=None, posting_date=None):
	"""Pay a supplier bill, in full or in part, from a mode of payment."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	doc = frappe.get_doc("Purchase Invoice", name)
	doc.check_permission("read")
	frappe.has_permission("Payment Entry", "create", throw=True)
	if doc.docstatus != 1:
		frappe.throw(_("Only a submitted purchase can be paid"))
	if cint(doc.is_return):
		frappe.throw(_("A return cannot be paid from here"))

	outstanding = flt(doc.outstanding_amount)
	if outstanding <= 0:
		frappe.throw(_("This purchase is already fully paid"))

	amount = flt(amount) or outstanding
	if amount <= 0:
		frappe.throw(_("Payment amount must be greater than zero"))
	precision = frappe.get_precision("Purchase Invoice", "outstanding_amount") or 2
	if flt(amount, precision) > flt(outstanding, precision):
		frappe.throw(_("Payment amount cannot be more than the amount still owed ({0})").format(
			frappe.format_value(outstanding, {"fieldtype": "Currency", "options": doc.currency})
		))

	account = _mode_account(mode_of_payment, doc.company)
	posting_date = getdate(posting_date) if posting_date else getdate(nowdate())

	pe = get_payment_entry(
		"Purchase Invoice", doc.name, party_amount=amount, bank_account=account, reference_date=posting_date
	)
	pe.mode_of_payment = mode_of_payment
	pe.posting_date = posting_date
	reference_no = (reference_no or "").strip()
	if reference_no or frappe.db.get_value("Mode of Payment", mode_of_payment, "type") == "Bank":
		# Bank payments require a reference; the bill name is a traceable default.
		pe.reference_no = reference_no or doc.bill_no or doc.name
		pe.reference_date = posting_date
	pe.insert()
	pe.submit()

	return {"payment_entry": pe.name, "outstanding_amount": flt(frappe.db.get_value("Purchase Invoice", doc.name, "outstanding_amount"))}


# --------------------------------------------------------------------------- helpers


def _fill(doc, data):
	supplier = (data.get("supplier") or "").strip()
	if not supplier or not frappe.db.exists("Supplier", supplier):
		frappe.throw(_("Choose a supplier"))

	items = data.get("items") or []
	if not items:
		frappe.throw(_("Add at least one item"))

	company = doc.company or data.get("company") or _company_and_warehouse(data.get("branch"))[0]
	warehouse = data.get("warehouse")
	if not warehouse:
		frappe.throw(_("Choose the warehouse the goods go into"))
	wh = frappe.db.get_value("Warehouse", warehouse, ["company", "is_group", "disabled"], as_dict=True)
	if not wh or wh.is_group or wh.disabled:
		frappe.throw(_("Warehouse {0} cannot receive stock").format(warehouse))
	if wh.company != company:
		frappe.throw(_("Warehouse {0} belongs to another company").format(warehouse))

	posting_date = getdate(data.get("posting_date") or nowdate())
	if posting_date > getdate(nowdate()):
		frappe.throw(_("The purchase date cannot be in the future"))

	doc.company = company
	doc.supplier = supplier
	doc.currency = frappe.get_cached_value("Company", company, "default_currency")
	doc.conversion_rate = 1
	doc.set_posting_time = 1
	doc.posting_date = posting_date
	doc.bill_no = (data.get("bill_no") or "").strip() or None
	doc.bill_date = getdate(data.bill_date) if data.get("bill_date") else None
	if data.get("due_date"):
		due = getdate(data.due_date)
		if due < posting_date:
			frappe.throw(_("The due date cannot be before the purchase date"))
		doc.due_date = due
		# A due date chosen by hand wins over the supplier's payment terms.
		doc.payment_terms_template = None
		doc.set("payment_schedule", [])
	elif not doc.is_new():
		# Cleared on edit: let ERPNext work it out from the supplier's terms again.
		doc.due_date = None
		doc.set("payment_schedule", [])
	doc.update_stock = 1
	doc.set_warehouse = warehouse
	doc.remarks = (data.get("remarks") or "").strip() or None

	discount = flt(data.get("discount_amount"))
	if discount < 0:
		frappe.throw(_("Discount cannot be negative"))
	doc.apply_discount_on = "Grand Total"
	doc.additional_discount_percentage = 0
	doc.discount_amount = discount

	doc.set("items", [])
	for i, row in enumerate(items, start=1):
		row = frappe._dict(row)
		item_code = (row.get("item_code") or "").strip()
		if not item_code or not frappe.db.exists("Item", item_code):
			frappe.throw(_("Row {0}: choose an item").format(i))
		qty = flt(row.get("qty"))
		rate = flt(row.get("rate"))
		if qty <= 0:
			frappe.throw(_("Row {0}: quantity must be greater than zero").format(i))
		if rate < 0:
			frappe.throw(_("Row {0}: price cannot be negative").format(i))

		stock_uom = frappe.get_cached_value("Item", item_code, "stock_uom")
		uom = row.get("uom") or stock_uom
		factor = 1.0 if uom == stock_uom else flt(frappe.db.get_value(
			"UOM Conversion Detail", {"parent": item_code, "parenttype": "Item", "uom": uom}, "conversion_factor"
		))
		if not factor:
			frappe.throw(_("Row {0}: unit {1} is not set up for item {2}").format(i, uom, item_code))

		doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"uom": uom,
			"stock_uom": stock_uom,
			"conversion_factor": factor,
			"rate": rate,
			"warehouse": warehouse,
		})

	if cint(data.get("pay_now")):
		mode = data.get("mode_of_payment")
		if not mode:
			frappe.throw(_("Choose how the supplier was paid"))
		doc.is_paid = 1
		doc.mode_of_payment = mode
		doc.cash_bank_account = _mode_account(mode, company)
		# Recalculated from the total during validate.
		doc.paid_amount = 0
		doc.base_paid_amount = 0
	else:
		doc.is_paid = 0
		doc.mode_of_payment = None
		doc.cash_bank_account = None
		doc.paid_amount = 0
		doc.base_paid_amount = 0

	doc.set_missing_values()
	# set_missing_values pulls the supplier's default price list rates into
	# the rows; the price typed on the bill is the price paid.
	for row, src in zip(doc.items, items):
		row.rate = flt(frappe._dict(src).get("rate"))
		row.price_list_rate = 0
		row.discount_percentage = 0
		row.discount_amount = 0
		row.margin_rate_or_amount = 0
	doc.calculate_taxes_and_totals()
	if cint(doc.is_paid):
		doc.paid_amount = flt(doc.rounded_total or doc.grand_total)
		doc.base_paid_amount = doc.paid_amount


def _mode_account(mode_of_payment, company):
	if not mode_of_payment or not frappe.db.exists("Mode of Payment", mode_of_payment):
		frappe.throw(_("Choose a mode of payment"))
	account = _payable_account(mode_of_payment, company)
	if not account:
		frappe.throw(
			_("Mode of payment {0} has no cash or bank account set for company {1}").format(mode_of_payment, company)
		)
	return account


def _payable_account(mode_of_payment, company):
	account = frappe.db.get_value(
		"Mode of Payment Account", {"parent": mode_of_payment, "company": company}, "default_account"
	)
	if account and frappe.db.get_value("Account", account, "account_type") in ("Cash", "Bank"):
		return account
	return None


def _check_not_modified(doc, modified):
	"""Refuse to overwrite a draft someone else saved after this form loaded it."""
	if modified and str(doc.modified) != str(modified):
		frappe.throw(
			_("This purchase was changed by someone else after you opened it. Reload it and try again."),
			frappe.TimestampMismatchError,
		)


def _branch_company(branch):
	if not branch or branch == "all":
		return None
	return frappe.db.get_value("POS Profile", {"branch": branch, "disabled": 0}, "company")


def _company_and_warehouse(branch=None):
	"""The company and receiving warehouse a branch buys into.

	A branch's stock lives in its POS Profile's warehouse, so purchases for
	that branch default to it. Without a branch, the user's default company.
	"""
	if branch and branch != "all":
		profile = frappe.db.get_value(
			"POS Profile", {"branch": branch, "disabled": 0}, ["company", "warehouse"], as_dict=True
		)
		if profile and profile.company:
			return profile.company, profile.warehouse

	company = (
		frappe.defaults.get_user_default("Company")
		or frappe.defaults.get_global_default("company")
		or frappe.db.get_value("Company", {}, "name")
	)
	if not company:
		frappe.throw(_("Set up a company before recording purchases"))
	warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
	if warehouse and frappe.db.get_value("Warehouse", warehouse, "company") != company:
		warehouse = None
	return company, warehouse


def _last_supplier_rates(supplier, item_codes):
	"""The per-stock-unit price last paid to this supplier for each item."""
	pi = frappe.qb.DocType("Purchase Invoice")
	pii = frappe.qb.DocType("Purchase Invoice Item")
	rows = (
		frappe.qb.from_(pii)
		.join(pi).on(pi.name == pii.parent)
		.select(pii.item_code, pii.rate, pii.conversion_factor, pi.posting_date, pi.creation)
		.where(
			(pi.docstatus == 1)
			& (pi.supplier == supplier)
			& (pi.is_return == 0)
			& (pii.item_code.isin(item_codes))
		)
		.orderby(pi.posting_date, order=frappe.qb.desc)
		.orderby(pi.creation, order=frappe.qb.desc)
		.limit(500)
		.run(as_dict=True)
	)
	rates = {}
	for row in rows:
		if row.item_code not in rates:
			rates[row.item_code] = frappe._dict(rate=flt(row.rate) / (flt(row.conversion_factor) or 1.0))
	return rates


def _display_status(doc):
	if doc.docstatus == 2:
		return "Cancelled"
	if doc.docstatus == 0:
		return "Draft"
	return doc.status


def _user_name(user):
	return frappe.utils.get_fullname(user) if user else None
