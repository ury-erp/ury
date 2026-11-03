"""Idempotent demo data for sales targets, labour hours, tips/commission and a
second branch (isolation testing).

Run on the live demo bench::

    bench --site sa-v16-latest-demo.local execute ury.ury.dev_seed.people_targets_seed.seed

Run a single section (each is independently rerunnable)::

    bench --site <site> execute ury.ury.dev_seed.people_targets_seed.seed_branch2
    bench --site <site> execute ury.ury.dev_seed.people_targets_seed.seed_targets
    bench --site <site> execute ury.ury.dev_seed.people_targets_seed.seed_labour
    bench --site <site> execute ury.ury.dev_seed.people_targets_seed.seed_tips_and_commission
    bench --site <site> execute ury.ury.dev_seed.people_targets_seed.seed_table_timing

Sections (``seed()`` runs them in this order; one failing section never aborts
the others, errors are collected in the returned dict):

1. ``seed_branch2``  - Branch "URY Branch 2" + URY Restaurant, URY Room, URY
   Tables, POS Profile + POS Opening Entry, 5 staff Users (roles URY Cashier /
   URY Captain), Employees, and 60 submitted POS Invoices over the last 14 days.
2. ``seed_targets``  - one ``URY Sales Target`` per branch for the last 6 months
   plus the current month (SAL-021). Needs the new doctype (``bench migrate``).
3. ``seed_labour``   - Shift Type, Shift Assignment, Employee Checkin,
   Attendance (with working_hours) and weekly Timesheets for the last 60 days
   (EMP-014).
4. ``seed_tips_and_commission`` - adds Custom Field ``POS Invoice-custom_tip_amount``
   (if missing), fills it on recent submitted invoices, ensures commission
   rules exist and backfills empty ``custom_waiter_employee`` /
   ``custom_closing_employee`` on recent invoices (EMP-015).
5. ``seed_table_timing`` - URY Branch Operating Schedule for both branches and
   realistic ``arrived_time`` / ``total_spend_time`` on recent dine-in invoices
   where they are empty or 00:00:00 (TBL-009 / TBL-010 proxies).

"Do not modify existing records" is honoured except for filling previously
EMPTY fields (tip, employee attribution, dwell time) on recent invoices; nothing
non-empty is overwritten. Deterministic: ``random.seed(SEED)`` plus crc32 of
names for per-record choices.

NOT run by seed(): ``create_branch_chairman_user`` (see bottom).
"""

import calendar
import random
import zlib
from datetime import date, datetime, timedelta

import frappe
from frappe.utils import add_days, flt, getdate, today

SEED = 20260603

BRANCH2 = "URY Branch 2"
BRANCH2_RESTAURANT = "URY Branch 2 Restaurant"
BRANCH2_ROOM = "Branch 2 Dining"
BRANCH2_TABLES = [("B2-T1", 2), ("B2-T2", 4), ("B2-T3", 4), ("B2-T4", 6), ("B2-T5", 8)]
BRANCH2_INVOICE_TARGET = 60
BRANCH2_INVOICE_DAYS = 14
BRANCH2_STAFF = [
	# (email, first, last, role, designation)
	("b2.cashier1@ury.local", "Anita", "Verma", "URY Cashier", "Cashier"),
	("b2.cashier2@ury.local", "Rohit", "Kulkarni", "URY Cashier", "Cashier"),
	("b2.captain1@ury.local", "Neha", "Iyer", "URY Captain", "Captain"),
	("b2.captain2@ury.local", "Karan", "Malhotra", "URY Captain", "Captain"),
	("b2.captain3@ury.local", "Divya", "Reddy", "URY Captain", "Captain"),
]

TARGET_MONTHS_BACK = 6
FALLBACK_DAILY_NET = 20000.0

LABOUR_DAYS = 60
SHIFT_MORNING = "URY Morning Shift"   # 10:00-18:00
SHIFT_EVENING = "URY Evening Shift"   # 15:00-23:30
TIP_FIELD = "custom_tip_amount"
TIP_DAYS = 60

ROLE_DESIGNATION = {"URY Cashier": "Cashier", "URY Captain": "Captain"}


# ---------------------------------------------------------------------------
# Pure helpers (unit-tested without a database)
# ---------------------------------------------------------------------------

