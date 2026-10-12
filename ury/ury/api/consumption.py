"""Taking a sold product's ingredients off the shelf.

When a POS Invoice is submitted, every product on it that has a recipe
consumes its ingredients: three oranges for a fresh juice; tobacco, charcoal
and foil for a hookah. They leave stock as a Material Issue Stock Entry,
valued at what they were bought for, and the cost goes to Cost of Goods Sold.
No manufacturing step, no finished-goods stock.

The rules:
  * The sale is never blocked. Ingredients are worked out inside the sale
    (from the recipe in force at that moment) and written to a URY
    Consumption Log; the stock entry is made right after, in the background.
    If it fails — not enough oranges recorded in the bar — the log says so
    and the deduction can be retried once stock is put right.
  * Products kept in stock themselves (a can of cola) are not exploded: the
    sale already takes them off the shelf.
  * A return does not put ingredients back: the juice was squeezed. Cancelling
    an invoice (a mistake) reverses its deduction.
  * One log per invoice, whatever is retried or resubmitted.
"""

import math

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, getdate, now_datetime, nowdate, strip_html

from ury.ury.api.recipes import _default_boms, consumption_warehouse, explode

MAX_AUTO_ATTEMPTS = 24


# --------------------------------------------------------------------------- hooks


def on_pos_invoice_submit(doc, method=None):
	"""POS Invoice on_submit: record what the sale consumes, then deduct it after commit."""
	from ury.ury import features

	if not features.is_enabled("recipes"):
		return
	try:
		frappe.db.savepoint("ury_consumption")
		log = build_log(doc)
	except Exception:
		# Whatever goes wrong here is ours, not the cashier's: the bill is paid.
		frappe.db.rollback(save_point="ury_consumption")
		frappe.log_error(frappe.get_traceback(), f"Recipe consumption not recorded for {doc.name}")
		return
	if log and log.status == "Pending":
		frappe.enqueue(
			"ury.ury.api.consumption.process_log",
			queue="short",
			log_name=log.name,
			enqueue_after_commit=True,
			job_id=f"ury-consumption-{log.name}",
			deduplicate=True,
		)


def on_pos_invoice_cancel(doc, method=None):
	"""POS Invoice on_cancel: a cancelled sale gives its ingredients back."""
	name = frappe.db.get_value("URY Consumption Log", {"pos_invoice": doc.name}, "name")
	if not name:
		return
	log = frappe.get_doc("URY Consumption Log", name)
	if log.stock_entry and frappe.db.get_value("Stock Entry", log.stock_entry, "docstatus") == 1:
		se = frappe.get_doc("Stock Entry", log.stock_entry)
		se.flags.ignore_permissions = True
		se.cancel()
	log.status = "Cancelled"
	log.error = None
	log.save(ignore_permissions=True)


# --------------------------------------------------------------------------- build


def build_log(invoice):
	"""Work out an invoice's ingredients and store them; None if it consumes nothing."""
	existing = frappe.db.get_value("URY Consumption Log", {"pos_invoice": invoice.name}, ["name", "status"], as_dict=True)
	if existing:
		return frappe.get_doc("URY Consumption Log", existing.name)
	if cint(invoice.get("is_return")):
		return None

	codes = [r.item_code for r in invoice.items]
	stock_items = set(frappe.get_all("Item", filters={"name": ["in", codes], "is_stock_item": 1}, pluck="name"))
	recipes = _default_boms([c for c in codes if c not in stock_items])
	if not recipes:
		return None

	rows = []
	for line in invoice.items:
		bom = recipes.get(line.item_code)
		if not bom:
			continue
		sold = flt(line.get("stock_qty")) or flt(line.qty) * (flt(line.get("conversion_factor")) or 1)
		if sold <= 0:
			continue
		default_wh = consumption_warehouse(
			line.item_code,
			branch=invoice.get("branch"),
			pos_profile=invoice.get("pos_profile"),
			fallback=line.get("warehouse") or invoice.get("set_warehouse"),
		)
		for ing in explode(bom.name, sold, default_wh):
			rows.append({
				"sold_item": line.item_code,
				"sold_qty": sold,
				"recipe": ing.recipe,
				"item_code": ing.item_code,
				"warehouse": ing.warehouse or default_wh,
				"qty": _stock_qty(ing.item_code, ing.qty),
				"stock_uom": frappe.get_cached_value("Item", ing.item_code, "stock_uom"),
			})
	rows = [r for r in rows if r["qty"] > 0 and r["warehouse"]]
	if not rows:
		return None

	log = frappe.get_doc({
		"doctype": "URY Consumption Log",
		"pos_invoice": invoice.name,
		"status": "Pending",
		"company": invoice.company,
		"branch": invoice.get("branch"),
		"posting_date": invoice.posting_date,
		"posting_time": invoice.posting_time,
		"items": rows,
	})
	log.insert(ignore_permissions=True)
	return log


