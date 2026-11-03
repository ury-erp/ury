"""Second gap-filling pass for the URY Insights demo dashboards.

Run AFTER ``gap_data_seed``. Fills what that seed left empty. Fill-only: no
existing non-empty value is changed or deleted; every part is idempotent and
deterministic (``random.Random`` seeded from SEED).

=====================  ======================================================
Part (function)        Charts / source
=====================  ======================================================
seed_kot_exec          DB08 "Avg prep time by cook" (ready_by = real cook,
                       never Administrator) + DB06 stage times. Adds a NEWER
                       (modified = now) URY KOT Execution (+ Item Execution)
                       row for served KOTs whose latest execution row is not
                       believable (Administrator / no stamps / < 60 s prep).
                       The dashboards keep ROW_NUMBER() ... ORDER BY modified
                       DESC per (kot, production_unit), so the new row wins.
                       Why gap_data_seed.kot_timing made 0: it skipped every
                       KOT having ANY execution with >= 60 s start->ready,
                       regardless of who tapped ready (Administrator rows
                       counted as "good") and only looked at 40 KOTs.
seed_cash_differences  DB09 "Shifts with a cash difference": sets closing_amount
                       = expected_amount + difference and difference on ~8
                       recent submitted POS Closing Entry Detail rows that
                       balance exactly (db.set_value; parent totals are not
                       read by the chart and carry no difference).
seed_kot_dispositions  DB11 "Cancelled items by outcome" + DB15 "Voided
                       quantity": URY KOT Items.cancelled_qty + disposition
                       (options: Pending / Returned to Stock / Wasted).
seed_commitments       DB13 "Committed vs made": URY Sales Plan Item
                       .committed_qty (the chart reads the plan item, not the
                       reservations) + ~30 URY Stock Reservation rows over the
                       last 30 days via the doctype.
=====================  ======================================================

Usage::

    bench --site sa-v16-latest-demo.local execute ury.ury.dev_seed.gap_data_seed2.seed
    bench --site sa-v16-latest-demo.local execute ury.ury.dev_seed.gap_data_seed2.seed_kot_exec
"""

import json
import random
import zlib
from datetime import datetime, timedelta

import frappe
from frappe.utils import add_days, flt, get_datetime, now_datetime, today

SEED = 20261104
MARK = "gap-seed2"
WINDOW_DAYS = 30
FALLBACK_WINDOW_DAYS = 60
MIN_PREP_SECONDS = 60

CASH_DIFFS = [-40.0, 25.0, -15.0, 60.0, -80.0, 10.0, -25.0, 35.0]
DISPOSITIONS = ["Wasted", "Returned to Stock", "Pending"]
DISPOSITION_WEIGHTS = [40, 35, 25]
RESERVATION_STATUSES = ["Fulfilled", "Fulfilled", "Released", "Expired", "Reserved"]

PARTS = ("kot_exec", "cash_differences", "kot_dispositions", "commitments")


# ---------------------------------------------------------------------------
# Pure helpers (unit tested in test_gap_data_seed2.py)
# ---------------------------------------------------------------------------

def rng_for(part):
	return random.Random(f"{SEED}-{part}")


def stable_index(text, modulo):
	if modulo <= 0:
		return 0
	return zlib.crc32(str(text).encode("utf-8")) % modulo


def stage_times(rng, cook_factor=1.0, slow_prob=0.07):
	"""(queue_s, prep_s, pass_s) with queue 1-6 min, prep 6-18 min and
	order-to-serve 12-30 min; ~slow_prob of tickets are outliers of 35-50 min."""
	queue_s = rng.randint(60, 360)
	prep_s = int(min(max(rng.uniform(6, 14) * cook_factor, 6.0), 18.0) * 60) + rng.randint(0, 59)
	prep_s = min(prep_s, 18 * 60)
	pass_s = rng.randint(60, 360)
	total = queue_s + prep_s + pass_s
	if rng.random() < slow_prob:
		target = rng.randint(35 * 60, 50 * 60)
		pass_s += target - total  # stretch the hand-over/plating wait
		pass_s = max(pass_s, 60)
		return queue_s, prep_s, pass_s
	if total < 12 * 60:
		pass_s += 12 * 60 - total + rng.randint(0, 120)
	elif total > 30 * 60:
		pass_s = max(60, pass_s - (total - 30 * 60))
		total = queue_s + prep_s + pass_s
		if total > 30 * 60:
			queue_s = max(60, queue_s - (total - 30 * 60))
	return queue_s, prep_s, pass_s


