"""Demo seed: roll the demo forward so it looks live "today" and "yesterday".

Run (bench dir, module importable / on PYTHONPATH like the sibling seeds)::

    bench --site <site> execute roll_forward_demo.seed
    # or: roll_forward_demo.seed(branch="My Branch")

Everything is computed from ``frappe.utils.today()`` (never hardcoded). The
sibling seeds (menu_demo, sales_plan_demo, pnl_demo, variance_yield_demo,
pos_today_demo, ...) are reused by import; this module only orchestrates and
fills gaps.

Steps (each one try/except + commit/rollback, result goes in the summary dict)
-----------------------------------------------------------------------------
YESTERDAY
 1. close_prev_sessions  - every submitted POS Opening Entry still "Open" from
                           an earlier day gets a real POS Closing Entry
                           (ERPNext make_closing_entry_from_opening, same path
                           as pos_today_demo._step_close_stale), dated on the
                           opening's own day; falls back to
                           pos_today_demo._close_opening (today-dated, with the
                           negative-stock retry) if the dated close fails.
 2. prev_pnl             - submitted URY Daily P and L for yesterday with all
                           expense lines (pnl_demo._process_day for one date).
 3. prev_variance_yield  - yesterday's (and today's early-morning) yield checks
                           + Short/Excess Stock Corrections through
                           variance_yield_demo's own per-day helpers.
 4. prev_sales_plan      - yesterday's URY Sales Plan: created if missing
                           (sales_plan_demo helpers), walked Draft -> Locked for
                           Production through the real workflow, fulfilment
                           recorded with apply_commit_delta.
TODAY
 5. pos_today            - pos_today_demo.seed(force=True): open POS session,
                           paid invoices, running tables, take-away/delivery,
                           KOTs in all kitchen states, service requests,
                           alerts, insights.
 6. today_plan_locked    - today's (previously "tomorrow's") Draft sales plan is
                           driven to Locked for Production; a modest partial
                           fulfilment is recorded. Done AFTER pos_today so that
                           Hard-enforcement can never block the demo orders.
 7. tomorrow_plan_draft  - a Draft sales plan for tomorrow.
 8. notifications        - Notification Log rows for Administrator (some
                           unread) pointing at real seeded documents.
REPORTS (last 7 days: today-6 .. today)
 9. reports              - probes every report_api function / catalog report
                           that needs data that is commonly missing, before and
                           after, and fills gaps with real controllers:
                           cancelled-invoices (sync_order + cancel_order),
                           employee-sales (waiter spread), employee-commission
                           (URY Commission Settings + invoice employee
                           attribution), repeated-customers / daywise-customer
                           / customer-data (customer spread), item-wise-purchase
                           (Purchase Invoices), wastage-and-damage (URY Wastage
                           + Issue Authorization), completed-work-orders (Work
                           Orders), unsettled-bills (Comment on printed
                           drafts), daily-pnl / close-day-checklist (probe).

Idempotency: sub-steps check for existing data first; the non-naturally
idempotent ones (fulfilment, notifications) use a Comment marker on the Branch
(``roll_forward_demo:<date>:<key>``).
"""

import importlib
import json
import random
import traceback
from datetime import timedelta

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, today

MARK = "roll_forward_demo"
REPORT_DAYS = 7  # window: today-6 .. today
PLAN_PATH = ("Draft", "Proposed", "Submitted for Approval", "Approved", "Locked for Production")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _imp(name):
	"""Import a sibling seed module (flat, as run from the seed folder), falling
	back to a package-relative / ury dev_seed import."""
	last = None
	for path in (name, f"{__package__}.{name}" if __package__ else None, f"ury.ury.dev_seed.demo_full.{name}"):
		if not path:
			continue
		try:
			return importlib.import_module(path)
		except ImportError as e:  # noqa: PERF203
			last = e
	raise ImportError(f"cannot import {name}: {last}")


def _resolve_branch(branch=None):
	"""Same resolution as pos_today_demo: first Branch with POS Profile + URY Restaurant."""
	cands = [branch] if branch else frappe.get_all("Branch", order_by="creation asc", pluck="name")
	for b in cands:
		if frappe.db.exists("POS Profile", {"branch": b}) and frappe.db.get_value("URY Restaurant", {"branch": b}, "name"):
			profile = frappe.db.get_value("POS Profile", {"branch": b}, "name")
			company = frappe.db.get_value("POS Profile", profile, "company") or frappe.db.get_value(
				"Branch", b, "company"
			)
			return b, company
	frappe.throw("roll_forward_demo: no Branch with both a POS Profile and a URY Restaurant")


def _marker(key, day=None):
	return f"{MARK}:{day or today()}:{key}"


def _marked(branch, key, day=None):
	return bool(
		frappe.db.exists(
			"Comment",
			{
				"reference_doctype": "Branch",
				"reference_name": branch,
				"comment_type": "Info",
				"content": _marker(key, day),
			},
		)
	)


def _mark(branch, key, day=None):
	if _marked(branch, key, day):
		return
	frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": "Branch",
			"reference_name": branch,
			"content": _marker(key, day),
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()