def stable_int(key):
	"""Deterministic non-negative int for a string key (crc32)."""
	return zlib.crc32(str(key).encode("utf-8")) & 0xFFFFFFFF


def month_periods(ref, months_back=TARGET_MONTHS_BACK):
	"""[(start, end)] for ``months_back`` full months before ``ref``'s month plus
	ref's own month, oldest first. Dates are ``datetime.date``."""
	ref = getdate(ref)
	periods = []
	for back in range(months_back, -1, -1):
		total = ref.year * 12 + (ref.month - 1) - back
		year, month = divmod(total, 12)
		month += 1
		last = calendar.monthrange(year, month)[1]
		periods.append((date(year, month, 1), date(year, month, last)))
	return periods


def target_amount_for(period_start, period_end, avg_daily_net):
	"""Round (nearest 5,000) monthly target: avg daily net x days x a
	deterministic 0.92-1.12 stretch factor derived from the month."""
	days = (period_end - period_start).days + 1
	factor = 0.92 + (stable_int(period_start.isoformat()) % 21) / 100.0  # 0.92..1.12
	raw = max(avg_daily_net, 1.0) * days * factor
	return float(max(5000, int(round(raw / 5000.0)) * 5000))


def tip_for(invoice_name, grand_total):
	"""Deterministic tip: ~40% of bills carry none, rest 5/7/10/12% rounded."""
	if grand_total <= 0:
		return 0.0
	bucket = stable_int("tip:" + invoice_name) % 10
	pct = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0.05, 5: 0.05, 6: 0.07, 7: 0.10, 8: 0.10, 9: 0.12}[bucket]
	return float(round(grand_total * pct))


def dwell_seconds_for(invoice_name):
	"""Seat-to-clear dwell 30-110 minutes, deterministic per invoice."""
	return (30 + stable_int("dwell:" + invoice_name) % 81) * 60


def format_hms(seconds):
	h, rem = divmod(int(seconds), 3600)
	m, s = divmod(rem, 60)
	return f"{h:02d}:{m:02d}:{s:02d}"


def works_on(emp_index, day, absent_pct=5):
	"""One fixed weekly day off per employee (index % 7) plus ~absent_pct random
	absence, both deterministic."""
	day = getdate(day)
	if day.weekday() == emp_index % 7:
		return False
	return stable_int(f"abs:{emp_index}:{day.isoformat()}") % 100 >= absent_pct


def shift_plan(emp_index, day, designation):
	"""(shift_name, in_dt, out_dt, hours) for a worked day. Cashiers/captains
	alternate morning/evening by employee; weekends run ~1h longer."""
	day = getdate(day)
	evening = emp_index % 2 == 1
	start_h, start_m = (15, 0) if evening else (10, 0)
	jitter = stable_int(f"in:{emp_index}:{day.isoformat()}") % 21 - 5  # -5..+15 min
	base = 8.0 if designation == "Cashier" else 7.5
	base += 1.0 if day.weekday() >= 5 else 0.0
	extra = (stable_int(f"len:{emp_index}:{day.isoformat()}") % 9) / 10.0  # 0..0.8
	hours = round(base + extra, 2)
	in_dt = datetime(day.year, day.month, day.day, start_h, start_m) + timedelta(minutes=jitter)
	out_dt = in_dt + timedelta(hours=hours)
	return (SHIFT_EVENING if evening else SHIFT_MORNING), in_dt, out_dt, hours


def week_start(day):
	day = getdate(day)
	return day - timedelta(days=day.weekday())


def invoice_offsets(count, days, rng):
	"""Deterministic day offsets (1..days) for ``count`` invoices, spread across
	all days (round robin) then shuffled."""
	offsets = [(i % days) + 1 for i in range(count)]
	rng.shuffle(offsets)
	return offsets


# ---------------------------------------------------------------------------
# Small frappe helpers
# ---------------------------------------------------------------------------

def _log(msg):
	print(msg)


def _company_for(branch):
	company = frappe.db.get_value("Branch", branch, "company") if branch else None
	return company or frappe.db.get_value("Company", {}, "name")


