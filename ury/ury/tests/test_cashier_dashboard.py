"""Daily Operations dashboard: card calculations, business-day boundaries, waiter chart, access.

Rows are seeded with direct INSERTs (the aggregation only reads a handful of columns) and are
rolled back by the test framework. "Now" is passed explicitly so no test depends on the clock.
"""

from datetime import datetime
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import cashier_dashboard as api
from ury.ury.services import cashier_dashboard as service

BRANCH_A = "ZZ Dash Branch A"
BRANCH_B = "ZZ Dash Branch B"
NOW = datetime(2026, 3, 10, 14, 0, 0)  # a Tuesday afternoon, site time


def _insert_branch(name):
	if not frappe.db.exists("Branch", name):
		frappe.db.sql(
			"INSERT INTO `tabBranch` (name, branch, creation, modified, owner, modified_by, docstatus) "
			"VALUES (%s, %s, NOW(), NOW(), 'Administrator', 'Administrator', 0)",
			(name, name),
		)


def _assign_user(branch, user):
	frappe.db.sql(
		"INSERT INTO `tabURY User` (name, parent, parenttype, parentfield, user, creation, modified, owner, modified_by, docstatus, idx) "
		"VALUES (%s, %s, 'Branch', 'user', %s, NOW(), NOW(), 'Administrator', 'Administrator', 0, 1)",
		(frappe.generate_hash(length=10), branch, user),
	)


def _invoice(posting, total, branch=BRANCH_A, waiter="w1@example.com", docstatus=1, status="Paid",
             is_return=0, printed=1, table="T1"):
	"""Insert a POS Invoice row. `posting` is a datetime."""
	frappe.db.sql(
		"""INSERT INTO `tabPOS Invoice`
		(name, docstatus, status, is_return, posting_date, posting_time, grand_total, branch, waiter,
		 invoice_printed, restaurant_table, creation, modified, owner, modified_by)
		VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), 'Administrator', 'Administrator')""",
		(
			f"ZZ-DASH-{frappe.generate_hash(length=8)}", docstatus, status, is_return,
			posting.date(), posting.time(), total, branch, waiter, printed, table,
		),
	)


def _kot(when, branch=BRANCH_A, docstatus=1, order_status="Ready For Prepare", verified=0, kot_type="New Order"):
	frappe.db.sql(
		"""INSERT INTO `tabURY KOT`
		(name, docstatus, order_status, verified, type, date, time, branch, creation, modified, owner, modified_by)
		VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), 'Administrator', 'Administrator')""",
		(f"ZZ-KOT-{frappe.generate_hash(length=8)}", docstatus, order_status, verified, kot_type,
		 when.date(), when.time(), branch),
	)


def _hours(branch, hours):
	frappe.db.sql(
		"INSERT INTO `tabURY Report Settings` (name, branch, extended_hours, hours, creation, modified, owner, modified_by, docstatus) "
		"VALUES (%s, %s, 1, %s, NOW(), NOW(), 'Administrator', 'Administrator', 0)",
		(branch, branch, hours),
	)


class _IsolatedTestCase(FrappeTestCase):
	"""Every test starts from the rows it seeds itself: roll back after each one."""

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()