def _run(summary, name, fn, *args):
	print(f"[roll_forward_demo] step '{name}' ...")
	frappe.set_user("Administrator")
	try:
		res = fn(*args)
		frappe.db.commit()
		summary[name] = res if res is not None else "ok"
	except Exception as e:  # noqa: BLE001
		frappe.db.rollback()
		frappe.set_user("Administrator")
		summary[name] = f"FAILED: {type(e).__name__}: {e}"
		print(f"  ! step '{name}' failed: {e}\n{traceback.format_exc()}")
	finally:
		frappe.set_user("Administrator")


def _size(res):
	"""Rough 'how many rows does this report return' for before/after probes."""
	if res is None:
		return 0
	if isinstance(res, (list, tuple)):
		return len(res)
	if isinstance(res, dict):
		return sum(len(v) for v in res.values() if isinstance(v, (list, tuple)))
	return 1


def _drive_to_locked(plan_name):
	sp = _imp("sales_plan_demo")
	doc = frappe.get_doc("URY Sales Plan", plan_name)
	cur = doc.status or "Draft"
	if cur == "Locked for Production":
		return doc
	if cur not in PLAN_PATH:
		raise frappe.ValidationError(f"plan {plan_name} is in state {cur!r}; cannot drive to Locked")
	for target in PLAN_PATH[PLAN_PATH.index(cur) + 1 :]:
		res = sp.transition_sales_plan(doc, target)
		doc = res if res is not None and hasattr(res, "status") else frappe.get_doc("URY Sales Plan", plan_name)
	return doc


def _fulfil(doc, branch, company, plan_date, lo, hi, rng):
	sp = _imp("sales_plan_demo")
	n = 0
	for row in doc.items:
		qty = round(row.qty * rng.uniform(lo, hi))
		if qty <= 0:
			continue
		if sp.apply_commit_delta(row.item_code, branch, company, plan_date=plan_date, fulfilled_delta=qty):
			n += 1
	return n


# ---------------------------------------------------------------------------
# 1. close yesterday's (and any older) open POS sessions
# ---------------------------------------------------------------------------


def _close_on_own_day(pos, name):
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening

	opening = frappe.get_doc("POS Opening Entry", name)
	day = str(getdate(opening.posting_date))
	closing = make_closing_entry_from_opening(opening)
	closing.posting_date = day
	try:
		closing.period_end_date = f"{day} 23:30:00"
	except Exception:  # noqa: BLE001
		pass
	closing.insert(ignore_permissions=True)
	closing.submit()
	frappe.db.commit()
	status = frappe.db.get_value("POS Closing Entry", closing.name, "status")
	if status == "Queued" and frappe.db.get_value("POS Opening Entry", name, "status") == "Open":
		from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
			create_merge_logs,
			get_invoice_customer_map,
		)

		closing.reload()
		create_merge_logs(get_invoice_customer_map(closing.get("pos_transactions")), closing)
	return closing.name


def _step_close_prev_sessions(branch, company):
	pos = _imp("pos_today_demo")
	profiles = frappe.get_all("POS Profile", filters={"branch": branch}, pluck="name")
	stale = frappe.get_all(
		"POS Opening Entry",
		filters={"status": "Open", "docstatus": 1, "posting_date": ["<", today()], "pos_profile": ["in", profiles]},
		fields=["name", "posting_date"],
		order_by="posting_date asc",
	)
	out = {"closed": [], "failed": [], "path": {}}
	for row in stale:
		closing = None
		try:
			closing = _close_on_own_day(pos, row.name)
			out["path"][row.name] = "dated"
		except Exception as first:  # noqa: BLE001
			frappe.db.rollback()
			print(f"  ~ dated close of {row.name} failed ({first}); using pos_today_demo._close_opening")
			try:
				try:
					closing = pos._close_opening(row.name)
				except Exception:  # noqa: BLE001
					frappe.db.rollback()
					closing = pos._with_negative_stock(lambda: pos._close_opening(row.name))
				out["path"][row.name] = "pos_today_demo"
			except Exception as e:  # noqa: BLE001
				frappe.db.rollback()
				out["failed"].append(f"{row.name}: {e}")
				continue
		if frappe.db.get_value("POS Opening Entry", row.name, "status") == "Closed":
			out["closed"].append(f"{row.name} -> {closing}")
		else:
			out["failed"].append(f"{row.name}: still Open after closing {closing}")
	return out


# ---------------------------------------------------------------------------
# 2. yesterday's Daily P&L
# ---------------------------------------------------------------------------


