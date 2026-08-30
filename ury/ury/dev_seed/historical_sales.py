"""Permanent, rerunnable demo-data seed for historical + today's sales.

Seeds submitted `POS Invoice` docs (the real "closed sale" doctype this app's
dashboard/report queries read from — see `ury/ury/api/ury_dashboard.py` and
`ury/ury/report_api/financial.py`, both of which filter
`docstatus=1 AND status IN ('Consolidated', 'Paid')` directly on
`tabPOS Invoice`/`tabPOS Invoice Item`, NOT on `Sales Invoice`), plus a
handful of draft ("open order") POS Invoices with occupied `URY Table`
rows, plus one submitted `URY Daily P and L` per backfilled historical date.

Depends on `ury.ury.dev_seed.catalog` (items/tables/customers) and
`ury.ury.dev_seed.profiles` (POS Profile) having been run first — if they
haven't, this module looks up what it needs directly via `frappe.db`/
`frappe.get_all` and skips gracefully (with a clear printed message) rather
than hard-failing, per those modules' own "don't hard fail" precedent.

Field/mechanics conventions here are copied directly from the real order
flow rather than reinvented:

- POS Invoice required fields and item-row shape: `sync_order` /
  `price_items_for_invoice` / `_resolve_or_create_pos_invoice` in
  `ury/ury/doctype/ury_order/ury_order.py` (search that file for
  "def sync_order", "def price_items_for_invoice",
  "def _resolve_or_create_pos_invoice"). In particular: `is_pos=1`,
  `taxes_and_charges` from `URY Restaurant.default_tax_template`,
  `selling_price_list` from the branch's enabled `Price List`, item rows
  built from `Item Price` at that price list (`rate`/`price_list_rate`/
  `base_price_list_rate` all equal, plus `cost_center` from the POS
  Profile), and a "dummy payment" appended as
  `{mode_of_payment, amount=invoice.grand_total}`.
- `URY Table.occupied` is set via a plain `frappe.db.set_value("URY Table",
  table, {"occupied": 1, "latest_invoice_time": invoice.creation})` (see
  `sync_order`, ~line 1641) — not a doctype method. Draft ("open") orders in
  this module set the same flag the same way.
- Dashboard/report queries filter on `docstatus=1 AND status IN
  ("Consolidated", "Paid")` — see `get_dashboard_stats`,
  `get_shift_metrics`, `get_comparable_weekday_history` in
  `ury/ury/api/ury_dashboard.py`, and the `gross_sales`/`cogs_sold` queries
  in `ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py`. ERPNext's
  standard `POS Invoice.validate()` sets `status` to "Paid" on its own once
  `payments` covers the full `rounded_total`, so this module does not set
  `status` explicitly.
- `get_dashboard_stats`'s "today" KPIs are hardcoded to
  `posting_date = curdate()` (see `ury_dashboard.py`) — so a batch of
  invoices is seeded dated *today* in addition to the historical backfill.
- Backdating: `doc.set_posting_time = 1` before insert (Frappe otherwise
  forces `posting_date` to today), and `update_stock = 0` on every seeded
  POS Invoice to avoid backdating the stock ledger — matches the "Update
  Stock" checkbox ERPNext POS Invoice already exposes for exactly this.
- `URY Daily P and L` (`ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py`)
  is a separate, manually-submitted doctype. Its `before_submit()`:
    * requires `branch`, `date`, `electricity_opening` < `electricity_closing`
      (both mandatory `Float` fields per the doctype JSON);
    * requires at least one submitted `Attendance` row for an `Employee` of
      that `branch` on that `date` with status "Present"/"Half Day", else it
      `frappe.throw`s "Attendance not marked" — so this module seeds one
      demo `Employee` (branch-linked, custom `payment_type`/`payment_amount`
      fields set — both real custom fields on `Employee`, see
      `ury/fixtures/custom_field.json`, "Employee-payment_type" /
      "Employee-payment_amount") and a submitted `Attendance` row per
      backfilled date;
    * an `Employee` with Attendance but no `payment_type`/`payment_amount`
      set makes it throw "Set Payment Type/Amount" — the seeded Employee
      always has both set, avoiding that path;
    * `materials_consumed` rows need `material`, `units_consumed` (> 0),
      `cost_per_unit`, `amount` (`URY P and L Materials` child doctype) —
      seeded with one placeholder row per date so COGS-adjacent totals are
      non-zero;
    * it recomputes `cogs`/expenses itself from existing submitted
      `POS Invoice` rows for that branch/date, so it must run *after* that
      date's invoices are seeded and submitted.

This is a permanent module, not a throwaway script — every insert is
wrapped so one bad row (e.g. a missing Item Price) prints an error and moves
on instead of aborting the whole seed, and every date/record is guarded by
an existence check so re-running `seed()` does not duplicate data.

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.historical_sales.seed
"""