class TestSalesSummary(_IsolatedTestCase):
	def setUp(self):
		_insert_branch(BRANCH_A)
		_insert_branch(BRANCH_B)
		frappe.db.sql("DELETE FROM `tabURY Report Settings` WHERE branch IN (%s, %s)", (BRANCH_A, BRANCH_B))

	def test_today_and_yesterday_share_one_definition(self):
		_invoice(datetime(2026, 3, 10, 12, 0), 100)
		_invoice(datetime(2026, 3, 10, 13, 0), 50, status="Consolidated")
		_invoice(datetime(2026, 3, 9, 23, 30), 200)
		_invoice(datetime(2026, 3, 9, 10, 0), 100)

		summary = service.get_sales_summary([BRANCH_A], now=NOW)
		self.assertEqual(summary[0], {"sales": 150.0, "bills": 2})
		self.assertEqual(summary[1], {"sales": 300.0, "bills": 2})
		self.assertEqual(service.get_average_bill(summary[0]), 75.0)
		self.assertEqual(service.get_average_bill(summary[1]), 150.0)

	def test_ineligible_invoices_are_not_sales(self):
		_invoice(datetime(2026, 3, 10, 12, 0), 100)
		_invoice(datetime(2026, 3, 10, 12, 1), 40, docstatus=2, status="Cancelled")
		_invoice(datetime(2026, 3, 10, 12, 2), 40, docstatus=0, status="Draft")
		_invoice(datetime(2026, 3, 10, 12, 3), -20, status="Consolidated", is_return=1)
		_invoice(datetime(2026, 3, 10, 12, 4), 40, status="Unpaid")
		_invoice(datetime(2026, 3, 10, 12, 5), 999, branch=BRANCH_B)

		today = service.get_sales_summary([BRANCH_A], now=NOW)[0]
		self.assertEqual(today, {"sales": 100.0, "bills": 1})

	def test_no_bills_gives_zero_average(self):
		summary = service.get_sales_summary([BRANCH_A], now=NOW)
		self.assertEqual(summary[0], {"sales": 0.0, "bills": 0})
		self.assertEqual(service.get_average_bill(summary[0]), 0.0)

	def test_all_branches_scope(self):
		_invoice(datetime(2026, 3, 10, 12, 0), 100)
		_invoice(datetime(2026, 3, 10, 12, 0), 10, branch=BRANCH_B)
		today = service.get_sales_summary(None, now=NOW)[0]
		self.assertGreaterEqual(today["sales"], 110.0)
		self.assertEqual(service.get_sales_summary([BRANCH_B], now=NOW)[0], {"sales": 10.0, "bills": 1})

	def test_extended_business_day_boundary(self):
		"""With a 4 hour cutoff, 02:00 on the 10th still belongs to the 9th."""
		_hours(BRANCH_A, 4)
		_invoice(datetime(2026, 3, 10, 2, 0), 70)  # business day 9th -> yesterday
		_invoice(datetime(2026, 3, 10, 5, 0), 30)  # business day 10th -> today
		_invoice(datetime(2026, 3, 11, 3, 0), 15)  # business day 10th (after midnight) -> today

		summary = service.get_sales_summary([BRANCH_A], now=NOW)
		self.assertEqual(summary[0], {"sales": 45.0, "bills": 2})
		self.assertEqual(summary[1], {"sales": 70.0, "bills": 1})

	def test_before_cutoff_today_is_still_the_previous_business_day(self):
		_hours(BRANCH_A, 4)
		early = datetime(2026, 3, 10, 2, 0)
		_invoice(datetime(2026, 3, 10, 1, 0), 25)  # business day 9th == "today" at 02:00 on the 10th
		_invoice(datetime(2026, 3, 9, 20, 0), 5)
		_invoice(datetime(2026, 3, 8, 22, 0), 7)  # business day 8th -> yesterday

		summary = service.get_sales_summary([BRANCH_A], now=early)
		self.assertEqual(summary[0], {"sales": 30.0, "bills": 2})
		self.assertEqual(summary[1], {"sales": 7.0, "bills": 1})


