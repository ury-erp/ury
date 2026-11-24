"""Demo data: KOTs (Kitchen Order Tickets) for the orders that have none.

The demo bench has ~1,700 submitted POS Invoices but only a few hundred KOTs,
none after 3 Nov, so every kitchen number (DB05 Department & production, DB06
Kitchen timing, DB08 cook speed) is empty on the days that have sales. This
seed gives every submitted, non-return POS Invoice that has no KOT yet its
tickets, so "orders" and "KOTs" line up day for day.

Per order
---------
* One KOT per kitchen station the order touches, in the invoice's own branch.
  A line goes to the Bar (drinks), the Salad station or the Kitchen from its
  item group; a branch without that station sends the line to its Kitchen.
* Every invoice line is on exactly one ticket and carries the invoice's
  quantity, so KOT dishes tie out to dishes sold (no double counting).
* ~4% of orders (with 2+ lines on a station) have their last line on a second
  "Order Modified" ticket fired a few minutes after the first.
* ~2.5% of tickets get a "Cancelled" / "Partially cancelled" ticket of their
  own (series CNCL-KOT-<branch>-, ``original_kot`` set, ``cancelled_qty`` and
  ``disposition`` filled), like the cancellations already on the demo.
* Fire time is 25-55 min before the bill, kept inside the invoice's own day
  and in the past. Each ticket gets a served URY KOT Execution + one Item
  Execution per dish (queue / prep / pass stamps) via
  ``gap_data_seed._write_execution`` so the timing charts have data.

Idempotency: each ticket carries ``[order-kot:<invoice>:<station>:<type>]`` in
``comments``; invoices that already have any KOT are skipped, so a second run
creates nothing. Randomness is seeded from ``SEED`` and the invoice name.

Usage::

    bench --site urytest2 execute ury.ury.dev_seed.order_kot_seed.seed
    bench --site urytest2 execute ury.ury.dev_seed.order_kot_seed.seed --kwargs '{"limit": 20}'
"""

import random
from datetime import datetime, timedelta

import frappe
from frappe.utils import flt, get_datetime, now_datetime

from ury.ury.dev_seed import gap_data_seed as gap

SEED = 20261124
MARK = "order-kot"

MODIFIED_PROB = 0.04
CANCEL_PROB = 0.025
MIN_LEAD_MIN, MAX_LEAD_MIN = 25, 55  # KOT fired this long before the bill

DRINK_WORDS = ("beverage", "drink", "juice", "mocktail", "coffee", "tea", "shake", "soda")
SALAD_WORDS = ("salad",)


def station_of_group(item_group):
	g = (item_group or "").lower()
	if any(w in g for w in DRINK_WORDS):
		return "bar"
	if any(w in g for w in SALAD_WORDS):
		return "salad"
	return "kitchen"


def station_of_unit(unit_name):
	n = (unit_name or "").lower()
	if n.startswith("bar") or n.startswith("bev"):
		return "bar"
	if n.startswith("salad"):
		return "salad"
	return "kitchen"


def pick_unit(units_by_station, station):
	"""Unit for a station; a branch without it falls back to its Kitchen."""
	return units_by_station.get(station) or units_by_station.get("kitchen") or next(iter(units_by_station.values()), None)


def marker(invoice, station, kot_type):
	return f"[{MARK}:{invoice}:{station}:{kot_type}]"


def fire_time(posting_dt, now, rng):
	"""Fire the KOT before the bill, inside the invoice day and in the past."""
	fired = posting_dt - timedelta(minutes=rng.randint(MIN_LEAD_MIN, MAX_LEAD_MIN), seconds=rng.randint(0, 59))
	day_start = datetime.combine(posting_dt.date(), datetime.min.time()) + timedelta(minutes=rng.randint(1, 20))
	fired = max(fired, day_start)
	latest = now - timedelta(minutes=45)  # leave room for queue + prep + pass
	if fired > latest and fired.date() == latest.date():
		fired = latest - timedelta(seconds=rng.randint(0, 600))
	return min(fired, latest)


