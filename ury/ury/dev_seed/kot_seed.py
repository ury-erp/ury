"""Permanent, rerunnable demo-data seed: occupied tables + KOTs (Kitchen Order
Tickets) spread across every valid KOT state, on every department's KDS
screen.

Written because the KDS screens came up empty/near-empty on a freshly seeded
bench -- there was no seed step that ever created a real `URY KOT` document,
so `ury.ury.api.ury_kot_display.kot_list()` / `served_kot_list()` (what the
KDS mosaic queries) had nothing to return.

Doctype/state facts used here are read from the actual code, not guessed:

- `URY KOT.order_status` (`ury/ury/doctype/ury_kot/ury_kot.json`) is a plain
  `Data` field, `default: "Ready For Prepare"`, `read_only: 1` (only ever
  set programmatically, never typed by a user). Grepping every literal
  string ever assigned to/compared against `order_status` across
  `ury/ury/**/*.py` turns up exactly two values in the whole codebase:
    * `"Ready For Prepare"` -- the default on insert; the state
      `ury_kot_display.kot_list()` (the "active tickets" KDS query) filters
      on, and the state `ury_kot_execution_service.py`'s docstring calls out
      as "the compatibility signal that maps to QUEUED".
    * `"Served"` -- set by `ury_kot_display.serve_kot()`; the state
      `served_kot_list()` (the "served tickets" KDS query) filters on.
  There is no "Preparing"/"Ready"/"In Progress"/etc. `order_status` value
  anywhere in this codebase -- `URY KOT Execution`
  (`ury_kot_execution_service.py`, states QUEUED/IN_PREPARATION/READY/
  SERVED/CANCELLED_*) is a separate, NOT-wired-in, KOT-level shadow state
  machine per its own docstring ("does NOT ... wire itself into KOT
  creation/submission") -- it is not what the live KDS queries read, so it
  is not what this module drives.
- `URY KOT.type` (Select: `New Order` / `Order Modified` / `Cancelled` /
  `Partially cancelled` / `Duplicate`) is a second, independent axis both
  `kot_list()` and `served_kot_list()` filter on (`type in [...]`) and that
  the KDS mosaic renders distinctly per ticket. This module varies `type`
  alongside `order_status` so the seeded spread covers both.
- `verified` (Check) gates whether a `Cancelled`/`Partially cancelled`
  ticket still needs a manager's confirmation (`confirm_cancel_kot` in
  `ury_kot_execution_service.py` sets it) -- both `kot_list()`/
  `served_kot_list()` filter `verified=0`, so this module seeds one
  confirmed (`verified=1`, deliberately absent from the live mosaic queries
  -- a real "already handled" ticket) and one unconfirmed per department.
- "Late"/overdue threshold: `POS Profile.custom_kot_warning_time` (Int,
  `ury/fixtures/custom_field.json`), returned to the frontend as
  `kot_alert_time` by both `kot_list()`/`served_kot_list()` -- this is the
  real elapsed-time threshold the KDS uses, not a guessed number. `profiles.py`
  never sets it, so this module seeds it (10 minutes) on the demo POS
  Profile if unset.
- Backdating: `URY KOT` has no `posting_date`/`posting_time` field (unlike
  `POS Invoice`) -- elapsed-time rendering and `kot_list()`'s own
  `creation >= now - 3h` filter both key off the standard `creation`
  timestamp. Frappe's `BaseDocument.db_insert()` only stamps
  `creation = now()` `if not self.creation` (confirmed in
  `frappe/model/base_document.py`), so setting `doc.creation` (and
  `doc.modified`) to a backdated datetime *before* `insert()` -- exactly
  the same idea `historical_sales.py` documents for `POS Invoice.
  set_posting_time`, applied to the field this doctype actually has --
  reliably backdates a KOT. `doc.date`/`doc.time` (the real `Date`/`Time`
  fields, `date` is mandatory) are set to match.
- Department -> production-unit routing: the KDS mosaic groups strictly by
  `URY KOT.production` (a `URY Production Unit` Link) -- see
  `ury_kot_display.build_dashboard_summary()`/`kot_list()`, which key
  everything off `kot.production`, and `URYKOT.kotDisplayRealtime()`, whose
  publish channel is literally `f"kot_update_{branch}_{production}"`. This
  module sets `production` directly to each department's seeded
  `URY Production Unit` name (`operations.py`'s `DEPARTMENTS`), so each
  department's KDS screen gets its own KOTs regardless of the *item-level*
  routing config. (Separately-noted, pre-existing gap, NOT fixed here since
  it is out of this task's scope: `operations.py`'s
  `_ensure_production_units()` never populates a `URY Production Unit`'s own
  `URY Production Item Groups` child table, which is what the *real* order
  flow -- `ury_kot_generate.py`'s `process_items_for_kot()` -- uses to route
  items to a production unit. That legacy-fallback routing path would find
  no match today. This module bypasses it entirely by constructing `URY KOT`
  documents directly with an explicit `production`, the same shape
  `create_kot_doc()` produces, so seeded KOTs render correctly regardless.)
- KOT creation shape (fields, `kot_items` child rows, `insert()` +
  `submit()`) mirrors `create_kot_doc()` in `ury/ury/api/ury_kot_generate.py`
  (read-only reference, not imported -- that module is live production code).
- Occupied tables backed by a real order: mirrors `historical_sales.py`'s
  `_seed_draft_invoice()` (`POS Invoice`, `is_pos=1`, `set_posting_time=1`,
  `update_stock=0`, a `payments` row appended *before* `insert()` since POS
  Invoice validates `payments` at insert time regardless of docstatus, and
  `URY Table.occupied`/`latest_invoice_time` set via a plain
  `frappe.db.set_value` call, matching `ury_order.py::sync_order`).
- Idempotent like every other module here: guarded by `frappe.db.exists`
  keyed on `(invoice, production, type, order_status)` so re-running
  `seed()` does not duplicate KOTs, and reuses one draft POS Invoice per
  department/table rather than creating a fresh one every run.

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.kot_seed.seed
"""