class TestOperationalCounts(_IsolatedTestCase):
	def setUp(self):
		_insert_branch(BRANCH_A)
		_insert_branch(BRANCH_B)
		frappe.db.sql("DELETE FROM `tabURY Report Settings` WHERE branch IN (%s, %s)", (BRANCH_A, BRANCH_B))

	def test_cancelled_bills_today_only(self):
		_invoice(datetime(2026, 3, 10, 9, 0), 10, docstatus=2, status="Cancelled")
		_invoice(datetime(2026, 3, 10, 9, 5), 10, docstatus=2, status="Cancelled", branch=BRANCH_B)
		_invoice(datetime(2026, 3, 9, 9, 0), 10, docstatus=2, status="Cancelled")
		_invoice(datetime(2026, 3, 10, 9, 10), 10)
		self.assertEqual(service.get_cancelled_bills_today([BRANCH_A], now=NOW), 1)

	def test_unsettled_is_printed_or_takeaway_drafts_on_any_date(self):
		_invoice(datetime(2026, 3, 10, 9, 0), 10, docstatus=0, status="Draft", printed=1, table="T1")
		_invoice(datetime(2026, 3, 7, 9, 0), 10, docstatus=0, status="Draft", printed=1, table="T2")  # stale
		_invoice(datetime(2026, 3, 10, 9, 5), 10, docstatus=0, status="Draft", printed=0, table=None)  # takeaway
		_invoice(datetime(2026, 3, 10, 9, 6), 10, docstatus=0, status="Draft", printed=0, table="")  # takeaway
		_invoice(datetime(2026, 3, 10, 9, 7), 10, docstatus=0, status="Draft", printed=0, table="T3")  # running
		_invoice(datetime(2026, 3, 10, 9, 8), 10, docstatus=0, status="Draft", printed=1, branch=BRANCH_B)
		_invoice(datetime(2026, 3, 10, 9, 9), 10)  # paid
		self.assertEqual(service.get_unsettled_bills([BRANCH_A]), 4)

	def test_open_kots(self):
		today = datetime(2026, 3, 10, 12, 0)
		_kot(today)
		_kot(today, kot_type="Order Modified")
		_kot(today, kot_type="Duplicate")
		_kot(today, kot_type="Cancelled")  # cancel notification, not kitchen work
		_kot(today, kot_type="Partially cancelled")
		_kot(today, order_status="Served")
		_kot(today, verified=1)
		_kot(today, docstatus=2)
		_kot(today, docstatus=0)
		_kot(today, branch=BRANCH_B)
		_kot(datetime(2026, 3, 9, 12, 0))  # yesterday
		self.assertEqual(service.get_open_kots([BRANCH_A], now=NOW), 3)


