"""On-demand seed of one day's sales for URY Brief (and the dashboards).

Reuses the invoice builders in ``historical_sales`` so the data has the same
shape as the permanent demo seed, but targets exactly one date and any/all
branches, so you can ask for "yesterday", "today" or "2026-10-30".

    bench --site SITE execute ury.ury.dev_seed.day_seed.seed_day
    bench --site SITE execute ury.ury.dev_seed.day_seed.seed_day --kwargs "{'date': 'yesterday'}"
    bench --site SITE execute ury.ury.dev_seed.day_seed.seed_day \
        --kwargs "{'date': '2026-10-30', 'branch': 'Airport Branch', 'orders': 60, 'replace': True}"

Args:
    date     'today' (default), 'yesterday', 'N days ago' style ints (-2) or YYYY-MM-DD.
    branch   one Branch name, or None for every Branch with a URY Restaurant.
    orders   invoices per branch (default 35-70 random, weekends +30%).
    replace  cancel+delete that day's existing submitted POS Invoices for the
             branch first; otherwise a day that already has invoices is skipped.
"""

import random

import frappe
from frappe.utils import add_days, flt, getdate, nowtime, today

from ury.ury.dev_seed import historical_sales as hs


def _resolve_date(value):
	if value in (None, "", "today"):
		return str(getdate(today()))
	if value == "yesterday":
		return str(getdate(add_days(today(), -1)))
	if isinstance(value, int) or str(value).lstrip("-").isdigit():
		n = int(value)
		return str(getdate(add_days(today(), n if n <= 0 else -n)))
	return str(getdate(value))


def _branches(branch):
	if branch:
		return [branch]
	return frappe.get_all("URY Restaurant", pluck="branch", distinct=True)


def _clear_day(branch, date):
	names = frappe.get_all(
		"POS Invoice", filters={"branch": branch, "posting_date": date}, pluck="name"
	)
	for name in names:
		doc = frappe.get_doc("POS Invoice", name)
		if doc.docstatus == 1:
			doc.cancel()
		frappe.delete_doc("POS Invoice", name, force=True, ignore_permissions=True)
	return len(names)


def seed_day(date=None, branch=None, orders=None, replace=False):
	date = _resolve_date(date)
	is_today = date == str(getdate(today()))
	out = {}
	for branch_name in _branches(branch):
		company = frappe.db.get_value("Branch", branch_name, "company") or frappe.db.get_value(
			"Company", {}, "name"
		)
		restaurant = hs._get_restaurant(branch_name)
		profile = hs._get_pos_profile(branch_name)
		if not (restaurant and profile):
			out[branch_name] = "skipped: no restaurant/POS profile"
			continue
		company = frappe.db.get_value("POS Profile", profile, "company") or company

		# ERPNext only accepts POS invoices while the profile's open POS Opening
		# Entry started today, so roll a stale demo entry forward.
		opening = frappe.db.get_value(
			"POS Opening Entry", {"pos_profile": profile, "status": "Open", "docstatus": 1}, ["name", "period_start_date"], as_dict=True
		)
		if opening and str(getdate(opening.period_start_date)) != today():
			frappe.db.set_value("POS Opening Entry", opening.name, "period_start_date", f"{today()} 06:00:00")

		cleared = 0
		if replace:
			cleared = _clear_day(branch_name, date)
		elif frappe.db.exists(
			"POS Invoice", {"branch": branch_name, "posting_date": date, "docstatus": 1}
		):
			out[branch_name] = "skipped: day already seeded (pass replace=True)"
			continue

		tables = hs._get_tables(branch_name)
		items = hs._get_items()
		price_list = hs._get_price_list()
		prices = hs._get_item_prices(price_list)
		customers = hs._get_customers()
		mop = hs._get_mode_of_payment()
		if not (items and prices and customers and mop):
			out[branch_name] = "skipped: catalog incomplete (run dev_seed.catalog.seed)"
			continue
		tax = hs._get_tax_template(restaurant)
		currency = frappe.db.get_value("Company", company, "default_currency") or "INR"
		cashiers = hs._ensure_min_staff("URY Cashier", hs.MIN_STAFF_PER_ROLE, "cashier") or ["Administrator"]
		waiters = hs._ensure_min_staff("URY Captain", hs.MIN_STAFF_PER_ROLE, "waiter") or ["Administrator"]
		repeat, one_time = hs._split_customer_pools(customers)

		count = orders or random.randint(35, 70)
		if not orders and getdate(date).weekday() >= 5:
			count = round(count * 1.3)

		made = cancelled = 0
		for _ in range(count):
			order_type = random.choice(hs.ORDER_TYPES)
			name = hs._seed_submitted_invoice(
				branch_name=branch_name,
				company_name=company,
				restaurant_name=restaurant,
				pos_profile=profile,
				price_list=price_list,
				tax_template=tax,
				table=random.choice(tables) if (tables and order_type == "Dine In") else None,
				customer=hs._pick_customer(repeat, one_time),
				cashier=hs._weighted_pick(cashiers, hs.STAFF_WEIGHTS),
				waiter=hs._weighted_pick(waiters, hs.STAFF_WEIGHTS),
				order_type=order_type,
				no_of_pax=random.randint(1, 6),
				posting_date=date,
				# today's rows must not be in the future
				posting_time=nowtime() if is_today and random.random() < 0.2 else hs._pick_posting_time(),
				items=items,
				item_prices=prices,
				currency=currency,
				mode_of_payment=mop,
			)
			if name:
				made += 1
				if random.random() < hs.CANCEL_RATE and hs._maybe_cancel_invoice(name):
					cancelled += 1

		employee = hs._ensure_demo_employee(branch_name)
		if employee:
			hs._ensure_attendance(employee, branch_name, date)
		pnl = bool(employee and hs._seed_daily_pnl(branch_name, date, employee))
		out[branch_name] = {
			"date": date, "invoices": made, "cancelled": cancelled,
			"replaced": cleared, "daily_pnl": pnl,
		}
	frappe.db.commit()
	print(out)
	return out
