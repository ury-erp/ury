"""Permanent, idempotent demo-data seed: submitted ``URY Daily P and L``
documents.

Context (see ``ury/ury/doctype/ury_daily_p_and_l/ury_daily_p_and_l.py``'s
``before_submit()``): on this bench ``URY Daily P and L`` had **0**
documents and could not be submitted at all -- ``before_submit()`` ran three
raw SQL queries against ``tabAttendance`` for daily-wage employee-cost
proration, and that table does not exist because ``hrms`` is not installed
(and, critically, ``ury/hooks.py``'s ``required_apps`` never declares
``hrms`` as a dependency -- this was a latent product bug, not just a bench
misconfiguration). That method now guards the Attendance block with
``frappe.db.table_exists("Attendance")``: when Attendance is unavailable it
skips daily-wage employee-cost proration (contributing 0), leaves the
existing "No Attendance !" / "Set Payment Type/Amount" throws untouched for
the case where Attendance genuinely exists but is empty/misconfigured, and
appends a cost-exclusion note to the doc's ``remarks`` field plus a
``frappe.msgprint`` so the resulting understated-cost/overstated-profit is
never silent.

This module seeds real, submitted (``docstatus=1``) Daily P&L documents by
creating each doc with only its *inputs* (branch, date, electricity
readings, materials consumed) and letting ``before_submit()`` compute the
~30 summary fields and 4 breakup child tables for real -- no hand-populated
financials, so seeded figures actually reconcile.

``historical_sales.py`` (out of scope for this module -- do not edit it)
already contains its own ``_seed_daily_pnl`` attempt gated behind
``_attendance_available()`` / Attendance seeding, so it still skips Daily
P&L entirely on this bench (Attendance doctype unavailable). This module
does not depend on Attendance at all: it relies on the guard above to let
``before_submit()`` succeed without it, and is the actual mechanism that
gets non-empty, submitted Daily P&L rows onto this bench.

Requires submitted POS Invoices to already exist for the chosen
branch/date (``historical_sales.py`` seeds those across
``HISTORICAL_DAYS = 120`` days, ~May-Aug 2026, 823 invoices, commit
``237f071``) -- Daily P&L's ``before_submit()`` reads ``tabPOS Invoice``
directly for gross/net sales and COGS.

Usage (from a bench console / ``bench execute``)::

    bench execute ury.ury.dev_seed.daily_pnl_seed.seed
"""

import frappe
from frappe.utils import getdate

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# Dates are picked dynamically from whatever calendar months already have
# submitted POS Invoices (see _pick_dates()), rather than hard-coded, since
# historical_sales.py's exact date spread can shift. PNL_DATES_PER_MONTH
# keeps this "enough dates to demonstrate the report and compare across
# months" per the task, not exhaustive backfill of all 120 days -- Daily
# P&L is a heavier, per-day submit-time computation (COGS/BOM costing,
# multiple SQL passes) than a POS Invoice insert, so a light, deliberately
# small spread (3 dates/month x up to 4 months = up to 12 documents) is
# the right trade-off: enough to make MonthWiseSales-style comparisons and
# the report UI demonstrably work, without turning every future run_all()
# into a long submit-heavy loop.
PNL_DATES_PER_MONTH = 3

ELECTRICITY_OPENING = 1000
ELECTRICITY_UNITS_PER_DAY = 45

MATERIALS_CONSUMED = [
	{
		"material": "Cooking Gas",
		"units_consumed": 2,
		"cost_per_unit": 900,
		"amount": 1800,
	}
]


# ---------------------------------------------------------------------------
# Shared lookups
# ---------------------------------------------------------------------------

def _get_branch_and_company():
	branch_name = frappe.db.get_value("Branch", {}, "name")
	company_name = frappe.db.get_value("Company", {}, "name")
	return branch_name, company_name


def _pick_dates(branch_name):
	"""Pick up to PNL_DATES_PER_MONTH submitted-POS-Invoice dates per
	calendar month, spread across whatever months historical_sales.py's
	seeding actually landed on -- so seeded Daily P&L docs are comparable
	across months rather than clustered in one.
	"""
	rows = frappe.get_all(
		"POS Invoice",
		filters={"branch": branch_name, "docstatus": 1},
		fields=["posting_date"],
		distinct=True,
		order_by="posting_date asc",
	)
	dates_by_month = {}
	for row in rows:
		d = getdate(row.posting_date)
		key = (d.year, d.month)
		dates_by_month.setdefault(key, []).append(d)

	picked = []
	for key in sorted(dates_by_month.keys()):
		month_dates = sorted(dates_by_month[key])
		n = len(month_dates)
		if n <= PNL_DATES_PER_MONTH:
			chosen = month_dates
		else:
			# Evenly spaced picks across the month (first, middle, last, ...)
			step = (n - 1) / (PNL_DATES_PER_MONTH - 1) if PNL_DATES_PER_MONTH > 1 else 0
			idxs = sorted({round(i * step) for i in range(PNL_DATES_PER_MONTH)})
			chosen = [month_dates[i] for i in idxs]
		picked.extend(chosen)

	return picked


# ---------------------------------------------------------------------------
# Daily P&L
# ---------------------------------------------------------------------------

def _seed_daily_pnl(branch_name, date):
	if frappe.db.exists("URY Daily P and L", {"branch": branch_name, "date": date}):
		return None

	# before_submit() does `datetime.strptime(self.date, '%Y-%m-%d')` -- it
	# requires self.date to be a plain string, not a datetime.date object
	# (confirmed live: passing a date object raises
	# "strptime() argument 1 must be str, not datetime.date"). Force str().
	date_str = str(date)

	try:
		doc = frappe.get_doc(
			{
				"doctype": "URY Daily P and L",
				"branch": branch_name,
				"date": date_str,
				"electricity_opening": ELECTRICITY_OPENING,
				"electricity_closing": ELECTRICITY_OPENING + ELECTRICITY_UNITS_PER_DAY,
				"materials_consumed": [dict(row) for row in MATERIALS_CONSUMED],
			}
		)
		doc.insert(ignore_permissions=True)
		doc.submit()
		return doc.name
	except Exception as e:
		print(f"  ! Failed to seed Daily P&L for {date}: {e}")
		return None


def seed():
	"""Idempotent entrypoint -- safe to call repeatedly, e.g. via
	``bench execute ury.ury.dev_seed.daily_pnl_seed.seed``.
	"""
	branch_name, company_name = _get_branch_and_company()
	if not branch_name or not company_name:
		print("daily_pnl_seed.seed: no Branch/Company found on this site -- skipping.")
		return {"skipped": True, "reason": "no Branch/Company"}

	if not frappe.db.exists("URY Report Settings", {"branch": branch_name}):
		print(
			"daily_pnl_seed.seed: no URY Report Settings for branch "
			f"{branch_name} -- skipping (before_submit() requires it)."
		)
		return {"skipped": True, "reason": "no URY Report Settings"}

	dates = _pick_dates(branch_name)
	if not dates:
		print("daily_pnl_seed.seed: no submitted POS Invoices found -- skipping.")
		return {"skipped": True, "reason": "no POS Invoices"}

	created = []
	for date in dates:
		name = _seed_daily_pnl(branch_name, date)
		if name:
			created.append(name)
			print(f"  + Created URY Daily P and L {name} for {date}")

	frappe.db.commit()
	print(f"daily_pnl_seed.seed: {len(created)} new Daily P&L document(s) created "
	      f"(considered {len(dates)} dates).")
	return {"created": created, "dates_considered": [str(d) for d in dates]}