from datetime import timedelta

import frappe
from frappe.utils import flt, get_datetime, now_datetime

from ury.ury.dev_seed.operations import DEPARTMENTS

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# One occupied table per department, reusing catalog.py's T1..T12. Kept
# distinct from historical_sales.py's random table picks isn't required
# (that module dates its invoices in the past and doesn't hold tables
# "occupied" long-term), but using the first 4 tables keeps this
# deterministic/idempotent across reruns.
DEPARTMENT_TABLES = {
	"Indian Kitchen": "T1",
	"Chinese": "T2",
	"Tandoor": "T3",
	"Beverage Station": "T4",
}

# Items to fire per department. `operations.py`'s ITEM_GROUP_TO_DEPARTMENT
# has no mapping at all for "Tandoor" (explicitly noted there as "kept for
# menu growth"), so these are hand-picked from catalog.py's MENU_ITEMS by
# theme rather than by a nonexistent item_group mapping -- KOT.production is
# set explicitly below regardless of the item's own item_group.
DEPARTMENT_ITEMS = {
	"Indian Kitchen": ["Butter Chicken", "Dal Makhani", "Chicken Biryani", "Paneer Butter Masala"],
	"Chinese": ["Chicken Manchurian", "Hakka Noodles", "Veg Fried Rice", "Chilli Chicken"],
	"Tandoor": ["Tandoori Chicken (Half)", "Chicken 65", "Fish Amritsari"],
	"Beverage Station": ["Masala Chai", "Cold Coffee", "Gulab Jamun (2 pcs)", "Mango Lassi"],
}

ORDER_STATUS_READY = "Ready For Prepare"
ORDER_STATUS_SERVED = "Served"

KOT_WARNING_MINUTES = 10  # seeded onto POS Profile.custom_kot_warning_time if unset

# One ticket per spec, per department. Fields:
#   (order_status, type, verified, age_minutes, item_count, with_note)
# Covers: a just-fired ticket, one a few minutes in with a modifier note, one
# well past the warning threshold ("late"/overdue rendering), an amended
# ticket, a duplicate ticket, a served ticket, and an unconfirmed +
# manager-confirmed cancellation each.
# `label` is a stable, spec-unique tag (stashed in `URY KOT.comments`, a
# plain Data field distinct from the per-item `kot_items.comments` note) used
# purely for idempotency dedup below. Several specs deliberately share the
# same (type, order_status, verified) triple -- e.g. three separate "New
# Order"/"Ready For Prepare" tickets at different ages -- so dedup can't key
# on those fields alone; without `label` a rerun would collapse them into
# one "already exists" ticket instead of recreating the missing two.
#   (label, order_status, type, verified, age_minutes, item_count, with_note)
TICKET_SPECS = [
	("fresh", ORDER_STATUS_READY, "New Order", 0, 0, 2, False),
	("noted", ORDER_STATUS_READY, "New Order", 0, 4, 3, True),
	("late", ORDER_STATUS_READY, "New Order", 0, 25, 2, False),
	("modified", ORDER_STATUS_READY, "Order Modified", 0, 6, 4, False),
	("duplicate", ORDER_STATUS_READY, "Duplicate", 0, 2, 1, False),
	("served", ORDER_STATUS_SERVED, "New Order", 0, 45, 3, False),
	("cancelled-pending", ORDER_STATUS_READY, "Cancelled", 0, 8, 2, False),
	("cancelled-confirmed", ORDER_STATUS_READY, "Cancelled", 1, 15, 2, False),
]

