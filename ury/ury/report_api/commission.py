import calendar
from datetime import timedelta

import frappe
from frappe.utils import flt, getdate

from ury.ury.report_api.utils import (
	get_business_day_range_condition,
	report_settings_join,
	require_manager,
	validate_date_range,
)

# The commission "base" (the amount commission is calculated on) has 4
# possible SQL expressions depending on URY Commission Settings.commission_base.
# "Net Sales" is the tricky one: when a discount was applied on Grand Total,
# net_total alone overstates the base, so we pro-rate the discount back onto
# net_total using its share of (net_total + total_taxes_and_charges).
_BASE_EXPR = {
	"Net Sales": """
		CASE
		  WHEN b.`apply_discount_on` = 'Grand Total'
		       AND IFNULL(b.`discount_amount`, 0) > 0
		       AND (IFNULL(b.`net_total`,0) + IFNULL(b.`total_taxes_and_charges`,0)) <> 0
		  THEN b.`net_total`
		       - (b.`discount_amount` * b.`net_total`
		          / (b.`net_total` + b.`total_taxes_and_charges`))
		  ELSE b.`net_total`
		END
	""",
	"Net Total": "b.`net_total`",
	"Item Total": "b.`total`",
	"Grand Total": "b.`grand_total`",
}

def _coerce_bool(value):
	if isinstance(value, str):
		return value.strip().lower() in {"1", "true", "yes", "on"}
	return bool(value)


def _settings_dict(doc):
	rules = []
	for row in doc.rules:
		rules.append({
			"branch": row.branch,
			"designation": row.designation,
			"employee": row.employee,
			"rate_type": row.rate_type,
			"rate": flt(row.rate),
			"tier_mode": row.tier_mode,
			"disabled": bool(row.disabled),
			"idx": row.idx,
			"tiers": [
				{"from_amount": flt(t.from_amount), "rate": flt(t.rate)}
				for t in row.tiers
			],
		})
	return {
		"enabled": bool(doc.enabled),
		"commission_base": doc.commission_base or "Net Sales",
		"include_returns": bool(doc.include_returns),
		"attribution_mode": doc.attribution_mode or "Opener",
		"default_rate": flt(doc.default_rate),
		"tier_period": doc.tier_period or "Monthly",
		"rules": rules,
	}


def _load_settings():
	return _settings_dict(frappe.get_single("URY Commission Settings"))


@frappe.whitelist()
def get_commission_settings():
	require_manager()
	return _load_settings()


@frappe.whitelist()
def update_commission_settings(
	enabled=None,
	commission_base=None,
	include_returns=None,
	attribution_mode=None,
	default_rate=None,
	tier_period=None,
	rules=None,
):
	require_manager()

	doc = frappe.get_single("URY Commission Settings")

	if enabled is not None:
		doc.enabled = 1 if _coerce_bool(enabled) else 0
	if commission_base is not None:
		doc.commission_base = commission_base
	if include_returns is not None:
		doc.include_returns = 1 if _coerce_bool(include_returns) else 0
	if attribution_mode is not None:
		doc.attribution_mode = attribution_mode
	if default_rate is not None:
		doc.default_rate = flt(default_rate)
	if tier_period is not None:
		doc.tier_period = tier_period

	if rules is not None:
		if isinstance(rules, str):
			rules = frappe.parse_json(rules)
		doc.set("rules", [])
		for rule in rules:
			row = doc.append("rules", {
				"branch": rule.get("branch"),
				"designation": rule.get("designation"),
				"employee": rule.get("employee"),
				"rate_type": rule.get("rate_type"),
				"rate": flt(rule.get("rate")),
				"tier_mode": rule.get("tier_mode"),
				"disabled": 1 if _coerce_bool(rule.get("disabled")) else 0,
			})
			for tier in rule.get("tiers") or []:
				row.append("tiers", {
					"from_amount": flt(tier.get("from_amount")),
					"rate": flt(tier.get("rate")),
				})

	doc.save(ignore_permissions=True)

	return _load_settings()