def _primary_branch():
	"""Branch 1 = the branch with the most submitted POS Invoices (not BRANCH2)."""
	rows = frappe.db.sql(
		"""SELECT branch, COUNT(*) c FROM `tabPOS Invoice`
		WHERE docstatus = 1 AND branch IS NOT NULL AND branch != '' AND branch != %s
		GROUP BY branch ORDER BY c DESC LIMIT 1""",
		(BRANCH2,),
	)
	if rows:
		return rows[0][0]
	return frappe.db.get_value("Branch", {"name": ["!=", BRANCH2]}, "name")


def _doctype_ready(doctype):
	try:
		return bool(frappe.db.exists("DocType", doctype)) and frappe.db.table_exists(doctype)
	except Exception:
		return False


def _ensure_designation(name):
	if not frappe.db.exists("Designation", name):
		frappe.get_doc({"doctype": "Designation", "designation_name": name}).insert(ignore_permissions=True)


def _ensure_user(email, first, last, role):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": first,
				"last_name": last,
				"send_welcome_email": 0,
				"roles": [{"role": role}],
			}
		).insert(ignore_permissions=True)
	elif not frappe.db.exists("Has Role", {"parent": email, "role": role, "parenttype": "User"}):
		user = frappe.get_doc("User", email)
		user.append("roles", {"role": role})
		user.save(ignore_permissions=True)
	return email