def _step_prev_pnl(branch, company):
	pnl = _imp("pnl_demo")
	day = getdate(add_days(today(), -1))
	start = getdate(add_days(day, -(pnl.NUM_DAYS - 1)))
	stats_all = pnl._invoice_stats(branch, start, day)
	nets = [v[1] for v in stats_all.values() if v[1] > 0]
	avg_net = (sum(nets) / len(nets)) if nets else pnl.FALLBACK_AVG_NET_SALES
	settings = pnl._ensure_report_settings(branch, avg_net)
	pnl._ensure_buying_prices(branch, start, day)
	employees = None
	if frappe.db.table_exists("Attendance", cached=False):
		employees = pnl._ensure_employees(branch, company, start)
	prev = frappe.db.get_value(
		"URY Daily P and L",
		{"branch": branch, "date": ["<", day], "docstatus": 1},
		"electricity_closing",
		order_by="date desc",
	)
	meter = flt(prev) or pnl.METER_START
	day_idx = (day - start).days + 1  # beyond the 21 days pnl_demo seeded
	status, _meter = pnl._process_day(branch, company, settings, employees, day, day_idx, stats_all, meter, avg_net)
	name = frappe.db.get_value(
		"URY Daily P and L", {"branch": branch, "date": day, "docstatus": 1}, "name", order_by="creation desc"
	)
	if not name:
		raise frappe.ValidationError(f"no submitted Daily P&L for {day} after _process_day ({status})")
	doc = frappe.get_doc("URY Daily P and L", name)
	return {
		"status": status,
		"doc": name,
		"net_sales": flt(doc.net_sales),
		"net_profit": flt(doc.get("net_profit")),
		"expense_lines": {
			t: len(doc.get(t) or [])
			for t in ("direct_expenses_breakup", "employee_costs_breakup", "indirect_expenses_breakup")
		},
		"complete": bool(pnl._is_complete(doc)),
	}


# ---------------------------------------------------------------------------
# 3. yesterday's yield checks + short/excess corrections
# ---------------------------------------------------------------------------


def _step_prev_variance_yield(branch, company):
	vy = _imp("variance_yield_demo")
	b, c, warehouse = vy._branch_ctx(branch)
	items = vy._pick_items(b, c)
	std_map = vy._ensure_yield_standards(items)
	frappe.db.commit()
	try:
		vy._ensure_branch_scope_bom(b, c, items)
	except Exception as e:  # noqa: BLE001
		print(f"  ~ _ensure_branch_scope_bom: {e}")
	out = {"sr": 0, "short_docs": 0, "excess_docs": 0, "yield_checks": 0, "days": {}}
	# variance_yield_demo ran on yesterday (offset 0 => day_idx == vy.DAYS); continue its numbering.
	for offset in (1, 0):
		day = add_days(today(), -offset)
		day_idx = vy.DAYS + (1 - offset)
		rng = random.Random(f"{b}:{day}")
		pattern = vy.DAY_PATTERN[day_idx % len(vy.DAY_PATTERN)] if offset == 1 else ""  # corrections only for yesterday
		made = []
		try:
			if pattern:
				sr_name, created = vy._ensure_stock_reconciliation(b, c, warehouse, items, day, rng)
				out["sr"] += 1 if created else 0
				for d in sorted(pattern, reverse=True):
					n = vy._make_correction(b, warehouse, sr_name, items, day, d, rng)
					if n:
						made.append(n)
						out["short_docs" if d == "S" else "excess_docs"] += 1
			yc = vy._make_yield_checks(b, c, items, std_map, day, day_idx, rng)
			out["yield_checks"] += len(yc)
			frappe.db.commit()
			out["days"][str(day)] = {"pattern": pattern or "none", "corrections": made, "yield_checks": len(yc)}
		except Exception as e:  # noqa: BLE001
			frappe.db.rollback()
			out["days"][str(day)] = f"FAILED: {type(e).__name__}: {e}"
	return out


# ---------------------------------------------------------------------------
# 4. yesterday's sales plan: create (if missing) -> Locked -> fulfilment
# ---------------------------------------------------------------------------


def _plan_name_for(branch, plan_date):
	sp = _imp("sales_plan_demo")
	return sp._plan_exists(branch, plan_date)


def _step_prev_sales_plan(branch, company):
	sp = _imp("sales_plan_demo")
	plan_date = add_days(today(), -1)
	name = _plan_name_for(branch, plan_date)
	created = False
	if not name:
		catalog = sp._plannable_items(branch)
		if len(catalog) < sp.MIN_ITEMS:
			raise frappe.ValidationError(f"only {len(catalog)} plannable items for {branch}")
		rng = random.Random(f"{branch}:{plan_date}")
		doc = sp._build_plan(branch, company, plan_date, catalog, rng)
		name, created = doc.name, True
	doc = _drive_to_locked(name)
	fulfilled_rows = 0
	if not _marked(branch, f"fulfil:{name}", plan_date):
		rng = random.Random(f"{branch}:{plan_date}:fulfil")
		fulfilled_rows = _fulfil(doc, branch, company, plan_date, 0.7, 1.05, rng)
		frappe.db.commit()
		_mark(branch, f"fulfil:{name}", plan_date)
	return {"plan": name, "created": created, "status": doc.status, "fulfilled_rows": fulfilled_rows}


# ---------------------------------------------------------------------------
# 5. today's live POS
# ---------------------------------------------------------------------------


def _step_pos_today(branch, company):
	pos = _imp("pos_today_demo")
	res = pos.seed(branch=branch, force=True)
	frappe.set_user("Administrator")
	if isinstance(res, dict):
		return {
			"opening_entry": res.get("opening_entry"),
			"paid_invoices": res.get("paid_invoices"),
			"running_orders": res.get("running_orders"),
			"insights": res.get("insights"),
			"steps_failed": res.get("steps_failed"),
			"error": res.get("error"),
		}
	return res


# ---------------------------------------------------------------------------
# 6/7. today's plan -> Locked; tomorrow's plan -> Draft
# ---------------------------------------------------------------------------