import random
from datetime import timedelta

import frappe
from frappe.utils import add_days, flt, now_datetime, nowtime, today

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

HISTORICAL_DAYS = 12          # how many past days to backfill
MIN_ORDERS_PER_DAY = 15
MAX_ORDERS_PER_DAY = 30
MIN_ITEMS_PER_ORDER = 2
MAX_ITEMS_PER_ORDER = 6
MIN_QTY = 1
MAX_QTY = 3

TODAY_ORDER_COUNT = 10        # extra submitted invoices dated today
DRAFT_ORDER_COUNT = 4         # unsubmitted "open" orders dated today

ORDER_TYPES = ["Dine In", "Takeaway"]

DEMO_EMPLOYEE_ID = "ury-dev-seed-employee"
DEMO_EMPLOYEE_EMAIL = "dev-seed-employee@ury.local"

ELECTRICITY_UNITS_PER_DAY = 40  # closing - opening, arbitrary but > 0


# ---------------------------------------------------------------------------
# Lookups (mirrors catalog.py / profiles.py conventions: reuse whatever
# already exists on this bench, only create the minimum needed to proceed)
# ---------------------------------------------------------------------------

def _get_branch_and_company():
	branch_name = frappe.db.get_value("Branch", {}, "name")
	company_name = frappe.db.get_value("Company", {}, "name")
	return branch_name, company_name


def _get_restaurant(branch_name):
	return frappe.db.get_value("URY Restaurant", {"branch": branch_name}, "name")


def _get_pos_profile(branch_name):
	pos_profile = frappe.db.get_value("POS Profile", {"branch": branch_name, "disabled": 0}, "name")
	if not pos_profile:
		pos_profile = frappe.db.get_value("POS Profile", {}, "name")
	return pos_profile


def _get_price_list():
	return frappe.db.get_value("Price List", {"selling": 1}, "name") or "Standard Selling"


def _get_tax_template(restaurant_name):
	if not restaurant_name:
		return None
	return frappe.db.get_value("URY Restaurant", restaurant_name, "default_tax_template")


def _get_tables(branch_name):
	return frappe.get_all("URY Table", filters={"branch": branch_name}, pluck="name")


def _get_items():
	return frappe.get_all(
		"Item", filters={"disabled": 0, "is_sales_item": 1}, fields=["item_code", "item_name"]
	)


def _get_item_prices(price_list):
	rows = frappe.get_all(
		"Item Price",
		filters={"price_list": price_list},
		fields=["item_code", "price_list_rate"],
	)
	return {r.item_code: flt(r.price_list_rate) for r in rows}


def _get_customers():
	return frappe.get_all("Customer", limit_page_length=50, fields=["name", "customer_name"])


def _get_mode_of_payment():
	if frappe.db.exists("Mode of Payment", "Cash"):
		return "Cash"
	return frappe.db.get_value("Mode of Payment", {}, "name")


def _get_staff_user(role):
	rows = frappe.get_all(
		"Has Role", filters={"role": role, "parenttype": "User"}, fields=["parent"]
	)
	users = sorted({r.parent for r in rows if r.parent not in ("Administrator", "Guest")})
	return users[0] if users else "Administrator"


# ---------------------------------------------------------------------------
# POS Invoice creation (shape copied from ury_order.py's sync_order /
# price_items_for_invoice / _resolve_or_create_pos_invoice)
# ---------------------------------------------------------------------------

def _pick_items(items, item_prices, count):
	priced = [i for i in items if i.item_code in item_prices]
	if not priced:
		return []
	count = min(count, len(priced))
	return random.sample(priced, count)


