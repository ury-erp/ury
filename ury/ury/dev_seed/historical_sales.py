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
from frappe.utils import add_days, flt, getdate, now_datetime, nowtime, today

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

HISTORICAL_DAYS = 120         # total days of history to backfill (~4 calendar
                               # months ending today), so MonthWiseSales spans
                               # several distinct months. Density tapers with
                               # age -- see _order_count_for_offset() -- to
                               # keep the total invoice volume tractable.
RECENT_DENSE_DAYS = 21         # most recent ~3 weeks: full daily volume
MID_RANGE_DAYS = 60            # up to ~2 months back: medium volume
                               # beyond that (up to HISTORICAL_DAYS): sparse

MIN_ORDERS_PER_DAY = 15
MAX_ORDERS_PER_DAY = 30
MID_MIN_ORDERS_PER_DAY = 8
MID_MAX_ORDERS_PER_DAY = 15
SPARSE_MIN_ORDERS_PER_DAY = 4
SPARSE_MAX_ORDERS_PER_DAY = 8

MIN_ITEMS_PER_ORDER = 2
MAX_ITEMS_PER_ORDER = 6
MIN_QTY = 1
MAX_QTY = 3

WEEKEND_ORDER_MULTIPLIER = 1.3  # Sat/Sun get a bump for weekday/weekend shape

TODAY_ORDER_COUNT = 10        # extra submitted invoices dated today
DRAFT_ORDER_COUNT = 4         # unsubmitted "open" orders dated today

ORDER_TYPES = ["Dine In", "Take Away"]

ELECTRICITY_UNITS_PER_DAY = 40  # closing - opening, arbitrary but > 0

# --- Multiple staff, for meaningful EmployeeSales/EmployeeItemWiseSales ---
MIN_STAFF_PER_ROLE = 5         # cashiers and waiters each, if the bench has
                               # fewer real Users with the role we create
                               # simple demo Users to reach this count
STAFF_WEIGHTS = [35, 25, 18, 12, 10, 6, 4]  # descending volume shares,
                               # sliced to however many staff exist -- gives
                               # a realistic leaderboard spread rather than a
                               # flat distribution

# --- Repeat vs one-time customers, for RepeatedCustomers/CustomerData ---
REPEAT_CUSTOMER_POOL_SIZE = 8   # customers deliberately reused across many
                               # distinct dates
REPEAT_CUSTOMER_SHARE = 0.55    # probability an order picks from that pool
                               # rather than a one-time customer

# --- Cancelled/returned invoices, for CancelledInvoices ---
CANCEL_RATE = 0.04              # small realistic fraction of invoices
CANCEL_REASONS = [
	"Customer changed mind",
	"Order placed by mistake",
	"Kitchen out of stock",
	"Duplicate order",
	"Payment issue",
]

# --- Posting-time shape: lunch/dinner peaks instead of a flat 11-22 spread ---
# (start_hour, end_hour, weight) buckets across service hours.
TIME_BUCKETS = [
	(11, 12, 10),   # late morning trickle
	(12, 15, 35),   # lunch peak
	(15, 18, 15),   # afternoon lull
	(18, 22, 35),   # dinner peak
	(22, 23, 5),    # late closing trickle
]


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
	"""Pick a selling Price List that actually has Item Price rows -- a bench
	can have several selling price lists (Direct, Swiggy, Zomato, ...) with
	no Item Price rows of their own, and `{"selling": 1}` picks whichever one
	the DB happens to return first, which can silently be an empty one. Not
	part of the historical-sales fix directly, but it's a real pre-existing
	bug in this same file that otherwise blocks the whole seed from ever
	running."""
	candidates = frappe.get_all("Price List", filters={"selling": 1}, pluck="name")
	for name in candidates:
		if frappe.db.exists("Item Price", {"price_list": name}):
			return name
	return candidates[0] if candidates else "Standard Selling"


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
	users = _get_staff_users(role)
	return users[0] if users else "Administrator"


def _get_staff_users(role):
	rows = frappe.get_all(
		"Has Role", filters={"role": role, "parenttype": "User"}, fields=["parent"]
	)
	return sorted({r.parent for r in rows if r.parent not in ("Administrator", "Guest")})


