"""Gap-filling demo data for the URY Insights dashboards.

Fills the sources that stay EMPTY (or show 0) on the demo for DB03, DB06,
DB08, DB11, DB12, DB13, DB14, DB15 and DB10 without touching the existing
sales / KOT history and without depending on any workflow:

=====================  ======================================================
Part (function)        Charts it is meant to fill
=====================  ======================================================
seed_invoices          NEW submitted POS Invoices spread over the last 60 days
                       (3 per day in the last 14 days):
                        * discounts   -> DB03 "Discounts given", DB15
                          "Discounts given", DB08 "Discounts given by cashier"
                        * service charge rows ("Service Charge" tax account)
                          -> DB08 "Service charge collected"
                        * URY Ordering Session with invoice set
                          -> DB03 "Self-order bills (count)"
                        * one URY KOT per invoice (Served) with URY KOT
                          Execution / URY KOT Item Execution stamps
                          -> DB06 stage times + slowest dishes, DB08 cook speed
seed_returns           Full credit notes (is_return=1) on ~10% of the new
                       invoices (last 30 days incl. last 14)
                       -> DB15 "Returns", DB03/DB08 (non-return facts stay
                       unchanged because they filter is_return = 0)
seed_kot_timing        Realistic URY KOT Execution + Item Execution stamps for
                       EXISTING recent KOTs whose stamps are milliseconds apart
                       (adds a newer row per (kot, production unit); the
                       dashboards de-duplicate to the latest-modified row)
seed_yield             URY Yield Check: fills department / checked_by on the
                       existing checks that lack them (adds missing fields
                       only) and adds new checks with both set over 60 days
                       -> DB12 "Yield by station", checker splits, DB14
seed_wastage           Submitted + Authorized URY Wastage (+ Wastage Item) over
                       60 days. docstatus / status are written directly, so no
                       workflow transition and no Stock Entry is involved
                       -> DB11 wastage value / item / department / reason /
                       % of sales, DB14 wastage readiness
seed_bulk_production   Submitted Bulk Production runs with real BOMs
                       (total_cost computed by the controller; no Stock Entry
                       is queued) -> DB13 "Bulk production cost"
seed_cost_variance     URY Cost Variance Snapshot rows spread over 60 days
                       -> DB10 cost variance table
=====================  ======================================================

Idempotency: every document carries a deterministic marker ("gap-seed:<key>")
in a text field (POS Invoice.remarks, Wastage.reason_notes, idempotency_key,
...) or is skipped on a natural key; a second run creates nothing new. All
randomness comes from ``random.Random`` instances seeded from ``SEED``.

Usage::

    bench --site sa-v16-latest-demo.local execute ury.ury.dev_seed.gap_data_seed.seed
    # or a single part
    bench --site sa-v16-latest-demo.local execute ury.ury.dev_seed.gap_data_seed.seed_wastage
    # or a subset
    bench --site sa-v16-latest-demo.local execute ury.ury.dev_seed.gap_data_seed.seed \
        --kwargs '{"parts": "wastage,yield"}'
"""

import hashlib
import json
import random
import zlib
from datetime import datetime, timedelta

import frappe
from frappe.utils import add_days, flt, get_datetime, getdate, now_datetime, today

SEED = 20261103
MARK = "gap-seed"
WINDOW_DAYS = 60
RECENT_DAYS = 14

COOK_ROLE = "Kitchen Cook"
COOKS = [
	("Arjun", "Pillai", 0.8),
	("Meera", "Krishnan", 1.0),
	("Bilal", "Hussain", 1.25),
	("Sunil", "Varghese", 1.6),
	("Anita", "Joseph", 0.95),
]  # (first, last, prep-time factor): drives a visible cook-speed spread

DISCOUNT_PCTS = [5, 5, 10, 10, 10, 15, 15, 20, 25]
SERVICE_RATES = [5, 5, 7.5, 10]
SELF_ORDER_SOURCES = {
	"Dine In": ["QR Table", "Table Tablet", "Kiosk"],
	"Take Away": ["QR Pickup", "Kiosk"],
}
WASTAGE_REASONS = ["Spoilage", "Preparation Error", "Dropped/Damaged", "Expired", "Other"]
WASTAGE_REASON_WEIGHTS = [34, 24, 18, 16, 8]
YIELD_CHECK_TYPES = ["Routine", "Scheduled", "Spot-Check", "Manual"]
STAFF_WEIGHTS = [35, 25, 18, 12, 10, 6, 4]
CASHIER_DISCOUNT_PROB = [0.60, 0.45, 0.22, 0.15, 0.10, 0.08, 0.05]  # by cashier rank

PARTS = (
	"invoices",
	"returns",
	"kot_timing",
	"yield",
	"wastage",
	"bulk_production",
	"cost_variance",
)


# ---------------------------------------------------------------------------
# Pure helpers (no database access; unit tested in test_gap_data_seed.py)
# ---------------------------------------------------------------------------

def rng_for(part):
	"""Independent deterministic generator per part."""
	return random.Random(f"{SEED}-{part}")


def marker(key):
	return f"[{MARK}:{key}]"


def stable_index(text, modulo):
	"""Process-independent hash index (python's hash() is salted)."""
	if modulo <= 0:
		return 0
	return zlib.crc32(str(text).encode("utf-8")) % modulo


def invoice_counts_per_offset(window=WINDOW_DAYS, recent=RECENT_DAYS):
	"""{offset_days_ago: number_of_new_invoices}. Dense in the last `recent`
	days (the cloned-sales window), ~1 per day before, +1 on weekends is applied
	by the caller via the date. Pure and deterministic."""
	return {off: (3 if off < recent else 1) for off in range(window)}


