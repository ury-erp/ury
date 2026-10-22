"""Demo seed: a live "trading today" restaurant -- open POS session, running
tables, KDS tickets, paid sales, alerts, insights and service requests.

Run (from the bench, site context)::

    bench --site <site> execute <dotted.path>.pos_today_demo.seed
    # or from a console / import:
    #   pos_today_demo.seed(branch="My Branch", user="Administrator")
    #   pos_today_demo.seed(force=True)      # ignore the per-day step markers
    #   pos_today_demo.check_access()        # read-only: can <user> open POS/KDS/dashboard?

What it does, for TODAY on the first branch (or ``branch``):

1. ACCESS    -- makes ``user`` pass every gate the POS v2 opening screen, KDS
                 (mosaic) and the manager dashboard apply (see "Access
                 mapping" below; this is the SW-14 fix).
2. STALE     -- closes every submitted ``POS Opening Entry`` still ``Open``
                 from an earlier day with a real ``POS Closing Entry`` (ERPNext's
                 own ``make_closing_entry_from_opening``, same as
                 ``ury/setup/pos_demo.py``), so ``validate_pos_close`` stops
                 returning "Failed" and ``get_needs_attention`` stops listing a
                 "POS session left open from a previous day".
3. OPENING   -- ``ury.ury_pos.api.create_pos_opening_entry`` as ``user`` (the
                 call the React Opening screen makes), then the "Opening"
                 checklist via ``ury.ury_pos.api.submit_checklist`` (the POS
                 gates on it before showing any order screen).
4. PAID      -- ~10 invoices earlier today: ``sync_order`` -> (dine-in)
                 ``qz_print_update`` (the "print bill" call) -> ``make_invoice``
                 (the "settle" call). KOTs are served through the KDS item
                 execution API + ``serve_kot``.
5. RUNNING   -- 6 dine-in table orders (draft POS Invoices, KOTs sent, tables
                 ``occupied``) at different stages -- just sent / in
                 preparation (late) / ready / partly served with a fresh
                 add-on / eating / bill requested -- plus 1 take-away and 1
                 delivery order, plus one order cancelled via ``cancel_order``
                 (a "Cancelled" KOT waiting for manager confirmation on the KDS).
6. ALERTS    -- Alert Settings/Alert Rule rows (Payment Delay, Table
                 Turnaround), ``URY Service Request`` rows (Bill/Assistance;
                 Open/Acknowledged/Resolved), ``URY KOT Error Log`` rows
                 (within the last hour, so "KOT generation issues" shows),
                 and ``URY Insight`` rows (real rule engine + a few
                 data-derived cards).

Access mapping (what POS v2 / KDS / dashboard actually check -- all read from
source, ``ury`` v3-stg):

* ``Branch.user`` (child doctype ``URY User``: ``user`` + ``room``) -- the ONLY
  user->branch mapping. ``ury_pos.api.getBranch()`` is
  ``SELECT b.branch FROM tabURY User a JOIN tabBranch b ON a.parent=b.name
  WHERE a.user=%s`` and takes ``branch_array[0]``: so the user must be listed in
  the target branch and (to be deterministic) in no other branch. Used by
  getPosProfile, kot_list/served_kot_list (KDS), sync_order, make_invoice,
  cancel_order, checklist API ... Administrator is NOT exempt from getBranch().
* ``POS Profile.applicable_for_users`` (``POS Profile User``) -- needed twice:
  ``getPosProfile()`` does ``applicable_for_users[0].user`` (IndexError if the
  list is empty -> POS never loads), and the Opening screen's
  ``_get_allowed_pos_profiles`` keeps a profile only if the list is empty or
  contains the user.
* **Company default** -- the actual cause of SW-14. ``get_pos_opening_screen_data``
  resolves ``company = frappe.defaults.get_user_default("Company") or
  frappe.db.get_default("Company")`` and ``_get_allowed_pos_profiles`` then
  filters ``POS Profile`` by ``company == that`` and ``disabled = 0``. With no
  Global Defaults company (or a user default pointing at another company) the
  list is empty and the React screen shows ``pos_opening.no_profiles`` =
  "No POS Profile is available for your user in this branch". Note
  ``get_user_default("Company")`` reads the scrubbed key ``company``
  (``frappe/defaults.py``), so the default must be stored under ``company``.
  Adding Administrator to Branch users + POS Profile users (what was tried) does
  not help if this is unset.
* POS Profile must be enabled, in the same company as the opening entry, and the
  first profile of the branch (``frappe.db.exists("POS Profile",
  {"branch": ...})`` -- the one ``getPosProfile`` picks); it needs
  ``custom_kot_naming_series`` (``kot_execute`` throws without it) and at least
  one ``payments`` row with a Mode of Payment account for the company
  (``POS Opening Entry.validate_payment_method_account``).
* Roles: React POS ``checkAccess`` lets ``Administrator`` or any of
  ``URY Captain`` / ``URY Cashier`` / ``URY Manager`` in. The dashboard
  ``AuthGuard``/``useAuth`` treats ``URY Manager`` / ``System Manager`` /
  ``Administrator`` as manager (``require_manager`` server side is the same set).
  KDS ``kot_list`` needs read on ``URY KOT`` (URY Captain/Manager/Cashier or
  System Manager) and item-execution mutations need URY Manager / URY Admin /
  System Manager / Chef + Branch scope. ``create_pos_opening_entry`` needs
  create+submit on ``POS Opening Entry`` (granted to the URY roles by
  ``ury.install.ensure_role_permissions``). Administrator implicitly has every
  role, so only a non-Administrator ``user`` needs roles added.
* Multi-cashier profiles (``custom_enable_multiple_cashier``) additionally need
  a ``custom_main_cashier`` row and an open main-cashier session; this module
  only warns about that, it does not reconfigure it.

Idempotency: each step stores a ``Comment`` marker on the Branch
(``pos_today_demo:<date>:<hash>:<step>``) when it completes; a re-run the same
day skips finished steps (per-order markers for the order steps). Every step is
wrapped in try/except with a commit after success and a rollback on failure --
important because ERPNext's ``create_merge_logs`` rolls back the whole
transaction when a closing fails. ``force=True`` ignores the markers.
"""

import hashlib
import json
import random
import traceback
from contextlib import contextmanager
from datetime import timedelta

import frappe
from frappe.utils import cint, flt, get_datetime, now_datetime, today

MARK = "pos_today_demo"

PAID_COUNT = 10
RUNNING_DINE_IN = 6
OPENING_CASH = 5000
KOT_WARNING_MINUTES = 15  # POS Profile.custom_kot_warning_time default if unset