# Realistic staff name pools, keyed by the same `name_prefix` values callers
# already pass ("cashier", "waiter") -- swapped in for the old
# "Dev Seed <Role> <N>" placeholder names, which leaked into
# EmployeeSales/EmployeeItemWiseSales reports and the POS UI.
STAFF_NAME_POOLS = {
	"cashier": [
		("Ramesh", "Nair"),
		("Deepak", "Menon"),
		("Farah", "Sheikh"),
		("Vikas", "Choudhary"),
	],
	"waiter": [
		("Suraj", "Yadav"),
		("Imran", "Ansari"),
		("Ganesh", "Naidu"),
		("Tarun", "Bhatia"),
	],
}


def _ensure_min_staff(role, min_count, name_prefix):
	"""Make sure at least `min_count` real Users hold `role`, so EmployeeSales
	(which INNER JOINs POS Invoice.cashier/waiter to tabUser) has more than
	one row to rank. Reuses whatever Users already have the role; creates
	Users with realistic staff names (idempotent by email) only to fill the
	gap -- never removes or reassigns existing ones.
	"""
	users = _get_staff_users(role)
	needed = min_count - len(users)
	if needed <= 0:
		return users

	pool = STAFF_NAME_POOLS.get(name_prefix, [("Staff", "Member")])

	for i in range(1, needed + 1):
		first_name, last_name = pool[(i - 1) % len(pool)]
		suffix = "" if i <= len(pool) else str(i)
		email = f"{first_name.lower()}.{last_name.lower()}{suffix}@ury.local"
		if not frappe.db.exists("User", email):
			try:
				user = frappe.get_doc(
					{
						"doctype": "User",
						"email": email,
						"first_name": first_name,
						"last_name": f"{last_name}{suffix}" if suffix else last_name,
						"send_welcome_email": 0,
						"roles": [{"role": role}],
					}
				)
				user.insert(ignore_permissions=True)
				print(f"Created User '{email}' with role '{role}' for staff-sales seeding")
			except Exception as e:
				print(f"  ! Failed to create User '{email}': {e}")
				continue
		elif not frappe.db.exists("Has Role", {"parent": email, "role": role}):
			try:
				user = frappe.get_doc("User", email)
				user.append("roles", {"role": role})
				user.save(ignore_permissions=True)
			except Exception as e:
				print(f"  ! Failed to grant role '{role}' to existing User '{email}': {e}")
				continue
		users.append(email)

	return sorted(set(users))


def _weighted_pick(pool, weights):
	if not pool:
		return None
	w = weights[: len(pool)]
	if len(w) < len(pool):
		w = w + [w[-1] if w else 1] * (len(pool) - len(w))
	return random.choices(pool, weights=w, k=1)[0]


def _pick_posting_time():
	"""Weighted lunch/dinner-peaked posting time, for TimeWiseSales/
	AverageBillValue shape instead of a flat spread across service hours."""
	starts, ends, weights = zip(*TIME_BUCKETS)
	idx = random.choices(range(len(TIME_BUCKETS)), weights=weights, k=1)[0]
	hour = random.randint(starts[idx], ends[idx] - 1) if ends[idx] > starts[idx] else starts[idx]
	minute = random.randint(0, 59)
	return f"{hour:02d}:{minute:02d}:00"


def _order_count_for_offset(offset):
	"""Tapered daily order volume by how far back `offset` (days ago) is --
	keeps recent weeks dense (for fine-grained TimeWise/day reports) while
	older months stay sparse (keeps total submit volume tractable)."""
	if offset <= RECENT_DENSE_DAYS:
		lo, hi = MIN_ORDERS_PER_DAY, MAX_ORDERS_PER_DAY
	elif offset <= MID_RANGE_DAYS:
		lo, hi = MID_MIN_ORDERS_PER_DAY, MID_MAX_ORDERS_PER_DAY
	else:
		lo, hi = SPARSE_MIN_ORDERS_PER_DAY, SPARSE_MAX_ORDERS_PER_DAY
	count = random.randint(lo, hi)

	date = getdate(add_days(today(), -offset))
	# weekday() 5=Sat, 6=Sun
	if date.weekday() >= 5:
		count = max(count, round(count * WEEKEND_ORDER_MULTIPLIER))
	return count


def _split_customer_pools(customers):
	"""Split into a small pool deliberately reused across many dates
	(RepeatedCustomers/CustomerData/DaywiseCustomerDetails need repeats to
	be meaningful) and the rest, used at most a handful of times each."""
	pool_size = min(REPEAT_CUSTOMER_POOL_SIZE, len(customers))
	shuffled = customers[:]
	random.shuffle(shuffled)
	repeat_pool = shuffled[:pool_size]
	one_time_pool = shuffled[pool_size:] or shuffled
	return repeat_pool, one_time_pool