@frappe.whitelist()
def search_commission_employees(query, limit=10):
	require_manager()
	if not query or len(query) < 2:
		return []
	return frappe.get_list(
		"Employee",
		filters=[["employee_name", "like", f"%{query}%"], ["status", "=", "Active"]],
		fields=["name", "employee_name", "designation", "branch"],
		limit=min(int(limit), 25),
		order_by="employee_name asc",
	)


def resolve_rule(rules, employee, designation, branch):
	"""Pick the most specific enabled rule matching (employee, designation,
	branch). Specificity: employee beats designation beats branch, scored
	additively so combinations (e.g. employee+branch) beat a single-field
	match. Ties keep the first (lowest idx) match encountered."""
	best, best_score = None, -1
	for row in rules:
		if row.get("disabled"):
			continue
		if row.get("employee") and row["employee"] != employee:
			continue
		if row.get("designation") and row["designation"] != designation:
			continue
		if row.get("branch") and row["branch"] != branch:
			continue
		score = (
			(4 if row.get("employee") else 0)
			+ (2 if row.get("designation") else 0)
			+ (1 if row.get("branch") else 0)
		)
		if score > best_score:
			best, best_score = row, score
	return best


def _rate_source(rule):
	has_e = bool(rule.get("employee"))
	has_d = bool(rule.get("designation"))
	has_b = bool(rule.get("branch"))
	if has_e and has_b:
		return "employee+branch"
	if has_e:
		return "employee"
	if has_d and has_b:
		return "designation+branch"
	if has_d:
		return "designation"
	if has_b:
		return "branch"
	return "rule"


def _apply_tiers(base, tiers, mode):
	"""Returns (commission, effective_rate) for a base amount against a
	sorted list of tiers (ascending from_amount). Slab: whole base at the
	rate of the highest tier reached. Marginal: each tier's rate applies
	only to the slice of base within that tier's range. Never negative --
	a net-negative bucket always yields zero commission."""
	if base <= 0:
		return 0.0, 0.0
	if not tiers:
		return 0.0, 0.0
	if mode == "Slab":
		achieved = tiers[0]
		for t in tiers:
			if base >= flt(t["from_amount"]):
				achieved = t
		return flt(base * flt(achieved["rate"]) / 100, 2), flt(achieved["rate"])

	total = 0.0
	for i, t in enumerate(tiers):
		lo = flt(t["from_amount"])
		hi = flt(tiers[i + 1]["from_amount"]) if i + 1 < len(tiers) else None
		seg = (min(base, hi) if hi is not None else base) - lo
		if seg > 0:
			total += seg * flt(t["rate"]) / 100
	effective = (total / base * 100) if base else 0.0
	return flt(total, 2), flt(effective, 2)


def _period_key(posting_date, tier_period):
	d = getdate(posting_date)
	if tier_period == "Weekly":
		monday = d - timedelta(days=d.weekday())
		return monday.isoformat()
	first = d.replace(day=1)
	return first.isoformat()


def _fetch_invoices(start_date, end_date, branch, settings):
	base_expr = _BASE_EXPR[settings["commission_base"]]
	status_pred = "b.`status` IN ('Consolidated', 'Paid')"
	if settings["include_returns"]:
		status_pred = "(b.`status` IN ('Consolidated', 'Paid') OR b.`is_return` = 1)"

	params = {"start_date": start_date, "end_date": end_date, "branch": branch}
	branch_pred = "AND b.`branch` = %(branch)s" if branch else ""

	rows = frappe.db.sql(
		f"""
		SELECT
			b.`name` AS invoice, b.`posting_date` AS posting_date, b.`branch` AS branch,
			b.`custom_waiter_employee` AS opener, b.`custom_closing_employee` AS closer,
			b.`is_return` AS is_return, b.`return_against` AS return_against,
			ROUND({base_expr}, 2) AS base_amount
		FROM `tabPOS Invoice` b
		{report_settings_join()}
		WHERE b.`docstatus` = 1 AND {status_pred} {branch_pred}
		  AND {get_business_day_range_condition()}
		""",
		params,
		as_dict=True,
	)
	return rows