def _step_today_plan_locked(branch, company):
	sp = _imp("sales_plan_demo")
	plan_date = today()
	name = _plan_name_for(branch, plan_date)
	created = False
	if not name:
		catalog = sp._plannable_items(branch)
		rng = random.Random(f"{branch}:{plan_date}")
		doc = sp._build_plan(branch, company, plan_date, catalog, rng)
		name, created = doc.name, True
	doc = _drive_to_locked(name)
	fulfilled_rows = 0
	if not _marked(branch, f"fulfil:{name}"):
		rng = random.Random(f"{branch}:{plan_date}:fulfil")
		fulfilled_rows = _fulfil(doc, branch, company, plan_date, 0.2, 0.45, rng)  # trading in progress
		frappe.db.commit()
		_mark(branch, f"fulfil:{name}")
	return {"plan": name, "created": created, "status": doc.status, "fulfilled_rows": fulfilled_rows}


def _step_tomorrow_plan_draft(branch, company):
	sp = _imp("sales_plan_demo")
	plan_date = add_days(today(), 1)
	name = _plan_name_for(branch, plan_date)
	if name:
		return {"plan": name, "created": False, "status": frappe.db.get_value("URY Sales Plan", name, "status")}
	catalog = sp._plannable_items(branch)
	if len(catalog) < sp.MIN_ITEMS:
		raise frappe.ValidationError(f"only {len(catalog)} plannable items for {branch}")
	rng = random.Random(f"{branch}:{plan_date}")
	doc = sp._build_plan(branch, company, plan_date, catalog, rng)
	return {"plan": doc.name, "created": True, "status": doc.status}


# ---------------------------------------------------------------------------
# 8. notifications for Administrator
# ---------------------------------------------------------------------------


def _step_notifications(branch, company):
	if _marked(branch, "notifications"):
		return "already done today"
	yday = add_days(today(), -1)
	frappe.flags.mute_emails = True
	ntype = "Alert" if frappe.db.exists("Notification Type", "Alert") else None
	if not ntype and frappe.get_meta("Notification Log").get_field("type").fieldtype == "Select":
		ntype = "Alert"

	def first(doctype, filters, order="creation desc", field="name"):
		return frappe.db.get_value(doctype, filters, field, order_by=order)

	pnl = first("URY Daily P and L", {"branch": branch, "date": yday, "docstatus": 1})
	closing = first("POS Closing Entry", {"posting_date": yday, "docstatus": 1, "company": company})
	plan_t = first("URY Sales Plan", {"branch": branch, "plan_date": today(), "docstatus": ["!=", 2]})
	plan_n = first("URY Sales Plan", {"branch": branch, "plan_date": add_days(today(), 1), "docstatus": ["!=", 2]})
	printed = first("POS Invoice", {"branch": branch, "docstatus": 0, "invoice_printed": 1, "posting_date": today()})
	draft_open = first("POS Invoice", {"branch": branch, "docstatus": 0, "posting_date": today()}, "creation asc")
	kot = first("URY KOT", {"branch": branch, "docstatus": 1, "date": today(), "order_status": ["!=", "Served"]}, "creation asc")
	yc = first("URY Yield Check", {"branch": branch}, "checked_on desc")
	sc = first("Stock Correction", {"branch": branch, "docstatus": 1}, "posting_date desc")
	tbl = frappe.db.get_value("POS Invoice", printed, "restaurant_table") if printed else None

	rows = [
		(f"Daily P&L for {yday} has been submitted", "URY Daily P and L", pnl, 600, 1),
		(f"POS session of {yday} was closed", "POS Closing Entry", closing, 570, 1),
		("Today's sales plan is locked for production", "URY Sales Plan", plan_t, 240, 1),
		(f"Draft sales plan for {add_days(today(), 1)} is ready for review", "URY Sales Plan", plan_n, 25, 0),
		(
			f"Bill requested on table {tbl}" if tbl else "A guest has asked for the bill",
			"POS Invoice", printed or draft_open, 12, 0,
		),
		("Kitchen ticket is running late", "URY KOT", kot, 9, 0),
		("Yield below standard on a prepared item", "URY Yield Check", yc, 45, 0),
		("Stock count correction posted (short/excess)", "Stock Correction", sc, 300, 0),
	]
	made = 0
	for subject, dt, dn, mins_ago, is_read in rows:
		if dt and not dn and dt != "POS Invoice":
			continue  # no real document to point at; skip rather than fake one
		doc = {
			"doctype": "Notification Log",
			"subject": subject,
			"for_user": "Administrator",
			"from_user": "Administrator",
			"email_content": subject,
			"read": is_read,
		}
		if ntype:
			doc["type"] = ntype
		if dn:
			doc["document_type"], doc["document_name"] = dt, dn
		try:
			nl = frappe.get_doc(doc).insert(ignore_permissions=True)
			ts = now_datetime() - timedelta(minutes=mins_ago)
			frappe.db.set_value("Notification Log", nl.name, {"creation": ts, "modified": ts}, update_modified=False)
			made += 1
		except Exception as e:  # noqa: BLE001
			frappe.db.rollback()
			print(f"  ~ notification '{subject}' failed: {e}")
	_mark(branch, "notifications")
	return {"created": made, "unread": sum(1 for r in rows if not r[4])}


# ---------------------------------------------------------------------------
# 9. reports: probe + fill
# ---------------------------------------------------------------------------