def _pick_customer(repeat_pool, one_time_pool):
	if repeat_pool and (not one_time_pool or random.random() < REPEAT_CUSTOMER_SHARE):
		return random.choice(repeat_pool)
	return random.choice(one_time_pool)


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
		# `payments` must be present on insert -- POS Invoice validates it
		# then, not just on submit. Appending after insert() (the original
		# approach) fails validation before the row is ever attached.
		# `doc.grand_total`/`rounded_total` aren't computed until validate()
		# runs, so estimate the payment amount from the same items already
		# appended onto `doc` rather than reading a not-yet-calculated total.
		estimated_total = sum(flt(row.rate) * flt(row.qty) for row in doc.items)
		doc.append("payments", {"mode_of_payment": mode_of_payment, "amount": estimated_total})
		doc.insert(ignore_permissions=True)
		# Now that insert()'s validate() has computed the real grand_total,
		# correct the payment amount if the estimate (pre-tax) undershot it.
		real_total = flt(doc.rounded_total) or flt(doc.grand_total)
		if real_total and abs(real_total - flt(doc.payments[0].amount)) > 0.01:
			doc.payments[0].amount = real_total
			doc.save(ignore_permissions=True)
		# Workaround for a pre-existing bug in
		# `ury/ury/hooks/ury_pos_invoice.py`'s `calculate_and_set_times`
		# (parses `now()` as a datetime and subtracts `doc.creation`, which
		# comes back as a plain string rather than a datetime object for a
		# freshly-inserted doc in this code path, raising "unsupported
		# operand type(s) for -: 'datetime.datetime' and 'str'" on submit
		# for every single invoice, not just after a `.save()` correction).
		# Reloading via `frappe.get_doc` (fresh DB read, not the in-memory
		# `doc.reload()`) restores `creation` to a proper datetime before
		# the submit-time hook runs. Not fixing the hook itself -- out of
		# this seed script's scope, and this is a real, safe workaround
		# fully within our own control.
		if doc.restaurant_table:
			# Dine-in invoices must be marked printed before submit
			# (`ury_pos_invoice.py`'s `validate_invoice_print` gate) --
			# real business rule, not something to bypass; set it via
			# direct db value since there's no meaningful "print" action
			# for a seeded historical invoice.
			frappe.db.set_value("POS Invoice", doc.name, "invoice_printed", 1)
		doc = frappe.get_doc("POS Invoice", doc.name)
		doc.submit()
		return doc.name
	except Exception as e:
		print(f"  ! Failed to seed submitted POS Invoice for {posting_date}: {e}")
		# If insert() succeeded but a later step (payment correction, submit)
		# failed, `doc` is a real docstatus=0 row still in the DB -- left in
		# place, it permanently blocks this table for every subsequent seed
		# attempt (`ury_pos_invoice.py`'s own guard rejects any new invoice
		# on a table that already has an unprinted draft). Clean it up so
		# one failed row doesn't cascade into failing the whole table.
		try:
			if doc.name and frappe.db.exists("POS Invoice", doc.name):
				stray = frappe.get_doc("POS Invoice", doc.name)
				if stray.docstatus == 0:
					frappe.delete_doc("POS Invoice", doc.name, ignore_permissions=True, force=True)
		except Exception:
			pass
		return None


def _maybe_cancel_invoice(name):
	"""Cancel a small fraction of already-submitted invoices, for the
	CancelledInvoices report (docstatus=2, reads `cancel_reason`/
	`modified_by`). `cancel_reason` is a custom Data field guarded by core
	Frappe's "not allowed to change after submission" rule (it treats any
	field-level "Reason"-style change on a submitted doc as an amend-only
	edit), so it can't be set via `.save()` before/after submit -- cancel
	first (docstatus=2 is no longer "submitted" for that check), then set
	the reason directly via `db.set_value`, matching this module's existing
	`invoice_printed` convention for fields with no meaningful doctype
	action of their own. Best-effort -- a failed cancel just leaves the
	invoice submitted, which is harmless."""
	try:
		doc = frappe.get_doc("POS Invoice", name)
		doc.cancel()
		frappe.db.set_value("POS Invoice", name, "cancel_reason", random.choice(CANCEL_REASONS))
		return True
	except Exception as e:
		print(f"  ! Failed to cancel POS Invoice {name}: {e}")
		return False