# Running dine-in orders: (key, minutes since first send, guests, lines, stage)
# stage: queued | preparing | ready | partial | eating | bill_requested
RUNNING_SPECS = [
	("r1", 7, 2, 3, "queued"),
	("r2", 34, 4, 4, "preparing"),
	("r3", 19, 3, 3, "ready"),
	("r4", 52, 5, 4, "partial"),
	("r5", 64, 2, 3, "eating"),
	("r6", 88, 6, 5, "bill_requested"),
]
# Table-less orders: (key, order type, minutes since send, lines, stage)
TABLELESS_SPECS = [
	("t1", "Take Away", 12, 3, "ready"),
	("t2", "Delivery", 16, 3, "preparing"),
]
CANCELLED_SPEC = ("x1", "Take Away", 25, 2)  # cancelled via cancel_order

ITEM_COMMENTS = ["", "", "", "Less spicy", "No onion", "Extra crispy", "Less sugar", "Serve first"]
PAID_TYPES = ["Dine In"] * 6 + ["Take Away"] * 3 + ["Delivery"]


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _note(ctx, msg):
	print(f"  [pos_today_demo] {msg}")
	ctx.notes.append(msg)


def _day_start():
	return get_datetime(f"{today()} 00:00:00")


def _ts(minutes_ago):
	"""Datetime `minutes_ago` before now, never before 00:01 today (so every
	backdated row is still 'today' for posting_date and the business-day window)."""
	t = now_datetime() - timedelta(minutes=minutes_ago)
	floor = _day_start() + timedelta(minutes=1)
	return max(t, floor)


def _hms(dt):
	return dt.strftime("%H:%M:%S")


@contextmanager
def _as_user(user):
	prev = frappe.session.user
	frappe.set_user(user)
	try:
		yield
	finally:
		frappe.set_user(prev)


def _marker_key(ctx, step):
	h = hashlib.md5(f"{ctx.branch}|{ctx.user}".encode()).hexdigest()[:8]
	return f"{MARK}:{today()}:{h}:{step}"


def _is_done(ctx, step):
	if ctx.force:
		return False
	return bool(
		frappe.db.exists(
			"Comment",
			{
				"reference_doctype": "Branch",
				"reference_name": ctx.branch,
				"comment_type": "Info",
				"content": _marker_key(ctx, step),
			},
		)
	)


def _mark_done(ctx, step):
	if frappe.db.exists(
		"Comment",
		{
			"reference_doctype": "Branch",
			"reference_name": ctx.branch,
			"comment_type": "Info",
			"content": _marker_key(ctx, step),
		},
	):
		return
	frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": "Branch",
			"reference_name": ctx.branch,
			"content": _marker_key(ctx, step),
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()


def _run_step(ctx, step, fn, *args):
	"""try/except + commit/rollback wrapper. Returns fn's result or None."""
	if _is_done(ctx, step):
		print(f"[pos_today_demo] step '{step}': already done today -- skipped")
		ctx.skipped.append(step)
		return None
	print(f"[pos_today_demo] step '{step}' ...")
	try:
		result = fn(ctx, *args)
		frappe.db.commit()
		_mark_done(ctx, step)
		return result
	except Exception as e:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		ctx.failed.append(step)
		print(f"  ! step '{step}' failed: {e}\n{traceback.format_exc()}")
		return None


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------


def _resolve_context(branch, user, force):
	ctx = frappe._dict(
		user=user, force=force, notes=[], failed=[], skipped=[], summary={}, pools={}, kot_by_invoice={}
	)
	candidates = [branch] if branch else frappe.get_all("Branch", order_by="creation asc", pluck="name")
	for b in candidates:
		profile = frappe.db.exists("POS Profile", {"branch": b})  # == what getPosProfile() resolves
		restaurant = frappe.db.get_value("URY Restaurant", {"branch": b}, "name")
		if profile and restaurant:
			ctx.branch, ctx.profile, ctx.restaurant = b, profile, restaurant
			break
	else:
		raise frappe.ValidationError(
			"pos_today_demo: no Branch with both a POS Profile and a URY Restaurant found"
		)

	pp = frappe.db.get_value(
		"POS Profile",
		ctx.profile,
		["company", "disabled", "custom_kot_naming_series", "custom_kot_warning_time",
		 "custom_enable_multiple_cashier"],
		as_dict=True,
	)
	ctx.company = pp.company
	ctx.profile_disabled = cint(pp.disabled)
	ctx.multi_cashier = cint(pp.custom_enable_multiple_cashier)
	if frappe.db.count("POS Profile", {"branch": ctx.branch}) > 1:
		_note(ctx, f"branch has several POS Profiles; using {ctx.profile} (the one getPosProfile() resolves)")
	branch_company = frappe.db.get_value("Branch", ctx.branch, "company")
	if branch_company and branch_company != ctx.company:
		_note(ctx, f"Branch.company ({branch_company}) != POS Profile.company ({ctx.company}); using the profile's")

	ctx.rooms = frappe.get_all("URY Room", filters={"branch": ctx.branch}, pluck="name", order_by="name asc")
	ctx.default_room = frappe.db.get_value("URY Restaurant", ctx.restaurant, "default_room") or (
		ctx.rooms[0] if ctx.rooms else None
	)
	ctx.payment_modes = [
		r.mode_of_payment
		for r in frappe.get_all(
			"POS Payment Method",
			filters={"parent": ctx.profile},
			fields=["mode_of_payment", "default"],
			order_by="idx asc",
		)
	]
	ctx.rng = random.Random(f"{today()}:{ctx.branch}")
	ctx.total_minutes = int(min(360, max(30, (now_datetime() - _day_start()).total_seconds() / 60 - 2)))
	return ctx


# ---------------------------------------------------------------------------
# STEP 1: access (the SW-14 fix)
# ---------------------------------------------------------------------------


def _insert_child(parent_doctype, parent, parentfield, child_doctype, values):
	idx = (
		frappe.db.count(child_doctype, {"parent": parent, "parenttype": parent_doctype, "parentfield": parentfield})
		+ 1
	)
	frappe.get_doc(
		{
			"doctype": child_doctype,
			"parent": parent,
			"parenttype": parent_doctype,
			"parentfield": parentfield,
			"idx": idx,
			**values,
		}
	).insert(ignore_permissions=True)
	frappe.clear_document_cache(parent_doctype, parent)


