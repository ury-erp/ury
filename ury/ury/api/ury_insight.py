import frappe

from ury.ury.report_api.utils import require_manager


@frappe.whitelist(methods=["GET"])
def get_active_insights(branch=None, max_age_hours=24):
	"""Return non-dismissed URY Insight records, newest first, scoped to
	`branch` when one is supplied (all branches otherwise). Read-only,
	deterministic feed endpoint — never triggers HUF/LLM generation on
	render.

	Insights are only refreshed while their rule keeps firing and nothing
	auto-closes one when the underlying condition clears, so the feed is
	additionally bounded by `max_age_hours` — otherwise a stale "3 tickets
	open" card from days ago would sit on the dashboard until a human
	dismissed it by hand.
	"""
	require_manager()

	filters = {
		"dismissed": 0,
		"creation": [">", frappe.utils.add_to_date(frappe.utils.now_datetime(), hours=-int(max_age_hours))],
	}
	if branch:
		filters["branch"] = branch

	return frappe.get_all(
		"URY Insight",
		filters=filters,
		fields=[
			"name",
			"title",
			"severity",
			"rule_key",
			"branch",
			"source_tool",
			"body",
			"creation",
		],
		order_by="creation desc",
	)


@frappe.whitelist(methods=["POST"])
def dismiss_insight(name):
	"""Mark a URY Insight as dismissed by the current user."""
	require_manager()

	frappe.db.set_value(
		"URY Insight",
		name,
		{
			"dismissed": 1,
			"dismissed_by": frappe.session.user,
		},
	)
