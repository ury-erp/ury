import frappe

from frappe.utils import add_to_date, get_datetime

from ury.ury.api.ury_dashboard import _business_day_bounds, get_needs_attention
from ury.ury.report_api.utils import require_manager

# Recent-window used both for the "long-open ticket" / "cancellation spike"
# lookback and for de-duplicating URY Insight rows per rule_key+branch, same
# idempotency principle as create_system_notification() in
# ury_kot_notification.py (dedupe on a short recent window before insert).
DEDUPE_WINDOW_MINUTES = 120

LONG_OPEN_TICKET_MINUTES = 30
AGING_STOCK_HOURS = 48
CANCELLATION_SPIKE_MULTIPLIER = 2
CANCELLATION_SPIKE_MIN_COUNT = 3
CANCELLATION_BASELINE_DAYS = 14


# run_exception_rules() is primarily meant for scheduled/system invocation
# (a HUF Agent Trigger or `ury`'s own scheduler cron). It is whitelisted so
# an automation runner can invoke it over RPC, but because it *writes* URY
# Insight rows with ignore_permissions it must not be callable by any
# logged-in POS user: the whitelisted entry point is POST-only and gated on
# require_manager() (Administrator / System Manager / URY Manager), matching
# the non-negotiable in PLAN.md that every new whitelisted endpoint enforces
# a server-side role check. Scheduler/system invocation runs as
# Administrator and passes the gate; internal callers can use
# _run_exception_rules() directly to bypass the RPC gate.
@frappe.whitelist(methods=["POST"])
def run_exception_rules():
	require_manager()
	return _run_exception_rules()


def _run_exception_rules():
	"""Evaluate deterministic exception rules and write/refresh URY Insight
	records (rule_key set, body left empty for the PR-B HUF narration pass).
	Idempotent per rule_key+branch within DEDUPE_WINDOW_MINUTES.
	"""
	branches = [b.name for b in frappe.get_all("Branch", fields=["name"])]
	# Fall back to a single unscoped (branch=None) evaluation when no Branch
	# records exist, so a single-branch deployment still gets insights. Note
	# that unscoped insights are only visible to a feed call that also passes
	# no branch — get_active_insights filters on exact branch match.
	scopes = branches or [None]

	created = []
	for branch in scopes:
		created += _rule_long_open_tickets(branch)
		created += _rule_aging_unpaid_orders(branch)
		created += _rule_notable_cancellations(branch)
		created += _rule_aging_stock(branch)

	return created


