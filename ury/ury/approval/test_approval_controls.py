import json
from concurrent.futures import ThreadPoolExecutor

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_months, getdate, nowdate, random_string

from erpnext.accounts.doctype.accounting_period.accounting_period import (
	ClosedAccountingPeriod,
	validate_accounting_period_on_doc_save,
)
from erpnext.accounts.doctype.budget.budget import BudgetError, get_accumulated_monthly_budget
from erpnext.accounts.utils import get_fiscal_year
from ury.ury.approval import budget as budget_control
from ury.ury.approval import payments, periods
from ury.ury.approval.config import ENABLE_FIELDS, get_payment_levels, validate_branch
from ury.ury.approval.service import decide_approval, request_approval
from ury.ury.tests.factories import make_branch, make_user


class TestApprovalControls(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(lambda: frappe.set_user("Administrator"))
		self.company = (
			"_Test Company"
			if frappe.db.exists("Account", {"company": "_Test Company", "root_type": "Expense", "is_group": 0})
			else frappe.db.get_value("Account", {"root_type": "Expense", "is_group": 0}, "company")
		)
		suffix = random_string(8)
		self.requester = make_user(f"ury-requester-{suffix}@example.com", ["Restaurant Manager"])
		self.approver = make_user(f"ury-approver-{suffix}@example.com", ["Restaurant Manager"])
		self.branch = make_branch(branch=f"URY Approval {suffix}", company=self.company)
		self.branch2 = make_branch(branch=f"URY Approval Other {suffix}", company=self.company)
		for branch in (self.branch, self.branch2):
			if not branch.get("user"):
				branch.append("user", {"user": self.requester.name})
				branch.save(ignore_permissions=True)
		self.cost_center = self._make_cost_center(self.branch)
		self.other_cost_center = self._make_cost_center(self.branch2)
		self.account = self._expense_account()

	def _make_cost_center(self, branch):
		parent = frappe.db.get_value("Cost Center", {"company": self.company, "is_group": 1}, "name")
		doc = frappe.get_doc(
			{
				"doctype": "Cost Center",
				"cost_center_name": f"URY {random_string(8)}",
				"company": self.company,
				"parent_cost_center": parent,
				"is_group": 0,
				"branch": branch.name,
			}
		).insert(ignore_permissions=True)
		return doc.name

	def _expense_account(self):
		return frappe.db.get_value("Account", {"company": self.company, "root_type": "Expense", "is_group": 0}, "name")

	def _configure(self, control="payment"):
		self.branch.custom_ury_master_approval_control = 1
		self.branch.set(ENABLE_FIELDS[control], 1)
		if control == "backdated":
			self.branch.custom_ury_backdated_lock_day = 5
			self.branch.custom_ury_pnl_finalization_required = 1
		table = f"custom_ury_{control}_approval_levels"
		self.branch.set(table, [])
		self.branch.append(table, {"level": 1, "approver_role": "Restaurant Manager"})
		self.branch.append(table, {"level": 2, "approver_role": "Finance Head"})
		self.branch.save(ignore_permissions=True)

	def _source(self, amount=1000):
		return frappe.get_doc(
			{
				"doctype": "Payment Entry",
				"company": self.company,
				"payment_type": "Pay",
				"posting_date": nowdate(),
				"base_paid_amount": amount,
				"paid_amount": amount,
				"custom_ury_branch": self.branch.name,
			}
		)

	def _request(self, doc, control="payment", approver=None):
		levels = [{"level": 1, "approver_role": None, "approver_user": (approver or self.approver).name}]
		frappe.set_user(self.requester.name)
		try:
			return request_approval(doc, control, self.branch.name, levels=levels, amount=doc.base_paid_amount)
		finally:
			frappe.set_user("Administrator")

	def _budget(self, action="Ignore"):
		fiscal_year = get_fiscal_year(nowdate(), company=self.company)[0]
		doc = frappe.get_doc(
			{
				"doctype": "Budget",
				"company": self.company,
				"budget_against": "Cost Center",
				"cost_center": self.cost_center,
				"account": self.account,
				"from_fiscal_year": fiscal_year,
				"to_fiscal_year": fiscal_year,
				"budget_amount": 120000,
				"distribution_frequency": "Monthly",
				"applicable_on_booking_actual_expenses": 1,
				"action_if_annual_budget_exceeded": action,
				"action_if_accumulated_monthly_budget_exceeded": action,
			}
		)
		doc.insert(ignore_permissions=True)
		doc.submit()
		return doc

	def _advance(self, amount, name=None):
		return frappe.get_doc(
			{
				"doctype": "Employee Advance",
				"company": self.company,
				"posting_date": nowdate(),
				"advance_amount": amount,
				"custom_ury_branch": self.branch.name,
				"custom_ury_expense_account": self.account,
				"custom_ury_cost_center": self.cost_center,
			}
		)

	def test_repeated_save_reuses_open_request_and_notifies_once(self):
		doc = self._source()
		request = self._request(doc)
		initial_notifications = frappe.db.count("Notification Log", {"document_name": request.name})
		again = self._request(doc)
		self.assertEqual(request.name, again.name)
		self.assertEqual(frappe.db.count("URY Approval Request", {"reference_name": doc.name}), 1)
		self.assertEqual(frappe.db.count("Notification Log", {"document_name": request.name}), initial_notifications)

	def test_unauthorized_and_self_approval_are_blocked(self):
		doc = self._source()
		request = self._request(doc, approver=self.requester)
		with self.assertRaises(frappe.PermissionError):
			decide_approval(request.name, "approve")
		frappe.set_user(self.requester.name)
		with self.assertRaises(frappe.PermissionError):
			decide_approval(request.name, "approve")

	def test_changed_amount_invalidates_approval(self):
		doc = self._source()
		request = self._request(doc)
		frappe.set_user(self.approver.name)
		decide_approval(request.name, "approve")
		frappe.set_user("Administrator")
		doc.base_paid_amount += 1
		new_request = self._request(doc)
		request.reload()
		self.assertEqual(request.status, "Invalidated")
		self.assertEqual(new_request.status, "Pending")
		self.assertNotEqual(request.name, new_request.name)

	def test_multiple_controls_are_independent(self):
		doc = self._source()
		payment = self._request(doc, "payment")
		expense = self._request(doc, "expense")
		frappe.set_user(self.approver.name)
		decide_approval(payment.name, "approve")
		expense.reload()
		self.assertEqual(expense.status, "Pending")

	def test_concurrent_expenses_do_not_share_available_budget(self):
		self._configure("expense")
		budget = self._budget()
		request_names = []
		self.addCleanup(self._cleanup_concurrent_fixtures, budget.name, request_names)
		frappe.db.commit()
		site = frappe.local.site
		plan_lengths = []

		def create_expense():
			frappe.init(site, force=True)
			frappe.connect()
			try:
				frappe.set_user("Administrator")
				doc = self._advance(6000)
				budget_control.validate(doc)
				request = frappe.get_doc(
					"URY Approval Request", {"reference_name": doc.name, "control_type": "expense"}
				)
				request_names.append(request.name)
				plan_lengths.append(len(json.loads(request.approval_plan)))
				frappe.db.commit()
			except Exception:
				frappe.db.rollback()
				raise
			finally:
				frappe.destroy()

		with ThreadPoolExecutor(max_workers=2) as executor:
			futures = [executor.submit(create_expense) for _ in range(2)]
			for future in futures:
				future.result(timeout=30)
		self.assertEqual(sorted(plan_lengths), [1, 2])

	def _cleanup_concurrent_fixtures(self, budget_name, request_names):
		frappe.set_user("Administrator")
		if request_names:
			frappe.db.delete("Notification Log", {"document_name": ["in", request_names]})
			frappe.db.delete("URY Approval Log", {"approval_request": ["in", request_names]})
			frappe.db.delete("URY Approval Request", {"name": ["in", request_names]})
		frappe.db.delete("URY Budget Reservation", {"budget": budget_name})
		if frappe.db.exists("Budget", budget_name):
			budget = frappe.get_doc("Budget", budget_name)
			if budget.docstatus == 1:
				budget.cancel()
			budget.delete(force=True, ignore_permissions=True)
		for doctype, names in (
			("Cost Center", [self.cost_center, self.other_cost_center]),
			("Branch", [self.branch.name, self.branch2.name]),
			("User", [self.requester.name, self.approver.name]),
		):
			for name in names:
				if frappe.db.exists(doctype, name):
					frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_disabled_feature_preserves_pending_request(self):
		self._configure("payment")
		self.branch.set("custom_ury_payment_approval_levels", [])
		self.branch.append(
			"custom_ury_payment_approval_levels",
			{"level": 1, "payment_type": "Bank", "threshold": 100000, "approver_role": "Restaurant Manager"},
		)
		self.branch.save(ignore_permissions=True)
		doc = self._source(99999)
		payments.validate(doc)
		request = frappe.get_doc("URY Approval Request", {"reference_name": doc.name, "control_type": "payment"})
		original_hash = request.document_version_hash
		self.branch.custom_ury_enable_payment_approval = 0
		self.branch.save(ignore_permissions=True)
		doc.base_paid_amount = 100001
		payments.validate(doc)
		request.reload()
		self.assertEqual(request.status, "Pending")
		self.assertEqual(request.document_version_hash, original_hash)
		self.assertEqual(len(self.branch.custom_ury_payment_approval_levels), 1)

	def test_payment_limit_boundaries(self):
		self.branch.set("custom_ury_payment_approval_levels", [])
		for level, threshold, role in ((1, 100000, "Restaurant Manager"), (2, 0, "Finance Head")):
			self.branch.append(
				"custom_ury_payment_approval_levels",
				{"level": level, "payment_type": "Bank", "threshold": threshold, "approver_role": role},
			)
		for amount, role in ((99999, "Restaurant Manager"), (100000, "Restaurant Manager"), (100001, "Finance Head")):
			doc = self._source(amount)
			self.assertEqual(get_payment_levels(self.branch, doc)[0]["approver_role"], role)

	def test_mixed_branch_is_blocked_before_request(self):
		self._configure("payment")
		doc = self._source()
		doc.cost_center = self.other_cost_center
		payments.validate(doc)
		self.assertFalse(frappe.db.exists("URY Approval Request", {"reference_name": doc.name}))
		with self.assertRaises(frappe.ValidationError):
			payments.before_submit(doc)

	def test_branch_requires_approver_when_control_enabled(self):
		self.branch.custom_ury_enable_expense_approval = 1
		self.branch.set("custom_ury_expense_approval_levels", [])
		with self.assertRaises(frappe.ValidationError):
			validate_branch(self.branch)

	def test_no_budget_warns_without_request(self):
		self._configure("expense")
		doc = self._advance(1000)
		frappe.message_log = []
		budget_control.validate(doc)
		self.assertFalse(doc.flags.ury_expense_approval_required)
		self.assertFalse(frappe.db.exists("URY Approval Request", {"reference_name": doc.name, "control_type": "expense"}))
		self.assertIn("No budget", str(frappe.message_log))

	def test_budget_reservations_change_routing_and_release(self):
		self._configure("expense")
		self._budget()
		first = self._advance(5000)
		budget_control.validate(first)
		first_request = frappe.get_doc("URY Approval Request", {"reference_name": first.name, "control_type": "expense"})
		self.assertEqual(len(json.loads(first_request.approval_plan)), 1)
		second = self._advance(6000)
		budget_control.validate(second)
		second_request = frappe.get_doc("URY Approval Request", {"reference_name": second.name, "control_type": "expense"})
		self.assertEqual(len(json.loads(second_request.approval_plan)), 2)
		reservation = frappe.get_doc("URY Budget Reservation", {"reference_name": second.name})
		self.assertEqual(reservation.status, "Reserved")
		budget_control.release_reservations(second)
		reservation.reload()
		self.assertEqual(reservation.status, "Released")

	def test_locked_period_requires_approval_and_alert(self):
		self._configure("backdated")
		previous_month = getdate(add_months(nowdate(), -1))
		periods.finalize_period(self.branch.name, previous_month.year, previous_month.month)
		doc = self._source()
		doc.posting_date = previous_month
		periods.validate(doc)
		request = frappe.get_doc("URY Approval Request", {"reference_name": doc.name, "control_type": "backdated"})
		self.assertEqual(request.status, "Pending")
		self.assertTrue(frappe.db.exists("Notification Log", {"document_name": request.name, "type": "Alert"}))
		with self.assertRaises(frappe.PermissionError):
			periods.before_submit(doc)
		periods.reopen_period(self.branch.name, previous_month.year, previous_month.month)
		self.assertFalse(periods._locked_period(self.branch.name, previous_month))

	def test_native_budget_stop_still_blocks(self):
		budget = self._budget(action="Stop")
		bank = frappe.db.get_value("Account", {"company": self.company, "account_type": "Bank", "is_group": 0}, "name")
		amount = get_accumulated_monthly_budget(budget.name, nowdate()) + 1
		journal = frappe.get_doc(
			{
				"doctype": "Journal Entry",
				"voucher_type": "Journal Entry",
				"company": self.company,
				"posting_date": nowdate(),
				"accounts": [
					{"account": self.account, "debit_in_account_currency": amount, "cost_center": self.cost_center},
					{"account": bank, "credit_in_account_currency": amount, "cost_center": self.cost_center},
				],
			}
		)
		journal.insert(ignore_permissions=True)
		with self.assertRaises(BudgetError):
			journal.submit()
		budget.load_from_db()

	def test_native_accounting_period_still_blocks(self):
		period = frappe.get_doc(
			{
				"doctype": "Accounting Period",
				"period_name": f"URY Native {random_string(8)}",
				"company": self.company,
				"start_date": "2000-01-01",
				"end_date": "2000-01-01",
				"closed_documents": [{"document_type": "Journal Entry", "closed": 1}],
			}
		).insert(ignore_permissions=True)
		doc = frappe.get_doc({"doctype": "Journal Entry", "company": self.company, "posting_date": "2000-01-01"})
		with self.assertRaises(ClosedAccountingPeriod):
			validate_accounting_period_on_doc_save(doc)
		self.assertTrue(period.name)

	def test_approval_log_cannot_be_edited_or_deleted(self):
		request = self._request(self._source())
		log = frappe.get_doc("URY Approval Log", {"approval_request": request.name})
		log.remarks = "Illegal edit"
		with self.assertRaises(frappe.PermissionError):
			log.save()
		log.reload()
		with self.assertRaises(frappe.PermissionError):
			log.delete()