def build_invoice_plan(today_date, cashier_count, waiter_count, window=WINDOW_DAYS, recent=RECENT_DAYS):
	"""Deterministic list of invoice plans (oldest first).

	Each plan: key, offset, date, hour, minute, order_type, cashier_idx,
	waiter_idx, discount_pct (or None), service_rate (or None), self_order
	(source or None). The random stream is seeded per (date, slot), so the
	plan for a given day never changes when the seed is rerun on a later day.
	"""
	today_date = getdate(today_date)
	plans = []
	for off in range(window - 1, -1, -1):
		day = today_date - timedelta(days=off)
		count = 3 if off < recent else 1
		if off >= recent and day.weekday() >= 5:
			count += 1  # weekend bump in the older window
		for slot in range(count):
			rng = random.Random(f"{SEED}-plan-{day.isoformat()}-{slot}")
			# Today: take-away only so a seeded dine-in bill never collides with
			# an open order on a table.
			order_type = "Take Away" if off == 0 or rng.random() < 0.40 else "Dine In"
			cashier_idx = pick_weighted_index(STAFF_WEIGHTS[: max(cashier_count, 1)], rng)
			waiter_idx = pick_weighted_index(STAFF_WEIGHTS[: max(waiter_count, 1)], rng)
			prob = CASHIER_DISCOUNT_PROB[min(cashier_idx, len(CASHIER_DISCOUNT_PROB) - 1)]
			discount_pct = rng.choice(DISCOUNT_PCTS) if rng.random() < prob else None
			service_rate = rng.choice(SERVICE_RATES) if (order_type == "Dine In" and rng.random() < 0.7) else None
			self_order = rng.choice(SELF_ORDER_SOURCES[order_type]) if rng.random() < 0.18 else None
			hour = 12 + (slot * 3 + rng.randint(0, 2)) % 10  # 12:xx - 21:xx
			plans.append(
				{
					"key": f"inv-{day.isoformat()}-{slot}",
					"offset": off,
					"date": day,
					"hour": hour,
					"minute": rng.randint(0, 59),
					"order_type": order_type,
					"cashier_idx": cashier_idx,
					"waiter_idx": waiter_idx,
					"discount_pct": discount_pct,
					"service_rate": service_rate,
					"self_order": self_order,
				}
			)
	return plans


def pick_weighted_index(weights, rng):
	total = sum(weights)
	r = rng.random() * total
	acc = 0.0
	for i, w in enumerate(weights):
		acc += w
		if r <= acc:
			return i
	return len(weights) - 1


def kot_timing(rng, cook_factor=1.0, dept_factor=1.0):
	"""(queue_s, prep_s, pass_s) for one served KOT. Prep is 3-24 min scaled by
	cook and station; ~8% of tickets are slow (x1.8) so the tail is visible."""
	base = rng.uniform(4.0, 12.0) * cook_factor * dept_factor
	if rng.random() < 0.08:
		base *= 1.8
	prep_s = int(max(120, min(base * 60, 40 * 60)))
	queue_s = int(rng.uniform(20, 240))
	pass_s = int(rng.uniform(45, 240))
	return queue_s, prep_s, pass_s


def exec_stamps(fired_at, queue_s, prep_s, pass_s):
	"""Datetimes (started, ready, served) from the KOT fire time."""
	started = fired_at + timedelta(seconds=queue_s)
	ready = started + timedelta(seconds=prep_s)
	served = ready + timedelta(seconds=pass_s)
	return started, ready, served


