"""Demo seed: 21 days of fully-populated, submitted ``URY Daily P and L``.

Run (from the bench, site context)::

    bench --site <site> execute <dotted.path>.pnl_demo.seed
    # or from a console / import: pnl_demo.seed(branch="My Branch")

Grounded in ``ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py``:

* ``before_submit()`` itself computes gross/net sales, tax, COGS and all the
  ``*_breakup`` tables from (a) submitted POS Invoices of the day and
  (b) the branch's ``URY Report Settings`` (name == branch).  So this module
  only provides *inputs*: Report Settings expense config, buying prices
  (``Item Price`` on ``Report Settings.buying_price_list``, which drive COGS),
  electricity readings, ``materials_consumed`` rows (gas / charcoal /
  packaging -> "direct_expenses_breakup"), and -- when the ``Attendance``
  table exists (hrms) -- Employees + submitted Attendance so the employee-cost
  block does not throw "No Attendance !".
* Fixed vs variable lines:
    - ``monthly_fixed_expenses``  (amount / days-in-month per day): Rent, Water,
      Maintenance, Internet & POS Software, Pest Control
    - ``indirect_fixed_expenses`` (flat per day): Staff Food Charges
    - ``employee_costs``          (flat per day): Kitchen / Service Staff Salaries
    - ``percentage_expenses``     (% of gross/net sales): Marketing, Aggregator
      Commission
    - ``electricity_charges`` (Rs/unit) x (closing - opening) meter readings
    - ``materials_consumed`` (per day, scaled with that day's sales): Gas (LPG),
      Charcoal, Packaging  (names must match ``Report Settings.consumables``)

Idempotent; per-day try/except + commit; prints a summary.
"""

import calendar
import hashlib

import frappe
from frappe.utils import add_days, flt, getdate, today

NUM_DAYS = 21
PRICE_LIST = "Demo Buying Prices"
CURRENCY = "INR"

# --- cost structure, as a share of average daily net sales ("A") -----------
RENT_PCT_OF_MONTHLY_SALES = 0.10
WATER_PCT_OF_MONTHLY_SALES = 0.008
MAINT_PCT_OF_MONTHLY_SALES = 0.02
STAFF_COST_PCT = 0.18          # total of Salary Cost Gross + kitchen + service
STAFF_FOOD_PCT = 0.012
MARKETING_PCT = 3.0            # percent of Gross Sales
AGGREGATOR_PCT = 5.0           # blended (not every order is aggregator)
GAS_PCT = 0.032                # of that day's net sales
CHARCOAL_PCT = 0.024
ELECTRICITY_PCT = 0.025
COGS_RATIO_RANGE = (0.28, 0.36)  # buying price / selling price, per item

ELECTRICITY_RATE = 9.0         # Rs per unit
GAS_COST_PER_CYLINDER = 1950.0  # 19 kg commercial LPG
CHARCOAL_COST_PER_KG = 70.0
PACKAGING_COST_PER_PIECE = 6.0
PACKAGING_PIECES_PER_INVOICE = 2.6
METER_START = 18250.0
FALLBACK_AVG_NET_SALES = 30000.0

MATERIAL_GAS = "Gas (LPG)"
MATERIAL_CHARCOAL = "Charcoal"
MATERIAL_PACKAGING = "Packaging"

DEMO_EMPLOYEES = [
	# (first, last, payment_type, payment_amount)
	("Ramesh", "Kumar", "Daily Wage", 650),
	("Anil", "Das", "Daily Wage", 600),
	("Meera", "Nair", "Salary", 22000),
	("Joseph", "Thomas", "Salary", 28000),
]

REQUIRED_DIRECT = [MATERIAL_GAS, MATERIAL_CHARCOAL, MATERIAL_PACKAGING]
REQUIRED_EMPLOYEE = ["Salary Cost Gross", "Kitchen Staff Salaries", "Service Staff Salaries"]
REQUIRED_INDIRECT = ["Electricity", "Rent", "Water", "Maintenance", "Marketing"]

# Every expense name this module manages in Report Settings.  Rows with these
# names (case-insensitive) are removed from the *wrong* tables (e.g. legacy
# operations.py seeded "Rent" 45000/day as a *direct fixed* row).
MANAGED_NAMES = {
	"rent", "gas", "water", "maintenance", "marketing", "aggregator commission",
	"kitchen staff salaries", "service staff salaries", "staff food charges",
	"internet & pos software", "pest control",
}


def _r(x, step=1):
	return round(flt(x) / step) * step


# ---------------------------------------------------------------------------
# lookups
# ---------------------------------------------------------------------------