def _step_access(ctx):
	user = ctx.user
	done = []

	# a) the User itself
	if not frappe.db.exists("User", user):
		doc = frappe.get_doc(
			{
				"doctype": "User",
				"email": user if "@" in user else f"{user}@example.com",
				"first_name": user.split("@")[0].title(),
				"user_type": "System User",
				"send_welcome_email": 0,
				"enabled": 1,
			}
		)
		doc.insert(ignore_permissions=True)
		done.append("created User (no password set -- set one yourself to log in)")
		user = doc.name
		ctx.user = user
	elif not cint(frappe.db.get_value("User", user, "enabled")):
		frappe.db.set_value("User", user, "enabled", 1)
		done.append("enabled User")

	# b) roles (Administrator already has every role implicitly)
	if user != "Administrator":
		have = set(frappe.get_roles(user))
		want = [r for r in ("URY Manager", "URY Cashier", "URY Captain") if frappe.db.exists("Role", r)]
		missing = [r for r in want if r not in have]
		if missing:
			frappe.get_doc("User", user).add_roles(*missing)
			frappe.clear_cache(user=user)
			done.append(f"roles +{missing}")

	# c) Branch.user (URY User): one row per room of the branch (room None ==
	#    "all rooms" is also accepted by getRoom(), but getBranchRoom() needs a
	#    concrete first room, so rooms are listed explicitly).
	existing = {
		(r.room or None)
		for r in frappe.get_all(
			"URY User",
			filters={"parent": ctx.branch, "parenttype": "Branch", "user": user},
			fields=["room"],
		)
	}
	wanted_rooms = ctx.rooms or [None]
	added = 0
	for room in wanted_rooms:
		if room in existing:
			continue
		_insert_child("Branch", ctx.branch, "user", "URY User", {"user": user, "room": room})
		added += 1
	if added:
		done.append(f"Branch.user +{added} URY User row(s)")

	# d) getBranch() takes the FIRST joined row -- drop the user's rows in other branches.
	others = frappe.get_all(
		"URY User",
		filters={"user": user, "parenttype": "Branch", "parent": ["!=", ctx.branch]},
		fields=["name", "parent"],
	)
	for r in others:
		frappe.db.delete("URY User", {"name": r.name})
		frappe.clear_document_cache("Branch", r.parent)
	if others:
		done.append(f"removed {len(others)} URY User row(s) from other branches {sorted({r.parent for r in others})}")

	# e) POS Profile: enabled, users, KOT series, KOT warning time
	if ctx.profile_disabled:
		frappe.db.set_value("POS Profile", ctx.profile, "disabled", 0)
		done.append("enabled POS Profile")
	if not frappe.db.exists("POS Profile User", {"parent": ctx.profile, "user": user}):
		_insert_child("POS Profile", ctx.profile, "applicable_for_users", "POS Profile User", {"user": user, "default": 0})
		done.append("POS Profile.applicable_for_users +user")
	if not frappe.db.get_value("POS Profile", ctx.profile, "custom_kot_naming_series"):
		frappe.db.set_value("POS Profile", ctx.profile, "custom_kot_naming_series", "KOT-URY-")
		done.append("POS Profile.custom_kot_naming_series='KOT-URY-'")
	if not cint(frappe.db.get_value("POS Profile", ctx.profile, "custom_kot_warning_time")):
		frappe.db.set_value("POS Profile", ctx.profile, "custom_kot_warning_time", KOT_WARNING_MINUTES)
		done.append(f"POS Profile.custom_kot_warning_time={KOT_WARNING_MINUTES}")
	frappe.clear_document_cache("POS Profile", ctx.profile)

	# f) payment-mode accounts for the opening entry's balance_details
	try:
		from ury.ury.dev_seed.profiles import _ensure_mode_of_payment

		for mode in ctx.payment_modes:
			_ensure_mode_of_payment(mode, ctx.company)
	except Exception as e:  # best effort; the dev_seed helper may not be importable
		_note(ctx, f"could not ensure Mode of Payment accounts ({e})")

	# g) Company default -- THE cause of "No POS Profile is available" (SW-14)
	if not frappe.db.get_default("company"):
		gd = frappe.get_doc("Global Defaults")
		gd.default_company = ctx.company
		gd.save(ignore_permissions=True)
		done.append(f"Global Defaults.default_company={ctx.company}")
	with _as_user(user):
		resolved = frappe.defaults.get_user_default("Company") or frappe.db.get_default("Company")
	if resolved != ctx.company:
		frappe.defaults.set_user_default("company", ctx.company, user=user)
		frappe.defaults.set_user_default("Company", ctx.company, user=user)
		done.append(f"user default company {resolved!r} -> {ctx.company!r}")
		if user != "Administrator" and frappe.db.exists("User Permission", {"user": user, "allow": "Company"}):
			if not frappe.db.exists("User Permission", {"user": user, "allow": "Company", "for_value": ctx.company}):
				_note(ctx, f"{user} has User Permissions on Company that exclude {ctx.company}; add one manually")

	if ctx.multi_cashier:
		_note(
			ctx,
			"POS Profile has custom_enable_multiple_cashier=1: also needs a custom_main_cashier row and an open "
			"main-cashier session; not reconfigured by this seed",
		)
	ctx.summary["access_changes"] = done or ["nothing to change"]
	return done


def check_access(branch=None, user="Administrator"):
	"""Read-only: run the server calls the POS opening screen, KDS and dashboard
	make *as `user`* and report failures. Returns {check: "ok" | "FAIL: ..."}."""
	ctx = _resolve_context(branch, user, False)
	return _verify_access(ctx)


def _verify_access(ctx):
	from ury.ury.api.ury_dashboard import get_dashboard_stats, get_needs_attention
	from ury.ury.api.ury_insight import get_active_insights
	from ury.ury.api.ury_kot_display import kot_list
	from ury.ury_pos.api import getBranch, getPosProfile, get_open_pos_opening_entries, get_pos_opening_screen_data

	out = {}

	def check(name, fn):
		try:
			out[name] = fn() or "ok"
		except Exception as e:
			out[name] = f"FAIL: {e}"

	def t_branch():
		b = getBranch()
		return None if b == ctx.branch else f"FAIL: getBranch()={b!r}, expected {ctx.branch!r}"

	def t_profile():
		p = getPosProfile()
		return None if p.get("pos_profile") == ctx.profile else f"FAIL: getPosProfile() -> {p.get('pos_profile')!r}"

	def t_opening_screen():
		d = get_pos_opening_screen_data()
		names = [p["name"] for p in d["allowed_profiles"]]
		if not names:
			return "FAIL: allowed_profiles empty -> 'No POS Profile is available' (SW-14); company=%r" % d.get("company")
		if not (d["permissions"]["create"] and d["permissions"]["submit"]):
			return "FAIL: no create/submit permission on POS Opening Entry"
		if d.get("daily_close_pending"):
			return "FAIL: daily_close_pending (stale open POS Opening Entry)"
		return None

	def t_open_entries():
		rows = get_open_pos_opening_entries(ctx.profile)
		return None if rows else "FAIL: no open POS Opening Entry visible"

	with _as_user(ctx.user):
		check("getBranch", t_branch)
		check("getPosProfile", t_profile)
		check("opening_screen_context", t_opening_screen)
		check("open_pos_opening_entries", t_open_entries)
		check("kds_kot_list", lambda: bool(kot_list()) and None)
		check("dashboard_stats", lambda: bool(get_dashboard_stats(ctx.branch)) and None)
		check("dashboard_needs_attention", lambda: get_needs_attention(ctx.branch) is not None and None)
		check("dashboard_insights", lambda: get_active_insights(ctx.branch) is not None and None)
	return out


# ---------------------------------------------------------------------------
# STEP 2: close stale open POS Opening Entries
# ---------------------------------------------------------------------------


