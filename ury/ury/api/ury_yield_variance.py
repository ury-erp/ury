"""Yield variance tracking and reporting.

Provides API endpoints for recording and querying actual yield measurements
against standard yield percentages from Item.custom_yield_percent. Yield checks
are captured at point of production and compared against the standard to
measure and track efficiency/losses.

Permission gating varies by endpoint:
- record_yield_check: requires frappe.has_permission("create") + _require_scope (staff-facing)
- get_yield_variance, get_yield_check_compliance: require_manager() + _require_scope (reporting)
"""

import hashlib
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import getdate

from ury.ury.report_api.utils import require_manager, user_has_branch_access


YIELD_CHECK_DOCTYPE = "URY Yield Check"


@frappe.whitelist()
def record_yield_check(item, branch, company, input_qty, output_qty, stock_uom,
					   check_type, issue_authorization=None, department=None,
					   production_unit=None):
	"""Record a yield check measurement.

	Creates and inserts a URY Yield Check document with the given fields.
	Automatically captures the Item's current custom_yield_percent as a snapshot
	at save time, and computes actual_yield_percent and variance_percent.

	All user inputs are validated in the document's validate() method.

	Args:
		item: Item code (Link → Item, required)
		branch: Branch name (Link → Branch, required)
		company: Company name (Link → Company, required)
		input_qty: Input quantity (Float, required)
		output_qty: Output quantity (Float, required)
		stock_uom: Unit of Measure (Link → UOM, required)
		check_type: Check type (Select: Routine/Scheduled/Spot-Check/Manual, required)
		issue_authorization: Issue Authorization name (Link, optional)
		department: Department name (Link → URY Production Department, optional)
		production_unit: Production Unit name (Link → URY Production Unit, optional)

	Returns:
		dict with created document name and key fields

	Raises:
		frappe.ValidationError if any validation fails in the document's validate()
	"""
	# I7: Relaxed from manager-only to any authenticated user with doctype create permission
	# This function is called from prep-staff-facing frontend action (Log Usable Output drawer)
	# not a manager-only workflow; use lighter permission check consistent with ury_issue_authorization pattern
	if not frappe.has_permission(YIELD_CHECK_DOCTYPE, "create"):
		frappe.throw(_("Not permitted to create Yield Check"), frappe.PermissionError)
	_require_scope(company)
	if not user_has_branch_access(frappe.session.user, branch):
		frappe.throw(
			_("You are not assigned to branch {0}").format(branch),
			frappe.PermissionError,
		)

	doc = frappe.get_doc({
		"doctype": YIELD_CHECK_DOCTYPE,
		"item": item,
		"branch": branch,
		"company": company,
		"input_qty": input_qty,
		"output_qty": output_qty,
		"stock_uom": stock_uom,
		"check_type": check_type,
		"issue_authorization": issue_authorization,
		"department": department,
		"production_unit": production_unit,
		"checked_by": frappe.session.user,
		"checked_on": frappe.utils.now(),
	})
	doc.insert(ignore_permissions=False)

	return {
		"name": doc.name,
		"item": doc.item,
		"branch": doc.branch,
		"company": doc.company,
		"actual_yield_percent": doc.actual_yield_percent,
		"standard_yield_percent_snapshot": doc.standard_yield_percent_snapshot,
		"variance_percent": doc.variance_percent,
		"check_type": doc.check_type,
		"checked_on": doc.checked_on,
	}


@frappe.whitelist()
def get_yield_variance(company, branch=None, item=None):
	"""Retrieve yield check records with variance data.

	Returns a list of URY Yield Check documents filtered by company (required)
	and optionally by branch and item. Results are sorted by checked_on descending
	(most recent first) and limited to 200 records.

	Args:
		company: Company name (required, scoped)
		branch: Branch name (optional filter)
		item: Item code (optional filter)

	Returns:
		list of dicts with yield check data:
		[
			{
				"name": "<check-id>",
				"item": "<item-code>",
				"branch": "<branch-name>",
				"actual_yield_percent": <float>,
				"standard_yield_percent_snapshot": <float>,
				"variance_percent": <float>,
				"checked_on": "<datetime>",
			},
			...
		]
	"""
	require_manager()
	_require_scope(company)

	filters = {"company": company}
	if branch:
		filters["branch"] = branch
	if item:
		filters["item"] = item

	records = frappe.get_all(
		YIELD_CHECK_DOCTYPE,
		filters=filters,
		fields=[
			"name",
			"item",
			"branch",
			"actual_yield_percent",
			"standard_yield_percent_snapshot",
			"variance_percent",
			"checked_on",
		],
		order_by="checked_on desc",
		limit_page_length=200,
	)

	return records