def _ensure_employee(user_email, branch, company, designation):
	"""Employee linked to ``user_email`` (by user_id; Employee is hash-named, so
	never look up by name). Existing employees are left untouched."""
	existing = frappe.db.get_value("Employee", {"user_id": user_email}, "name")
	if existing:
		return existing
	full = frappe.db.get_value("User", user_email, ["first_name", "last_name"], as_dict=True) or {}
	_ensure_designation(designation)
	doc = frappe.get_doc(
		{
			"doctype": "Employee",
			"first_name": full.get("first_name") or user_email.split("@")[0],
			"last_name": full.get("last_name") or "",
			"gender": "Male",
			"date_of_birth": "1995-01-01",
			"date_of_joining": add_days(today(), -400),
			"status": "Active",
			"branch": branch,
			"company": company,
			"designation": designation,
			"user_id": user_email,
			"payment_type": "Daily Wage",
			"payment_amount": 500,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _users_with_role(role):
	rows = frappe.get_all("Has Role", filters={"role": role, "parenttype": "User"}, pluck="parent")
	return sorted({r for r in rows if r not in ("Administrator", "Guest")})


# ---------------------------------------------------------------------------
# 4a. Second branch
# ---------------------------------------------------------------------------

def _ensure_branch2(company):
	if not frappe.db.exists("Branch", BRANCH2):
		# Branch.user is a mandatory Table of "URY User" (custom field); the users
		# must already exist (seed_branch2 creates them first).
		frappe.get_doc(
			{
				"doctype": "Branch",
				"branch": BRANCH2,
				"user": [{"user": email} for email, *_r in BRANCH2_STAFF if frappe.db.exists("User", email)],
			}
		).insert(ignore_permissions=True)
	meta = frappe.get_meta("Branch")
	if meta.has_field("company") and not frappe.db.get_value("Branch", BRANCH2, "company"):
		frappe.db.set_value("Branch", BRANCH2, "company", company, update_modified=False)
	return BRANCH2


def _ensure_branch2_restaurant(company, branch1):
	if not frappe.db.exists("URY Room", BRANCH2_ROOM):
		frappe.get_doc(
			{"doctype": "URY Room", "name": BRANCH2_ROOM, "branch": BRANCH2, "room_type": "AC"}
		).insert(ignore_permissions=True)
	if not frappe.db.exists("URY Restaurant", BRANCH2_RESTAURANT):
		src = frappe.db.get_value(
			"URY Restaurant", {"branch": branch1}, ["default_tax_template", "active_menu"], as_dict=True
		) or {}
		doc = {
			"doctype": "URY Restaurant",
			"name": BRANCH2_RESTAURANT,
			"company": company,
			"branch": BRANCH2,
			"invoice_series_prefix": "B2-INV-",
			"aggregator_series_prefix": "B2-AGG-",
			"default_room": BRANCH2_ROOM,
		}
		if src.get("default_tax_template"):
			doc["default_tax_template"] = src["default_tax_template"]
		if src.get("active_menu"):
			doc["active_menu"] = src["active_menu"]
		frappe.get_doc(doc).insert(ignore_permissions=True)
	for name, seats in BRANCH2_TABLES:
		if not frappe.db.exists("URY Table", name):
			frappe.get_doc(
				{
					"doctype": "URY Table",
					"name": name,
					"restaurant": BRANCH2_RESTAURANT,
					"restaurant_room": BRANCH2_ROOM,
					"branch": BRANCH2,
					"no_of_seats": seats,
					"table_shape": "Square",
				}
			).insert(ignore_permissions=True)
	return BRANCH2_RESTAURANT


def _ensure_branch2_pos(company):
	"""Reuse profiles.py's POS Profile builder (named after the branch) and open
	a POS Opening Entry for a Branch-2-only cashier (ERPNext allows one open
	entry per user)."""
	from ury.ury.dev_seed import profiles

	pos_profile = profiles._seed_pos_profile(company, BRANCH2, BRANCH2_RESTAURANT)
	cashier = BRANCH2_STAFF[0][0]
	if frappe.db.exists("POS Opening Entry", {"pos_profile": pos_profile, "status": "Open", "docstatus": 1}):
		return pos_profile
	modes = [
		p.mode_of_payment
		for p in frappe.get_doc("POS Profile", pos_profile).get("payments", [])
		if p.mode_of_payment
	] or ["Cash"]
	doc = frappe.get_doc(
		{
			"doctype": "POS Opening Entry",
			"company": company,
			"pos_profile": pos_profile,
			"user": cashier,
			"period_start_date": frappe.utils.now(),
			"posting_date": today(),
			"balance_details": [
				{"mode_of_payment": m, "opening_amount": 1000 if m == "Cash" else 0} for m in modes
			],
		}
	)
	if frappe.get_meta("POS Opening Entry").has_field("branch"):
		doc.branch = BRANCH2
	doc.insert(ignore_permissions=True)
	doc.submit()
	return pos_profile


def seed_branch2():
	from ury.ury.dev_seed import historical_sales as hs

	random.seed(SEED)
	rng = random.Random(SEED)
	out = {"branch": BRANCH2, "invoices_created": 0}

	branch1 = _primary_branch()
	company = _company_for(branch1)
	for email, first, last, role, _d in BRANCH2_STAFF:
		_ensure_user(email, first, last, role)
	_ensure_branch2(company)
	_ensure_branch2_restaurant(company, branch1)

	for email, first, last, role, designation in BRANCH2_STAFF:
		try:
			_ensure_employee(email, BRANCH2, company, designation)
		except Exception as e:
			_log(f"  ! Employee for {email}: {e}")

	pos_profile = _ensure_branch2_pos(company)
	company = frappe.db.get_value("POS Profile", pos_profile, "company") or company

	existing = frappe.db.count("POS Invoice", {"branch": BRANCH2, "docstatus": 1})
	missing = max(0, BRANCH2_INVOICE_TARGET - existing)
	out["existing_invoices"] = existing
	if not missing:
		return out

	items = hs._get_items()
	price_list = hs._get_price_list()
	item_prices = hs._get_item_prices(price_list)
	customers = hs._get_customers()
	mop = hs._get_mode_of_payment()
	if not (items and item_prices and customers and mop):
		out["skipped"] = "missing items / item prices / customers / mode of payment"
		return out

	tax_template = hs._get_tax_template(BRANCH2_RESTAURANT)
	currency = frappe.db.get_value("Company", company, "default_currency") or "INR"
	cashiers = [e for e, *_ in BRANCH2_STAFF if e.startswith("b2.cashier")]
	waiters = [e for e, *_ in BRANCH2_STAFF if e.startswith("b2.captain")]
	tables = [t for t, _s in BRANCH2_TABLES]
	repeat_pool, one_time_pool = hs._split_customer_pools(customers)

	for offset in invoice_offsets(missing, BRANCH2_INVOICE_DAYS, rng):
		order_type = rng.choice(["Dine In", "Dine In", "Take Away"])
		name = hs._seed_submitted_invoice(
			branch_name=BRANCH2,
			company_name=company,
			restaurant_name=BRANCH2_RESTAURANT,
			pos_profile=pos_profile,
			price_list=price_list,
			tax_template=tax_template,
			table=rng.choice(tables) if order_type == "Dine In" else None,
			customer=hs._pick_customer(repeat_pool, one_time_pool),
			cashier=rng.choice(cashiers),
			waiter=rng.choice(waiters),
			order_type=order_type,
			no_of_pax=rng.randint(1, 5),
			posting_date=add_days(today(), -offset),
			posting_time=hs._pick_posting_time(),
			items=items,
			item_prices=item_prices,
			currency=currency,
			mode_of_payment=mop,
		)
		if name:
			out["invoices_created"] += 1
	frappe.db.commit()
	_log(f"people_targets_seed: Branch 2 invoices created: {out['invoices_created']}")
	return out


# ---------------------------------------------------------------------------
# 1. Sales targets (SAL-021)
# ---------------------------------------------------------------------------

def _avg_daily_net(branch, window_days=60):
	row = frappe.db.sql(
		"""SELECT SUM(net_total), MIN(posting_date) FROM `tabPOS Invoice`
		WHERE docstatus = 1 AND is_return = 0 AND branch = %s AND posting_date >= %s""",
		(branch, add_days(today(), -window_days)),
	)
	total, first = (row[0] if row else (None, None))
	if not total or not first:
		return FALLBACK_DAILY_NET
	days = max(1, (getdate(today()) - getdate(first)).days + 1)
	return flt(total) / days


def seed_targets(branches=None):
	if not _doctype_ready("URY Sales Target"):
		msg = "URY Sales Target doctype not installed; run `bench --site <site> migrate` first."
		_log(f"people_targets_seed: {msg}")
		return {"skipped": msg}
	branches = branches or [b for b in (_primary_branch(), BRANCH2) if b and frappe.db.exists("Branch", b)]
	created = 0
	for branch in branches:
		avg = _avg_daily_net(branch)
		for start, end in month_periods(today()):
			if frappe.db.exists("URY Sales Target", {"branch": branch, "period_start": start}):
				continue
			frappe.get_doc(
				{
					"doctype": "URY Sales Target",
					"branch": branch,
					"company": _company_for(branch),
					"period_start": start,
					"period_end": end,
					"target_amount": target_amount_for(start, end, avg),
				}
			).insert(ignore_permissions=True)
			created += 1
	frappe.db.commit()
	_log(f"people_targets_seed: sales targets created: {created}")
	return {"created": created, "branches": branches}


# ---------------------------------------------------------------------------
# 2. Labour hours (EMP-014)
# ---------------------------------------------------------------------------

def _ensure_shift_types():
	for name, start, end in ((SHIFT_MORNING, "10:00:00", "18:00:00"), (SHIFT_EVENING, "15:00:00", "23:30:00")):
		if not frappe.db.exists("Shift Type", name):
			frappe.get_doc(
				{
					"doctype": "Shift Type",
					"name": name,
					"start_time": start,
					"end_time": end,
					"enable_auto_attendance": 0,
				}
			).insert(ignore_permissions=True)


def _staff_roster():
	"""[(user, branch, designation)] sorted for stable indices: branch-1 cashiers
	and captains (existing users), then Branch 2 staff."""
	branch1 = _primary_branch()
	roster, seen = [], set()
	for role in ("URY Cashier", "URY Captain"):
		for user in _users_with_role(role):
			if user in seen or user.startswith("b2."):
				continue
			seen.add(user)
			roster.append((user, branch1, ROLE_DESIGNATION[role]))
	for email, _f, _l, role, designation in BRANCH2_STAFF:
		roster.append((email, BRANCH2, designation))
	return roster


def _activity_type():
	name = "URY Floor Service"
	if not frappe.db.exists("Activity Type", name):
		frappe.get_doc({"doctype": "Activity Type", "activity_type": name}).insert(ignore_permissions=True)
	return name


def seed_labour(days=LABOUR_DAYS):
	random.seed(SEED)
	counts = {"employees": 0, "shift_assignments": 0, "checkins": 0, "attendance": 0, "timesheets": 0}
	try:
		frappe.get_meta("Attendance")
		frappe.get_meta("Employee Checkin")
	except Exception as e:
		msg = f"hrms doctypes unavailable: {e}"
		_log(f"people_targets_seed: {msg}")
		return {"skipped": msg}

	_ensure_shift_types()
	start_day = getdate(add_days(today(), -days))
	yesterday = getdate(add_days(today(), -1))
	roster = _staff_roster()

	for idx, (user, branch, designation) in enumerate(roster):
		try:
			company = _company_for(branch)
			employee = _ensure_employee(user, branch, company, designation)
		except Exception as e:
			_log(f"  ! Employee for {user}: {e}")
			continue
		counts["employees"] += 1

		# Joining date must precede the oldest attendance date.
		joined = frappe.db.get_value("Employee", employee, "date_of_joining")
		if joined and getdate(joined) > start_day:
			frappe.db.set_value("Employee", employee, "date_of_joining", add_days(start_day, -30), update_modified=False)

		shift_default = SHIFT_EVENING if idx % 2 == 1 else SHIFT_MORNING
		if not frappe.db.exists("Shift Assignment", {"employee": employee, "docstatus": 1, "start_date": start_day}):
			try:
				sa = frappe.get_doc(
					{
						"doctype": "Shift Assignment",
						"employee": employee,
						"company": company,
						"shift_type": shift_default,
						"start_date": start_day,
						"status": "Active",
					}
				)
				sa.insert(ignore_permissions=True)
				sa.submit()
				counts["shift_assignments"] += 1
			except Exception as e:
				_log(f"  ! Shift Assignment for {employee}: {e}")

		week_logs = {}
		day = start_day
		while day <= yesterday:
			if works_on(idx, day):
				shift, in_dt, out_dt, hours = shift_plan(idx, day, designation)
				if not frappe.db.exists(
					"Attendance", {"employee": employee, "attendance_date": day, "docstatus": 1}
				):
					try:
						logs = []
						for log_type, ts in (("IN", in_dt), ("OUT", out_dt)):
							if not frappe.db.exists("Employee Checkin", {"employee": employee, "time": ts}):
								ci = frappe.get_doc(
									{
										"doctype": "Employee Checkin",
										"employee": employee,
										"log_type": log_type,
										"time": ts,
										"shift": shift_default,
										"device_id": "URY Demo",
										"skip_auto_attendance": 1,
									}
								)
								ci.insert(ignore_permissions=True)
								logs.append(ci.name)
								counts["checkins"] += 1
						att = frappe.get_doc(
							{
								"doctype": "Attendance",
								"employee": employee,
								"attendance_date": day,
								"status": "Present",
								"company": company,
								"shift": shift_default,
								"in_time": in_dt,
								"out_time": out_dt,
								"working_hours": hours,
							}
						)
						att.insert(ignore_permissions=True)
						att.submit()
						frappe.db.set_value(
							"Attendance", att.name,
							{"working_hours": hours, "in_time": in_dt, "out_time": out_dt},
							update_modified=False,
						)
						for ci_name in logs:
							frappe.db.set_value("Employee Checkin", ci_name, "attendance", att.name, update_modified=False)
						counts["attendance"] += 1
					except Exception as e:
						_log(f"  ! Attendance {employee} {day}: {e}")
						continue
				week_logs.setdefault(week_start(day), []).append((in_dt, out_dt, hours))
			day += timedelta(days=1)

		for wk, logs in sorted(week_logs.items()):
			marker = f"URY demo labour week {wk.isoformat()}"
			if frappe.db.exists("Timesheet", {"employee": employee, "note": marker}):
				continue
			frappe.db.savepoint("ts")
			try:
				ts = frappe.get_doc(
					{
						"doctype": "Timesheet",
						"employee": employee,
						"company": company,
						"note": marker,
						"time_logs": [
							{
								"from_time": a,
								"to_time": b,
								"hours": h,
								"activity_type": _activity_type(),
								"completed": 1,
							}
							for a, b, h in logs
						],
					}
				)
				ts.flags.ignore_mandatory = True
				ts.insert(ignore_permissions=True)
				ts.submit()
				counts["timesheets"] += 1
			except Exception as e:
				frappe.db.rollback(save_point="ts")
				counts.setdefault("timesheet_errors", []).append(f"{employee} {wk}: {e}"[:200])
				_log(f"  ! Timesheet {employee} week {wk}: {e}")
		frappe.db.commit()
	_log(f"people_targets_seed: labour {counts}")
	return counts


# ---------------------------------------------------------------------------
# 3. Tips and commission (EMP-015)
# ---------------------------------------------------------------------------

def _ensure_tip_field():
	if frappe.db.exists("Custom Field", f"POS Invoice-{TIP_FIELD}"):
		return False
	frappe.get_doc(
		{
			"doctype": "Custom Field",
			"dt": "POS Invoice",
			"fieldname": TIP_FIELD,
			"label": "Tip Amount",
			"fieldtype": "Currency",
			"insert_after": "cashier",
			"allow_on_submit": 1,
			"default": "0",
			"description": "Gratuity paid by the guest; read by EMP-015 tips per waiter.",
		}
	).insert(ignore_permissions=True)
	frappe.clear_cache(doctype="POS Invoice")
	return True


def seed_tips_and_commission(days=TIP_DAYS):
	out = {"tip_field_created": False, "tips_set": 0, "waiter_attrib_filled": 0, "closing_attrib_filled": 0}
	out["tip_field_created"] = _ensure_tip_field()
	since = add_days(today(), -days)

	rows = frappe.db.sql(
		f"""SELECT name, grand_total FROM `tabPOS Invoice`
		WHERE docstatus = 1 AND is_return = 0 AND order_type = 'Dine In'
		AND posting_date >= %s AND (`{TIP_FIELD}` IS NULL OR `{TIP_FIELD}` = 0)""",
		(since,),
		as_dict=True,
	)
	for r in rows:
		tip = tip_for(r.name, flt(r.grand_total))
		if tip > 0:
			frappe.db.set_value("POS Invoice", r.name, TIP_FIELD, tip, update_modified=False)
			out["tips_set"] += 1

	# Commission rules / settings (existing idempotent seed), then attribution.
	try:
		from ury.ury.dev_seed.v3_features import commission_seed

		out["commission_settings"] = commission_seed.seed()
	except Exception as e:
		out["commission_settings_error"] = str(e)
		_log(f"  ! commission_seed: {e}")

	# Make sure all staff have Employees so attribution can resolve.
	for user, branch, designation in _staff_roster():
		try:
			_ensure_employee(user, branch, _company_for(branch), designation)
		except Exception as e:
			_log(f"  ! Employee {user}: {e}")

	cur = frappe.db.sql(
		"""UPDATE `tabPOS Invoice` pi JOIN `tabEmployee` e ON e.user_id = pi.waiter
		SET pi.custom_waiter_employee = e.name
		WHERE pi.docstatus = 1 AND pi.posting_date >= %s
		AND (pi.custom_waiter_employee IS NULL OR pi.custom_waiter_employee = '')""",
		(since,),
	)
	out["waiter_attrib_filled"] = frappe.db.sql(
		"""SELECT COUNT(*) FROM `tabPOS Invoice` WHERE docstatus = 1 AND posting_date >= %s
		AND custom_waiter_employee IS NOT NULL AND custom_waiter_employee != ''""",
		(since,),
	)[0][0]
	frappe.db.sql(
		"""UPDATE `tabPOS Invoice` pi JOIN `tabEmployee` e ON e.user_id = pi.cashier
		SET pi.custom_closing_employee = e.name
		WHERE pi.docstatus = 1 AND pi.posting_date >= %s
		AND (pi.custom_closing_employee IS NULL OR pi.custom_closing_employee = '')""",
		(since,),
	)
	out["closing_attrib_filled"] = frappe.db.sql(
		"""SELECT COUNT(*) FROM `tabPOS Invoice` WHERE docstatus = 1 AND posting_date >= %s
		AND custom_closing_employee IS NOT NULL AND custom_closing_employee != ''""",
		(since,),
	)[0][0]
	frappe.db.commit()
	_log(f"people_targets_seed: tips/commission {out}")
	return out


# ---------------------------------------------------------------------------
# 5. Opening hours + dwell (TBL-009 / TBL-010)
# ---------------------------------------------------------------------------

def _ensure_operating_schedule(branch):
	if not branch or frappe.db.exists("URY Branch Operating Schedule", branch):
		return False
	days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
	doc = {
		"doctype": "URY Branch Operating Schedule",
		"branch": branch,
		"enabled": 1,
		"timezone": "Asia/Kolkata",
		"pre_open_time": "10:00:00",
		"close_grace_minutes": 30,
	}
	for d in days:
		doc[d] = [
			{"service_name": "Lunch", "open_time": "11:00:00", "close_time": "15:30:00", "enabled": 1},
			{"service_name": "Dinner", "open_time": "18:00:00", "close_time": "23:00:00", "enabled": 1},
		]
	frappe.get_doc(doc).insert(ignore_permissions=True)
	return True


def seed_table_timing(days=TIP_DAYS):
	out = {"schedules_created": 0, "dwell_filled": 0}
	for b in (_primary_branch(), BRANCH2):
		if b and frappe.db.exists("Branch", b) and _doctype_ready("URY Branch Operating Schedule"):
			try:
				if _ensure_operating_schedule(b):
					out["schedules_created"] += 1
			except Exception as e:
				_log(f"  ! Operating schedule {b}: {e}")
	rows = frappe.db.sql(
		"""SELECT name, posting_date, posting_time FROM `tabPOS Invoice`
		WHERE docstatus = 1 AND order_type = 'Dine In' AND is_return = 0 AND posting_date >= %s
		AND (total_spend_time IS NULL OR total_spend_time IN ('', '00:00:00'))""",
		(add_days(today(), -days),),
		as_dict=True,
	)
	for r in rows:
		secs = dwell_seconds_for(r.name)
		arrived = datetime.combine(getdate(r.posting_date), (datetime.min + r.posting_time).time()) - timedelta(seconds=secs)
		frappe.db.set_value(
			"POS Invoice", r.name,
			{"arrived_time": arrived.strftime("%Y-%m-%d %H:%M:%S"), "total_spend_time": format_hms(secs)},
			update_modified=False,
		)
		out["dwell_filled"] += 1
	frappe.db.commit()
	_log(f"people_targets_seed: table timing {out}")
	return out


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def seed():
	"""Run every section; collect per-section result or error."""
	results = {}
	for label, fn in (
		("branch2", seed_branch2),
		("targets", seed_targets),
		("labour", seed_labour),
		("tips_commission", seed_tips_and_commission),
		("table_timing", seed_table_timing),
	):
		try:
			results[label] = fn()
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			results[label] = {"error": frappe.get_traceback()}
			_log(f"people_targets_seed: section {label} FAILED\n{results[label]['error']}")
	return results


# ---------------------------------------------------------------------------
# Test-user helper (NOT called by seed())
# ---------------------------------------------------------------------------

def create_branch_chairman_user(email, branches, password=None, first_name="Chairman Test",
		roles=("URY Owner",), company=None):
	"""Create (or update) a chairman test user whose Company/Branch User
	Permissions restrict every query to ``branches`` (str or list).

	Example::

	    bench --site <site> execute ury.ury.dev_seed.people_targets_seed.create_branch_chairman_user \\
	        --kwargs '{"email": "chair.b2@ury.local", "branches": ["URY Branch 2"], "password": "<choose>"}'

	Idempotent: re-running adds missing roles/permissions only. Returns the
	permission rows. ``password`` is optional (set it only for a test login).
	"""
	branches = [branches] if isinstance(branches, str) else list(branches)
	if not branches:
		raise ValueError("branches is required")
	for b in branches:
		if not frappe.db.exists("Branch", b):
			raise ValueError(f"Branch {b!r} does not exist")

	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": first_name,
				"send_welcome_email": 0,
				"enabled": 1,
				"roles": [{"role": r} for r in roles],
			}
		).insert(ignore_permissions=True)
	else:
		user = frappe.get_doc("User", email)
		have = {r.role for r in user.roles}
		for r in roles:
			if r not in have:
				user.append("roles", {"role": r})
		user.save(ignore_permissions=True)
	if password:
		from frappe.utils.password import update_password

		update_password(email, password)

	def _perm(allow, value):
		if not frappe.db.exists("User Permission", {"user": email, "allow": allow, "for_value": value}):
			frappe.get_doc(
				{
					"doctype": "User Permission",
					"user": email,
					"allow": allow,
					"for_value": value,
					"apply_to_all_doctypes": 1,
				}
			).insert(ignore_permissions=True)

	for b in branches:
		_perm("Branch", b)
	for c in {company or _company_for(b) for b in branches}:
		if c:
			_perm("Company", c)
	frappe.db.commit()
	return frappe.get_all(
		"User Permission", filters={"user": email}, fields=["allow", "for_value"], order_by="allow, for_value"
	)