class TestWaiterChart(_IsolatedTestCase):
	def setUp(self):
		_insert_branch(BRANCH_A)
		_insert_branch(BRANCH_B)
		frappe.db.sql("DELETE FROM `tabURY Report Settings` WHERE branch IN (%s, %s)", (BRANCH_A, BRANCH_B))

	def _series(self, chart):
		return {d["name"]: d["values"] for d in chart["datasets"]}

	def test_seven_zero_filled_days_oldest_first(self):
		chart = service.get_waiter_sales([BRANCH_A], now=NOW)
		self.assertEqual(len(chart["labels"]), 7)
		self.assertEqual(chart["dates"][0], "2026-03-04")
		self.assertEqual(chart["dates"][-1], "2026-03-10")
		self.assertEqual(chart["datasets"], [])

	def test_series_per_waiter_and_exclusions(self):
		_invoice(datetime(2026, 3, 10, 12, 0), 100, waiter="w1@example.com")
		_invoice(datetime(2026, 3, 10, 13, 0), 50, waiter="w1@example.com", status="Consolidated")
		_invoice(datetime(2026, 3, 8, 13, 0), 30, waiter="w1@example.com")
		_invoice(datetime(2026, 3, 10, 12, 0), 70, waiter="w2@example.com")
		_invoice(datetime(2026, 3, 10, 12, 0), 5, waiter="")
		_invoice(datetime(2026, 3, 10, 12, 0), 8, waiter=None)
		_invoice(datetime(2026, 3, 10, 12, 0), 12, waiter="Administrator")
		# excluded: cancelled, draft, return, other branch, older than seven days
		_invoice(datetime(2026, 3, 10, 12, 0), 500, waiter="w1@example.com", docstatus=2, status="Cancelled")
		_invoice(datetime(2026, 3, 10, 12, 0), 500, waiter="w1@example.com", docstatus=0, status="Draft")
		_invoice(datetime(2026, 3, 10, 12, 0), -90, waiter="w1@example.com", is_return=1, status="Consolidated")
		_invoice(datetime(2026, 3, 10, 12, 0), 500, waiter="w1@example.com", branch=BRANCH_B)
		_invoice(datetime(2026, 3, 3, 12, 0), 500, waiter="w1@example.com")

		series = self._series(service.get_waiter_sales([BRANCH_A], now=NOW))
		self.assertEqual(series["w1@example.com"], [0, 0, 0, 0, 30.0, 0, 150.0])
		self.assertEqual(series["w2@example.com"], [0, 0, 0, 0, 0, 0, 70.0])
		self.assertEqual(series[service.UNASSIGNED_LABEL], [0, 0, 0, 0, 0, 0, 13.0])
		self.assertEqual(series[service.SYSTEM_WAITER_LABEL], [0, 0, 0, 0, 0, 0, 12.0])
		self.assertNotIn("Administrator", series)

	def test_waiter_labels_use_full_names(self):
		user = "zz-dash-waiter@example.com"
		if not frappe.db.exists("User", user):
			frappe.get_doc(
				{"doctype": "User", "email": user, "first_name": "Dash Waiter", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		_invoice(datetime(2026, 3, 10, 12, 0), 10, waiter=user)
		series = self._series(service.get_waiter_sales([BRANCH_A], now=NOW))
		self.assertIn("Dash Waiter", series)

	def test_top_waiters_plus_others(self):
		for n in range(service.CHART_MAX_WAITERS + 3):
			_invoice(datetime(2026, 3, 10, 12, 0), 100 - n, waiter=f"zz-w{n:02d}@example.com")
		chart = service.get_waiter_sales([BRANCH_A], now=NOW)
		self.assertEqual(len(chart["datasets"]), service.CHART_MAX_WAITERS + 1)
		others = chart["datasets"][-1]
		self.assertEqual(others["name"], service.OTHERS_LABEL)
		self.assertEqual(others["values"][-1], 100 - 8 + 100 - 9 + 100 - 10)

	def test_extended_hours_move_late_night_sales_to_the_previous_day(self):
		_hours(BRANCH_A, 4)
		_invoice(datetime(2026, 3, 10, 1, 0), 40, waiter="w1@example.com")  # business day 9th
		series = self._series(service.get_waiter_sales([BRANCH_A], now=NOW))
		self.assertEqual(series["w1@example.com"][-2], 40.0)
		self.assertEqual(series["w1@example.com"][-1], 0)


class TestBranchScopeAndAccess(_IsolatedTestCase):
	def setUp(self):
		_insert_branch(BRANCH_A)
		_insert_branch(BRANCH_B)
		self.cashier = "zz-dash-cashier@example.com"
		self.manager = "zz-dash-manager@example.com"
		self.captain = "zz-dash-captain@example.com"
		for email, role in (
			(self.cashier, "URY Cashier"),
			(self.manager, "URY Manager"),
			(self.captain, "URY Captain"),
		):
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, force=True, ignore_permissions=True)
			user = frappe.get_doc(
				{"doctype": "User", "email": email, "first_name": role, "send_welcome_email": 0}
			).insert(ignore_permissions=True)
			user.add_roles(role)
		frappe.db.sql("DELETE FROM `tabURY User` WHERE user IN (%s, %s, %s)", (self.cashier, self.manager, self.captain))

	def test_scope_is_the_users_own_branches(self):
		_assign_user(BRANCH_A, self.cashier)
		_assign_user(BRANCH_B, self.cashier)
		self.assertEqual(sorted(service.get_branch_scope(self.cashier)), [BRANCH_A, BRANCH_B])

	def test_elevated_user_without_branch_sees_all_branches(self):
		self.assertIsNone(service.get_branch_scope(self.manager))

	def test_elevated_user_with_branch_is_limited_to_it(self):
		_assign_user(BRANCH_A, self.manager)
		self.assertEqual(service.get_branch_scope(self.manager), [BRANCH_A])

	def test_cashier_without_branch_is_refused(self):
		with self.assertRaises(frappe.PermissionError):
			service.get_branch_scope(self.cashier)

	def test_endpoints_refuse_roles_outside_the_dashboard(self):
		frappe.set_user(self.captain)
		for fn in (api.today_sales, api.unsettled_bills, api.open_kots, api.get_waiter_sales_chart):
			with self.subTest(fn=fn.__name__):
				with self.assertRaises(frappe.PermissionError):
					fn()

	def test_cashier_endpoint_returns_only_own_branch_numbers(self):
		_assign_user(BRANCH_A, self.cashier)
		today = frappe.utils.today()
		stamp = datetime.fromisoformat(f"{today} 12:00:00")
		_invoice(stamp, 100, branch=BRANCH_A)
		_invoice(stamp, 900, branch=BRANCH_B)
		frappe.set_user(self.cashier)
		with patch("frappe.has_permission", return_value=True):
			self.assertEqual(api.today_sales()["value"], 100.0)
			self.assertEqual(api.today_bills()["value"], 1)
			self.assertEqual(api.today_average_bill()["value"], 100.0)