def _upsert_insight(rule_key, branch, title, severity, source_tool):
	"""Skip if a non-dismissed URY Insight for this rule_key+branch already
	exists within DEDUPE_WINDOW_MINUTES; otherwise insert a fresh one with
	`body` left empty (reserved for the HUF narration pass in PR-B).
	"""
	window_start = add_to_date(get_datetime(), minutes=-DEDUPE_WINDOW_MINUTES)
	existing = frappe.db.exists(
		"URY Insight",
		{
			"rule_key": rule_key,
			"branch": branch,
			"dismissed": 0,
			"creation": [">", window_start],
		},
	)
	if existing:
		# Refresh the title/severity in place rather than duplicating.
		frappe.db.set_value("URY Insight", existing, {"title": title, "severity": severity})
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "URY Insight",
			"title": title,
			"severity": severity,
			"rule_key": rule_key,
			"branch": branch,
			"source_tool": source_tool,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _rule_long_open_tickets(branch):
	"""Tickets fired to the kitchen but not yet served, open beyond
	LONG_OPEN_TICKET_MINUTES. Reuses the same ticket-level `URY KOT`
	start_time_prep/start_time_serv timestamps get_shift_metrics() (in
	ury_dashboard.py) uses for avg_ticket_minutes, scoped to the current
	business-day window via the same _business_day_bounds() helper.
	"""
	start, end = _business_day_bounds(branch)
	threshold = add_to_date(get_datetime(), minutes=-LONG_OPEN_TICKET_MINUTES)

	conditions = """
		k.`docstatus` = 1
		AND k.`start_time_prep` IS NOT NULL
		AND k.`start_time_serv` IS NULL
		AND k.`start_time_prep` <= %(threshold)s
		AND k.`creation` BETWEEN %(start)s AND %(end)s
	"""
	params = {"threshold": threshold, "start": start, "end": end}
	if branch:
		conditions += " AND k.`branch` = %(branch)s"
		params["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT k.`name`
		FROM `tabURY KOT` k
		WHERE {conditions}
		""",
		params,
		as_dict=True,
	)

	if not rows:
		return []

	title = f"{len(rows)} ticket(s) open for over {LONG_OPEN_TICKET_MINUTES} minutes"
	name = _upsert_insight(
		rule_key="long_open_tickets",
		branch=branch,
		title=title,
		severity="Warning",
		source_tool="ury_insight_rules.run_exception_rules",
	)
	return [name]


def _rule_aging_unpaid_orders(branch):
	"""Aging unpaid orders. Reuses get_needs_attention() from
	ury_dashboard.py directly rather than duplicating its query — that
	function's "pending_payment" item is already capped to the current
	shift/business-day window (the bug #2 fix).
	"""
	items = get_needs_attention(branch=branch)
	pending = [i for i in items if i.get("type") == "pending_payment"]
	if not pending:
		return []

	item = pending[0]
	severity = "Critical" if item.get("severity") == "high" else "Warning"
	name = _upsert_insight(
		rule_key="aging_unpaid_orders",
		branch=branch,
		title=item["message"],
		severity=severity,
		source_tool="ury_dashboard.get_needs_attention",
	)
	return [name]


def _rule_notable_cancellations(branch):
	"""Spike in cancelled invoices today vs a same-weekday baseline. Follows
	the same docstatus=2 / business-day-window query approach as
	get_cancelled_invoices() in report_api/sales.py, simplified to a single
	count comparison rather than the full paginated audit list.
	"""
	start, end = _business_day_bounds(branch)

	today_conditions = "b.`docstatus` = 2 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) BETWEEN %(start)s AND %(end)s"
	today_params = {"start": start, "end": end}
	if branch:
		today_conditions += " AND b.`branch` = %(branch)s"
		today_params["branch"] = branch

	today_count = frappe.db.sql(
		f"""
		SELECT COUNT(*) AS cnt
		FROM `tabPOS Invoice` b
		WHERE {today_conditions}
		""",
		today_params,
		as_dict=True,
	)[0].cnt or 0

	if today_count < CANCELLATION_SPIKE_MIN_COUNT:
		return []

	weekday = start.weekday()
	baseline_conditions = """
		b.`docstatus` = 2
		AND WEEKDAY(b.`posting_date`) = %(weekday)s
		AND b.`posting_date` >= DATE_SUB(%(business_date)s, INTERVAL %(days)s DAY)
		AND b.`posting_date` < %(business_date)s
	"""
	baseline_params = {
		"weekday": weekday,
		"business_date": start.date(),
		"days": CANCELLATION_BASELINE_DAYS,
	}
	if branch:
		baseline_conditions += " AND b.`branch` = %(branch)s"
		baseline_params["branch"] = branch

	baseline_rows = frappe.db.sql(
		f"""
		SELECT b.`posting_date` AS d, COUNT(*) AS cnt
		FROM `tabPOS Invoice` b
		WHERE {baseline_conditions}
		GROUP BY b.`posting_date`
		""",
		baseline_params,
		as_dict=True,
	)

	sample_days = len(baseline_rows)
	avg_baseline = (sum(r.cnt for r in baseline_rows) / sample_days) if sample_days else 0

	if avg_baseline and today_count < avg_baseline * CANCELLATION_SPIKE_MULTIPLIER:
		return []
	if not avg_baseline and today_count < CANCELLATION_SPIKE_MIN_COUNT:
		return []

	title = f"{today_count} cancelled invoice(s) today, above the usual {round(avg_baseline, 1)}"
	name = _upsert_insight(
		rule_key="notable_cancellations",
		branch=branch,
		title=title,
		severity="Warning",
		source_tool="ury_insight_rules._rule_notable_cancellations",
	)
	return [name]


def _rule_aging_stock(branch):
	"""Component stock received into departments but not yet consumed, aged
	beyond AGING_STOCK_HOURS. Netting out any Return movements for the same
	item/department (stock already returned to central store is not flagged).
	Bounded to a 7-day lookback window to prevent query degradation as the
	URY Stock Movement table grows monotonically.
	"""
	now = get_datetime()
	aging_threshold = add_to_date(now, hours=-AGING_STOCK_HOURS)
	lookback_start = add_to_date(now, days=-7)

	conditions = """
		s.`posting_datetime` >= %(lookback_start)s
		AND s.`posting_datetime` <= %(now)s
	"""
	params = {"lookback_start": lookback_start, "now": now, "aging_threshold": aging_threshold}
	if branch:
		conditions += " AND s.`branch` = %(branch)s"
		params["branch"] = branch

	# Group by component_item + department, calculate net qty (Receipt - Return),
	# filter for net > 0 and oldest receipt <= aging threshold.
	rows = frappe.db.sql(
		f"""
		SELECT
			s.`component_item`,
			s.`department`,
			SUM(CASE WHEN s.`movement_type` = 'Receipt' THEN s.`qty` ELSE 0 END) AS receipt_qty,
			SUM(CASE WHEN s.`movement_type` = 'Return' THEN s.`qty` ELSE 0 END) AS return_qty,
			MIN(CASE WHEN s.`movement_type` = 'Receipt' THEN s.`posting_datetime` END) AS oldest_receipt
		FROM `tabURY Stock Movement` s
		WHERE {conditions}
		GROUP BY s.`component_item`, s.`department`
		HAVING
			receipt_qty > return_qty
			AND oldest_receipt IS NOT NULL
			AND oldest_receipt <= %(aging_threshold)s
		""",
		params,
		as_dict=True,
	)

	if not rows:
		return []

	created = []
	for row in rows:
		net_qty = row["receipt_qty"] - row["return_qty"]
		title = f"{row['component_item']} ({net_qty} units) in {row['department']} aged {AGING_STOCK_HOURS}+ hours"
		name = _upsert_insight(
			rule_key="aging_stock",
			branch=branch,
			title=title,
			severity="Warning",
			source_tool="ury_insight_rules._rule_aging_stock",
		)
		created.append(name)

	return created