def _fetch_item_weights(invoice_names):
	"""Per-invoice, per-employee sum of net_amount from POS Invoice Item,
	used for "Split By Contribution" attribution. Chunked in batches of
	5000 invoice names to stay well under any IN-clause limit."""
	weights = {}
	names = list(invoice_names)
	for i in range(0, len(names), 5000):
		chunk = names[i:i + 5000]
		rows = frappe.db.sql(
			"""
			SELECT bi.`parent` AS invoice, bi.`custom_entered_by_employee` AS employee,
			       SUM(bi.`net_amount`) AS item_base
			FROM `tabPOS Invoice Item` bi
			WHERE bi.`parent` IN %(names)s
			GROUP BY bi.`parent`, bi.`custom_entered_by_employee`
			""",
			{"names": chunk},
			as_dict=True,
		)
		for r in rows:
			weights.setdefault(r["invoice"], []).append(
				{"employee": r["employee"], "item_base": flt(r["item_base"])}
			)
	return weights


def _patch_return_fallback(rows):
	"""For return rows with no opener, resolve opener/closer from the
	original (return_against) invoice in one batch query."""
	needing = [r["return_against"] for r in rows if r["is_return"] and not r["opener"] and r["return_against"]]
	if not needing:
		return
	parents = frappe.get_all(
		"POS Invoice",
		filters={"name": ["in", list(set(needing))]},
		fields=["name", "custom_waiter_employee", "custom_closing_employee"],
	)
	by_name = {p["name"]: p for p in parents}
	for r in rows:
		if r["is_return"] and not r["opener"] and r["return_against"] in by_name:
			parent = by_name[r["return_against"]]
			r["opener"] = parent["custom_waiter_employee"]
			r["closer"] = parent["custom_closing_employee"]


def _weights_for_row(row, attribution_mode, item_weights):
	"""Returns a dict {employee: weight} summing to 1.0 for a resolvable
	row, or {} if nothing can be resolved (caller folds those into
	`unattributed`)."""
	opener, closer = row["opener"], row["closer"]

	def opener_only():
		if opener:
			return {opener: 1.0}
		if closer:
			return {closer: 1.0}
		return {}

	if attribution_mode == "Opener":
		return opener_only()

	if attribution_mode == "Closer":
		if closer:
			return {closer: 1.0}
		if opener:
			return {opener: 1.0}
		return {}

	if attribution_mode == "Split Evenly":
		if opener and closer and opener != closer:
			return {opener: 0.5, closer: 0.5}
		if opener:
			return {opener: 1.0}
		if closer:
			return {closer: 1.0}
		return {}

	if attribution_mode == "Split By Contribution":
		items = item_weights.get(row["invoice"]) or []
		total = sum(i["item_base"] for i in items)
		if total <= 0:
			return opener_only()
		weights = {}
		unassigned = 0.0
		for i in items:
			share = i["item_base"] / total
			if i["employee"]:
				weights[i["employee"]] = weights.get(i["employee"], 0.0) + share
			else:
				unassigned += share
		if unassigned:
			if opener:
				weights[opener] = weights.get(opener, 0.0) + unassigned
			elif not weights:
				return opener_only()
		if not weights:
			return opener_only()
		return weights

	return opener_only()