def _stock_qty(item_code, qty):
	"""A quantity a stock entry will accept: whole units stay whole."""
	uom = frappe.get_cached_value("Item", item_code, "stock_uom")
	if uom and cint(frappe.get_cached_value("UOM", uom, "must_be_whole_number")):
		return float(math.ceil(round(qty, 6)))
	return flt(qty, 6)


# --------------------------------------------------------------------------- process


def process_log(log_name, retry=False):
	"""Make (or retry) the Material Issue for one log. Safe to run twice."""
	log = frappe.get_doc("URY Consumption Log", log_name, for_update=True)
	if log.status not in ("Pending", "Failed"):
		return log.status
	if frappe.db.get_value("POS Invoice", log.pos_invoice, "docstatus") != 1:
		log.db_set({"status": "Cancelled", "error": None})
		return "Cancelled"

	# A savepoint, not a full rollback: undo only this stock entry, never
	# whatever else the surrounding request or job has done.
	frappe.db.savepoint("ury_consumption_entry")
	try:
		se = _make_stock_entry(log, retry)
	except Exception as e:
		frappe.db.rollback(save_point="ury_consumption_entry")
		message = _clean_error(e)
		frappe.db.set_value(
			"URY Consumption Log", log_name,
			{"status": "Failed", "error": message, "attempts": cint(log.attempts) + 1},
			update_modified=True,
		)
		frappe.db.commit()
		return "Failed"

	rates = {(r.item_code, r.s_warehouse): flt(r.valuation_rate) for r in se.items}
	total = 0.0
	for row in log.items:
		row.rate = rates.get((row.item_code, row.warehouse), 0)
		row.amount = flt(row.rate) * flt(row.qty)
		total += row.amount
	log.total_cost = total
	log.stock_entry = se.name
	log.status = "Done"
	log.error = None
	log.attempts = cint(log.attempts) + 1
	log.save(ignore_permissions=True)
	frappe.db.commit()
	return "Done"


def _make_stock_entry(log, retry):
	company = log.company
	expense = frappe.get_cached_value("Company", company, "default_expense_account")
	profile = frappe.db.get_value("POS Invoice", log.pos_invoice, "pos_profile")
	cost_center = (profile and frappe.db.get_value("POS Profile", profile, "cost_center")) or frappe.get_cached_value(
		"Company", company, "cost_center"
	)

	merged = {}
	for row in log.items:
		key = (row.item_code, row.warehouse)
		merged[key] = merged.get(key, 0) + flt(row.qty)

	se = frappe.new_doc("Stock Entry")
	se.stock_entry_type = "Material Issue"
	se.purpose = "Material Issue"
	se.company = company
	if not retry:
		# At the moment of sale; a retry is recorded when it happens, since the
		# stock that makes it possible arrived later.
		se.set_posting_time = 1
		se.posting_date = log.posting_date
		se.posting_time = log.posting_time
	se.remarks = _("Recipe consumption for {0}").format(log.pos_invoice)
	for (item_code, warehouse), qty in merged.items():
		uom = frappe.get_cached_value("Item", item_code, "stock_uom")
		se.append("items", {
			"item_code": item_code,
			"s_warehouse": warehouse,
			"qty": qty,
			"uom": uom,
			"stock_uom": uom,
			"conversion_factor": 1,
			"expense_account": expense,
			"cost_center": cost_center,
		})
	se.flags.ignore_permissions = True
	se.insert(ignore_permissions=True)
	se.submit()
	return se