def _company(branch):
	return (
		frappe.db.get_value("Branch", branch, "company")
		or frappe.db.get_value("Company", {}, "name")
	)


def _invoice_stats(branch, start, end):
	rows = frappe.db.sql(
		"""
		SELECT posting_date AS d, COUNT(name) AS n, SUM(net_total) AS net
		FROM `tabPOS Invoice`
		WHERE branch = %(b)s AND docstatus = 1 AND status IN ('Paid', 'Consolidated')
			AND posting_date BETWEEN %(s)s AND %(e)s
		GROUP BY posting_date
		""",
		{"b": branch, "s": start, "e": end},
		as_dict=True,
	)
	return {str(r.d): (int(r.n or 0), flt(r.net)) for r in rows}


def _sold_item_rates(branch, start, end):
	return frappe.db.sql(
		"""
		SELECT i.item_code AS item_code, AVG(i.rate) AS rate
		FROM `tabPOS Invoice Item` i
		JOIN `tabPOS Invoice` p ON p.name = i.parent
		WHERE p.branch = %(b)s AND p.docstatus = 1
			AND p.status IN ('Paid', 'Consolidated')
			AND p.posting_date BETWEEN %(s)s AND %(e)s
			AND i.rate > 0
		GROUP BY i.item_code
		""",
		{"b": branch, "s": start, "e": end},
		as_dict=True,
	)


# ---------------------------------------------------------------------------
# buying prices (drive COGS)
# ---------------------------------------------------------------------------

def _ensure_price_list():
	if not frappe.db.exists("Price List", PRICE_LIST):
		frappe.get_doc(
			{
				"doctype": "Price List",
				"price_list_name": PRICE_LIST,
				"currency": CURRENCY,
				"enabled": 1,
				"buying": 1,
				"selling": 0,
			}
		).insert(ignore_permissions=True)
	return PRICE_LIST


def _set_item_price(item_code, cost):
	cost = round(max(flt(cost), 0.5), 2)
	existing = frappe.db.get_value(
		"Item Price", {"item_code": item_code, "price_list": PRICE_LIST}, ["name", "price_list_rate"], as_dict=True
	)
	if existing:
		if abs(flt(existing.price_list_rate) - cost) > 0.01:
			frappe.db.set_value("Item Price", existing.name, "price_list_rate", cost)
		return
	frappe.get_doc(
		{
			"doctype": "Item Price",
			"item_code": item_code,
			"price_list": PRICE_LIST,
			"price_list_rate": cost,
			"currency": CURRENCY,
		}
	).insert(ignore_permissions=True)


def _ensure_item_cost(item_code, unit_cost, depth=0, seen=None):
	"""Make the controller's costing yield ~``unit_cost`` per unit of item_code:
	plain item -> Item Price; Product Bundle -> price sub-items; default BOM
	-> price components (controller costs BOM items from Item Price)."""
	seen = seen or set()
	if item_code in seen or depth > 3:
		return
	seen = seen | {item_code}

	bundle = frappe.db.get_value("Product Bundle", {"new_item_code": item_code}, "name")
	if bundle:
		subs = frappe.get_all("Product Bundle Item", filters={"parent": bundle}, fields=["item_code", "qty"])
		total_qty = sum(flt(s.qty) or 1 for s in subs) or 1
		for s in subs:
			_ensure_item_cost(s.item_code, unit_cost / total_qty, depth + 1, seen)
		return

	bom = frappe.db.get_value(
		"BOM", {"item": item_code, "is_active": 1, "is_default": 1, "docstatus": 1}, ["name", "quantity"], as_dict=True
	)
	if bom:
		comps = frappe.get_all("BOM Item", filters={"parent": bom.name}, fields=["item_code", "qty"])
		total_qty = sum(flt(c.qty) or 1 for c in comps) or 1
		per_comp = unit_cost * (flt(bom.quantity) or 1) / total_qty
		for c in comps:
			_ensure_item_cost(c.item_code, per_comp, depth + 1, seen)
		return

	_set_item_price(item_code, unit_cost)


def _ratio(item_code):
	lo, hi = COGS_RATIO_RANGE
	h = int(hashlib.md5(item_code.encode()).hexdigest()[:6], 16) / 0xFFFFFF
	return lo + (hi - lo) * h


def _ensure_buying_prices(branch, start, end):
	_ensure_price_list()
	n = 0
	for r in _sold_item_rates(branch, start, end):
		try:
			_ensure_item_cost(r.item_code, flt(r.rate) * _ratio(r.item_code))
			n += 1
		except Exception as e:
			print(f"  ! buying price for {r.item_code} failed: {e}")
	frappe.db.commit()
	return n


