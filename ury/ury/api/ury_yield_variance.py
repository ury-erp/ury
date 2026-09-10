"""Yield variance tracking and reporting.

Provides API endpoints for recording and querying actual yield measurements
against standard yield percentages from Item.custom_yield_percent. Yield checks
are captured at point of production and compared against the standard to
measure and track efficiency/losses.

All endpoints are gated with `require_manager()` + `_require_scope(company)`
following the established pattern from ury_cost_variance_attribution.py.
"""

import frappe
from frappe import _

from ury.ury.report_api.utils import require_manager


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
	require_manager()
	_require_scope(company)

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


# --- internal helpers -------------------------------------------------------


def _require_scope(company):
	"""Fail closed if company scope is missing, matching the established pattern."""
	if not company:
		frappe.throw(_("Company is required"), frappe.ValidationError)