NOTE_TEXT = "Extra spicy, no onion"


# ---------------------------------------------------------------------------
# Lookups (same conventions as catalog.py / operations.py / historical_sales.py)
# ---------------------------------------------------------------------------


def _get_branch_and_company():
	branch_name = frappe.db.get_value("Branch", {}, "name")
	company_name = frappe.db.get_value("Company", {}, "name")
	return branch_name, company_name


def _get_pos_profile(branch_name):
	pos_profile = frappe.db.get_value("POS Profile", {"branch": branch_name, "disabled": 0}, "name")
	if not pos_profile:
		pos_profile = frappe.db.get_value("POS Profile", {}, "name")
	return pos_profile


def _get_price_list():
	# NOTE: `frappe.db.get_value("Price List", {"selling": 1}, "name")`
	# (the convention `historical_sales.py`/`profiles.py` both use) is
	# non-deterministic once `operations.seed()` has created the "Zomato"/
	# "Swiggy"/"Direct" aggregator Price Lists (also `selling=1`) --
	# confirmed live: it returned "Direct" ahead of "Standard Selling" here.
	# Pin to "Standard Selling" explicitly (the price list every other
	# seed module's fallback already names) instead of an unordered filter.
	if frappe.db.exists("Price List", "Standard Selling"):
		return "Standard Selling"
	return frappe.db.get_value("Price List", {"selling": 1}, "name") or "Standard Selling"


def _get_customer():
	return frappe.db.get_value("Customer", {}, "name")


def _get_mode_of_payment():
	if frappe.db.exists("Mode of Payment", "Cash"):
		return "Cash"
	return frappe.db.get_value("Mode of Payment", {}, "name")


def _get_item_rate(item_code, price_list):
	"""`catalog.py` now creates an `Item Price` row against "Standard
	Selling" for every MENU_ITEMS item (see `catalog.py::_ensure_item_prices`),
	so this should normally resolve via the `Item Price` lookup below.
	Kept as a defensive fallback to `Item.standard_rate` for a bench that
	ran an older `catalog.py` (pre-`_ensure_item_prices`) or has items
	seeded by some other script without prices.
	"""
	rate = frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": price_list}, "price_list_rate")
	if rate:
		return flt(rate)
	return flt(frappe.db.get_value("Item", item_code, "standard_rate"))


def _ensure_kot_warning_time(pos_profile_name):
	"""Seed `custom_kot_warning_time` (the KDS's real "late" threshold, see
	`ury_kot_display.kot_list()`'s `kot_alert_time` return value) if unset,
	so the deliberately-late ticket below actually renders as overdue.
	"""
	if not pos_profile_name:
		return False
	meta = frappe.get_meta("POS Profile")
	if not meta.has_field("custom_kot_warning_time"):
		print("POS Profile has no custom_kot_warning_time field on this site -- skipping.")
		return False
	current = frappe.db.get_value("POS Profile", pos_profile_name, "custom_kot_warning_time")
	if current:
		return False
	frappe.db.set_value("POS Profile", pos_profile_name, "custom_kot_warning_time", KOT_WARNING_MINUTES)
	print(f"Set POS Profile {pos_profile_name}.custom_kot_warning_time = {KOT_WARNING_MINUTES}")
	return True


def _get_production_unit(department_name):
	"""`operations.py` names the Production Unit the same as the department
	(see `DEPARTMENTS` in operations.py) -- confirm it actually exists on
	this site rather than assuming operations.seed() already ran.
	"""
	entry = next((d for d in DEPARTMENTS if d["department_name"] == department_name), None)
	if not entry:
		return None
	unit_name = entry["production_unit"]
	if not frappe.db.exists("URY Production Unit", unit_name):
		return None
	return unit_name


# ---------------------------------------------------------------------------
# Occupied table + backing draft POS Invoice (one per department)
# ---------------------------------------------------------------------------