def _probes(branch, company):
	"""name -> callable returning a row-count; run as Administrator."""
	s, e = add_days(today(), -(REPORT_DAYS - 1)), today()
	yday = add_days(today(), -1)
	import ury.ury.report_api.commission as commission
	import ury.ury.report_api.customers as customers
	import ury.ury.report_api.day_close as day_close
	import ury.ury.report_api.employees as employees
	import ury.ury.report_api.financial as financial
	import ury.ury.report_api.items as items
	import ury.ury.report_api.operations as operations
	import ury.ury.report_api.sales as sales
	from ury.ury.ai_tools import ury_ops_tools

	cust = frappe.db.sql(
		"""select customer_name from `tabPOS Invoice` where branch=%s and docstatus=1 and posting_date between %s and %s
		group by customer_name order by count(*) desc limit 1""",
		(branch, s, e),
	)
	cust = cust[0][0] if cust else None

	def unsettled():
		from ury.ury.report.unsettled_bills.unsettled_bills import execute

		return len(execute({"branch": branch})[1])

	return {
		"cancelled-invoices": lambda: sales.get_cancelled_invoices(s, e, branch)["pagination"]["total"],
		"employee-sales": lambda: _size(employees.get_employee_sales(s, e, branch)),
		"employee-commission": lambda: _size(commission.get_employee_commission(s, e, branch)),
		"repeated-customers": lambda: _size(customers.get_repeated_customers(s, e, branch)),
		"daywise-customer-details": lambda: _size(customers.get_daywise_customer_details(s, e, branch)),
		"customer-data": lambda: _size(customers.get_customer_data(cust, s, e, branch)) if cust else 0,
		"item-wise-purchase-history": lambda: _size(items.get_item_wise_purchase_history(s, e, branch)),
		"wastage-and-damage": lambda: ury_ops_tools.get_wastage(branch, s, e).get("records", 0),
		"completed-work-orders": lambda: len(operations.get_completed_work_orders(s, e)["work_orders"]),
		"unsettled-bills": unsettled,
		"daily-pnl(yesterday)": lambda: 1 if financial.get_daily_pnl(yday, branch) else 0,
		"close-day-checklist(yesterday)": lambda: _size(day_close.get_close_day_checklist(branch, yday)),
		"item-wise-sales": lambda: _size(items.get_item_wise_sales(s, e, branch)),
		"daywise-sales": lambda: _size(sales.get_daywise_sales(s, e, branch)),
		"service-wise-sales": lambda: _size(sales.get_service_wise_sales(s, e, branch)),
	}


def _probe_all(branch, company):
	out = {}
	for name, fn in _probes(branch, company).items():
		try:
			out[name] = fn()
		except Exception as e:  # noqa: BLE001
			frappe.db.rollback()
			out[name] = f"ERR {type(e).__name__}: {str(e)[:80]}"
	return out


def _fill_cancelled(branch, company):
	"""Past-day cancelled orders through the real sync_order -> cancel_order path
	(backdated like pos_today_demo backdates its orders)."""
	pos = _imp("pos_today_demo")
	ctx = pos._resolve_context(branch, "Administrator", False)
	s, e = add_days(today(), -(REPORT_DAYS - 1)), add_days(today(), -1)
	have_days = set(
		str(d)
		for d in frappe.get_all(
			"POS Invoice",
			filters={"branch": branch, "docstatus": 2, "posting_date": ["between", [s, e]]},
			pluck="posting_date",
		)
	)
	from ury.ury.doctype.ury_order.ury_order import cancel_order, get_menu_name

	reasons = ["Customer left before the order was prepared", "Wrong item punched", "Duplicate order", "Guest changed mind"]
	made = []
	menu = get_menu_name("Take Away")
	with pos._as_user("Administrator"):
		for i, offset in enumerate((5, 3, 1)):
			day = add_days(today(), -offset)
			if day in have_days:
				continue
			name = None
			try:
				rng = random.Random(f"{branch}:{day}:cancel")
				ts = get_datetime(f"{day} {rng.choice(['13', '14', '20', '21'])}:{rng.randint(5, 55):02d}:00")
				customers = pos._customers(ctx)
				lines = pos._pick_lines(ctx, pos._pool_for_menu(ctx, menu), rng.randint(2, 4), f"rf-cancel-{day}")
				name = pos._sync(
					ctx, items=lines, customer=rng.choice(customers), pax=1, order_type="Take Away", room=ctx.default_room
				)
				pos._backdate_invoice(name, ts)
				for k in pos._kots_of(name):
					pos._backdate_kot(k.name, ts + timedelta(seconds=30))
				cancel_order(name, reasons[i % len(reasons)])
				# clear the "Cancelled KOT awaiting manager confirmation" from the KDS
				try:
					from ury.ury.api.ury_kot_display import confirm_cancel_kot

					for k in pos._kots_of(name, ("Cancelled", "Partially cancelled")):
						confirm_cancel_kot(k.name)
				except Exception as ce:  # noqa: BLE001
					print(f"  ~ confirm_cancel_kot: {ce}")
				frappe.db.commit()
				made.append(name)
			except Exception as ex:  # noqa: BLE001
				frappe.db.rollback()
				print(f"  ~ cancelled order for {day} ({name}) failed: {ex}")
	return made