def _clean_error(e):
	text = strip_html(str(e) or "").strip()
	if not text:
		messages = frappe.local.message_log or []
		text = strip_html(str(messages[-1])) if messages else e.__class__.__name__
	frappe.local.message_log = []
	return text[:1000]


# --------------------------------------------------------------------------- retry


@frappe.whitelist(methods=["POST"])
def retry(names=None, branch=None):
	"""Retry failed (or stuck) deductions now: the listed ones, or every failed one in the branch."""
	frappe.has_permission("URY Consumption Log", "write", throw=True)
	if names:
		names = frappe.parse_json(names) if isinstance(names, str) else names
	else:
		filters = {"status": ["in", ["Failed", "Pending"]]}
		if branch and branch != "all":
			filters["branch"] = branch
		names = frappe.get_all("URY Consumption Log", filters=filters, pluck="name", limit_page_length=200)
	results = {"Done": 0, "Failed": 0, "Cancelled": 0}
	for name in names:
		status = process_log(name, retry=True)
		results[status] = results.get(status, 0) + 1
	return results


def retry_failed():
	"""Scheduler: pick up deductions whose stock has since arrived, and jobs that never ran."""
	stuck = add_to_date(now_datetime(), minutes=-10)
	for name in frappe.get_all(
		"URY Consumption Log",
		filters={"status": ["in", ["Failed", "Pending"]], "attempts": ["<", MAX_AUTO_ATTEMPTS], "modified": ["<", stuck]},
		pluck="name",
		limit_page_length=100,
	):
		process_log(name, retry=True)


# --------------------------------------------------------------------------- report


@frappe.whitelist()
def get_consumption(branch=None, from_date=None, to_date=None):
	"""What recipes took off the shelves in a period, and what did not go through."""
	frappe.has_permission("URY Consumption Log", "read", throw=True)
	to_date = getdate(to_date or nowdate())
	from_date = getdate(from_date or add_to_date(to_date, days=-29))
	cond = ["log.posting_date between %(from)s and %(to)s"]
	values = {"from": from_date, "to": to_date}
	if branch and branch != "all":
		cond.append("log.branch = %(branch)s")
		values["branch"] = branch
	where = " and ".join(cond)

	status = {r.status: r for r in frappe.db.sql(
		f"""select status, count(*) as count, sum(total_cost) as cost
		from `tabURY Consumption Log` log where {where} group by status""",
		values, as_dict=True,
	)}
	ingredients = frappe.db.sql(
		f"""select item.item_code, max(item.item_name) as item_name, max(item.stock_uom) as stock_uom,
			sum(item.qty) as qty, sum(item.amount) as cost
		from `tabURY Consumption Log Item` item join `tabURY Consumption Log` log on log.name = item.parent
		where {where} and log.status = 'Done'
		group by item.item_code order by cost desc limit 50""",
		values, as_dict=True,
	)
	products = frappe.db.sql(
		f"""select item.sold_item, sum(item.amount) as cost, count(distinct log.name) as invoices
		from `tabURY Consumption Log Item` item join `tabURY Consumption Log` log on log.name = item.parent
		where {where} and log.status = 'Done'
		group by item.sold_item order by cost desc limit 50""",
		values, as_dict=True,
	)
	names = dict(frappe.get_all("Item", filters={"name": ["in", [p.sold_item for p in products]]},
								fields=["name", "item_name"], as_list=True)) if products else {}
	for p in products:
		p.item_name = names.get(p.sold_item) or p.sold_item

	problems = frappe.db.sql(
		f"""select log.name, log.pos_invoice, log.status, log.posting_date, log.error, log.attempts, log.modified
		from `tabURY Consumption Log` log
		where {where} and log.status in ('Failed', 'Pending')
		order by log.posting_date desc, log.modified desc limit 100""",
		values, as_dict=True,
	)
	return {
		"from_date": from_date,
		"to_date": to_date,
		"cost": flt((status.get("Done") or {}).get("cost")),
		"counts": {s: cint((status.get(s) or {}).get("count")) for s in ("Done", "Failed", "Pending", "Cancelled")},
		"ingredients": ingredients,
		"products": products,
		"problems": problems,
	}