def _get_or_create_department_invoice(
	*, department_name, table, branch_name, company_name, pos_profile_name, price_list, customer, items_needed
):
	"""One draft ("open order") POS Invoice per department, holding its
	table occupied, carrying every item any of that department's seeded
	KOTs will reference (KOT items don't have to be a subset of the
	invoice's own item rows for `URY KOT` to insert -- `URY KOT.kot_items`
	is its own child table -- but keeping them consistent is what makes the
	POS floor view and the KDS agree on "what's on this table", per the
	task brief).
	"""
	existing = frappe.db.get_value(
		"POS Invoice",
		{"restaurant_table": table, "docstatus": 0, "pos_profile": pos_profile_name},
		"name",
	)
	if existing:
		return existing

	mode_of_payment = _get_mode_of_payment()
	doc = frappe.new_doc("POS Invoice")
	doc.is_pos = 1
	doc.pos_profile = pos_profile_name
	doc.branch = branch_name
	doc.company = company_name
	doc.restaurant_table = table
	doc.customer = customer
	doc.selling_price_list = price_list
	doc.currency = frappe.db.get_value("Company", company_name, "default_currency")
	doc.conversion_rate = 1
	doc.update_stock = 0
	doc.order_type = "Dine In"

	for item_code in items_needed:
		if not frappe.db.exists("Item", item_code):
			continue
		rate = _get_item_rate(item_code, price_list)
		if not rate:
			continue
		doc.append(
			"items",
			{
				"item_code": item_code,
				"item_name": item_code,
				"qty": 1,
				"rate": rate,
				"price_list_rate": rate,
				"base_price_list_rate": rate,
			},
		)

	if not doc.items:
		print(f"  ! No priced items found for department {department_name} -- skipping its invoice/table.")
		return None

	try:
		if mode_of_payment:
			estimated_total = sum(flt(row.rate) * flt(row.qty) for row in doc.items)
			doc.append("payments", {"mode_of_payment": mode_of_payment, "amount": estimated_total})
		doc.insert(ignore_permissions=True)
	except Exception as e:
		print(f"  ! Failed to seed draft POS Invoice for department {department_name}: {e}")
		return None

	frappe.db.set_value(
		"URY Table",
		table,
		{"occupied": 1, "latest_invoice_time": doc.creation},
	)
	print(f"Created draft POS Invoice {doc.name} on table {table} for department {department_name}")
	return doc.name


# ---------------------------------------------------------------------------
# KOT creation (shape mirrors ury_kot_generate.py::create_kot_doc)
# ---------------------------------------------------------------------------


def _kot_exists(invoice, production, label):
	# `comments` carries the spec's stable `label` tag (see TICKET_SPECS) --
	# needed because several specs share the same (type, order_status,
	# verified) triple and would otherwise collide on a rerun.
	return frappe.db.exists(
		"URY KOT",
		{
			"invoice": invoice,
			"production": production,
			"comments": f"dev_seed:{label}",
		},
	)


def _create_kot(
	*,
	invoice,
	table,
	customer,
	pos_profile_name,
	naming_series,
	production,
	label,
	kot_type,
	order_status,
	verified,
	age_minutes,
	item_codes,
	with_note,
):
	if _kot_exists(invoice, production, label):
		return None

	created_at = now_datetime() - timedelta(minutes=age_minutes)

	kot_doc = frappe.get_doc(
		{
			"doctype": "URY KOT",
			"invoice": invoice,
			"restaurant_table": table,
			"customer_name": customer,
			"pos_profile": pos_profile_name,
			"naming_series": naming_series,
			"production": production,
			"type": kot_type,
			"order_status": order_status,
			"verified": verified,
			"comments": f"dev_seed:{label}",
			"date": created_at.date(),
			"time": created_at.time(),
			"table_takeaway": 0,
		}
	)

	for i, item_code in enumerate(item_codes):
		if not frappe.db.exists("Item", item_code):
			continue
		comments = NOTE_TEXT if (with_note and i == 0) else ""
		kot_doc.append(
			"kot_items",
			{
				"item": item_code,
				"item_name": item_code,
				"quantity": 1,
				"comments": comments,
			},
		)

	if not kot_doc.kot_items:
		return None

	# Backdate `creation`/`modified` before insert -- Frappe's
	# `BaseDocument.db_insert()` only stamps `now()` `if not self.creation`,
	# so a truthy value set here is preserved (see module docstring).
	kot_doc.creation = created_at
	kot_doc.modified = created_at

	try:
		kot_doc.insert(ignore_permissions=True)
		kot_doc.submit()
	except Exception as e:
		print(f"  ! Failed to seed URY KOT ({kot_type}/{order_status}) for invoice {invoice}: {e}")
		return None

	if order_status == ORDER_STATUS_SERVED:
		# Mirror serve_kot()'s bookkeeping (production_time / start_time_serv)
		# instead of leaving them blank on a "Served" ticket.
		served_at = created_at + timedelta(minutes=min(age_minutes, 20))
		production_time_minutes = (served_at - get_datetime(kot_doc.creation)).total_seconds() / 60
		frappe.db.set_value("URY KOT", kot_doc.name, "start_time_serv", served_at.strftime("%H:%M:%S"))
		frappe.db.set_value("URY KOT", kot_doc.name, "production_time", production_time_minutes)

	if verified:
		frappe.db.set_value("URY KOT", kot_doc.name, "verified_by", "Administrator")

	# Re-stamp creation/modified after submit(), since submit()'s own save
	# touches `modified` again.
	frappe.db.set_value("URY KOT", kot_doc.name, "creation", created_at)
	frappe.db.set_value("URY KOT", kot_doc.name, "modified", created_at)

	return kot_doc.name