def _branch_users(branch):
	rows = frappe.get_all("URY User", filters={"parent": branch, "parenttype": "Branch"}, pluck="user")
	return sorted(
		{
			u
			for u in rows
			if u not in ("Administrator", "Guest") and cint(frappe.db.get_value("User", u, "enabled"))
		}
	)


def _recent_invoices(branch, extra=None):
	s = add_days(today(), -(REPORT_DAYS - 1))
	f = {"branch": branch, "docstatus": 1, "posting_date": [">=", s]}
	f.update(extra or {})
	return frappe.get_all(
		"POS Invoice", filters=f, fields=["name", "waiter", "customer", "customer_name"], order_by="posting_date asc, name asc"
	)


def _fill_employee_sales(branch, company):
	users = _branch_users(branch)
	if len(users) < 2:
		return f"skipped: only {len(users)} non-admin branch users"
	invs = _recent_invoices(branch)
	distinct = {i.waiter for i in invs if i.waiter and i.waiter != "Administrator"}
	if len(distinct) >= 3:
		return f"already {len(distinct)} waiters"
	n = 0
	for idx, i in enumerate(invs):
		if i.waiter in (None, "", "Administrator"):
			frappe.db.set_value("POS Invoice", i.name, "waiter", users[idx % len(users)], update_modified=False)
			n += 1
	return f"waiter spread over {len(users)} users on {n} invoices"


def _fill_commission(branch, company):
	notes = []
	doc = frappe.get_single("URY Commission Settings")
	changed = False
	if not doc.enabled:
		doc.enabled = 1
		changed = True
	if not flt(doc.default_rate) and not (doc.get("rules") or []):
		doc.default_rate = 2.0
		changed = True
	if changed:
		doc.save(ignore_permissions=True)
		notes.append("settings enabled (default_rate 2%)")
	if not (frappe.db.has_column("POS Invoice", "custom_waiter_employee")):
		return "; ".join(notes) + "; no custom_waiter_employee column"
	emps = frappe.get_all(
		"Employee", filters={"status": "Active", "branch": branch}, pluck="name", order_by="creation asc", limit_page_length=6
	)
	if not emps:
		return "; ".join(notes) + "; no active Employee for branch (run pnl_demo)"
	n = 0
	for idx, i in enumerate(_recent_invoices(branch)):
		cur = frappe.db.get_value("POS Invoice", i.name, ["custom_waiter_employee", "custom_closing_employee"], as_dict=True)
		upd = {}
		if not cur.custom_waiter_employee:
			upd["custom_waiter_employee"] = emps[idx % len(emps)]
		if not cur.custom_closing_employee:
			upd["custom_closing_employee"] = emps[(idx + 1) % len(emps)]
		if upd:
			frappe.db.set_value("POS Invoice", i.name, upd, update_modified=False)
			n += 1
	notes.append(f"employee attribution set on {n} invoices")
	return "; ".join(notes)


def _fill_customers(branch, company):
	invs = _recent_invoices(branch)
	by_cust = {}
	for i in invs:
		by_cust.setdefault(i.customer_name or i.customer, 0)
		by_cust[i.customer_name or i.customer] += 1
	repeated = [c for c, n in by_cust.items() if n > 1]
	if len(repeated) >= 3:
		return f"already {len(repeated)} repeat customers"
	pos = _imp("pos_today_demo")
	ctx = frappe._dict(branch=branch)
	customers = pos._customers(ctx)[:4]
	if len(customers) < 2:
		return "skipped: <2 customers"
	n = 0
	for idx, i in enumerate(invs[: len(customers) * 3]):
		c = customers[idx % len(customers)]
		cname = frappe.db.get_value("Customer", c, "customer_name") or c
		frappe.db.set_value("POS Invoice", i.name, {"customer": c, "customer_name": cname}, update_modified=False)
		n += 1
	return f"{n} recent invoices spread over {len(customers)} customers"


def _fill_purchases(branch, company):
	s, e = add_days(today(), -(REPORT_DAYS - 1)), today()
	have = frappe.db.count("Purchase Invoice", {"company": company, "docstatus": 1, "posting_date": ["between", [s, e]]})
	if have >= 3:
		return f"already {have} purchase invoices"
	ps = importlib.import_module("ury.ury.dev_seed.purchasing_seed")
	ps._ensure_suppliers()
	vy = _imp("variance_yield_demo")
	_b, _c, warehouse = vy._branch_ctx(branch)
	items = vy._pick_items(branch, company)
	if not items:
		return "skipped: no stock items"
	expense = frappe.db.get_value("Company", company, "default_expense_account")
	made = []
	for i, offset in enumerate((6, 3, 1)):
		day = add_days(today(), -offset)
		supplier = ps.SUPPLIERS[i % len(ps.SUPPLIERS)]
		remarks = f"[{MARK}] {day}"
		if frappe.db.exists("Purchase Invoice", {"company": company, "supplier": supplier, "posting_date": day, "remarks": ["like", f"{remarks}%"]}):
			continue
		chosen = [items[(i + j) % len(items)] for j in range(min(4, len(items)))]
		for update_stock in (1, 0):
			try:
				data = {
					"doctype": "Purchase Invoice",
					"supplier": supplier,
					"company": company,
					"posting_date": day,
					"set_posting_time": 1,
					"bill_date": day,
					"update_stock": update_stock,
					"remarks": remarks,
					"items": [
						{
							"item_code": c,
							"qty": 10 + ((i + j) % 6) * 3,
							"rate": flt(frappe.db.get_value("Item", c, "valuation_rate")) or 60 + j * 15,
							"expense_account": expense,
							**({"warehouse": warehouse} if update_stock else {}),
						}
						for j, c in enumerate(chosen)
					],
				}
				if frappe.get_meta("Purchase Invoice").get_field("branch"):
					data["branch"] = branch
				if update_stock:
					data["set_warehouse"] = warehouse
				doc = frappe.get_doc(data)
				doc.insert(ignore_permissions=True)
				doc.submit()
				frappe.db.commit()
				made.append(doc.name)
				break
			except Exception as ex:  # noqa: BLE001
				frappe.db.rollback()
				print(f"  ~ purchase invoice {day} update_stock={update_stock} failed: {ex}")
	return made