def _compute_commission(start_date, end_date, branch, settings, employee_scope=None):
	"""Shared core for get_employee_commission and
	get_employee_commission_detail. Returns (buckets, per_invoice_rows,
	unattributed, tier_period_partial) where buckets is keyed by
	(employee, branch, period)."""
	rows = _fetch_invoices(start_date, end_date, branch, settings)

	item_weights = {}
	if settings["attribution_mode"] == "Split By Contribution" and rows:
		item_weights = _fetch_item_weights([r["invoice"] for r in rows])

	_patch_return_fallback(rows)

	tier_period = settings["tier_period"]
	sd, ed = getdate(start_date), getdate(end_date)
	if tier_period == "Weekly":
		tier_period_partial = sd.weekday() != 0 or ed.weekday() != 6
	else:
		last_day = calendar.monthrange(ed.year, ed.month)[1]
		tier_period_partial = sd.day != 1 or ed.day != last_day

	buckets = {}
	unattributed = {"invoices": 0, "base": 0.0}
	per_invoice = []

	for row in rows:
		weights = _weights_for_row(row, settings["attribution_mode"], item_weights)
		base_amount = flt(row["base_amount"])

		if employee_scope is not None:
			w = weights.get(employee_scope)
			if w:
				attributed_base = flt(base_amount * w, 2)
				per_invoice.append({
					"invoice": row["invoice"],
					"posting_date": str(row["posting_date"]),
					"branch": row["branch"],
					"base_amount": base_amount,
					"weight": w,
					"attributed_base": attributed_base,
					"is_return": bool(row["is_return"]),
				})

		if not weights:
			unattributed["invoices"] += 1
			unattributed["base"] += base_amount
			continue

		period = _period_key(row["posting_date"], tier_period)
		for emp, w in weights.items():
			key = (emp, row["branch"], period)
			b = buckets.setdefault(key, {
				"employee": emp, "branch": row["branch"], "period": period,
				"base": 0.0, "invoices": 0, "weighted_invoices": 0.0,
			})
			b["base"] += base_amount * w
			b["invoices"] += 1
			b["weighted_invoices"] += w

	unattributed["base"] = round(unattributed["base"], 2)

	if employee_scope is not None:
		per_invoice.sort(key=lambda r: r["posting_date"], reverse=True)

	return buckets, per_invoice, unattributed, tier_period_partial


def _score_and_commission_buckets(buckets, settings):
	"""Resolves the applicable rule and computes commission for each
	bucket in place, returning the employee metadata map used along the
	way."""
	employees = {b["employee"] for b in buckets.values()}
	meta_rows = frappe.get_all(
		"Employee",
		filters={"name": ["in", list(employees)]} if employees else {"name": ["in", []]},
		fields=["name", "employee_name", "designation", "branch", "status"],
	)
	meta = {m["name"]: m for m in meta_rows}

	for key, b in buckets.items():
		emp = b["employee"]
		info = meta.get(emp, {})
		designation = info.get("designation")
		emp_branch = b["branch"]

		base = b["base"]
		rule = resolve_rule(settings["rules"], emp, designation, emp_branch)

		if rule is None:
			rate = settings["default_rate"]
			source = "default"
			commission = round(max(base, 0) * rate / 100, 2)
			effective_rate = rate
		elif rule["rate_type"] == "Flat":
			rate = flt(rule["rate"])
			source = _rate_source(rule)
			commission = round(max(base, 0) * rate / 100, 2)
			effective_rate = rate
		else:
			tiers = sorted(rule["tiers"], key=lambda t: t["from_amount"])
			commission, effective_rate = _apply_tiers(base, tiers, rule.get("tier_mode") or "Marginal")
			source = _rate_source(rule)

		b["rate"] = effective_rate
		b["rate_source"] = source
		b["commission"] = commission
		b["base"] = round(base, 2)

	return meta