def item_stamps(started, ready, rng):
	"""Per-dish (started, ready) inside the KOT prep window."""
	span = max(int((ready - started).total_seconds()), 2)
	s_off = rng.randint(0, span // 4)
	e_off = rng.randint(span * 3 // 4, span)
	return started + timedelta(seconds=s_off), started + timedelta(seconds=max(e_off, s_off + 60))


def plan_wastage(today_date, count, rng):
	"""[{key, date, hour, reason, qty_factor, authorized}] over the window; every
	third record falls in the last 14 days."""
	today_date = getdate(today_date)
	rows = []
	for i in range(count):
		if i % 3 == 0:
			off = rng.randint(0, RECENT_DAYS - 1)
		else:
			off = rng.randint(RECENT_DAYS, WINDOW_DAYS - 1)
		rows.append(
			{
				"key": f"wst-{i + 1:03d}",
				"date": today_date - timedelta(days=off),
				"hour": rng.randint(9, 22),
				"reason": WASTAGE_REASONS[pick_weighted_index(WASTAGE_REASON_WEIGHTS, rng)],
				"qty_factor": round(rng.uniform(0.5, 4.0), 2),
				"authorized": rng.random() < 0.85,
			}
		)
	return sorted(rows, key=lambda r: (r["date"], r["key"]))


def plan_yield_actual(std, rng):
	"""Actual yield % around the standard: ~35% under, ~45% near, ~20% over."""
	roll = rng.random()
	if roll < 0.35:
		actual = rng.uniform(max(70.0, std - 12.0), max(70.5, std - 3.0))
	elif roll < 0.80:
		actual = std + rng.uniform(-2.5, 2.5)
	else:
		actual = rng.uniform(std + 1.5, std + 5.0)
	return max(60.0, min(105.0, actual))


def plan_bulk_runs(today_date, count, rng):
	"""[{key, date, lines}] where lines is the number of BOM rows (1-3) and
	~40% of runs fall in the last 14 days."""
	today_date = getdate(today_date)
	runs = []
	for i in range(count):
		off = rng.randint(0, RECENT_DAYS - 1) if rng.random() < 0.4 else rng.randint(RECENT_DAYS, WINDOW_DAYS - 1)
		runs.append({"key": f"bulk-{i + 1:03d}", "date": today_date - timedelta(days=off), "lines": rng.randint(1, 3)})
	return sorted(runs, key=lambda r: (r["date"], r["key"]))


def parts_from_arg(parts):
	"""Normalise the `parts` kwarg ('a,b' / list / None) to a validated tuple."""
	if not parts:
		return PARTS
	if isinstance(parts, str):
		parts = [p.strip() for p in parts.split(",") if p.strip()]
	unknown = [p for p in parts if p not in PARTS]
	if unknown:
		raise ValueError(f"unknown parts {unknown}; valid: {list(PARTS)}")
	return tuple(p for p in PARTS if p in parts)


# ---------------------------------------------------------------------------
# Context / lookups
# ---------------------------------------------------------------------------

def _hs():
	from ury.ury.dev_seed import historical_sales

	return historical_sales


def _ctx():
	"""Branch / company / POS profile context, reconciled like historical_sales."""
	hs = _hs()
	branch, company = hs._get_branch_and_company()
	if not branch or not company:
		return None
	pos_profile = hs._get_pos_profile(branch)
	if pos_profile:
		profile_company = frappe.db.get_value("POS Profile", pos_profile, "company")
		if profile_company and profile_company != company:
			company = profile_company
	restaurant = hs._get_restaurant(branch)
	return frappe._dict(
		branch=branch,
		company=company,
		pos_profile=pos_profile,
		restaurant=restaurant,
		warehouse=(frappe.db.get_value("POS Profile", pos_profile, "warehouse") if pos_profile else None)
		or _default_warehouse(company),
		abbr=frappe.db.get_value("Company", company, "abbr"),
	)


def _default_warehouse(company):
	abbr = frappe.db.get_value("Company", company, "abbr")
	for cand in (f"Stores - {abbr}", f"Finished Goods - {abbr}"):
		if frappe.db.exists("Warehouse", cand):
			return cand
	return frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")


def _ensure_cooks():
	"""Cook Users (own role, so waiter/cashier pools used by other seeds are
	not polluted). Returns [(user, factor)]."""
	if not frappe.db.exists("Role", COOK_ROLE):
		try:
			frappe.get_doc({"doctype": "Role", "role_name": COOK_ROLE, "desk_access": 0}).insert(
				ignore_permissions=True
			)
		except Exception as e:
			print(f"  ! could not create Role {COOK_ROLE}: {e}")
	cooks = []
	for first, last, factor in COOKS:
		email = f"{first.lower()}.{last.lower()}@ury.local"
		if not frappe.db.exists("User", email):
			try:
				frappe.get_doc(
					{
						"doctype": "User",
						"email": email,
						"first_name": first,
						"last_name": last,
						"send_welcome_email": 0,
						"roles": [{"role": COOK_ROLE}] if frappe.db.exists("Role", COOK_ROLE) else [],
					}
				).insert(ignore_permissions=True)
			except Exception as e:
				print(f"  ! could not create cook {email}: {e}")
				continue
		cooks.append((email, factor))
	return cooks


def _production_units(branch):
	rows = frappe.get_all(
		"URY Production Unit",
		filters={"branch": branch},
		fields=["name", "department"],
		order_by="name asc",
	)
	if not rows:
		rows = frappe.get_all("URY Production Unit", fields=["name", "department"], order_by="name asc")
	return rows


def _service_account(ctx):
	"""An income/tax account whose name contains 'Service' (DB08 filters on it)."""
	existing = frappe.db.get_value(
		"Account",
		{
			"company": ctx.company,
			"is_group": 0,
			"disabled": 0,
			"name": ["like", "%Service%"],
			"account_type": ["in", ["Income Account", "Tax", "Chargeable"]],
		},
		"name",
	)
	if existing:
		return existing
	parent = None
	for cand in (f"Direct Income - {ctx.abbr}", f"Indirect Income - {ctx.abbr}", f"Income - {ctx.abbr}"):
		if frappe.db.exists("Account", {"name": cand, "is_group": 1}):
			parent = cand
			break
	if not parent:
		parent = frappe.db.get_value("Account", {"company": ctx.company, "root_type": "Income", "is_group": 1}, "name")
	if not parent:
		print("  ! no Income group account found; service charge rows skipped")
		return None
	try:
		acc = frappe.get_doc(
			{
				"doctype": "Account",
				"account_name": "Service Charge",
				"company": ctx.company,
				"parent_account": parent,
				"is_group": 0,
				"account_type": "Income Account",
			}
		).insert(ignore_permissions=True)
		return acc.name
	except Exception as e:
		print(f"  ! could not create Service Charge account: {e}")
		return None


# ---------------------------------------------------------------------------
# Part 1: new invoices (discounts, service charge, self-order, KOT + timings)
# ---------------------------------------------------------------------------

def _invoice_exists(key):
	return frappe.db.get_value("POS Invoice", {"remarks": marker(key)}, "name")


def _create_invoice(plan, ctx, env, rng):
	customer = rng.choice(env.customers)
	cashier = env.cashiers[plan["cashier_idx"] % len(env.cashiers)]
	waiter = env.waiters[plan["waiter_idx"] % len(env.waiters)]
	table = None
	if plan["order_type"] == "Dine In" and env.tables:
		table = env.tables[stable_index(plan["key"], len(env.tables))]
	posting_time = f"{plan['hour']:02d}:{plan['minute']:02d}:00"

	doc = _empty_invoice(plan, ctx, env, customer, cashier, waiter, table, posting_time, rng)
	chosen = rng.sample(env.priced_items, min(len(env.priced_items), rng.randint(2, 6)))
	doc.set("items", [])
	for item in chosen:
		rate = env.item_prices[item.item_code]
		doc.append(
			"items",
			{
				"item_code": item.item_code,
				"item_name": item.item_name,
				"qty": rng.randint(1, 3),
				"rate": rate,
				"price_list_rate": rate,
				"base_price_list_rate": rate,
			},
		)
	if plan["discount_pct"]:
		doc.apply_discount_on = "Net Total"
		doc.additional_discount_percentage = plan["discount_pct"]
	doc.remarks = marker(plan["key"])
	est = sum(flt(r.rate) * flt(r.qty) for r in doc.items)
	doc.append("payments", {"mode_of_payment": env.mode_of_payment, "amount": est})
	doc.insert(ignore_permissions=True)

	if plan["service_rate"] and env.service_account:
		doc.append(
			"taxes",
			{
				"charge_type": "On Net Total",
				"account_head": env.service_account,
				"description": "Service Charge",
				"rate": plan["service_rate"],
				"cost_center": frappe.db.get_value("POS Profile", ctx.pos_profile, "cost_center"),
			},
		)
		doc.save(ignore_permissions=True)

	real_total = flt(doc.rounded_total) or flt(doc.grand_total)
	if real_total and abs(real_total - flt(doc.payments[0].amount)) > 0.01:
		doc.payments[0].amount = real_total
		doc.save(ignore_permissions=True)
	if doc.restaurant_table:
		frappe.db.set_value("POS Invoice", doc.name, "invoice_printed", 1)
	doc = frappe.get_doc("POS Invoice", doc.name)
	doc.submit()
	return doc.name


def _empty_invoice(plan, ctx, env, customer, cashier, waiter, table, posting_time, rng):
	doc = frappe.new_doc("POS Invoice")
	doc.is_pos = 1
	doc.pos_profile = ctx.pos_profile
	doc.branch = ctx.branch
	doc.company = ctx.company
	doc.restaurant = ctx.restaurant
	doc.cashier = cashier
	doc.waiter = waiter
	doc.order_type = plan["order_type"]
	if table:
		doc.restaurant_table = table
	doc.customer = customer.name
	doc.customer_name = customer.customer_name
	doc.selling_price_list = env.price_list
	if env.tax_template:
		doc.taxes_and_charges = env.tax_template
	doc.currency = env.currency
	doc.conversion_rate = 1
	doc.no_of_pax = str(rng.randint(1, 6))
	doc.update_stock = 0
	doc.set_posting_time = 1
	doc.posting_date = plan["date"]
	doc.posting_time = posting_time
	return doc


def _create_session(plan, invoice_name, ctx, env):
	if not env.ordering_profile:
		return None
	token = hashlib.sha256(f"{SEED}-{plan['key']}".encode()).hexdigest()
	if frappe.db.exists("URY Ordering Session", {"token_hash": token}):
		return None
	opened = datetime.combine(plan["date"], datetime.min.time()) + timedelta(
		hours=plan["hour"], minutes=plan["minute"]
	) - timedelta(minutes=20 + stable_index(plan["key"], 15))
	doc = frappe.get_doc(
		{
			"doctype": "URY Ordering Session",
			"ordering_profile": env.ordering_profile,
			"source": plan["self_order"],
			"table": frappe.db.get_value("POS Invoice", invoice_name, "restaurant_table")
			if plan["self_order"] in ("QR Table", "Table Tablet")
			else None,
			"token_hash": token,
			"status": "Closed",
			"opened_at": opened,
			"expires_at": opened + timedelta(hours=2),
			"last_activity": opened + timedelta(minutes=15),
			"invoice": invoice_name,
		}
	)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	frappe.db.set_value("URY Ordering Session", doc.name, {"creation": opened}, update_modified=False)
	return doc.name


def _create_kot(plan, invoice_name, ctx, env, rng):
	"""Served KOT for the new invoice + execution stamps. Mirrors kot_seed._create_kot."""
	if not env.units:
		return None
	key = f"kot-{plan['key']}"
	if frappe.db.exists("URY KOT", {"comments": marker(key)}):
		return None
	inv = frappe.get_doc("POS Invoice", invoice_name)
	unit = env.units[stable_index(plan["key"], len(env.units))]
	fired = datetime.combine(plan["date"], datetime.min.time()) + timedelta(
		hours=plan["hour"], minutes=plan["minute"]
	) - timedelta(minutes=rng.randint(30, 55))
	kot = frappe.get_doc(
		{
			"doctype": "URY KOT",
			"invoice": invoice_name,
			"restaurant_table": inv.restaurant_table,
			"customer_name": inv.customer,
			"pos_profile": ctx.pos_profile,
			"naming_series": env.kot_series,
			"production": unit.name,
			"type": "New Order",
			"order_status": "Served",
			"verified": 0,
			"comments": marker(key),
			"date": fired.date(),
			"time": fired.time(),
			"table_takeaway": 0 if inv.restaurant_table else 1,
		}
	)
	for row in inv.items[:4]:
		kot.append(
			"kot_items",
			{"item": row.item_code, "item_name": row.item_name, "quantity": int(flt(row.qty)), "comments": ""},
		)
	kot.creation = fired
	kot.modified = fired
	kot.insert(ignore_permissions=True)
	kot.submit()
	frappe.db.set_value("URY KOT", kot.name, {"creation": fired, "modified": fired}, update_modified=False)
	_write_execution(kot.name, unit, fired, ctx, env, rng, [r.name for r in kot.kot_items], waiter=inv.waiter)
	return kot.name


def _write_execution(kot_name, unit, fired, ctx, env, rng, kot_item_names, waiter=None):
	"""One URY KOT Execution (SERVED) + one Item Execution per dish line.

	Stamps are real Datetimes (seconds), which is what fact_kot_exec /
	fact_kot_item_exec subtract with TIMESTAMPDIFF. `modified` is left at now()
	so this row wins the "latest modified" de-dup against older ms-apart rows;
	`creation` is the KOT fire time (queue wait = started_at - creation)."""
	cook, factor = env.cooks[stable_index(f"{kot_name}-cook", len(env.cooks))]
	dept_factor = 0.85 + 0.1 * stable_index(unit.department or unit.name, 8)  # 0.85 .. 1.55
	queue_s, prep_s, pass_s = kot_timing(rng, factor, dept_factor)
	started, ready, served = exec_stamps(fired, queue_s, prep_s, pass_s)
	key = f"{MARK}-{kot_name}"
	if not frappe.db.exists("URY KOT Execution", {"idempotency_key": key}):
		doc = frappe.get_doc(
			{
				"doctype": "URY KOT Execution",
				"kot": kot_name,
				"state": "SERVED",
				"idempotency_key": key,
				"branch": ctx.branch,
				"company": ctx.company,
				"production_unit": unit.name,
				"started_by": cook,
				"started_at": started,
				"ready_by": cook,
				"ready_at": ready,
				"served_by": waiter or cook,
				"served_at": served,
				"audit_log": json.dumps([{"event": MARK, "state": "SERVED"}]),
			}
		)
		doc.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.set_value("URY KOT Execution", doc.name, {"creation": fired}, update_modified=False)
	for item_name in kot_item_names:
		ikey = f"{MARK}-{item_name}"
		if frappe.db.exists("URY KOT Item Execution", {"idempotency_key": ikey}):
			continue
		s, r = item_stamps(started, ready, rng)
		idoc = frappe.get_doc(
			{
				"doctype": "URY KOT Item Execution",
				"kot": kot_name,
				"kot_item": item_name,
				"state": "SERVED",
				"idempotency_key": ikey,
				"branch": ctx.branch,
				"company": ctx.company,
				"production_unit": unit.name,
				"started_by": cook,
				"started_at": s,
				"ready_by": cook,
				"ready_at": r,
				"served_by": waiter or cook,
				"served_at": served,
			}
		)
		idoc.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.set_value("URY KOT Item Execution", idoc.name, {"creation": fired}, update_modified=False)


def _invoice_env(ctx):
	hs = _hs()
	items = hs._get_items()
	price_list = hs._get_price_list()
	item_prices = hs._get_item_prices(price_list)
	priced = sorted([i for i in items if i.item_code in item_prices], key=lambda i: i.item_code)
	cashiers = hs._get_staff_users("URY Cashier") or ["Administrator"]
	waiters = hs._get_staff_users("URY Captain") or ["Administrator"]
	return frappe._dict(
		priced_items=priced,
		price_list=price_list,
		item_prices=item_prices,
		customers=sorted(hs._get_customers(), key=lambda c: c.name),
		tables=sorted(hs._get_tables(ctx.branch)),
		tax_template=hs._get_tax_template(ctx.restaurant),
		mode_of_payment=hs._get_mode_of_payment(),
		currency=frappe.db.get_value("Company", ctx.company, "default_currency") or "INR",
		cashiers=sorted(cashiers),
		waiters=sorted(waiters),
		service_account=_service_account(ctx),
		ordering_profile=frappe.db.get_value("URY Self Ordering Profile", {"branch": ctx.branch}, "name")
		or frappe.db.get_value("URY Self Ordering Profile", {}, "name"),
		units=_production_units(ctx.branch),
		cooks=_ensure_cooks(),
		kot_series=(frappe.db.get_value("POS Profile", ctx.pos_profile, "custom_kot_naming_series") or "KOT-URY-"),
	)


def seed_invoices():
	ctx = _ctx()
	if not ctx or not ctx.pos_profile:
		print("gap_data_seed.invoices: no Branch/Company/POS Profile; skipping")
		return {"skipped": True}
	frappe.set_user("Administrator")
	env = _invoice_env(ctx)
	if not (env.priced_items and env.customers and env.mode_of_payment):
		print("gap_data_seed.invoices: missing items/prices/customers/mode of payment; skipping")
		return {"skipped": True}
	plans = build_invoice_plan(today(), len(env.cashiers), len(env.waiters))
	made = sessions = kots = failed = 0
	for plan in plans:
		sub = random.Random(f"{SEED}-{plan['key']}")
		if _invoice_exists(plan["key"]):
			continue
		try:
			name = _create_invoice(plan, ctx, env, sub)
			made += 1
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			failed += 1
			print(f"  ! invoice {plan['key']} {plan['date']} failed: {e}")
			continue
		if plan["self_order"]:
			try:
				if _create_session(plan, name, ctx, env):
					sessions += 1
				frappe.db.commit()
			except Exception as e:
				frappe.db.rollback()
				print(f"  ! ordering session {plan['key']} failed: {e}")
		try:
			if _create_kot(plan, name, ctx, env, sub):
				kots += 1
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			print(f"  ! KOT {plan['key']} failed: {e}")
	out = {"invoices": made, "sessions": sessions, "kots": kots, "failed": failed, "planned": len(plans)}
	print(f"gap_data_seed.invoices: {out}")
	return out


# ---------------------------------------------------------------------------
# Part 2: returns (credit notes)
# ---------------------------------------------------------------------------

def seed_returns():
	ctx = _ctx()
	if not ctx or not ctx.pos_profile:
		return {"skipped": True}
	frappe.set_user("Administrator")
	made = failed = 0
	rng = rng_for("returns")
	candidates = _return_candidates()
	for key, src in candidates:
		rkey = f"{key}-return"
		if _invoice_exists(rkey):
			continue
		try:
			from erpnext.accounts.doctype.pos_invoice.pos_invoice import make_sales_return

			ret = make_sales_return(src)
			orig_date = getdate(frappe.db.get_value("POS Invoice", src, "posting_date"))
			delay = rng.choice([0, 0, 1])
			ret_date = min(orig_date + timedelta(days=delay), getdate(today()))
			ret.set_posting_time = 1
			ret.posting_date = ret_date
			ret.posting_time = f"{min(23, 13 + rng.randint(0, 8)):02d}:{rng.randint(0, 59):02d}:00"
			ret.remarks = marker(rkey)
			ret.insert(ignore_permissions=True)
			if ret.restaurant_table:
				frappe.db.set_value("POS Invoice", ret.name, "invoice_printed", 1)
			ret = frappe.get_doc("POS Invoice", ret.name)
			ret.submit()
			made += 1
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			failed += 1
			print(f"  ! return for {src} failed: {e}")
	out = {"returns": made, "failed": failed, "candidates": len(candidates)}
	print(f"gap_data_seed.returns: {out}")
	return out


def _return_candidates():
	"""[(key, invoice_name)] for submitted seeded invoices flagged for a return.

	The flag is recomputed per key (stable_index) rather than from the plan
	stream so it does not depend on staff counts: ~11% of seeded invoices from
	the last 30 days, never ones already returned."""
	since = add_days(today(), -30)
	rows = frappe.db.sql(
		"""SELECT name, remarks FROM `tabPOS Invoice`
		WHERE docstatus = 1 AND is_return = 0 AND remarks LIKE %s AND posting_date >= %s
		AND IFNULL(consolidated_invoice, '') = ''
		ORDER BY posting_date, name""",
		(f"[{MARK}:inv-%", since),
		as_dict=True,
	)
	out = []
	for r in rows:
		key = r.remarks.strip("[]").split(":", 1)[1]
		if stable_index(key, 100) < 11:
			out.append((key, r.name))
	return out


# ---------------------------------------------------------------------------
# Part 3: realistic timings for existing KOTs
# ---------------------------------------------------------------------------

def seed_kot_timing(limit=250):
	ctx = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	cooks = _ensure_cooks()
	if not cooks:
		return {"skipped": True, "reason": "no cooks"}
	env = frappe._dict(cooks=cooks)
	rng = rng_for("kot_timing")
	since = add_days(today(), -WINDOW_DAYS)
	# KOTs that already carry a believable execution (>= 60 s start->ready) or
	# our own row are left alone.
	good = {
		r[0]
		for r in frappe.db.sql(
			"""SELECT DISTINCT kot FROM `tabURY KOT Execution`
			WHERE started_at IS NOT NULL AND ready_at IS NOT NULL
			AND TIMESTAMPDIFF(SECOND, started_at, ready_at) >= 60"""
		)
	}
	kots = frappe.get_all(
		"URY KOT",
		filters={"docstatus": 1, "date": [">=", since], "order_status": "Served"},
		fields=["name", "date", "time", "production", "branch", "comments"],
		order_by="date asc, name asc",
		limit_page_length=5000,
	)
	units = {u.name: u for u in _production_units(ctx.branch)}
	made = 0
	for k in kots:
		if made >= limit:
			break
		if k.name in good or not k.production or (k.comments or "").startswith(f"[{MARK}:"):
			continue
		unit = units.get(k.production) or frappe._dict(name=k.production, department=None)
		fired = get_datetime(f"{k.date} {k.time}")
		try:
			item_names = frappe.get_all("URY KOT Items", filters={"parent": k.name}, pluck="name")
			_write_execution(k.name, unit, fired, ctx, env, rng, item_names)
			made += 1
			if made % 25 == 0:
				frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			print(f"  ! timing for {k.name} failed: {e}")
	frappe.db.commit()
	out = {"kots_with_new_timings": made, "candidates": len(kots)}
	print(f"gap_data_seed.kot_timing: {out}")
	return out


# ---------------------------------------------------------------------------
# Part 4: yield
# ---------------------------------------------------------------------------

def _departments():
	return frappe.get_all("URY Production Department", pluck="name", order_by="name asc")


def _yield_items(branch):
	return frappe.get_all(
		"Item",
		filters={"disabled": 0, "custom_yield_tracked": 1, "custom_yield_percent": [">", 0]},
		fields=["name", "stock_uom", "custom_yield_percent", "valuation_rate"],
		order_by="name asc",
		limit_page_length=40,
	)


def seed_yield():
	ctx = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	depts = _departments()
	cooks = _ensure_cooks()
	if not depts:
		print("gap_data_seed.yield: no URY Production Department; skipping")
		return {"skipped": True}
	unit_by_dept = {u.department: u.name for u in _production_units(ctx.branch) if u.department}

	# 1) add the missing department / checker on existing checks (fields only).
	filled = 0
	for chk in frappe.get_all(
		"URY Yield Check", filters={"department": ["is", "not set"]}, fields=["name", "item", "checked_by"]
	):
		dept = depts[stable_index(chk.item, len(depts))]
		values = {"department": dept}
		if unit_by_dept.get(dept):
			values["production_unit"] = unit_by_dept[dept]
		if (not chk.checked_by or chk.checked_by == "Administrator") and cooks:
			values["checked_by"] = cooks[stable_index(chk.name, len(cooks))][0]
		frappe.db.set_value("URY Yield Check", chk.name, values, update_modified=False)
		filled += 1

	# 2) new checks every 3 days per item with department + checker.
	items = _yield_items(ctx.branch)
	rng = rng_for("yield")
	created = failed = 0
	if not items:
		print("gap_data_seed.yield: no yield-tracked Items; only existing checks were updated")
	for idx, it in enumerate(items):
		dept = depts[stable_index(it.name, len(depts))]
		for off in range(WINDOW_DAYS - 1, -1, -1):
			if (off + idx) % 3:
				continue
			day = getdate(add_days(today(), -off))
			sub = random.Random(f"{SEED}-yield-{it.name}-{day}")
			if frappe.db.exists(
				"URY Yield Check",
				{
					"item": it.name,
					"branch": ctx.branch,
					"checked_on": ["between", [f"{day} 00:00:00", f"{day} 23:59:59"]],
				},
			):
				continue
			std = flt(it.custom_yield_percent)
			actual = plan_yield_actual(std, sub)
			input_qty = round(sub.uniform(6, 35), 2)
			output_qty = round(input_qty * actual / 100.0, 3)
			checked_on = f"{day} {8 + sub.randint(0, 12):02d}:{sub.randint(0, 59):02d}:00"
			try:
				doc = frappe.get_doc(
					{
						"doctype": "URY Yield Check",
						"item": it.name,
						"branch": ctx.branch,
						"company": ctx.company,
						"input_qty": input_qty,
						"output_qty": output_qty,
						"stock_uom": it.stock_uom,
						"check_type": sub.choice(YIELD_CHECK_TYPES),
						"department": dept,
						"production_unit": unit_by_dept.get(dept),
						"checked_by": cooks[sub.randint(0, len(cooks) - 1)][0] if cooks else "Administrator",
						"checked_on": checked_on,
					}
				)
				doc.insert(ignore_permissions=True)
				frappe.db.set_value(
					"URY Yield Check", doc.name, {"creation": checked_on, "modified": checked_on}, update_modified=False
				)
				created += 1
			except Exception as e:
				frappe.db.rollback()
				failed += 1
				if failed <= 5:
					print(f"  ! yield check {it.name} {day} failed: {e}")
		frappe.db.commit()
	frappe.db.commit()
	out = {"existing_checks_filled": filled, "new_checks": created, "failed": failed}
	print(f"gap_data_seed.yield: {out}")
	return out


# ---------------------------------------------------------------------------
# Part 5: wastage
# ---------------------------------------------------------------------------

def _wastage_items(limit=30):
	rows = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_stock_item": 1, "has_variants": 0},
		fields=["name", "item_name", "stock_uom", "valuation_rate", "last_purchase_rate"],
		order_by="name asc",
		limit_page_length=400,
	)
	# prefer raw/prepared stock items that have a rate; keep a stable order
	rated = [r for r in rows if flt(r.valuation_rate) or flt(r.last_purchase_rate)]
	return (rated or rows)[:limit]


def seed_wastage(count=45):
	ctx = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	items = _wastage_items()
	depts = _departments()
	if not items:
		print("gap_data_seed.wastage: no stock Items; skipping")
		return {"skipped": True}
	units = {u.department: u.name for u in _production_units(ctx.branch) if u.department}
	cooks = _ensure_cooks()
	rng = rng_for("wastage")
	made = failed = 0
	for p in plan_wastage(today(), count, rng):
		note = marker(p["key"])
		sub = random.Random(f"{SEED}-{p['key']}")
		if frappe.db.exists("URY Wastage", {"reason_notes": ["like", f"%{note}%"]}):
			continue
		dept = depts[sub.randint(0, len(depts) - 1)] if depts else None
		item = items[sub.randint(0, len(items) - 1)]
		rate = flt(item.valuation_rate) or flt(item.last_purchase_rate) or 60
		qty = round(max(0.25, p["qty_factor"]), 2)
		captured = datetime.combine(p["date"], datetime.min.time()) + timedelta(hours=p["hour"], minutes=sub.randint(0, 59))
		status = "Authorized" if p["authorized"] else "Rejected"
		who = cooks[sub.randint(0, len(cooks) - 1)][0] if cooks else "Administrator"
		try:
			doc = frappe.get_doc(
				{
					"doctype": "URY Wastage",
					"branch": ctx.branch,
					"company": ctx.company,
					"department": dept,
					"production_unit": units.get(dept),
					"warehouse": ctx.warehouse,
					"status": "Draft",
					"reason_category": p["reason"],
					"reason_notes": f"{p['reason'].lower()} on the line {note}",
					"captured_by": who,
					"captured_on": captured,
					"posting_date": p["date"],
					"posting_time": captured.strftime("%H:%M:%S"),
					"edit_posting_date": 1,
					"items": [
						{
							"item_code": item.name,
							"item_name": item.item_name,
							"qty": qty,
							"uom": item.stock_uom,
							"rate": rate,
							"amount": round(qty * rate, 2),
						}
					],
				}
			)
			# Seed-only bypass: no stock validation, no workflow, no Stock Entry.
			doc.flags.ignore_validate = True
			doc.flags.ignore_mandatory = True
			doc.insert(ignore_permissions=True, ignore_mandatory=True)
			values = {
				"docstatus": 1,
				"status": status,
				"approved_by": "Administrator",
				"approved_on": captured + timedelta(hours=1),
				"approval_permission_basis": "Stock Manager" if status == "Authorized" else "System Manager",
				"captured_on": captured,
				"posting_date": p["date"],
				"creation": captured,
			}
			if frappe.get_meta("URY Wastage").has_field("workflow_state"):
				values["workflow_state"] = "Approved" if status == "Authorized" else "Rejected"
			frappe.db.set_value("URY Wastage", doc.name, values, update_modified=False)
			frappe.db.sql("UPDATE `tabWastage Item` SET docstatus = 1 WHERE parent = %s", (doc.name,))
			made += 1
			if made % 15 == 0:
				frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			failed += 1
			print(f"  ! wastage {p['key']} failed: {e}")
	frappe.db.commit()
	out = {"wastage_docs": made, "failed": failed}
	print(f"gap_data_seed.wastage: {out}")
	return out


# ---------------------------------------------------------------------------
# Part 6: bulk production
# ---------------------------------------------------------------------------

def _usable_boms():
	return frappe.db.sql(
		"""SELECT name, item, item_name, quantity, total_cost FROM `tabBOM`
		WHERE docstatus = 1 AND is_active = 1 AND IFNULL(quantity, 0) > 0 AND IFNULL(total_cost, 0) > 0
		ORDER BY name""",
		as_dict=True,
	)


def _ensure_demo_bom(ctx):
	"""Fallback when the site has no costed BOM: a small BOM for a demo batch item."""
	raw = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_stock_item": 1, "valuation_rate": [">", 0]},
		fields=["name", "stock_uom", "valuation_rate"],
		order_by="name asc",
		limit_page_length=3,
	)
	if len(raw) < 2:
		return []
	code = "GAP-BATCH-GRAVY"
	if not frappe.db.exists("Item", code):
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name")
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": "Batch Gravy Base (Demo)",
				"item_group": group,
				"stock_uom": raw[0].stock_uom,
				"is_stock_item": 1,
				"is_sales_item": 0,
				"is_purchase_item": 0,
			}
		).insert(ignore_permissions=True)
	existing = frappe.db.get_value("BOM", {"item": code, "docstatus": 1, "is_active": 1}, "name")
	if not existing:
		bom = frappe.get_doc(
			{
				"doctype": "BOM",
				"item": code,
				"quantity": 10,
				"company": ctx.company,
				"rm_cost_as_per": "Valuation Rate",
				"items": [
					{"item_code": r.name, "qty": 2 + i, "uom": r.stock_uom, "rate": flt(r.valuation_rate)}
					for i, r in enumerate(raw)
				],
			}
		)
		bom.insert(ignore_permissions=True)
		bom.submit()
	return _usable_boms()