# ---------------------------------------------------------------------------
# URY Report Settings (expense configuration)
# ---------------------------------------------------------------------------

def _upsert_row(settings, table, name, field, target, extra=None):
	"""Ensure exactly one row ``name`` lives in ``table`` and nowhere else
	(among the managed tables); keep an existing amount if it is sane."""
	all_tables = [
		"direct_fixed_expenses", "indirect_fixed_expenses", "employee_costs",
		"monthly_fixed_expenses", "percentage_expenses",
	]
	keep_value = None
	for t in all_tables:
		for row in list(settings.get(t) or []):
			if (row.expense or "").strip().lower() != name.lower():
				continue
			if t == table and keep_value is None:
				cur = flt(row.get(field))
				if target * 0.2 <= cur <= target * 5:
					keep_value = cur
				else:
					row.set(field, target)
					keep_value = cur = target
				if extra:
					for k, v in extra.items():
						row.set(k, v)
			else:
				settings.remove(row)
	if keep_value is None:
		row = {"expense": name, field: target}
		row.update(extra or {})
		settings.append(table, row)


def _ensure_report_settings(branch, avg_net):
	"""Create/normalise Report Settings so the controller's own fetch logic
	emits every required expense line.  Returns the doc."""
	A = avg_net
	price_list = _ensure_price_list()
	if frappe.db.exists("URY Report Settings", branch):
		s = frappe.get_doc("URY Report Settings", branch)
	else:
		s = frappe.get_doc(
			{
				"doctype": "URY Report Settings",
				"branch": branch,
				"extended_hours": 1,
				"hours": 4,
				"buying_price_list": price_list,
			}
		)
	s.buying_price_list = price_list
	if s.extended_hours and not s.hours:
		s.hours = 4
	if not flt(s.depreciation) or flt(s.depreciation) > A * 0.05:
		s.depreciation = _r(A * 0.008, 5)  # per-day charge
	cur_rate = flt(s.electricity_charges)
	if not (ELECTRICITY_RATE * 0.2 <= cur_rate <= ELECTRICITY_RATE * 5):
		s.electricity_charges = ELECTRICITY_RATE

	# employee-derived salary share (so total staff cost ~STAFF_COST_PCT)
	emp_daily = sum(a / 30.0 if t == "Salary" else a for _f, _l, t, a in DEMO_EMPLOYEES)
	staff_rest = max(A * STAFF_COST_PCT - emp_daily, 800.0)

	_upsert_row(s, "monthly_fixed_expenses", "Rent", "amount", _r(A * 30 * RENT_PCT_OF_MONTHLY_SALES, 1000))
	_upsert_row(s, "monthly_fixed_expenses", "Water", "amount", _r(A * 30 * WATER_PCT_OF_MONTHLY_SALES, 100))
	_upsert_row(s, "monthly_fixed_expenses", "Maintenance", "amount", _r(A * 30 * MAINT_PCT_OF_MONTHLY_SALES, 500))
	_upsert_row(s, "monthly_fixed_expenses", "Internet & POS Software", "amount", 3500)
	_upsert_row(s, "monthly_fixed_expenses", "Pest Control", "amount", 1500)
	_upsert_row(s, "indirect_fixed_expenses", "Staff Food Charges", "amount", _r(A * STAFF_FOOD_PCT, 50))
	_upsert_row(s, "employee_costs", "Kitchen Staff Salaries", "amount", _r(staff_rest * 0.6, 50))
	_upsert_row(s, "employee_costs", "Service Staff Salaries", "amount", _r(staff_rest * 0.4, 50))
	_upsert_row(s, "percentage_expenses", "Marketing", "percent", MARKETING_PCT,
		{"percentage_type": "Gross Sales"})
	_upsert_row(s, "percentage_expenses", "Aggregator Commission", "percent", AGGREGATOR_PCT,
		{"percentage_type": "Gross Sales"})

	have = {(c.material or "").lower(): c for c in (s.consumables or [])}
	for mat, cost in (
		(MATERIAL_GAS, GAS_COST_PER_CYLINDER),
		(MATERIAL_CHARCOAL, CHARCOAL_COST_PER_KG),
		(MATERIAL_PACKAGING, PACKAGING_COST_PER_PIECE),
	):
		if mat.lower() not in have:
			s.append("consumables", {"material": mat, "cost_per_unit": cost})

	if s.is_new():
		s.insert(ignore_permissions=True)
	else:
		s.save(ignore_permissions=True)
	frappe.db.commit()
	return s