def _with_negative_stock(fn):
	"""Run fn with Stock Settings.allow_negative_stock=1, then restore it.
	Only used as a fallback when closing a stale session fails on stock."""
	orig = frappe.db.get_single_value("Stock Settings", "allow_negative_stock")
	frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
	frappe.db.commit()
	try:
		return fn()
	finally:
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", orig or 0)
		frappe.db.commit()


def _close_opening(name):
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening

	opening = frappe.get_doc("POS Opening Entry", name)
	closing = make_closing_entry_from_opening(opening)
	closing.posting_date = today()
	closing.insert(ignore_permissions=True)
	closing.submit()
	frappe.db.commit()

	status = frappe.db.get_value("POS Closing Entry", closing.name, "status")
	if status == "Queued" and frappe.db.get_value("POS Opening Entry", name, "status") == "Open":
		# >=10 invoices are consolidated in a background job; run it inline so the
		# seed does not depend on a worker being up.
		from erpnext.accounts.doctype.pos_invoice_merge_log.pos_invoice_merge_log import (
			create_merge_logs,
			get_invoice_customer_map,
		)

		closing.reload()
		create_merge_logs(get_invoice_customer_map(closing.get("pos_transactions")), closing)
	return closing.name


def _step_close_stale(ctx):
	profiles = frappe.get_all("POS Profile", filters={"branch": ctx.branch}, pluck="name")
	stale = frappe.get_all(
		"POS Opening Entry",
		filters={"status": "Open", "docstatus": 1, "posting_date": ["<", today()], "pos_profile": ["in", profiles]},
		fields=["name", "user", "posting_date"],
		order_by="posting_date asc",
	)
	closed, failed = [], []
	for row in stale:
		try:
			try:
				_close_opening(row.name)
			except Exception as first:
				frappe.db.rollback()
				_note(ctx, f"closing {row.name} failed ({first}); retrying with negative stock allowed")
				_with_negative_stock(lambda: _close_opening(row.name))
			if frappe.db.get_value("POS Opening Entry", row.name, "status") == "Closed":
				closed.append(row.name)
			else:
				failed.append(row.name)
		except Exception as e:
			frappe.db.rollback()
			failed.append(row.name)
			_note(ctx, f"could not close stale {row.name}: {e}")
	ctx.summary["stale_closed"] = closed
	ctx.summary["stale_failed"] = failed
	if failed:
		raise frappe.ValidationError(f"stale POS Opening Entries still open: {failed}")
	return closed


# ---------------------------------------------------------------------------
# STEP 3: today's opening entry + opening checklist (as `user`)
# ---------------------------------------------------------------------------


def _step_open_pos(ctx):
	from ury.ury_pos.api import create_pos_opening_entry, get_checklist, submit_checklist

	opening = frappe.db.get_value(
		"POS Opening Entry",
		{"user": ctx.user, "pos_profile": ctx.profile, "status": "Open", "docstatus": 1, "posting_date": today()},
		"name",
	)
	if not opening:
		balances = [
			{"mode_of_payment": m, "opening_amount": OPENING_CASH if m == "Cash" else 0} for m in ctx.payment_modes
		] or [{"mode_of_payment": "Cash", "opening_amount": OPENING_CASH}]
		try:
			with _as_user(ctx.user):
				res = create_pos_opening_entry(ctx.profile, ctx.company, balances)
			opening = res["name"]
		except Exception as e:
			frappe.db.rollback()
			_note(ctx, f"create_pos_opening_entry failed as {ctx.user} ({e}); inserting directly")
			doc = frappe.get_doc(
				{
					"doctype": "POS Opening Entry",
					"period_start_date": now_datetime(),
					"posting_date": today(),
					"user": ctx.user,
					"company": ctx.company,
					"pos_profile": ctx.profile,
					"branch": ctx.branch,
					"restaurant": ctx.restaurant,
					"balance_details": balances,
				}
			)
			doc.insert(ignore_permissions=True)
			doc.submit()
			opening = doc.name
		frappe.db.commit()

	# Backdate the session start so the paid invoices (dated earlier today) fall inside it.
	start = _ts(ctx.total_minutes)
	frappe.db.set_value("POS Opening Entry", opening, "period_start_date", start, update_modified=False)
	ctx.opening = opening
	ctx.summary["opening_entry"] = opening

	with _as_user(ctx.user):
		info = get_checklist(ctx.profile, "Opening")
		if info.get("items") and info.get("log_status") != "Complete":
			items = [{"item_label": r["item_label"], "is_checked": 1, "remarks": ""} for r in info["items"]]
			res = submit_checklist(ctx.profile, "Opening", json.dumps(items), opening)
			ctx.summary["opening_checklist"] = res.get("status")
		else:
			ctx.summary["opening_checklist"] = info.get("log_status") or "no checklist configured"
	return opening


# ---------------------------------------------------------------------------
# Alert settings
# ---------------------------------------------------------------------------


def _step_alert_settings(ctx):
	settings = frappe.get_single("Alert Settings")
	changed = []
	if not cint(settings.payment_delay_time):
		settings.payment_delay_time = 15
		changed.append("payment_delay_time=15")
	if not cint(settings.table_turnaround_warning_time):
		settings.table_turnaround_warning_time = 60
		changed.append("table_turnaround_warning_time=60")
	roles = [r for r in ("URY Manager",) if frappe.db.exists("Role", r)]
	for alert_type, minutes in (("Payment Delay", 15), ("Table Turnaround", 60)):
		have = any(
			r.alert_type == alert_type and (not r.branch or r.branch == ctx.branch) for r in settings.get("custom_alerts") or []
		)
		if have:
			continue
		settings.append(
			"custom_alerts",
			{
				"alert_type": alert_type,
				"alert_name": f"{alert_type} - {ctx.branch}",
				"threshold_minutes": minutes,
				"enabled": 1,
				"branch": ctx.branch,
				"notify_roles": [{"role": r} for r in roles],
			},
		)
		changed.append(f"Alert Rule {alert_type} ({minutes} min)")
	if changed:
		settings.save(ignore_permissions=True)
	ctx.summary["alert_rules"] = changed or ["already present"]
	return changed


# ---------------------------------------------------------------------------
# Menu/item pools, tables, customers
# ---------------------------------------------------------------------------