@frappe.whitelist()
def get_yield_check_compliance(company, branch=None):
	"""Compute yield check compliance metrics by cadence mode.

	For each yield-tracked item with cadence != 'None', computes required vs
	completed checks over the last 30 days. Returns compliance percentage and
	attached vs standalone check count for data-quality signaling.

	IMPORTANT — compliance_basis: "authorization". For the "Every Issue"
	cadence, `required_count` counts URY Issue Authorization records with
	status = "Authorized"; it does NOT know whether that authorization was
	ever physically issued, was later cancelled, or was only partially used.
	This is authorization-based compliance (did every Authorized record get a
	check), not production-based compliance (did every actual physical issue
	get a check). A real production-based fix needs a new field on URY Issue
	Authorization recording confirmed physical issuance, which is out of
	scope here — until that lands, treat these numbers as an upper bound on
	true non-compliance, not an exact measure.

	Args:
		company: Company name (required, scoped)
		branch: Branch name (optional filter; if None, aggregates all branches)

	Returns:
		list of dicts with compliance data:
		[
			{
				"item": "<item-code>",
				"cadence": "Every Issue" | "Interval" | "Sampled",
				"required_count": <int>,
				"completed_count": <int>,
				"compliance_percent": <float>,
				"attached_count": <int>,  # checks with issue_authorization set
				"compliance_basis": "authorization",  # see docstring above
			},
			...
		]
	"""
	require_manager()
	_require_scope(company)

	# Fetch all yield-tracked items with cadence != None.
	tracked_items = frappe.get_all(
		"Item",
		filters={
			"custom_yield_tracked": 1,
			"custom_yield_check_cadence": ["!=", "None"],
		},
		fields=[
			"name",
			"custom_yield_check_cadence",
			"custom_yield_check_interval_days",
		],
	)

	compliance_data = []
	today = getdate()
	start_date = today - timedelta(days=30)

	for item in tracked_items:
		item_code = item.name
		cadence = item.custom_yield_check_cadence

		# Fetch completed checks for this item in the last 30 days.
		# I1: Use "between" filter to avoid duplicate dict keys silently dropping the start_date bound
		completed_checks = frappe.get_all(
			YIELD_CHECK_DOCTYPE,
			filters={
				"company": company,
				"item": item_code,
				"checked_on": ["between", [start_date, today + timedelta(days=1)]],
			} if branch is None else {
				"company": company,
				"branch": branch,
				"item": item_code,
				"checked_on": ["between", [start_date, today + timedelta(days=1)]],
			},
			fields=["name", "issue_authorization", "checked_on"],
		)

		completed_count = len(completed_checks)
		attached_count = sum(1 for check in completed_checks if check.issue_authorization)

		required_count = 0
		if cadence == "Every Issue":
			# Count authorized issues without a corresponding yield check.
			# I2: Add 30-day window to authorizations to match the 30-day numerator (completed checks)
			authorized_issues = frappe.get_all(
				"URY Issue Authorization",
				filters={
					"component_item": item_code,
					"status": "Authorized",
					"creation": ["between", [start_date, today + timedelta(days=1)]],
				} if branch is None else {
					"component_item": item_code,
					"branch": branch,
					"status": "Authorized",
					"creation": ["between", [start_date, today + timedelta(days=1)]],
				},
				fields=["name"],
			)
			required_count = len(authorized_issues)

		elif cadence == "Interval":
			# Compute periods elapsed in the last 30 days.
			# I5: Match cadence engine semantics — when interval_days <= 0, skip this item (not due)
			interval_days = item.custom_yield_check_interval_days
			if interval_days and interval_days > 0:
				required_count = max(1, 30 // interval_days)
			else:
				# Skip items with unset or non-positive intervals (not due per engine logic)
				required_count = 0

		elif cadence == "Sampled":
			# Count days in the last 30 where the deterministic hash picked this item.
			required_count = _count_sampled_days(start_date, today, branch, item_code)

		compliance_percent = (
			(completed_count / required_count * 100)
			if required_count > 0
			else 100.0
		)

		compliance_data.append({
			"item": item_code,
			"cadence": cadence,
			"required_count": required_count,
			"completed_count": completed_count,
			"compliance_percent": round(compliance_percent, 2),
			"attached_count": attached_count,
			"compliance_basis": "authorization",
		})

	return compliance_data


# --- internal helpers -------------------------------------------------------


def _count_sampled_days(start_date, end_date, branch, item_code):
	"""Count days in [start_date, end_date) where item_code is sampled.

	Uses the same deterministic hash logic as yield_check_reminders.py's
	_evaluate_sampled (sampling rate 10%).

	Args:
		start_date: datetime.date
		end_date: datetime.date
		branch: Branch name (optional; if None, sums across all real branches)
		item_code: Item code

	Returns:
		int: number of days where the item was sampled
	"""
	SAMPLING_RATE = 0.10

	# I11: When branch is None (all-branches aggregate), sum per-branch counts
	# using actual branch names, not a fake "all" placeholder that the cadence engine never uses
	if branch is None:
		# Get all branches and sum sampled days for each
		branches = frappe.get_all("Branch", pluck="name")
		total_count = 0
		for branch_name in branches:
			total_count += _count_sampled_days(start_date, end_date, branch_name, item_code)
		return total_count

	# Single branch case: count sampled days using actual branch name
	count = 0
	current_date = start_date

	while current_date < end_date:
		today_str = str(current_date)
		hash_input = f"{today_str}:{branch}:{item_code}"
		hash_value = hashlib.md5(hash_input.encode()).hexdigest()
		hash_int = int(hash_value[:8], 16)
		normalized_hash = (hash_int % 1000000) / 1000000.0

		if normalized_hash < SAMPLING_RATE:
			count += 1

		current_date += timedelta(days=1)

	return count


def _require_scope(company):
	"""Fail closed if company scope is missing, matching the established pattern."""
	if not company:
		frappe.throw(_("Company is required"), frappe.ValidationError)