# ---------------------------------------------------------------------------
# Employees + Attendance (only needed when the Attendance table exists)
# ---------------------------------------------------------------------------

def _ensure_employees(branch, company, earliest):
	names = []
	joining = add_days(earliest, -30)
	for first, last, ptype, amt in DEMO_EMPLOYEES:
		full = f"{first} {last}"
		emp = frappe.db.get_value("Employee", {"employee_name": full}, "name")
		if not emp:
			doc = frappe.get_doc(
				{
					"doctype": "Employee",
					"first_name": first,
					"last_name": last,
					"gender": "Male" if first != "Meera" else "Female",
					"date_of_birth": "1992-04-12",
					"date_of_joining": joining,
					"status": "Active",
					"company": company,
					"branch": branch,
					"payment_type": ptype,
					"payment_amount": amt,
				}
			)
			doc.insert(ignore_permissions=True)
			emp = doc.name
		else:
			upd = {}
			cur = frappe.db.get_value(
				"Employee", emp, ["branch", "payment_type", "payment_amount", "date_of_joining"], as_dict=True
			)
			if cur.branch != branch:
				upd["branch"] = branch
			if cur.payment_type != ptype:
				upd["payment_type"] = ptype
			if not flt(cur.payment_amount):
				upd["payment_amount"] = amt
			if not cur.date_of_joining or getdate(cur.date_of_joining) > getdate(joining):
				upd["date_of_joining"] = joining
			if upd:
				frappe.db.set_value("Employee", emp, upd)
		names.append((emp, ptype))
	frappe.db.commit()
	return names


def _ensure_attendance(employees, company, date, day_idx):
	"""Daily-wage staff rotate a weekly off; salaried staff always present.
	Guarantees >=1 Present record (controller throws on zero)."""
	for i, (emp, ptype) in enumerate(employees):
		if ptype == "Daily Wage" and (day_idx + i) % 7 == 0:
			continue
		if frappe.db.exists("Attendance", {"employee": emp, "attendance_date": date, "docstatus": ["!=", 2]}):
			continue
		doc = frappe.get_doc(
			{
				"doctype": "Attendance",
				"employee": emp,
				"attendance_date": date,
				"status": "Present",
				"company": company,
			}
		)
		doc.insert(ignore_permissions=True)
		doc.submit()


# ---------------------------------------------------------------------------
# Daily P&L
# ---------------------------------------------------------------------------

def _existing(branch, date):
	rows = frappe.get_all(
		"URY Daily P and L",
		filters={"branch": branch, "date": date, "docstatus": ["!=", 2]},
		fields=["name", "docstatus"],
		order_by="creation desc",
	)
	return rows[0] if rows else None


def _labels(doc, table):
	return {(r.breakup or "").strip().lower() for r in (doc.get(table) or [])}


def _is_complete(doc):
	"""All required expense lines present and the numbers are populated and sane."""
	for table, req in (
		("direct_expenses_breakup", REQUIRED_DIRECT),
		("employee_costs_breakup", REQUIRED_EMPLOYEE),
		("indirect_expenses_breakup", REQUIRED_INDIRECT),
	):
		have = _labels(doc, table)
		if any(x.lower() not in have for x in req):
			return False
	if flt(doc.net_sales) > 0:
		if flt(doc.cogs) <= 0:
			return False
		if flt(doc.net_profit_percent) < -25:  # absurd legacy config (e.g. Rs 45k/day rent)
			return False
	return True


def _inputs(settings, date, day_idx, n_inv, net_d, meter, avg_net):
	base_net = net_d if net_d > 0 else avg_net
	elec_units = max(20, round(base_net * ELECTRICITY_PCT / flt(settings.electricity_charges or ELECTRICITY_RATE)))
	cost = {c.material.lower(): flt(c.cost_per_unit) for c in settings.consumables}
	gas_c = cost.get(MATERIAL_GAS.lower(), GAS_COST_PER_CYLINDER)
	chr_c = cost.get(MATERIAL_CHARCOAL.lower(), CHARCOAL_COST_PER_KG)
	pkg_c = cost.get(MATERIAL_PACKAGING.lower(), PACKAGING_COST_PER_PIECE)

	gas_u = max(0.1, round(base_net * GAS_PCT / gas_c, 2))
	chr_u = max(1.0, _r(base_net * CHARCOAL_PCT / chr_c, 0.5))
	pkg_u = max(10, round((n_inv or 12) * PACKAGING_PIECES_PER_INVOICE))
	mats = [
		{"material": MATERIAL_GAS, "cost_per_unit": gas_c, "units_consumed": gas_u, "amount": round(gas_u * gas_c, 2)},
		{"material": MATERIAL_CHARCOAL, "cost_per_unit": chr_c, "units_consumed": chr_u, "amount": round(chr_u * chr_c, 2)},
		{"material": MATERIAL_PACKAGING, "cost_per_unit": pkg_c, "units_consumed": pkg_u, "amount": round(pkg_u * pkg_c, 2)},
	]
	return {
		"electricity_opening": meter,
		"electricity_closing": meter + elec_units,
		"materials_consumed": mats,
	}