def _pool_for_menu(ctx, menu):
	"""Orderable items for `menu`: enabled menu item + Item Price on the menu's
	price list (what price_items_for_invoice requires) + resolvable KOT routing
	(what process_items_for_kot requires) + not obviously out of stock."""
	if menu in ctx.pools:
		return ctx.pools[menu]
	from ury.ury.api.ury_kot_routing import resolve_production_units
	from ury.ury.api.ury_production_context import resolve_production_context

	price_list = frappe.db.get_value("Price List", {"restaurant_menu": menu, "enabled": 1}, "name")
	pool = []
	if price_list:
		allow_neg = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock"))
		rows = frappe.get_all(
			"URY Menu Item", filters={"parent": menu, "disabled": 0}, fields=["item", "item_name"], order_by="idx asc"
		)
		for r in rows:
			item = frappe.db.get_value("Item", r.item, ["disabled", "is_sales_item", "is_stock_item"], as_dict=True)
			if not item or item.disabled or not item.is_sales_item:
				continue
			rate = frappe.db.get_value("Item Price", {"item_code": r.item, "price_list": price_list}, "price_list_rate")
			if not rate:
				continue
			try:
				cfg = resolve_production_context(r.item, ctx.branch, company=ctx.company)
				policy = cfg.production_policy if cfg else None
				if policy in ("PRE_PRODUCED", "DIRECT_RETAIL"):
					continue  # availability-gated / not sent to a kitchen unit
				units = resolve_production_units(
					item_code=r.item, company=ctx.company, branch=ctx.branch, production_policy=policy
				)
			except Exception:
				continue
			if not units:
				continue
			in_stock = True
			if not allow_neg and item.is_stock_item:
				qty = frappe.db.sql("select coalesce(sum(actual_qty),0) from `tabBin` where item_code=%s", (r.item,))[0][0]
				in_stock = flt(qty) >= 30
			pool.append(
				frappe._dict(
					item=r.item, item_name=r.item_name, rate=flt(rate), unit=units[0],
					mto=(policy == "MADE_TO_ORDER"), in_stock=in_stock,
				)
			)
	good = [p for p in pool if p.in_stock]
	if len(good) < 4:
		good = pool
	plain = [p for p in good if not p.mto]
	ctx.pools[menu] = plain if len(plain) >= 6 else good
	if len(ctx.pools[menu]) < 3:
		raise frappe.ValidationError(
			f"menu {menu!r}: only {len(ctx.pools[menu])} orderable items (need price + routing + stock)"
		)
	return ctx.pools[menu]


def _pick_lines(ctx, pool, n_lines, key):
	rng = ctx.rng
	shuffled = pool[:]
	rng.shuffle(shuffled)
	chosen, units = [], set()
	for p in shuffled:  # first pass: spread across production units so several KDS screens get tickets
		if p.unit not in units and len(chosen) < n_lines:
			chosen.append(p)
			units.add(p.unit)
	for p in shuffled:
		if len(chosen) >= n_lines:
			break
		if p not in chosen:
			chosen.append(p)
	return [
		{
			"item": p.item,
			"item_name": p.item_name,
			"rate": p.rate,
			"qty": rng.choice([1, 1, 2, 2, 3]),
			"comment": rng.choice(ITEM_COMMENTS),
			"reservation_line_key": f"demo-{key}-{i}",
		}
		for i, p in enumerate(chosen)
	]


def _free_tables(ctx):
	rows = frappe.get_all(
		"URY Table",
		filters={"branch": ctx.branch, "is_take_away": 0, "occupied": 0},
		fields=["name", "restaurant_room", "no_of_seats"],
		order_by="name asc",
	)
	busy = set(
		frappe.get_all(
			"POS Invoice",
			filters={"docstatus": 0, "branch": ctx.branch, "restaurant_table": ["is", "set"]},
			pluck="restaurant_table",
		)
	)
	by_room = {}
	for r in rows:
		if r.name not in busy:
			by_room.setdefault(r.restaurant_room, []).append(r)
	ordered = []
	while any(by_room.values()):  # round-robin across rooms
		for room in list(by_room):
			if by_room[room]:
				ordered.append(by_room[room].pop(0))
	return ordered


def _customers(ctx):
	if "customers" in ctx:
		return ctx.customers
	excluded = set(
		frappe.get_all("Aggregator Settings", filters={"parent": ctx.branch, "parenttype": "Branch"}, pluck="customer")
	)
	rows = frappe.get_all(
		"Customer", filters={"disabled": 0}, fields=["name"], order_by="creation asc", limit_page_length=40
	)
	ctx.customers = [r.name for r in rows if r.name not in excluded] or [rows[0].name]
	return ctx.customers


# ---------------------------------------------------------------------------
# Order primitives (call the same whitelisted APIs the POS calls, as `user`)
# ---------------------------------------------------------------------------


def _pos_identity(ctx):
	if "identity" not in ctx:
		from ury.ury_pos.api import getPosProfile

		info = getPosProfile()
		ctx.identity = frappe._dict(cashier=info.get("cashier"), owner=info.get("owner"))
	return ctx.identity


def _sync(ctx, *, items, customer, pax, order_type, table=None, invoice=None, room=None):
	from ury.ury.doctype.ury_order.ury_order import sync_order

	ident = _pos_identity(ctx)
	last_modified = str(frappe.db.get_value("POS Invoice", invoice, "modified")) if invoice else None
	res = sync_order(
		items=items,
		cashier=ident.cashier,
		owner=ident.owner,
		mode_of_payment=ctx.payment_modes[0] if ctx.payment_modes else "Cash",
		customer=customer,
		no_of_pax=pax,
		last_invoice=invoice,
		waiter=ctx.user,
		pos_profile=ctx.profile,
		last_modified_time=last_modified,
		table=table,
		invoice=invoice,
		order_type=order_type,
		room=room,
	)
	if not isinstance(res, dict) or res.get("status") == "Failure" or not res.get("name"):
		raise frappe.ValidationError(f"sync_order rejected the order: {res if not isinstance(res, dict) else res.get('status')}")
	return res["name"]


def _kots_of(invoice, types=("New Order", "Order Modified")):
	return frappe.get_all(
		"URY KOT",
		filters={"invoice": invoice, "docstatus": 1, "type": ["in", list(types)]},
		fields=["name", "production", "order_status"],
		order_by="creation asc",
	)


def _backdate_invoice(invoice, ts, table=None):
	frappe.db.set_value(
		"POS Invoice",
		invoice,
		{
			"creation": ts,
			"posting_date": ts.date(),
			"posting_time": _hms(ts),
			"set_posting_time": 1,
		},
		update_modified=False,
	)
	if table:
		frappe.db.set_value("URY Table", table, "latest_invoice_time", _hms(ts), update_modified=False)


def _backdate_kot(kot, ts):
	frappe.db.set_value(
		"URY KOT", kot, {"creation": ts, "date": ts.date(), "time": _hms(ts)}, update_modified=False
	)