def seed_bulk_production(count=14):
	ctx = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	boms = _usable_boms()
	if not boms:
		try:
			boms = _ensure_demo_bom(ctx)
		except Exception as e:
			frappe.db.rollback()
			print(f"  ! could not create a demo BOM: {e}")
	if not boms:
		print("gap_data_seed.bulk_production: no costed BOM available; skipping")
		return {"skipped": True, "reason": "no BOM"}
	rng = rng_for("bulk")
	made = failed = 0
	for run in plan_bulk_runs(today(), count, rng):
		sub = random.Random(f"{SEED}-{run['key']}")
		picks, seen = [], set()
		for b in sub.sample(boms, len(boms)):
			if b.item not in seen and len(picks) < run["lines"]:
				seen.add(b.item)
				picks.append(b)
		# natural key: a run on this date that already holds the first BOM
		if frappe.db.sql(
			"""SELECT bp.name FROM `tabBulk Production` bp
			JOIN `tabBulk Production Items` bi ON bi.parent = bp.name
			WHERE bp.posting_date = %s AND bp.branch = %s AND bi.bom = %s AND bp.docstatus = 1""",
			(run["date"], ctx.branch, picks[0].name),
		):
			continue
		try:
			doc = frappe.get_doc(
				{
					"doctype": "Bulk Production",
					"posting_date": run["date"],
					"edit_posting_date": 1,
					"branch": ctx.branch,
					"company": ctx.company,
					"warehouse": ctx.warehouse,
					"bulk_production_items": [
						{"bom": b.name, "item_name": b.item_name or b.item, "qty": round(sub.uniform(1, 8) * flt(b.quantity), 2)}
						for b in picks
					],
				}
			)
			doc.insert(ignore_permissions=True)
			# Seed-only: mark submitted without on_submit (which would queue a
			# Stock Entry and move stock).
			frappe.db.set_value(
				"Bulk Production",
				doc.name,
				{"docstatus": 1, "status": "Submitted", "total_cost": doc.total_cost, "creation": run["date"]},
				update_modified=False,
			)
			frappe.db.sql("UPDATE `tabBulk Production Items` SET docstatus = 1 WHERE parent = %s", (doc.name,))
			made += 1
		except Exception as e:
			frappe.db.rollback()
			failed += 1
			print(f"  ! bulk production {run['key']} failed: {e}")
	frappe.db.commit()
	out = {"bulk_production_docs": made, "failed": failed}
	print(f"gap_data_seed.bulk_production: {out}")
	return out