def _seed_department_kots(department_name, branch_name, company_name, pos_profile_name, naming_series, price_list, customer):
	table = DEPARTMENT_TABLES.get(department_name)
	if not table or not frappe.db.exists("URY Table", table):
		print(f"  ! No table configured/seeded for department {department_name} -- skipping (run catalog.seed() first).")
		return []

	production = _get_production_unit(department_name)
	if not production:
		print(f"  ! No URY Production Unit found for department {department_name} -- skipping (run operations.seed() first).")
		return []

	item_pool = [i for i in DEPARTMENT_ITEMS.get(department_name, []) if frappe.db.exists("Item", i)]
	if not item_pool:
		print(f"  ! No seeded Items found for department {department_name}'s DEPARTMENT_ITEMS -- skipping.")
		return []

	invoice = _get_or_create_department_invoice(
		department_name=department_name,
		table=table,
		branch_name=branch_name,
		company_name=company_name,
		pos_profile_name=pos_profile_name,
		price_list=price_list,
		customer=customer,
		items_needed=item_pool,
	)
	if not invoice:
		return []

	created = []
	for label, order_status, kot_type, verified, age_minutes, item_count, with_note in TICKET_SPECS:
		item_codes = [item_pool[i % len(item_pool)] for i in range(item_count)]
		name = _create_kot(
			invoice=invoice,
			table=table,
			customer=customer,
			pos_profile_name=pos_profile_name,
			naming_series=naming_series,
			production=production,
			label=label,
			kot_type=kot_type,
			order_status=order_status,
			verified=verified,
			age_minutes=age_minutes,
			item_codes=item_codes,
			with_note=with_note,
		)
		if name:
			created.append(name)
			print(f"Created URY KOT {name}: {department_name} / {order_status} / {kot_type} (verified={verified}, age={age_minutes}m)")

	return created


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def seed():
	"""Idempotent entrypoint -- safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.kot_seed.seed``. Depends on
	`catalog.seed()`, `profiles.seed()`, and `operations.seed()` having run
	first (real Items/Tables/POS Profile/Production Units); skips gracefully
	with a clear message per-department if any of those are missing rather
	than hard-failing.
	"""
	branch_name, company_name = _get_branch_and_company()
	if not branch_name or not company_name:
		print("dev_seed.kot_seed: no Branch/Company found on this site -- skipping.")
		return {}

	pos_profile_name = _get_pos_profile(branch_name)
	if not pos_profile_name:
		print("dev_seed.kot_seed: no POS Profile found -- run profiles.seed() first. Skipping.")
		return {}

	naming_series = frappe.db.get_value("POS Profile", pos_profile_name, "custom_kot_naming_series") or "KOT-URY-"
	price_list = _get_price_list()
	customer = _get_customer()
	if not customer:
		print("dev_seed.kot_seed: no Customer found -- run catalog.seed() first. Skipping.")
		return {}

	_ensure_kot_warning_time(pos_profile_name)

	summary = {}
	for d in DEPARTMENTS:
		department_name = d["department_name"]
		created = _seed_department_kots(
			department_name, branch_name, company_name, pos_profile_name, naming_series, price_list, customer
		)
		summary[department_name] = len(created)

	frappe.db.commit()
	print(f"KOT seed complete: {summary}")
	return summary


run = seed