def _advance_kot(ctx, kot, target, ts, serve_after_min=12):
	"""Move one KOT through the KDS item-execution states.
	target: queued | preparing | ready | served."""
	if target == "queued":
		return
	from ury.ury.api.ury_kot_display import serve_kot
	from ury.ury.api.ury_kot_item_execution_service import (
		mark_item_ready,
		serve_item_execution,
		start_item_execution,
	)

	rows = frappe.get_all("URY KOT Items", filters={"parent": kot}, pluck="name", order_by="idx asc")
	for r in rows:
		try:
			start_item_execution(r, f"{MARK}:{r}:start")
		except Exception as e:
			_note(ctx, f"start_item_execution({r}) failed: {e}")
	frappe.db.set_value("URY KOT", kot, "start_time_prep", _hms(ts + timedelta(minutes=2)), update_modified=False)
	if target == "preparing":
		return
	for r in rows:
		try:
			mark_item_ready(r, f"{MARK}:{r}:ready")
		except Exception as e:
			_note(ctx, f"mark_item_ready({r}) failed (item stays in preparation): {e}")
	if target == "ready":
		return
	for r in rows:
		try:
			serve_item_execution(r, f"{MARK}:{r}:serve")
		except Exception as e:
			_note(ctx, f"serve_item_execution({r}) failed: {e}")
	try:
		serve_kot(kot)
	except Exception as e:
		_note(ctx, f"serve_kot({kot}) failed ({e}); setting order_status directly")
		frappe.db.set_value("URY KOT", kot, "order_status", "Served", update_modified=False)
	frappe.db.set_value(
		"URY KOT",
		kot,
		{"start_time_serv": _hms(ts + timedelta(minutes=serve_after_min)), "production_time": serve_after_min},
		update_modified=False,
	)


def _progress_invoice_kots(ctx, invoice, target, ts, only_new=True):
	for i, k in enumerate(_kots_of(invoice)):
		if only_new and k.order_status == "Served":
			continue
		kts = ts + timedelta(seconds=20 + 5 * i)
		_backdate_kot(k.name, kts)
		_advance_kot(ctx, k.name, target, kts)


def _spread_waiter(ctx, invoice, idx):
	"""Spread `waiter` over branch captains so Floor Load / employee reports
	show several people (only when `user` is a super user, so POS ownership
	rules are not tripped)."""
	if "captains" not in ctx:
		rows = frappe.get_all("URY User", filters={"parent": ctx.branch, "parenttype": "Branch"}, pluck="user")
		ctx.captains = sorted(
			{
				u
				for u in rows
				if u not in ("Administrator", "Guest", ctx.user)
				and cint(frappe.db.get_value("User", u, "enabled"))
				and "URY Captain" in frappe.get_roles(u)
			}
		)
	is_super = ctx.user == "Administrator" or "System Manager" in frappe.get_roles(ctx.user)
	if ctx.captains and is_super and idx % 2 == 1:
		frappe.db.set_value("POS Invoice", invoice, "waiter", ctx.captains[idx % len(ctx.captains)], update_modified=False)


# ---------------------------------------------------------------------------
# STEP 4: paid invoices earlier today
# ---------------------------------------------------------------------------


def _pay_modes(ctx):
	preferred = [m for m in ctx.payment_modes if m in ("Cash", "Card", "UPI", "Credit Card", "Debit Card")]
	return preferred or ctx.payment_modes[:3] or ["Cash"]


def _step_paid(ctx):
	from ury.ury.api.ury_print import qz_print_update
	from ury.ury.doctype.ury_order.ury_order import get_menu_name, get_restaurant_and_menu_name, make_invoice

	modes = _pay_modes(ctx)
	customers = _customers(ctx)
	tables = _free_tables(ctx)
	span_first, span_last = ctx.total_minutes - 20, 35
	ages = [
		int(span_first - i * (span_first - span_last) / max(PAID_COUNT - 1, 1)) for i in range(PAID_COUNT)
	]
	done = failed = 0
	with _as_user(ctx.user):
		for i, (age, order_type) in enumerate(zip(ages, PAID_TYPES)):
			key = f"paid{i}"
			if _is_done(ctx, f"order:{key}"):
				continue
			name = None
			try:
				ts = _ts(age)
				customer = ctx.rng.choice(customers)
				table = room = None
				if order_type == "Dine In":
					if not tables:
						order_type = "Take Away"
					else:
						t = tables[i % len(tables)]
						table, room = t.name, t.restaurant_room
						_b, menu, _r = get_restaurant_and_menu_name(table)
						pax = max(1, min(ctx.rng.randint(1, 4), cint(t.no_of_seats) or 4))
				if not table:
					menu = get_menu_name(order_type)
					room, pax = ctx.default_room, 1
				lines = _pick_lines(ctx, _pool_for_menu(ctx, menu), ctx.rng.randint(2, 4), key)
				name = _sync(ctx, items=lines, customer=customer, pax=pax, order_type=order_type, table=table, room=room)
				_backdate_invoice(name, ts, table)
				_spread_waiter(ctx, name, i)
				_progress_invoice_kots(ctx, name, "served", ts)
				if table:
					qz_print_update(name)  # "print bill": marks printed + releases the table
				inv = frappe.db.get_value("POS Invoice", name, ["rounded_total", "grand_total"], as_dict=True)
				total = flt(inv.rounded_total) or flt(inv.grand_total)
				if i == 3 and len(modes) > 1:  # one split payment
					first = round(total / 2, 2)
					payments = [
						{"mode_of_payment": modes[0], "amount": first},
						{"mode_of_payment": modes[1], "amount": round(total - first, 2)},
					]
				else:
					payments = [{"mode_of_payment": modes[i % len(modes)], "amount": total}]
				ident = _pos_identity(ctx)
				make_invoice(
					customer=customer, payments=payments, cashier=ident.cashier, pos_profile=ctx.profile,
					owner=ident.owner, additionalDiscount=None, table=table, invoice=name,
				)
				dur = ctx.rng.randint(35, 70) if table else ctx.rng.randint(8, 20)
				frappe.db.set_value(
					"POS Invoice", name, "total_spend_time", f"{dur // 60:02d}:{dur % 60:02d}:00", update_modified=False
				)
				frappe.db.commit()
				_mark_done(ctx, f"order:{key}")
				done += 1
			except Exception as e:
				frappe.db.rollback()
				failed += 1
				_note(ctx, f"paid invoice {key} ({name or 'not created'}) failed: {e}")
	ctx.summary["paid_invoices"] = done
	ctx.summary["paid_failed"] = failed
	if failed and not done:
		raise frappe.ValidationError("no paid invoice could be created (see notes)")
	return done


# ---------------------------------------------------------------------------
# STEP 5: running orders
# ---------------------------------------------------------------------------