def stamps(fired_at, queue_s, prep_s, pass_s):
	started = fired_at + timedelta(seconds=queue_s)
	ready = started + timedelta(seconds=prep_s)
	served = ready + timedelta(seconds=pass_s)
	return started, ready, served


def item_stamps(started, ready, rng):
	span = max(int((ready - started).total_seconds()), 2)
	s_off = rng.randint(0, span // 4)
	e_off = max(rng.randint(span * 3 // 4, span), s_off + 60)
	return started + timedelta(seconds=s_off), started + timedelta(seconds=min(e_off, span))


def is_believable(row):
	"""row: dict(ready_by, started_at, ready_at). A real, cook-attributed row."""
	if not row.get("started_at") or not row.get("ready_at"):
		return False
	if (row.get("ready_by") or "Administrator") == "Administrator":
		return False
	return (row["ready_at"] - row["started_at"]).total_seconds() >= MIN_PREP_SECONDS


def pick_exec_candidates(kots, execs, limit):
	"""kots: [{name, ...}] ascending; execs: {kot: [row dict incl. modified]}.
	A KOT is a candidate unless its latest-modified row is believable."""
	out = []
	for k in kots:
		rows = execs.get(k["name"]) or []
		if rows:
			latest = max(rows, key=lambda r: r.get("modified") or datetime.min)
			if is_believable(latest) or str(latest.get("idempotency_key") or "").startswith(MARK):
				continue
		out.append(k)
		if len(out) >= limit:
			break
	return out


def plan_cash_differences(detail_names, count=8, existing=0):
	"""[(detail_name, diff)] for `count - existing` rows, deterministic."""
	need = max(0, count - existing)
	ordered = sorted(detail_names, key=lambda n: (stable_index(n, 10**6), n))
	return [(n, CASH_DIFFS[i % len(CASH_DIFFS)]) for i, n in enumerate(ordered[:need])]


def plan_dispositions(items, target=45, existing=0):
	"""items: [(row_name, qty)] with qty >= 1. -> [(name, cancelled_qty_text, disposition)]."""
	need = max(0, target - existing)
	ordered = sorted(
		((n, q) for n, q in items if flt(q) >= 1), key=lambda t: (stable_index(t[0], 10**6), t[0])
	)
	rng = rng_for("dispositions")
	out = []
	for name, qty in ordered[:need]:
		cancelled = min(flt(qty), float(rng.choice([1, 1, 1, 2])))
		disp = rng.choices(DISPOSITIONS, DISPOSITION_WEIGHTS)[0]
		out.append((name, str(int(cancelled)) if cancelled == int(cancelled) else str(cancelled), disp))
	return out


def plan_commit_qty(qty, fulfilled, rng):
	"""Committed qty: 60-100% of plan qty, never below what was already made."""
	base = round(flt(qty) * rng.uniform(0.6, 1.0))
	return float(max(base, flt(fulfilled), 1.0 if flt(qty) >= 1 else 0.0))


def plan_reservations(today_date, count, n_items):
	"""[{key, offset, status, item_index, qty, hour}] over the last 30 days."""
	rng = rng_for("reservations")
	out = []
	for i in range(count):
		offset = (i * WINDOW_DAYS) // count + rng.randint(0, 1)
		offset = min(offset, WINDOW_DAYS - 1)
		status = RESERVATION_STATUSES[i % len(RESERVATION_STATUSES)]
		if status == "Reserved":
			offset = min(offset, 1)
		out.append(
			{
				"key": f"GAP2-RES-{i + 1:03d}",
				"date": today_date - timedelta(days=offset),
				"offset": offset,
				"status": status,
				"item_index": rng.randrange(max(n_items, 1)),
				"qty": rng.randint(2, 12),
				"hour": rng.randint(11, 21),
			}
		)
	return out


def parts_from_arg(parts):
	if not parts:
		return list(PARTS)
	if isinstance(parts, str):
		parts = [p.strip() for p in parts.split(",") if p.strip()]
	bad = [p for p in parts if p not in PARTS]
	if bad:
		raise ValueError(f"unknown part(s) {bad}; choose from {PARTS}")
	return list(parts)


# ---------------------------------------------------------------------------
# DB parts
# ---------------------------------------------------------------------------

def _ctx():
	from ury.ury.dev_seed import gap_data_seed as g1

	return g1._ctx(), g1


def seed_kot_exec(limit=250, only_served=False):
	ctx, g1 = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	cooks = g1._ensure_cooks()
	if not cooks:
		return {"skipped": True, "reason": "no cooks"}
	rng = rng_for("kot_exec")
	candidates = []
	window = WINDOW_DAYS
	for window in (WINDOW_DAYS, FALLBACK_WINDOW_DAYS):
		kots = frappe.get_all(
			"URY KOT",
			filters={"docstatus": 1, "date": ["between", [add_days(today(), -window), add_days(today(), -1)]]},
			fields=["name", "date", "time", "production", "order_status"],
			order_by="date desc, name asc",
			limit_page_length=5000,
		)
		# every dashboard reads KOTs of any status (docstatus 1/2); skip cancelled ones
		kots = [
			k for k in kots
			if (k.order_status == "Served" or not only_served) and "cancel" not in (k.order_status or "").lower()
		]
		execs = {}
		if kots:
			for r in frappe.get_all(
				"URY KOT Execution",
				filters={"kot": ["in", [k.name for k in kots]]},
				fields=["name", "kot", "production_unit", "ready_by", "started_at", "ready_at", "modified", "idempotency_key"],
				limit_page_length=50000,
			):
				execs.setdefault(r.kot, []).append(r)
		candidates = pick_exec_candidates([dict(k) for k in kots], execs, limit)
		if len(candidates) >= min(limit, 250):
			break
	made = 0
	for k in sorted(candidates, key=lambda x: x["name"]):
		rows = execs.get(k["name"]) or []
		unit = (max(rows, key=lambda r: r.modified).production_unit if rows else None) or k["production"]
		fired = get_datetime(f"{k['date']} {k['time']}")
		cook, factor = cooks[stable_index(f"{k['name']}-cook", len(cooks))]
		queue_s, prep_s, pass_s = stage_times(rng, factor)
		started, ready, served = stamps(fired, queue_s, prep_s, pass_s)
		try:
			if not frappe.db.exists("URY KOT Execution", {"idempotency_key": f"{MARK}-{k['name']}"}):
				doc = frappe.get_doc(
					{
						"doctype": "URY KOT Execution",
						"kot": k["name"],
						"state": "SERVED",
						"idempotency_key": f"{MARK}-{k['name']}",
						"branch": ctx.branch,
						"company": ctx.company,
						"production_unit": unit,
						"started_by": cook,
						"started_at": started,
						"ready_by": cook,
						"ready_at": ready,
						"served_by": cook,
						"served_at": served,
						"audit_log": json.dumps([{"event": MARK, "state": "SERVED"}]),
					}
				)
				doc.insert(ignore_permissions=True, ignore_mandatory=True)
				# creation = fire time (queue = started - creation); modified stays now() so it wins the de-dup
				frappe.db.set_value("URY KOT Execution", doc.name, {"creation": fired}, update_modified=False)
			existing_items = {
				r.kot_item: r
				for r in frappe.get_all(
					"URY KOT Item Execution",
					filters={"kot": k["name"]},
					fields=["name", "kot_item", "ready_by", "started_at", "ready_at"],
				)
			}
			for item_name in frappe.get_all("URY KOT Items", filters={"parent": k["name"]}, pluck="name"):
				s, r = item_stamps(started, ready, rng)
				cur = existing_items.get(item_name)
				if cur:
					# kot_item is UNIQUE: fix the row in place, only when Administrator/unrealistic
					if is_believable(cur):
						continue
					frappe.db.set_value(
						"URY KOT Item Execution",
						cur.name,
						{"started_by": cook, "started_at": s, "ready_by": cook, "ready_at": r, "served_by": cook, "served_at": served},
						update_modified=False,
					)
					continue
				idoc = frappe.get_doc(
					{
						"doctype": "URY KOT Item Execution",
						"kot": k["name"],
						"kot_item": item_name,
						"state": "SERVED",
						"idempotency_key": f"{MARK}-{item_name}",
						"branch": ctx.branch,
						"company": ctx.company,
						"production_unit": unit,
						"started_by": cook,
						"started_at": s,
						"ready_by": cook,
						"ready_at": r,
						"served_by": cook,
						"served_at": served,
					}
				)
				idoc.insert(ignore_permissions=True, ignore_mandatory=True)
				frappe.db.set_value("URY KOT Item Execution", idoc.name, {"creation": fired}, update_modified=False)
			made += 1
			if made % 25 == 0:
				frappe.db.commit()
		except Exception as e:
			frappe.db.rollback()
			print(f"  ! exec for {k['name']} failed: {e}")
	frappe.db.commit()
	out = {"kots_filled": made, "candidates": len(candidates), "window_days": window}
	print(f"gap_data_seed2.kot_exec: {out}")
	return out


def seed_cash_differences(count=8):
	frappe.set_user("Administrator")
	rows = frappe.db.sql(
		"""SELECT d.name, c.posting_date, d.expected_amount, d.closing_amount, d.difference, d.mode_of_payment
		FROM `tabPOS Closing Entry Detail` d JOIN `tabPOS Closing Entry` c ON c.name = d.parent
		WHERE c.docstatus = 1 ORDER BY c.posting_date DESC, c.name DESC, d.idx""",
		as_dict=True,
	)
	existing = sum(1 for r in rows if flt(r.difference) != 0)
	recent = [r for r in rows if flt(r.difference) == 0 and r.posting_date and str(r.posting_date) >= str(add_days(today(), -60))]
	cash = [r for r in recent if (r.mode_of_payment or "").lower() == "cash"]
	pool = recent
	plan = plan_cash_differences([r.name for r in sorted(pool, key=lambda r: (r not in cash, 0))][:60], count, existing)
	by_name = {r.name: r for r in pool}
	for name, diff in plan:
		exp = flt(by_name[name].expected_amount)
		frappe.db.set_value(
			"POS Closing Entry Detail",
			name,
			{"closing_amount": exp + diff, "difference": diff},
			update_modified=False,
		)
	frappe.db.commit()
	out = {"rows_set": len(plan), "already_with_difference": existing, "pool": len(pool), "cash_in_pool": len(cash)}
	print(f"gap_data_seed2.cash_differences: {out}")
	return out


def seed_kot_dispositions(target=45):
	frappe.set_user("Administrator")
	since = add_days(today(), -WINDOW_DAYS)
	rows = frappe.db.sql(
		"""SELECT i.name, i.quantity, i.cancelled_qty, i.disposition
		FROM `tabURY KOT Items` i JOIN `tabURY KOT` k ON k.name = i.parent
		WHERE k.docstatus = 1 AND k.date >= %s""",
		(since,),
		as_dict=True,
	)
	existing = [r for r in rows if flt(r.cancelled_qty) > 0]
	# fill an empty outcome on already-cancelled rows
	filled_disp = 0
	for r in existing:
		if not r.disposition:
			frappe.db.set_value("URY KOT Items", r.name, "disposition", "Pending", update_modified=False)
			filled_disp += 1
	fresh = [(r.name, flt(r.quantity)) for r in rows if not flt(r.cancelled_qty)]
	plan = plan_dispositions(fresh, target, len(existing))
	for name, qty, disp in plan:
		frappe.db.set_value(
			"URY KOT Items", name, {"cancelled_qty": qty, "disposition": disp}, update_modified=False
		)
	frappe.db.commit()
	out = {"items_set": len(plan), "already_cancelled": len(existing), "disposition_filled": filled_disp}
	print(f"gap_data_seed2.kot_dispositions: {out}")
	return out


def seed_commitments(reservations=30):
	ctx, g1 = _ctx()
	if not ctx:
		return {"skipped": True}
	frappe.set_user("Administrator")
	rng = rng_for("commit")
	items = frappe.db.sql(
		"""SELECT pi.name, pi.qty, pi.fulfilled_qty FROM `tabURY Sales Plan Item` pi
		JOIN `tabURY Sales Plan` p ON p.name = pi.parent
		WHERE p.docstatus = 1 AND IFNULL(pi.committed_qty, 0) = 0 ORDER BY pi.name""",
		as_dict=True,
	)
	for r in items:
		frappe.db.set_value(
			"URY Sales Plan Item", r.name, "committed_qty", plan_commit_qty(r.qty, r.fulfilled_qty, rng), update_modified=False
		)
	made = 0
	item_codes = frappe.get_all(
		"Item", filters={"disabled": 0, "is_sales_item": 1}, pluck="name", order_by="name asc", limit_page_length=60
	)
	if item_codes and ctx.warehouse:
		from datetime import date

		for p in plan_reservations(date.fromisoformat(str(today())), reservations, len(item_codes)):
			if frappe.db.exists("URY KOT", p["key"]) or frappe.db.exists(
				"URY Stock Reservation", {"order_ref": p["key"]}
			):
				continue
			item = item_codes[p["item_index"]]
			created = datetime.combine(p["date"], datetime.min.time()) + timedelta(hours=p["hour"])
			try:
				doc = frappe.get_doc(
					{
						"doctype": "URY Stock Reservation",
						"reservation_group": f"{MARK}-{p['key']}",
						"order_ref": p["key"],
						"policy": "SOFT",
						"status": p["status"],
						"reason": None if p["status"] == "Reserved" else "Held for dine-in order",
						"branch": ctx.branch,
						"company": ctx.company,
						"warehouse": ctx.warehouse,
						"top_level_item": item,
						"component_item": item,
						"qty": p["qty"],
						"expires_at": add_days(now_datetime(), 1) if p["status"] == "Reserved" else created + timedelta(hours=3),
						"actor": "Administrator",
						"audit_log": json.dumps([{"event": MARK, "status": p["status"]}]),
					}
				)
				doc.insert(ignore_permissions=True, ignore_mandatory=True)
				frappe.db.set_value("URY Stock Reservation", doc.name, {"creation": created}, update_modified=False)
				made += 1
			except Exception as e:
				frappe.db.rollback()
				print(f"  ! reservation {p['key']} failed: {e}")
	frappe.db.commit()
	out = {"plan_items_committed": len(items), "reservations": made}
	print(f"gap_data_seed2.commitments: {out}")
	return out


_RUNNERS = {
	"kot_exec": seed_kot_exec,
	"cash_differences": seed_cash_differences,
	"kot_dispositions": seed_kot_dispositions,
	"commitments": seed_commitments,
}


def seed(parts=None):
	out = {}
	for p in parts_from_arg(parts):
		out[p] = _RUNNERS[p]()
	print(f"gap_data_seed2.seed: {out}")
	return out