def _build_pos_invoice(
	*,
	branch_name,
	company_name,
	restaurant_name,
	pos_profile,
	price_list,
	tax_template,
	table,
	customer,
	cashier,
	waiter,
	order_type,
	no_of_pax,
	posting_date,
	posting_time,
	items,
	item_prices,
	currency,
):
	doc = frappe.new_doc("POS Invoice")
	doc.is_pos = 1
	doc.pos_profile = pos_profile
	doc.branch = branch_name
	doc.company = company_name
	doc.restaurant = restaurant_name
	doc.cashier = cashier
	doc.waiter = waiter
	doc.order_type = order_type
	if table:
		doc.restaurant_table = table
	doc.customer = customer.name
	doc.customer_name = customer.customer_name
	doc.selling_price_list = price_list
	if tax_template:
		doc.taxes_and_charges = tax_template
	doc.currency = currency
	doc.conversion_rate = 1
	doc.no_of_pax = no_of_pax
	doc.update_stock = 0

	# Backdating: Frappe forces posting_date to today unless this is set
	# before insert (confirmed convention: ury_order.py never backdates,
	# so this is this module's own addition per the task brief).
	doc.set_posting_time = 1
	doc.posting_date = posting_date
	doc.posting_time = posting_time

	chosen = _pick_items(items, item_prices, random.randint(MIN_ITEMS_PER_ORDER, MAX_ITEMS_PER_ORDER))
	for item in chosen:
		rate = item_prices[item.item_code]
		qty = random.randint(MIN_QTY, MAX_QTY)
		doc.append(
			"items",
			{
				"item_code": item.item_code,
				"item_name": item.item_name,
				"qty": qty,
				"rate": rate,
				"price_list_rate": rate,
				"base_price_list_rate": rate,
			},
		)

	return doc if chosen else None


def _seed_submitted_invoice(
	*, mode_of_payment, posting_date, posting_time, **build_kwargs
):
	doc = _build_pos_invoice(posting_date=posting_date, posting_time=posting_time, **build_kwargs)
	if doc is None:
		return None
	try:
		doc.insert(ignore_permissions=True)
		doc.append("payments", {"mode_of_payment": mode_of_payment, "amount": doc.rounded_total or doc.grand_total})
		doc.save(ignore_permissions=True)
		doc.submit()
		return doc.name
	except Exception as e:
		print(f"  ! Failed to seed submitted POS Invoice for {posting_date}: {e}")
		return None


def _seed_draft_invoice(**build_kwargs):
	doc = _build_pos_invoice(**build_kwargs)
	if doc is None:
		return None
	try:
		doc.insert(ignore_permissions=True)
		if doc.restaurant_table:
			frappe.db.set_value(
				"URY Table",
				doc.restaurant_table,
				{"occupied": 1, "latest_invoice_time": doc.creation},
			)
		return doc.name
	except Exception as e:
		print(f"  ! Failed to seed draft POS Invoice: {e}")
		return None


# ---------------------------------------------------------------------------
# URY Daily P and L (before_submit computes its own COGS/expenses from the
# already-submitted POS Invoices for that branch/date -- see
# ury_daily_p_and_l.py's cogs_sold()/before_submit())
# ---------------------------------------------------------------------------

def _ensure_demo_employee(branch_name):
	if frappe.db.exists("Employee", DEMO_EMPLOYEE_ID):
		return DEMO_EMPLOYEE_ID

	try:
		doc = frappe.get_doc(
			{
				"doctype": "Employee",
				"name": DEMO_EMPLOYEE_ID,
				"employee": DEMO_EMPLOYEE_ID,
				"first_name": "Dev Seed Staff",
				"gender": "Male",
				"date_of_birth": "1995-01-01",
				"date_of_joining": today(),
				"status": "Active",
				"branch": branch_name,
				"company": frappe.db.get_value("Branch", branch_name, "company") or branch_name,
				# Custom fields (ury/fixtures/custom_field.json: Employee-payment_type,
				# Employee-payment_amount) -- required by before_submit()'s
				# "Set Payment Type/Amount" check for any employee with Attendance.
				"payment_type": "Daily Wage",
				"payment_amount": 500,
			}
		)
		doc.insert(ignore_permissions=True)
		print(f"Created demo Employee for Daily P&L seeding: {doc.name}")
		return doc.name
	except Exception as e:
		print(f"  ! Failed to create demo Employee for Daily P&L seeding: {e}")
		return None