def _step_running(ctx):
	from ury.ury.doctype.ury_order.ury_order import (
		cancel_order,
		get_menu_name,
		get_restaurant_and_menu_name,
	)

	customers = _customers(ctx)
	tables = _free_tables(ctx)
	if len(tables) < RUNNING_DINE_IN:
		_note(ctx, f"only {len(tables)} free dine-in tables for {RUNNING_DINE_IN} running orders")
	created, failed = [], 0
	ctx.running = {}

	with _as_user(ctx.user):
		# --- dine-in ---
		for i, (key, age, pax_wanted, n_lines, stage) in enumerate(RUNNING_SPECS):
			if _is_done(ctx, f"order:{key}"):
				continue
			if i >= len(tables):
				break
			t = tables[i]
			name = None
			try:
				ts = _ts(age)
				pax = max(1, min(pax_wanted, cint(t.no_of_seats) or pax_wanted))
				_b, menu, _r = get_restaurant_and_menu_name(t.name)
				pool = _pool_for_menu(ctx, menu)
				lines = _pick_lines(ctx, pool, n_lines, key)
				customer = customers[(i + 3) % len(customers)]
				name = _sync(
					ctx, items=lines, customer=customer, pax=pax, order_type="Dine In", table=t.name, room=t.restaurant_room
				)
				_backdate_invoice(name, ts, t.name)
				_spread_waiter(ctx, name, i)
				stage_kot = {
					"queued": "queued", "preparing": "preparing", "ready": "ready",
					"partial": "served", "eating": "served", "bill_requested": "served",
				}[stage]
				_progress_invoice_kots(ctx, name, stage_kot, ts)

				if stage == "partial":
					# add-on 9 min ago -> a fresh "Order Modified" KOT that is still queued
					extra = _pick_lines(ctx, pool, 2, f"{key}b")
					for j, e in enumerate(extra):
						e["reservation_line_key"] = f"demo-{key}-add{j}"
					name = _sync(
						ctx, items=lines + extra, customer=customer, pax=pax, order_type="Dine In",
						table=t.name, room=t.restaurant_room, invoice=name,
					)
					_progress_invoice_kots(ctx, name, "queued", _ts(9))
					for k in _kots_of(name, ("Order Modified",)):
						_backdate_kot(k.name, _ts(9))
				frappe.db.set_value("URY Table", t.name, "latest_invoice_time", _hms(ts), update_modified=False)
				frappe.db.commit()
				_mark_done(ctx, f"order:{key}")
				ctx.running[key] = {"invoice": name, "table": t.name, "stage": stage, "age": age}
				created.append(name)
			except Exception as e:
				frappe.db.rollback()
				failed += 1
				_note(ctx, f"running order {key} on {t.name} ({name or 'not created'}) failed: {e}")

		# --- take-away / delivery (no table) ---
		for i, (key, order_type, age, n_lines, stage) in enumerate(TABLELESS_SPECS):
			if _is_done(ctx, f"order:{key}"):
				continue
			name = None
			try:
				ts = _ts(age)
				menu = get_menu_name(order_type)
				lines = _pick_lines(ctx, _pool_for_menu(ctx, menu), n_lines, key)
				name = _sync(
					ctx, items=lines, customer=customers[(i + 7) % len(customers)], pax=1,
					order_type=order_type, room=ctx.default_room,
				)
				_backdate_invoice(name, ts)
				_progress_invoice_kots(ctx, name, stage, ts)
				frappe.db.commit()
				_mark_done(ctx, f"order:{key}")
				ctx.running[key] = {"invoice": name, "table": None, "stage": stage, "age": age}
				created.append(name)
			except Exception as e:
				frappe.db.rollback()
				failed += 1
				_note(ctx, f"{order_type} order {key} ({name or 'not created'}) failed: {e}")

		# --- one cancelled order: leaves a "Cancelled" KOT awaiting manager confirmation on the KDS ---
		key, order_type, age, n_lines = CANCELLED_SPEC
		if not _is_done(ctx, f"order:{key}"):
			name = None
			try:
				ts = _ts(age)
				menu = get_menu_name(order_type)
				lines = _pick_lines(ctx, _pool_for_menu(ctx, menu), n_lines, key)
				name = _sync(
					ctx, items=lines, customer=customers[-1], pax=1, order_type=order_type, room=ctx.default_room
				)
				_backdate_invoice(name, ts)
				_progress_invoice_kots(ctx, name, "preparing", ts)
				cancel_order(name, "Customer left before the order was prepared")
				for k in _kots_of(name, ("Cancelled", "Partially cancelled")):
					_backdate_kot(k.name, _ts(3))
				frappe.db.commit()
				_mark_done(ctx, f"order:{key}")
				ctx.summary["cancelled_invoice"] = name
			except Exception as e:
				frappe.db.rollback()
				failed += 1
				_note(ctx, f"cancelled-order demo ({name or 'not created'}) failed: {e}")

	ctx.summary["running_orders"] = created
	ctx.summary["running_failed"] = failed
	return created


def _load_running(ctx):
	"""Rebuild ctx.running from the DB when the order step was skipped (re-run)."""
	if getattr(ctx, "running", None):
		return
	ctx.running = {}
	rows = frappe.get_all(
		"POS Invoice",
		filters={"branch": ctx.branch, "docstatus": 0, "posting_date": today(), "restaurant_table": ["is", "set"]},
		fields=["name", "restaurant_table", "creation"],
		order_by="creation asc",
	)
	for n, r in enumerate(rows[:RUNNING_DINE_IN]):
		ctx.running[f"r{n + 1}"] = {"invoice": r.name, "table": r.restaurant_table, "stage": "?", "age": 0}


# ---------------------------------------------------------------------------
# STEP 6: service requests, KOT error log, insights
# ---------------------------------------------------------------------------


def _new_service_request(table, invoice, rtype, minutes_ago):
	ts = _ts(minutes_ago)
	doc = frappe.get_doc(
		{
			"doctype": "URY Service Request",
			"request_type": rtype,
			"table": table,
			"invoice": invoice,
			"status": "Open",
			"requested_at": ts,
		}
	).insert(ignore_permissions=True)
	frappe.db.set_value("URY Service Request", doc.name, "creation", ts, update_modified=False)
	return doc.name


def _step_service_requests(ctx):
	from ury.ury.api.service_requests import acknowledge_service_request, resolve_service_request

	_load_running(ctx)
	run = ctx.running
	made = []
	with _as_user(ctx.user):
		if "r6" in run:
			made.append(_new_service_request(run["r6"]["table"], run["r6"]["invoice"], "Bill", 6))
		if "r5" in run:
			made.append(_new_service_request(run["r5"]["table"], run["r5"]["invoice"], "Assistance", 3))
		if "r4" in run:
			name = _new_service_request(run["r4"]["table"], run["r4"]["invoice"], "Bill", 11)
			try:
				acknowledge_service_request(name)
			except Exception as e:
				_note(ctx, f"acknowledge_service_request failed ({e}); setting status directly")
				frappe.db.set_value("URY Service Request", name, "status", "Acknowledged", update_modified=False)
			made.append(name)
		# one already resolved, on a table whose invoice was paid earlier today
		paid = frappe.db.get_value(
			"POS Invoice",
			{"branch": ctx.branch, "docstatus": 1, "posting_date": today(), "restaurant_table": ["is", "set"]},
			["name", "restaurant_table"],
			as_dict=True,
			order_by="creation desc",
		)
		if paid:
			name = _new_service_request(paid.restaurant_table, paid.name, "Bill", 95)
			try:
				resolve_service_request(name)
			except Exception as e:
				_note(ctx, f"resolve_service_request failed ({e}); setting status directly")
				frappe.db.set_value(
					"URY Service Request", name, {"status": "Resolved", "resolved_by": ctx.user}, update_modified=False
				)
			frappe.db.set_value("URY Service Request", name, "resolved_at", _ts(90), update_modified=False)
			made.append(name)
	ctx.summary["service_requests"] = len(made)
	return made