# ---------------------------------------------------------------------------
# Part 7: cost variance snapshots
# ---------------------------------------------------------------------------

def seed_cost_variance():
	ctx = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	items = frappe.get_all(
		"Item",
		filters={"disabled": 0, "is_sales_item": 1},
		fields=["name"],
		order_by="name asc",
		limit_page_length=8,
	)
	if not items:
		return {"skipped": True}
	reasons = ["BOM revision drift", "Portion size variance", "Vendor price change", "Wastage not recorded"]
	made = 0
	for idx, it in enumerate(items):
		for off in range(WINDOW_DAYS - 1, -1, -1):
			if (off + idx * 2) % 7:
				continue
			day = getdate(add_days(today(), -off))
			if frappe.db.exists(
				"URY Cost Variance Snapshot",
				{"item_code": it.name, "company": ctx.company, "computed_at": ["between", [f"{day} 00:00:00", f"{day} 23:59:59"]]},
			):
				continue
			sub = random.Random(f"{SEED}-cv-{it.name}-{day}")
			qty = 10 + sub.randint(0, 4) * 5
			theo = round(qty * sub.uniform(4.0, 9.0), 2)
			drift = sub.uniform(-0.12, 0.18)
			counted_cost = round(theo * (1 + drift), 2)
			counted_qty = round(qty * (1 - sub.uniform(0, 0.08)), 2)
			computed_at = datetime.combine(day, datetime.min.time()) + timedelta(hours=6, minutes=sub.randint(0, 30))
			try:
				doc = frappe.get_doc(
					{
						"doctype": "URY Cost Variance Snapshot",
						"item_code": it.name,
						"qty": qty,
						"company": ctx.company,
						"computed_at": computed_at,
						"theoretical_cost": theo,
						"posted_cost": theo,
						"counted_qty": counted_qty,
						"counted_cost": counted_cost,
						"variance_vs_theoretical": round(counted_cost - theo, 2),
						"variance_vs_counted": 0.0,
						"reason": reasons[(idx + off) % len(reasons)],
					}
				)
				doc.insert(ignore_permissions=True)
				made += 1
			except Exception as e:
				frappe.db.rollback()
				print(f"  ! cost variance {it.name} {day} failed: {e}")
	frappe.db.commit()
	out = {"cost_variance_snapshots": made}
	print(f"gap_data_seed.cost_variance: {out}")
	return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

_RUNNERS = {
	"invoices": seed_invoices,
	"returns": seed_returns,
	"kot_timing": seed_kot_timing,
	"yield": seed_yield,
	"wastage": seed_wastage,
	"bulk_production": seed_bulk_production,
	"cost_variance": seed_cost_variance,
}


def seed(parts=None):
	"""Run all parts (or the comma separated subset in `parts`), in order."""
	chosen = parts_from_arg(parts)
	summary = {}
	for name in chosen:
		print(f"=== gap_data_seed: {name} ===")
		try:
			summary[name] = _RUNNERS[name]()
		except Exception as e:
			frappe.db.rollback()
			summary[name] = {"error": str(e)}
			print(f"  ! part {name} aborted: {e}")
	frappe.db.commit()
	print(f"gap_data_seed done: {summary}")
	return summary


run = seed