@frappe.whitelist()
def get_employee_commission(start_date, end_date, branch=None, employee=None, sort_by="commission_amount"):
	require_manager()
	validate_date_range(start_date, end_date)
	if sort_by not in ("commission_amount", "attributed_base", "attributed_invoices"):
		sort_by = "commission_amount"

	settings = _load_settings()

	if not settings["enabled"]:
		return {
			"branch": branch,
			"start_date": str(start_date),
			"end_date": str(end_date),
			"settings": settings,
			"tier_period_partial": False,
			"employees": [],
			"unattributed": {"invoices": 0, "base": 0.0},
			"summary": {"total_employees": 0, "total_base": 0.0, "total_commission": 0.0},
		}

	buckets, _, unattributed, tier_period_partial = _compute_commission(
		start_date, end_date, branch, settings
	)

	if employee:
		buckets = {k: v for k, v in buckets.items() if v["employee"] == employee}

	meta = _score_and_commission_buckets(buckets, settings)

	per_employee = {}
	for b in buckets.values():
		emp = b["employee"]
		entry = per_employee.setdefault(emp, {
			"employee": emp,
			"employee_name": meta.get(emp, {}).get("employee_name") or emp,
			"designation": meta.get(emp, {}).get("designation"),
			"attributed_invoices": 0,
			"weighted_invoices": 0.0,
			"attributed_base": 0.0,
			"commission_amount": 0.0,
			"periods": [],
		})
		entry["attributed_invoices"] += b["invoices"]
		entry["weighted_invoices"] += b["weighted_invoices"]
		entry["attributed_base"] += b["base"]
		entry["commission_amount"] += b["commission"]
		entry["periods"].append({
			"period": b["period"], "branch": b["branch"],
			"base": b["base"], "rate": b["rate"], "commission": b["commission"],
		})

	employees = list(per_employee.values())
	for e in employees:
		e["weighted_invoices"] = round(e["weighted_invoices"], 2)
		e["attributed_base"] = round(e["attributed_base"], 2)
		e["commission_amount"] = round(e["commission_amount"], 2)
		e["effective_rate"] = round(e["commission_amount"] / e["attributed_base"] * 100, 2) if e["attributed_base"] else 0.0
		e["rate_source"] = None

	# attach rate_source per employee from the bucket with the largest base
	bucket_by_key = {}
	for b in buckets.values():
		bucket_by_key.setdefault(b["employee"], []).append(b)
	for e in employees:
		emp_buckets = bucket_by_key.get(e["employee"], [])
		if emp_buckets:
			top = max(emp_buckets, key=lambda b: b["base"])
			e["rate_source"] = top["rate_source"]

	employees.sort(key=lambda e: e[sort_by], reverse=True)
	for i, e in enumerate(employees, start=1):
		e["rank"] = i

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"settings": settings,
		"tier_period_partial": tier_period_partial,
		"employees": employees,
		"unattributed": unattributed,
		"summary": {
			"total_employees": len(employees),
			"total_base": round(sum(e["attributed_base"] for e in employees), 2),
			"total_commission": round(sum(e["commission_amount"] for e in employees), 2),
		},
	}


@frappe.whitelist()
def get_employee_commission_detail(employee, start_date, end_date, branch=None):
	require_manager()
	validate_date_range(start_date, end_date)

	if not employee:
		frappe.throw("employee is required.")

	settings = _load_settings()

	if not settings["enabled"]:
		return {
			"branch": branch,
			"start_date": str(start_date),
			"end_date": str(end_date),
			"settings": settings,
			"tier_period_partial": False,
			"invoices": [],
			"truncated": False,
			"unattributed": {"invoices": 0, "base": 0.0},
			"summary": {"total_employees": 0, "total_base": 0.0, "total_commission": 0.0},
		}

	buckets, per_invoice, unattributed, tier_period_partial = _compute_commission(
		start_date, end_date, branch, settings, employee_scope=employee
	)

	buckets = {k: v for k, v in buckets.items() if v["employee"] == employee}
	meta = _score_and_commission_buckets(buckets, settings)

	total_base = round(sum(b["base"] for b in buckets.values()), 2)
	total_commission = round(sum(b["commission"] for b in buckets.values()), 2)

	truncated = len(per_invoice) > 2000
	invoices = per_invoice[:2000]

	return {
		"branch": branch,
		"start_date": str(start_date),
		"end_date": str(end_date),
		"settings": settings,
		"tier_period_partial": tier_period_partial,
		"employee": employee,
		"employee_name": meta.get(employee, {}).get("employee_name") or employee,
		"invoices": invoices,
		"truncated": truncated,
		"unattributed": unattributed,
		"summary": {
			"total_employees": 1 if buckets else 0,
			"total_base": total_base,
			"total_commission": total_commission,
		},
	}