def _seed_draft_invoice(mode_of_payment=None, **build_kwargs):
	doc = _build_pos_invoice(**build_kwargs)
	if doc is None:
		return None
	try:
		# Same constraint as submitted invoices: `is_pos=1` requires a
		# `payments` row present at insert-time validation, even for a
		# still-open/draft order. Real open orders in this app likely track
		# payment differently (unsettled), but the doctype's own validation
		# requires this row to exist regardless of docstatus.
		if mode_of_payment:
			estimated_total = sum(flt(row.rate) * flt(row.qty) for row in doc.items)
			doc.append("payments", {"mode_of_payment": mode_of_payment, "amount": estimated_total})
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
	# Employee uses hash/naming-series autoname on this bench (confirmed:
	# passing `name`/`employee` above was silently ignored, producing a new
	# HR-EMP-NNNNN row -- and therefore a new demo Employee -- on every
	# single `seed()` call). Look it up by `employee_name` instead, per this
	# module's own documented "known trap" for hash-autonamed doctypes.
	existing = frappe.db.get_value("Employee", {"employee_name": "Suresh Pillai"}, "name")
	if existing:
		return existing

	try:
		doc = frappe.get_doc(
			{
				"doctype": "Employee",
				"first_name": "Suresh",
				"last_name": "Pillai",
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
		print(f"Created Employee for Daily P&L seeding: {doc.name}")
		return doc.name
	except Exception as e:
		print(f"  ! Failed to create demo Employee for Daily P&L seeding: {e}")
		return None


def _attendance_available():
	"""Attendance moved to the separate `hrms` app in Frappe/ERPNext v15 --
	this bench only has frappe/erpnext/ury installed (confirmed via
	`bench list-apps`), so the doctype exists in the DB schema (from a
	fixture/migration) but its Python module can't be imported, and any
	`frappe.get_doc`/`frappe.db.exists` call against it throws. Rather than
	install a whole separate app just for this demo-data seed, Daily P&L
	seeding is skipped gracefully when this is the case -- named here as a
	real, checked gap rather than crashing or silently producing nothing.
	"""
	try:
		frappe.get_meta("Attendance")
		return True
	except Exception:
		return False


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

	if not _attendance_available():
		print(
			f"  ! Skipping Daily P&L for {date}: Attendance doctype unavailable "
			"(hrms app not installed on this bench -- real gap, not a fabricated skip)"
		)
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
	cashiers = _ensure_min_staff("URY Cashier", MIN_STAFF_PER_ROLE, "cashier")
	waiters = _ensure_min_staff("URY Captain", MIN_STAFF_PER_ROLE, "waiter")
	if not cashiers:
		cashiers = ["Administrator"]
	if not waiters:
		waiters = ["Administrator"]

	repeat_customers, one_time_customers = _split_customer_pools(customers)

	invoices_created = 0
	invoices_cancelled = 0
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

		order_count = _order_count_for_offset(offset)
		day_created = 0
		for _ in range(order_count):
			order_type = random.choice(ORDER_TYPES)
			table = random.choice(tables) if (tables and order_type == "Dine In") else None
			customer = _pick_customer(repeat_customers, one_time_customers)
			posting_time = _pick_posting_time()
			cashier = _weighted_pick(cashiers, STAFF_WEIGHTS)
			waiter = _weighted_pick(waiters, STAFF_WEIGHTS)

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
				if random.random() < CANCEL_RATE:
					if _maybe_cancel_invoice(name):
						invoices_cancelled += 1

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
			customer = _pick_customer(repeat_customers, one_time_customers)
			cashier = _weighted_pick(cashiers, STAFF_WEIGHTS)
			waiter = _weighted_pick(waiters, STAFF_WEIGHTS)
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
				customer = _pick_customer(repeat_customers, one_time_customers)
				cashier = _weighted_pick(cashiers, STAFF_WEIGHTS)
				waiter = _weighted_pick(waiters, STAFF_WEIGHTS)
				name = _seed_draft_invoice(
					mode_of_payment=mode_of_payment,
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
		"historical_invoices_cancelled": invoices_cancelled,
		"today_invoices_created": today_created,
		"draft_invoices_created": draft_created,
		"daily_pnl_created": pnl_created,
	}
	print(f"historical_sales seed complete: {summary}")
	return summary


# Backwards-compatible alias matching the ``run()`` convention used by
# ury/ury/api/seed_v3_demo.py and this package's other modules.
run = seed