def _ensure_attendance(employee, branch_name, date):
	if frappe.db.exists("Attendance", {"employee": employee, "attendance_date": date, "docstatus": 1}):
		return True
	try:
		doc = frappe.get_doc(
			{
				"doctype": "Attendance",
				"employee": employee,
				"attendance_date": date,
				"status": "Present",
				"company": frappe.db.get_value("Branch", branch_name, "company") or branch_name,
			}
		)
		doc.insert(ignore_permissions=True)
		doc.submit()
		return True
	except Exception as e:
		print(f"  ! Failed to seed Attendance for {employee} on {date}: {e}")
		return False


def _seed_daily_pnl(branch_name, date, employee):
	if frappe.db.exists("URY Daily P and L", {"branch": branch_name, "date": date}):
		return None

	if not _ensure_attendance(employee, branch_name, date):
		print(f"  ! Skipping Daily P&L for {date}: could not seed Attendance")
		return None

	try:
		doc = frappe.get_doc(
			{
				"doctype": "URY Daily P and L",
				"branch": branch_name,
				"date": date,
				"electricity_opening": 1000,
				"electricity_closing": 1000 + ELECTRICITY_UNITS_PER_DAY,
				"materials_consumed": [
					{
						"material": "Cooking Gas",
						"units_consumed": 2,
						"cost_per_unit": 900,
						"amount": 1800,
					}
				],
			}
		)
		doc.insert(ignore_permissions=True)
		doc.submit()
		return doc.name
	except Exception as e:
		print(f"  ! Failed to seed Daily P&L for {date}: {e}")
		return None


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def seed():
	"""Idempotent entrypoint — safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.historical_sales.seed``.
	"""
	branch_name, company_name = _get_branch_and_company()
	if not branch_name or not company_name:
		print("historical_sales.seed: no Branch/Company found on this site — skipping.")
		return {"skipped": True, "reason": "no Branch/Company"}

	restaurant_name = _get_restaurant(branch_name)
	pos_profile = _get_pos_profile(branch_name)
	if not pos_profile:
		print("historical_sales.seed: no POS Profile found (run dev_seed.profiles.seed first) — skipping.")
		return {"skipped": True, "reason": "no POS Profile"}

	tables = _get_tables(branch_name)
	if not tables:
		print("historical_sales.seed: no URY Table records found for this branch (run dev_seed.catalog.seed first) — proceeding with Takeaway-only orders (no tables to assign).")

	items = _get_items()
	if not items:
		print("historical_sales.seed: no sellable Items found — skipping (run dev_seed.catalog.seed first).")
		return {"skipped": True, "reason": "no Items"}

	price_list = _get_price_list()
	item_prices = _get_item_prices(price_list)
	if not item_prices:
		print(f"historical_sales.seed: no Item Price rows found for price list '{price_list}' — skipping.")
		return {"skipped": True, "reason": "no Item Price rows"}

	customers = _get_customers()
	if not customers:
		print("historical_sales.seed: no Customer records found — skipping (run dev_seed.catalog.seed first).")
		return {"skipped": True, "reason": "no Customers"}

	tax_template = _get_tax_template(restaurant_name)
	mode_of_payment = _get_mode_of_payment()
	if not mode_of_payment:
		print("historical_sales.seed: no Mode of Payment found — skipping.")
		return {"skipped": True, "reason": "no Mode of Payment"}

	currency = frappe.db.get_value("Company", company_name, "default_currency") or "INR"
	cashier = _get_staff_user("URY Cashier")
	waiter = _get_staff_user("URY Captain")

	invoices_created = 0
	dates_seeded = []
	dates_skipped = 0

	demo_employee = _ensure_demo_employee(branch_name)
	pnl_created = 0

	# --- Historical days (oldest first, to respect posting-date ordering) ---
	for offset in range(HISTORICAL_DAYS, 0, -1):
		date = add_days(today(), -offset)

		if frappe.db.exists("POS Invoice", {"branch": branch_name, "posting_date": date, "docstatus": 1}):
			dates_skipped += 1
			continue

		order_count = random.randint(MIN_ORDERS_PER_DAY, MAX_ORDERS_PER_DAY)
		day_created = 0
		for _ in range(order_count):
			order_type = random.choice(ORDER_TYPES)
			table = random.choice(tables) if (tables and order_type == "Dine In") else None
			customer = random.choice(customers)
			posting_time = f"{random.randint(11, 22):02d}:{random.randint(0, 59):02d}:00"

			name = _seed_submitted_invoice(
				branch_name=branch_name,
				company_name=company_name,
				restaurant_name=restaurant_name,
				pos_profile=pos_profile,
				price_list=price_list,
				tax_template=tax_template,
				table=table,
				customer=customer,
				cashier=cashier,
				waiter=waiter,
				order_type=order_type,
				no_of_pax=random.randint(1, 6),
				posting_date=date,
				posting_time=posting_time,
				items=items,
				item_prices=item_prices,
				currency=currency,
				mode_of_payment=mode_of_payment,
			)
			if name:
				day_created += 1

		if day_created:
			invoices_created += day_created
			dates_seeded.append(str(date))
			print(f"Seeded {day_created} POS Invoice(s) for {date}")

		if demo_employee:
			if _seed_daily_pnl(branch_name, date, demo_employee):
				pnl_created += 1
				print(f"Seeded URY Daily P and L for {date}")

	# --- Today's submitted invoices (get_dashboard_stats' "today" KPIs) ---
	today_date = today()
	existing_today = frappe.db.count(
		"POS Invoice", {"branch": branch_name, "posting_date": today_date, "docstatus": 1}
	)
	today_created = 0
	if existing_today < TODAY_ORDER_COUNT:
		to_create = TODAY_ORDER_COUNT - existing_today
		for _ in range(to_create):
			order_type = random.choice(ORDER_TYPES)
			table = random.choice(tables) if (tables and order_type == "Dine In") else None
			customer = random.choice(customers)
			name = _seed_submitted_invoice(
				branch_name=branch_name,
				company_name=company_name,
				restaurant_name=restaurant_name,
				pos_profile=pos_profile,
				price_list=price_list,
				tax_template=tax_template,
				table=table,
				customer=customer,
				cashier=cashier,
				waiter=waiter,
				order_type=order_type,
				no_of_pax=random.randint(1, 6),
				posting_date=today_date,
				posting_time=nowtime(),
				items=items,
				item_prices=item_prices,
				currency=currency,
				mode_of_payment=mode_of_payment,
			)
			if name:
				today_created += 1
		if today_created:
			print(f"Seeded {today_created} POS Invoice(s) dated today ({today_date})")
	else:
		print(f"historical_sales.seed: today already has {existing_today} submitted invoice(s) — skipping today's batch.")

	# --- Draft ("open") orders for the Service Board ---
	draft_created = 0
	if tables:
		free_tables = [t for t in tables if not frappe.db.get_value("URY Table", t, "occupied")]
		existing_drafts = frappe.db.count(
			"POS Invoice", {"branch": branch_name, "posting_date": today_date, "docstatus": 0}
		)
		if existing_drafts < DRAFT_ORDER_COUNT and free_tables:
			to_create = min(DRAFT_ORDER_COUNT - existing_drafts, len(free_tables))
			chosen_tables = random.sample(free_tables, to_create)
			for table in chosen_tables:
				customer = random.choice(customers)
				name = _seed_draft_invoice(
					branch_name=branch_name,
					company_name=company_name,
					restaurant_name=restaurant_name,
					pos_profile=pos_profile,
					price_list=price_list,
					tax_template=tax_template,
					table=table,
					customer=customer,
					cashier=cashier,
					waiter=waiter,
					order_type="Dine In",
					no_of_pax=random.randint(1, 4),
					posting_date=today_date,
					posting_time=nowtime(),
					items=items,
					item_prices=item_prices,
					currency=currency,
				)
				if name:
					draft_created += 1
			if draft_created:
				print(f"Seeded {draft_created} draft (open) POS Invoice(s) and marked their tables occupied")
		elif not free_tables:
			print("historical_sales.seed: no free tables available for draft/open orders — skipping.")
	else:
		print("historical_sales.seed: no tables available — skipping draft/open orders.")

	frappe.db.commit()

	summary = {
		"branch": branch_name,
		"historical_days_seeded": len(dates_seeded),
		"historical_days_skipped_existing": dates_skipped,
		"historical_invoices_created": invoices_created,
		"today_invoices_created": today_created,
		"draft_invoices_created": draft_created,
		"daily_pnl_created": pnl_created,
	}
	print(f"historical_sales seed complete: {summary}")
	return summary


# Backwards-compatible alias matching the ``run()`` convention used by
# ury/ury/api/seed_v3_demo.py and this package's other modules.
run = seed