def _units_by_branch():
	out = {}
	rows = frappe.get_all("URY Production Unit", fields=["name", "branch", "department", "enabled"], order_by="name asc")
	for r in rows:
		if r.enabled == 0:
			continue
		out.setdefault(r.branch, {}).setdefault(station_of_unit(r.name), r)
	return out


def _kot_series(branch, pos_profile):
	series = frappe.db.get_value("POS Profile", pos_profile, "custom_kot_naming_series") if pos_profile else None
	return series or "KOT-URY-"


def _cancel_series(kot_series):
	# KOT-GFJ- -> CNCL-KOT-GFJ-
	return f"CNCL-{kot_series}"


def _candidates(limit=None):
	"""Submitted, non-return invoices with no KOT, oldest first."""
	q = """
		SELECT pi.name
		FROM `tabPOS Invoice` pi
		WHERE pi.docstatus = 1 AND IFNULL(pi.is_return, 0) = 0
		  AND NOT EXISTS (SELECT 1 FROM `tabURY KOT` k WHERE k.invoice = pi.name)
		ORDER BY pi.posting_date, pi.posting_time, pi.name
	"""
	if limit:
		q += f" LIMIT {int(limit)}"
	return [r[0] for r in frappe.db.sql(q)]


def _new_kot(inv, unit, kot_type, lines, fired, series, note, original_kot=None, branch=None):
	kot = frappe.get_doc(
		{
			"doctype": "URY KOT",
			"invoice": inv.name,
			"restaurant_table": inv.get("restaurant_table"),
			"customer_name": inv.customer,
			"pos_profile": inv.pos_profile,
			"naming_series": series,
			"production": unit.name,
			"branch": branch,
			"type": kot_type,
			"order_status": "Served",
			"verified": 1 if kot_type != "New Order" and kot_type != "Order Modified" else 0,
			"comments": note,
			"date": fired.date(),
			"time": fired.time(),
			"table_takeaway": 0 if inv.get("restaurant_table") else 1,
			"original_kot": original_kot,
		}
	)
	for ln in lines:
		kot.append(
			"kot_items",
			{
				"item": ln["item"],
				"item_name": ln["item_name"],
				"quantity": ln["qty"],
				"cancelled_qty": ln.get("cancelled_qty", 0),
				"disposition": ln.get("disposition", "Pending"),
				"comments": "",
			},
		)
	kot.creation = fired
	kot.modified = fired
	kot.insert(ignore_permissions=True)
	kot.submit()
	frappe.db.set_value("URY KOT", kot.name, {"creation": fired, "modified": fired}, update_modified=False)
	return kot


def _seed_order(invoice_name, units_by_branch, cooks, now):
	inv = frappe.get_doc("POS Invoice", invoice_name)
	units = units_by_branch.get(inv.branch) or {}
	if not units or not inv.items:
		return 0
	rng = random.Random(f"{SEED}-{invoice_name}")
	posting_dt = get_datetime(f"{inv.posting_date} {inv.posting_time}")
	series = _kot_series(inv.branch, inv.pos_profile)
	ctx = frappe._dict(
		branch=inv.branch,
		company=inv.company,
	)
	env = frappe._dict(cooks=cooks)

	# group lines by station
	groups = {}
	for row in inv.items:
		qty = int(round(flt(row.qty)))
		if qty <= 0:
			continue
		station = station_of_group(row.item_group)
		groups.setdefault(station, []).append(
			{"item": row.item_code, "item_name": row.item_name, "qty": qty}
		)

	fired_base = fire_time(posting_dt, now, rng)
	made = 0
	for station, lines in sorted(groups.items()):
		unit = pick_unit(units, station)
		if not unit:
			continue
		# a unit may be shared when a station is missing: same unit, same ticket group
		fired = fired_base + timedelta(seconds=rng.randint(0, 90))
		tickets = [("New Order", lines, fired)]
		if len(lines) >= 2 and rng.random() < MODIFIED_PROB:
			tickets = [
				("New Order", lines[:-1], fired),
				("Order Modified", lines[-1:], min(fired + timedelta(minutes=rng.randint(4, 12)), now - timedelta(minutes=40))),
			]
		for kot_type, tlines, tfired in tickets:
			kot = _new_kot(
				inv, unit, kot_type, tlines, tfired, series, marker(inv.name, station, kot_type), branch=inv.branch
			)
			made += 1
			gap._write_execution(
				kot.name,
				frappe._dict(name=unit.name, department=unit.department),
				tfired,
				ctx,
				env,
				rng,
				[r.name for r in kot.kot_items],
				waiter=inv.get("waiter"),
			)
			_finish_timing(kot.name, tfired)
			if kot_type == "New Order" and rng.random() < CANCEL_PROB:
				made += _cancel_ticket(inv, unit, kot, tlines, tfired, series, rng, now)
	return made