def _fill_wastage(branch, company):
	s, e = add_days(today(), -(REPORT_DAYS - 1)), today()
	have = frappe.db.count(
		"URY Wastage", {"branch": branch, "captured_on": ["between", [f"{s} 00:00:00", f"{e} 23:59:59"]]}
	)
	if have >= 5:
		return f"already {have} wastage records"
	more = importlib.import_module("ury.ury.dev_seed.more_seed")
	vy = _imp("variance_yield_demo")
	_b, _c, warehouse = vy._branch_ctx(branch)
	items = vy._pick_items(branch, company)
	depts = frappe.get_all("URY Production Department", pluck="name")
	plan = frappe.db.get_value(
		"URY Sales Plan", {"branch": branch, "plan_date": ["<=", today()], "docstatus": ["!=", 2]}, "name", order_by="plan_date desc"
	)
	if not (items and depts and plan):
		return f"skipped: items={len(items)} depts={len(depts)} plan={plan}"
	reasons = more.WASTAGE_REASON_CATEGORIES
	statuses = ["Authorized", "Draft", "Authorized", "Rejected", "Draft", "Authorized"]
	made = []
	for i in range(5 - have if have < 5 else 0):
		offset = (6, 4, 3, 1, 0)[i % 5]
		day = add_days(today(), -offset)
		dept = depts[i % len(depts)]
		item = items[i % len(items)]
		status = statuses[i % len(statuses)]
		reason = reasons[i % len(reasons)]
		qty = round(1.5 + (i % 4) * 0.75, 2)
		try:
			ia = more._ensure_demo_issue_authorization(plan, branch, company, dept, item, 50)
			if not ia:
				continue
			meta = frappe.db.get_value("Item", item, ["item_name", "stock_uom", "valuation_rate"], as_dict=True)
			rate = flt(meta.valuation_rate) or 60
			captured = get_datetime(f"{day} {10 + i}:{(i * 13) % 60:02d}:00")
			wd = {
				"doctype": "URY Wastage",
				"issue_authorization": ia,
				"plan": plan,
				"branch": branch,
				"company": company,
				"department": dept,
				"warehouse": warehouse,
				"status": status,
				"reason_category": reason,
				"reason_notes": f"[{MARK}] {reason.lower()} on prep line",
				"captured_by": "Administrator",
				"captured_on": captured,
				"items": [
					{
						"item_code": item,
						"item_name": meta.item_name,
						"qty": qty,
						"uom": meta.stock_uom,
						"rate": rate,
						"amount": round(qty * rate, 2),
					}
				],
			}
			if status in ("Authorized", "Rejected"):
				wd["approved_by"] = "Administrator"
				wd["approved_on"] = captured + timedelta(hours=1)
				wd["approval_permission_basis"] = "Stock Manager" if status == "Authorized" else "System Manager"
			wd["audit_log"] = json.dumps([{"event": MARK, "actor": "Administrator", "status": status}], sort_keys=True)
			doc = frappe.get_doc(wd)
			doc.insert(ignore_permissions=True, ignore_mandatory=True)
			frappe.db.set_value("URY Wastage", doc.name, "captured_on", captured, update_modified=False)
			frappe.db.commit()
			made.append(doc.name)
		except Exception as ex:  # noqa: BLE001
			frappe.db.rollback()
			print(f"  ~ wastage {day} {dept}/{item} failed: {ex}")
	return made