def _step_kot_errors(ctx):
	"""Rows shaped exactly like create_kot_log() writes them, pointing at real
	KOTs of today's running orders, stamped within the last hour so
	get_needs_attention counts them ("KOT generation issue(s) in the last hour")."""
	_load_running(ctx)
	kots = []
	for key in ("r2", "r3", "r1", "t2"):
		info = ctx.running.get(key)
		if info:
			ks = _kots_of(info["invoice"])
			if ks:
				kots.append((info["invoice"], ks[0]))
	made = 0
	for n, (invoice, k) in enumerate(kots[:3]):
		if frappe.db.exists("URY KOT Error Log", {"kot": k.name}):
			continue
		ts = _ts([9, 23, 41][n])
		inv_creation = frappe.db.get_value("POS Invoice", invoice, "creation")
		doc = frappe.get_doc(
			{
				"doctype": "URY KOT Error Log",
				"kot": k.name,
				"invoice": invoice,
				"invoice_creation_time": str(inv_creation),
				"branch": ctx.branch,
				"production": k.production,
				"pos_profile": ctx.profile,
				"date": ts.date(),
				"time": _hms(ts),
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value("URY KOT Error Log", doc.name, "creation", ts, update_modified=False)
		made += 1
	ctx.summary["kot_error_logs"] = made
	return made


def _insert_insight(ctx, rule_key, title, severity, body):
	if frappe.db.exists(
		"URY Insight",
		{"rule_key": rule_key, "branch": ctx.branch, "dismissed": 0, "creation": [">", _day_start()]},
	):
		return None
	return (
		frappe.get_doc(
			{
				"doctype": "URY Insight",
				"title": title,
				"severity": severity,
				"rule_key": rule_key,
				"branch": ctx.branch,
				"source_tool": MARK,
				"body": body,
			}
		)
		.insert(ignore_permissions=True)
		.name
	)


def _step_insights(ctx):
	_load_running(ctx)
	_clear_dashboard_cache(ctx)  # get_needs_attention caches for 30s
	made = []
	# 1) real rule engine (long_open_tickets / aging_unpaid_orders / notable_cancellations / aging_stock)
	try:
		from ury.ury.api.ury_insight_rules import _run_exception_rules

		made += [n for n in (_run_exception_rules() or []) if n]
	except Exception as e:
		_note(ctx, f"_run_exception_rules failed: {e}")

	# 2) data-derived cards (numbers come from the orders seeded above)
	run = ctx.running
	if "r6" in run:
		n = _insert_insight(
			ctx, "table_turnaround", f"Table {run['r6']['table']} occupied for {run['r6']['age']} minutes",
			"Warning",
			f"Table {run['r6']['table']} has been seated since the first KOT {run['r6']['age']} minutes ago and the guest "
			"has asked for the bill. Target turnaround is 60 minutes. Send a captain to settle the table.",
		)
		made.append(n)
	if "r2" in run:
		n = _insert_insight(
			ctx, "kitchen_delay", f"Kitchen ticket for table {run['r2']['table']} open {run['r2']['age']} minutes",
			"Critical",
			f"The order on table {run['r2']['table']} is still in preparation after {run['r2']['age']} minutes, longer than "
			f"the {KOT_WARNING_MINUTES}-minute KOT warning time. Check the line with the production unit.",
		)
		made.append(n)
	if ctx.summary.get("cancelled_invoice"):
		n = _insert_insight(
			ctx, "order_cancelled_after_send", "Order cancelled after it was sent to the kitchen", "Info",
			f"{ctx.summary['cancelled_invoice']} was cancelled {CANCELLED_SPEC[2] - 3} minutes after its KOT was fired. "
			"The cancelled KOT is waiting for manager confirmation on the KDS.",
		)
		made.append(n)
	made = [m for m in made if m]
	ctx.summary["insights"] = len(made)
	return made


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _clear_dashboard_cache(ctx):
	cache = frappe.cache()
	for prefix in (
		"ury_dashboard_stats",
		"ury_dashboard_cancelled_invoices_count",
		"ury_dashboard_needs_attention",
		"ury_dashboard_shift_metrics",
		"ury_dashboard_floor_load",
	):
		for b in (ctx.branch, None):
			try:
				cache.delete_value(f"{prefix}:{b}")
			except Exception:
				pass


def seed(branch=None, user="Administrator", force=False):
	"""Seed today's live-service demo data. See the module docstring.

	`force=True` ignores the per-day step markers (it does not delete earlier
	seeded orders; free tables are used, busy ones skipped)."""
	prev_user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		ctx = _resolve_context(branch, user, force)
	except Exception as e:
		frappe.set_user(prev_user)
		print(f"[pos_today_demo] cannot start: {e}")
		return {"error": str(e)}

	print(f"[pos_today_demo] branch={ctx.branch} profile={ctx.profile} company={ctx.company} user={ctx.user}")
	try:
		_run_step(ctx, "access", _step_access)
		user = ctx.user  # may have been created
		frappe.set_user("Administrator")
		_run_step(ctx, "close_stale", _step_close_stale)
		frappe.set_user("Administrator")
		_run_step(ctx, "open_pos", _step_open_pos)
		if not getattr(ctx, "opening", None):
			ctx.opening = frappe.db.get_value(
				"POS Opening Entry",
				{"user": ctx.user, "pos_profile": ctx.profile, "status": "Open", "docstatus": 1, "posting_date": today()},
				"name",
			)
		if not ctx.opening:
			ctx.failed.append("no open POS Opening Entry -- orders skipped")
			print("[pos_today_demo] no open POS Opening Entry for today; skipping order steps")
		else:
			frappe.set_user("Administrator")
			_run_step(ctx, "alert_settings", _step_alert_settings)
			frappe.set_user("Administrator")
			_run_step(ctx, "paid_invoices", _step_paid)
			frappe.set_user("Administrator")
			ctx.running = {}
			_run_step(ctx, "running_orders", _step_running)
			frappe.set_user("Administrator")
			_run_step(ctx, "service_requests", _step_service_requests)
			_run_step(ctx, "kot_errors", _step_kot_errors)
			_run_step(ctx, "insights", _step_insights)
		frappe.set_user("Administrator")
		_clear_dashboard_cache(ctx)
		ctx.summary["access_checks"] = _verify_access(ctx)
	finally:
		frappe.set_user("Administrator")
		frappe.db.commit()
		frappe.set_user(prev_user)

	summary = {
		"branch": ctx.branch,
		"pos_profile": ctx.profile,
		"user": ctx.user,
		**ctx.summary,
		"steps_skipped_already_done": ctx.skipped,
		"steps_failed": ctx.failed,
		"notes": ctx.notes,
	}
	print("[pos_today_demo] ---- summary ----")
	for k, v in summary.items():
		print(f"  {k}: {v}")
	return summary


run = seed