def _finish_timing(kot_name, fired):
	"""Mirror serve_kot(): start_time_prep / start_time_serv / production_time."""
	ex = frappe.db.get_value(
		"URY KOT Execution",
		{"kot": kot_name, "state": "SERVED"},
		["started_at", "served_at"],
		order_by="modified desc",
	)
	if not ex or not ex[0] or not ex[1]:
		return
	started, served = ex
	frappe.db.set_value(
		"URY KOT",
		kot_name,
		{
			"start_time_prep": started.strftime("%H:%M:%S"),
			"start_time_serv": served.strftime("%H:%M:%S"),
			"production_time": round((served - fired).total_seconds() / 60, 2),
		},
		update_modified=False,
	)


def _cancel_ticket(inv, unit, kot, lines, fired, series, rng, now):
	"""A cancellation ticket against ``kot`` for one of its lines."""
	ln = rng.choice(lines)
	cancelled = 1 if ln["qty"] > 1 or rng.random() < 0.5 else ln["qty"]
	cancelled = min(cancelled, ln["qty"])
	kot_type = "Partially cancelled" if cancelled < ln["qty"] else "Cancelled"
	when = min(fired + timedelta(minutes=rng.randint(2, 9)), now - timedelta(minutes=40))
	ctk = _new_kot(
		inv,
		unit,
		kot_type,
		[
			{
				"item": ln["item"],
				"item_name": ln["item_name"],
				"qty": ln["qty"],
				"cancelled_qty": cancelled,
				"disposition": rng.choice(["Returned to Stock", "Wasted", "Pending"]),
			}
		],
		when,
		_cancel_series(series),
		marker(inv.name, unit.name, kot_type),
		original_kot=kot.name,
		branch=inv.branch,
	)
	frappe.db.set_value("URY KOT", ctk.name, "verified_by", "Administrator", update_modified=False)
	return 1


def seed(limit=None):
	"""Create KOTs for every order that has none. ``limit`` caps the invoices handled."""
	frappe.set_user("Administrator")
	units_by_branch = _units_by_branch()
	cooks = gap._ensure_cooks()
	if not units_by_branch or not cooks:
		print("order_kot_seed: no production units or cooks; skipping")
		return {"skipped": True}
	now = now_datetime()
	names = _candidates(limit)
	orders = kots = failed = 0
	for i, name in enumerate(names, 1):
		try:
			made = _seed_order(name, units_by_branch, cooks, now)
			if made:
				orders += 1
				kots += made
			frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			failed += 1
			print(f"  ! {name} failed: {e}")
		if i % 100 == 0:
			print(f"  ... {i}/{len(names)} orders, {kots} KOTs")
	out = {"candidates": len(names), "orders_with_new_kots": orders, "kots": kots, "failed": failed}
	print(f"order_kot_seed: {out}")
	return out