def _build_and_submit(branch, date, inputs, doc=None, amended_from=None):
	if doc is None:
		doc = frappe.get_doc({"doctype": "URY Daily P and L", "branch": branch, "date": str(date)})
		if amended_from:
			doc.amended_from = amended_from
	doc.date = str(date)  # before_submit() uses datetime.strptime on a str
	doc.electricity_opening = inputs["electricity_opening"]
	doc.electricity_closing = inputs["electricity_closing"]
	doc.materials_consumed = []
	for m in inputs["materials_consumed"]:
		doc.append("materials_consumed", dict(m))
	doc.save(ignore_permissions=True)
	doc.submit()
	return doc


def _process_day(branch, company, settings, employees, date, day_idx, stats, meter, avg_net):
	"""Returns (status, new_meter)."""
	n_inv, net_d = stats.get(str(date), (0, 0.0))
	inputs = _inputs(settings, date, day_idx, n_inv, net_d, meter, avg_net)
	new_meter = inputs["electricity_closing"]

	if employees is not None:
		_ensure_attendance(employees, company, date, day_idx)

	ex = _existing(branch, date)
	if ex is None:
		_build_and_submit(branch, date, inputs)
		return "created", new_meter

	doc = frappe.get_doc("URY Daily P and L", ex.name)
	if doc.docstatus == 0:
		_build_and_submit(branch, date, inputs, doc=doc)
		return "filled-draft", new_meter

	if _is_complete(doc):
		return "ok-existing", max(meter, flt(doc.electricity_closing))

	# submitted but incomplete: cancel + amend only if nothing was already amended from it
	if frappe.db.exists("URY Daily P and L", {"amended_from": doc.name}):
		print(f"  ~ {date}: {doc.name} incomplete but already amended -- skipped")
		return "skipped-amended", meter
	try:
		doc.cancel()
	except Exception as e:
		print(f"  ~ {date}: cannot cancel {doc.name} ({e}) -- skipped")
		frappe.db.rollback()
		return "skipped-uncancellable", meter
	_build_and_submit(branch, date, inputs, amended_from=doc.name)
	return "amended", new_meter


def seed(branch=None):
	branch = branch or frappe.db.get_value("Branch", {}, "name")
	if not branch:
		print("pnl_demo.seed: no Branch found -- aborting.")
		return {"skipped": True, "reason": "no Branch"}
	company = _company(branch)

	end = getdate(add_days(today(), -1))
	start = getdate(add_days(end, -(NUM_DAYS - 1)))
	days = [getdate(add_days(start, i)) for i in range(NUM_DAYS)]

	stats = _invoice_stats(branch, start, end)
	nets = [v[1] for v in stats.values() if v[1] > 0]
	avg_net = (sum(nets) / len(nets)) if nets else FALLBACK_AVG_NET_SALES
	print(
		f"pnl_demo: branch={branch} {start}..{end} invoice-days={len(nets)} avg_net/day={avg_net:,.0f}"
		+ ("" if nets else " (no POS invoices: using fallback; revenue/COGS will be 0)")
	)

	summary = {}
	try:
		settings = _ensure_report_settings(branch, avg_net)
		n_priced = _ensure_buying_prices(branch, start, end)
		print(f"pnl_demo: report settings ok; buying prices ensured for {n_priced} sold items")
	except Exception as e:
		frappe.db.rollback()
		print(f"pnl_demo: FATAL masters setup failed: {e}")
		return {"error": str(e)}

	employees = None
	if frappe.db.table_exists("Attendance", cached=False):
		try:
			employees = _ensure_employees(branch, company, start)
		except Exception as e:
			frappe.db.rollback()
			print(f"pnl_demo: employee setup failed ({e}); P&L may fail on attendance")

	meter = METER_START
	for idx, d in enumerate(days):
		try:
			status, meter = _process_day(branch, company, settings, employees, d, idx, stats, meter, avg_net)
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			status = "error"
			print(f"  ! {d}: {type(e).__name__}: {e}")
		summary[status] = summary.get(status, 0) + 1
		if status != "error":
			print(f"  {d}: {status}")

	print(f"pnl_demo summary: {summary}")
	return summary