def _fill_work_orders(branch, company):
	s, e = add_days(today(), -(REPORT_DAYS - 1)), today()
	have = frappe.db.sql(
		"""select count(*) from `tabWork Order` where status='Completed' and docstatus=1
		and date(coalesce(actual_end_date, planned_end_date)) between %s and %s""",
		(s, e),
	)[0][0]
	if have >= 3:
		return f"already {have} completed work orders"
	cfg = frappe.db.sql(
		"""select c.item, c.bom from `tabURY Item Production Configuration` c join `tabBOM` b on b.name=c.bom
		where c.branch=%s and c.active=1 and b.docstatus=1 and b.is_active=1 order by c.item limit 3""",
		(branch,),
		as_dict=True,
	)
	if not cfg:
		return "skipped: no active production configuration with a submitted BOM"
	vy = _imp("variance_yield_demo")
	_b, _c, fg = vy._branch_ctx(branch)
	wip = frappe.db.get_value("Warehouse", {"company": company, "name": ["like", "Work In Progress%"]}, "name") or fg
	made = []
	for i, offset in enumerate((5, 2, 1)[: 3 - have]):
		day = add_days(today(), -offset)
		c = cfg[i % len(cfg)]
		if frappe.db.exists(
			"Work Order",
			[
				["Work Order", "production_item", "=", c.item],
				["Work Order", "planned_start_date", ">=", f"{day} 00:00:00"],
				["Work Order", "planned_start_date", "<", f"{add_days(day, 1)} 00:00:00"],
			],
		):
			continue
		qty = 12 + 4 * i
		try:
			doc = frappe.get_doc(
				{
					"doctype": "Work Order",
					"production_item": c.item,
					"bom_no": c.bom,
					"qty": qty,
					"company": company,
					"skip_transfer": 1,
					"fg_warehouse": fg,
					"wip_warehouse": wip,
					"planned_start_date": f"{day} 09:00:00",
					"expected_delivery_date": day,
					"produced_qty": qty,
				}
			)
			doc.insert(ignore_permissions=True)
			doc.actual_start_date = f"{day} 09:00:00"
			doc.actual_end_date = f"{day} 14:00:00"
			doc.submit()
			frappe.db.commit()
			made.append(f"{doc.name} ({doc.status})")
		except Exception as ex:  # noqa: BLE001
			frappe.db.rollback()
			print(f"  ~ work order {day} {c.item} failed: {ex}")
	return made


def _fill_unsettled(branch, company):
	from ury.ury.report.unsettled_bills.unsettled_bills import execute

	if len(execute({"branch": branch})[1]):
		return "already has rows"
	drafts = frappe.get_all(
		"POS Invoice",
		filters={"branch": branch, "docstatus": 0, "invoice_printed": 1, "posting_date": today()},
		pluck="name",
	)
	if not drafts:
		return "skipped: no printed (bill requested) draft invoices today"
	delay = cint(frappe.get_single("Alert Settings").payment_delay_time) or 10
	n = 0
	for i, inv in enumerate(drafts):
		if frappe.db.exists("Comment", {"reference_doctype": "POS Invoice", "reference_name": inv, "comment_type": "Info"}):
			continue
		c = frappe.get_doc(
			{"doctype": "Comment", "comment_type": "Info", "reference_doctype": "POS Invoice", "reference_name": inv, "content": "Bill printed"}
		).insert(ignore_permissions=True)
		ts = now_datetime() - timedelta(minutes=delay + 6 + 4 * i)
		floor = get_datetime(f"{today()} 00:01:00")
		frappe.db.set_value("Comment", c.name, "creation", max(ts, floor), update_modified=False)
		n += 1
	return f"{n} bill-printed comments added"


def _step_reports(branch, company):
	out = {"before": _probe_all(branch, company), "fill": {}}
	# invoice-shaped fills first, then dependants
	for key, fn in (
		("cancelled", _fill_cancelled),
		("employee_sales", _fill_employee_sales),
		("commission", _fill_commission),
		("customers", _fill_customers),
		("purchases", _fill_purchases),
		("wastage", _fill_wastage),
		("work_orders", _fill_work_orders),
		("unsettled_bills", _fill_unsettled),
	):
		frappe.set_user("Administrator")
		try:
			out["fill"][key] = fn(branch, company)
			frappe.db.commit()
		except Exception as e:  # noqa: BLE001
			frappe.db.rollback()
			out["fill"][key] = f"FAILED: {type(e).__name__}: {e}"
			print(f"  ! report fill '{key}' failed: {e}\n{traceback.format_exc()}")
	out["after"] = _probe_all(branch, company)
	out["still_empty"] = [k for k, v in out["after"].items() if v in (0, None) or (isinstance(v, str) and v.startswith("ERR"))]
	return out


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------


def seed(branch=None):
	prev = frappe.session.user
	frappe.set_user("Administrator")
	summary = {"today": today()}
	try:
		branch, company = _resolve_branch(branch)
		summary["branch"], summary["company"] = branch, company
		print(f"[roll_forward_demo] today={today()} branch={branch} company={company}")
		_run(summary, "close_prev_sessions", _step_close_prev_sessions, branch, company)
		_run(summary, "prev_pnl", _step_prev_pnl, branch, company)
		_run(summary, "prev_variance_yield", _step_prev_variance_yield, branch, company)
		_run(summary, "prev_sales_plan", _step_prev_sales_plan, branch, company)
		_run(summary, "pos_today", _step_pos_today, branch, company)
		_run(summary, "today_plan_locked", _step_today_plan_locked, branch, company)
		_run(summary, "tomorrow_plan_draft", _step_tomorrow_plan_draft, branch, company)
		_run(summary, "notifications", _step_notifications, branch, company)
		_run(summary, "reports", _step_reports, branch, company)
	except Exception as e:  # noqa: BLE001
		summary["error"] = f"{type(e).__name__}: {e}"
		print(f"[roll_forward_demo] cannot start: {e}")
	finally:
		frappe.set_user("Administrator")
		frappe.db.commit()
		frappe.set_user(prev)
	print("[roll_forward_demo] ---- summary ----")
	print(json.dumps(summary, indent=2, default=str))
	return summary


run = seed
